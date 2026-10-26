"""Herpetoverse core integration tests (originally Sprint 3's DoD).

Sprint 3 shipped these against the per-taxon `/snakes/` API. ADR-003
(2026-05-14) consolidated snakes, lizards and frogs into one `animals` table
and the `/api/v1/animals/` routes, and the old `/snakes/` router was emptied,
so until 2026-10-26 every test here hit a 404 and nothing guarded the
behaviour. Same properties, ported to the current API:

    - create an animal, list animals
    - a shed log moves `animals.last_shed_at` forward
    - an animal feeding log sets `animal_id` (not `tarantula_id`) and moves
      `animals.last_fed_at` forward
    - a feeding log with two parents violates the polymorphic CHECK

All tests hit the real FastAPI app against the real Postgres schema;
there's no in-memory shortcut because `num_nonnulls(...)` doesn't exist
in SQLite. See conftest.py for the SAVEPOINT-per-test pattern.
"""
from __future__ import annotations

from datetime import datetime, timezone, date

import pytest
from sqlalchemy.exc import IntegrityError

# Every test in this module hits the real Postgres schema (see the module
# docstring — `num_nonnulls(...)` has no SQLite equivalent), so the whole file
# is gated on TEST_DATABASE_URL. Conftest skips only what carries this marker;
# unmarked tests run unconditionally.
pytestmark = pytest.mark.requires_postgres


def _create_snake(client, auth_headers, name: str, **extra) -> dict:
    payload = {"name": name, "taxon": "snake", "scientific_name": "Python regius", **extra}
    resp = client.post("/api/v1/animals/", json=payload, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Animal CRUD ───────────────────────────────────────────────────────────────

def test_create_animal(client, auth_headers):
    """POST /api/v1/animals/ creates an animal and returns it."""
    body = _create_snake(
        client,
        auth_headers,
        "Noodle",
        common_name="Ball Python",
        sex="female",
        feeding_schedule="1 medium rat every 10-14 days",
    )
    assert body["name"] == "Noodle"
    assert body["taxon"] == "snake"
    assert body["scientific_name"] == "Python regius"
    assert body["sex"] == "female"
    assert "id" in body
    # Denormalized cols start empty until a feeding/shed fires
    assert body["last_fed_at"] is None
    assert body["last_shed_at"] is None


def test_list_animals(client, auth_headers):
    """GET /api/v1/animals/ returns the authed keeper's animals."""
    for name in ("Noodle", "Ziggy", "Stardust"):
        _create_snake(client, auth_headers, name)

    resp = client.get("/api/v1/animals/", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    names = {a["name"] for a in resp.json()}
    assert names == {"Noodle", "Ziggy", "Stardust"}


# ── Shed logs ────────────────────────────────────────────────────────────────

def test_create_shed_log_denormalizes_last_shed_at(client, auth_headers, db_session):
    """POST /animals/{id}/sheds creates a shed AND updates animals.last_shed_at."""
    from app.models.animal import Animal

    animal_id = _create_snake(client, auth_headers, "Hiss")["id"]

    shed_at = datetime(2026, 4, 15, 10, 30, tzinfo=timezone.utc)
    shed_payload = {
        "shed_at": shed_at.isoformat(),
        "is_complete_shed": True,
        "has_retained_shed": False,
        "weight_before_g": "455.50",
        "weight_after_g": "448.00",
        "notes": "Good clean shed, eye caps came off clean.",
    }
    resp = client.post(
        f"/api/v1/animals/{animal_id}/sheds", json=shed_payload, headers=auth_headers
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["is_complete_shed"] is True
    assert body["has_retained_shed"] is False

    # Denormalized column should have moved forward
    db_session.expire_all()
    animal = db_session.query(Animal).filter(Animal.id == animal_id).first()
    assert animal is not None
    assert animal.last_shed_at == date(2026, 4, 15)


def test_create_animal_feeding_log_denormalizes_last_fed_at(
    client, auth_headers, db_session
):
    """POST /animals/{id}/feedings sets the animal parent + denorms last_fed_at."""
    from app.models.animal import Animal
    from app.models.feeding_log import FeedingLog

    animal_id = _create_snake(client, auth_headers, "Monty")["id"]

    fed_at = datetime(2026, 4, 20, 19, 0, tzinfo=timezone.utc)
    feeding_payload = {
        "fed_at": fed_at.isoformat(),
        "food_type": "rat",
        "food_size": "medium",
        "quantity": 1,
        "accepted": True,
        "notes": "Took it from tongs on the first offer.",
    }
    resp = client.post(
        f"/api/v1/animals/{animal_id}/feedings",
        json=feeding_payload,
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    feeding = resp.json()
    assert feeding["food_type"] == "rat"
    assert feeding["accepted"] is True

    # Polymorphic parent was set to the animal, not a tarantula
    fl = db_session.query(FeedingLog).filter(FeedingLog.id == feeding["id"]).first()
    assert fl is not None
    assert str(fl.animal_id) == animal_id
    assert fl.tarantula_id is None

    # Dashboard denorm moved forward
    db_session.expire_all()
    animal = db_session.query(Animal).filter(Animal.id == animal_id).first()
    assert animal.last_fed_at is not None
    # Compare at the minute level — timezone round-trips through JSON.
    assert animal.last_fed_at.replace(microsecond=0) == fed_at.replace(microsecond=0)


# ── Polymorphic CHECK holds ──────────────────────────────────────────────────

def test_feeding_log_rejects_both_parents(client, auth_headers, db_session):
    """Constructing a FeedingLog with BOTH tarantula_id AND animal_id should
    violate the Postgres `feeding_logs_must_have_exactly_one_parent` CHECK.

    The DB constraint is the real guard. Path-based endpoints can't produce
    this state — this test exists to ensure a future bulk-import or admin
    endpoint can't silently sneak a dual-parent row past the constraint.
    """
    from app.models.feeding_log import FeedingLog

    animal_id = _create_snake(client, auth_headers, "Conflict")["id"]

    r_t = client.post(
        "/api/v1/tarantulas/",
        json={
            "name": "Dual",
            "scientific_name": "Grammostola pulchra",
        },
        headers=auth_headers,
    )
    assert r_t.status_code == 201, r_t.text
    tarantula_id = r_t.json()["id"]

    # Attempt the forbidden state directly against the DB
    bad = FeedingLog(
        tarantula_id=tarantula_id,
        animal_id=animal_id,
        fed_at=datetime(2026, 4, 20, 19, 0, tzinfo=timezone.utc),
        food_type="rat",
        accepted=True,
    )
    db_session.add(bad)

    with pytest.raises(IntegrityError) as exc_info:
        db_session.flush()

    # Error text should name the CHECK so regressions are obvious
    assert "feeding_logs_must_have_exactly_one_parent" in str(exc_info.value)

    db_session.rollback()
