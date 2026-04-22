"""Sprint 3 Definition-of-Done integration tests.

Per SPRINT-herpetoverse-v1.md §Sprint 3 exit criteria:

    - create snake
    - list snakes
    - create shed log
    - reject feeding log with both parents (polymorphic CHECK holds)

We stretch slightly beyond the DoD with one extra test — creating a
snake-parented feeding log — because that's the core polymorphic
extension to `feedings.py` and shipping it untested felt irresponsible.

All tests hit the real FastAPI app against the real Postgres schema;
there's no in-memory shortcut because `num_nonnulls(...)` doesn't exist
in SQLite. See conftest.py for the SAVEPOINT-per-test pattern.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, date

import pytest
from sqlalchemy.exc import IntegrityError


# ── Snake CRUD ────────────────────────────────────────────────────────────────

def test_create_snake(client, auth_headers):
    """POST /api/v1/snakes/ creates a snake and returns it."""
    payload = {
        "name": "Noodle",
        "common_name": "Ball Python",
        "scientific_name": "Python regius",
        "sex": "female",
        "feeding_schedule": "1 medium rat every 10-14 days",
    }
    resp = client.post("/api/v1/snakes/", json=payload, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Noodle"
    assert body["scientific_name"] == "Python regius"
    assert body["sex"] == "female"
    assert "id" in body
    # Denormalized cols start empty until a feeding/shed fires
    assert body["last_fed_at"] is None
    assert body["last_shed_at"] is None


def test_list_snakes(client, auth_headers):
    """GET /api/v1/snakes/ returns all snakes for the authed user."""
    for name in ("Noodle", "Ziggy", "Stardust"):
        r = client.post(
            "/api/v1/snakes/",
            json={"name": name, "scientific_name": "Python regius"},
            headers=auth_headers,
        )
        assert r.status_code == 201, r.text

    resp = client.get("/api/v1/snakes/", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    snakes = resp.json()
    assert len(snakes) == 3
    names = {s["name"] for s in snakes}
    assert names == {"Noodle", "Ziggy", "Stardust"}


# ── Shed logs ────────────────────────────────────────────────────────────────

def test_create_shed_log_denormalizes_last_shed_at(client, auth_headers, db_session):
    """POST /snakes/{id}/sheds creates a shed AND updates snakes.last_shed_at."""
    from app.models.snake import Snake

    # Make a snake first
    r = client.post(
        "/api/v1/snakes/",
        json={"name": "Hiss", "scientific_name": "Python regius"},
        headers=auth_headers,
    )
    assert r.status_code == 201
    snake_id = r.json()["id"]

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
        f"/api/v1/snakes/{snake_id}/sheds", json=shed_payload, headers=auth_headers
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["is_complete_shed"] is True
    assert body["has_retained_shed"] is False

    # Denormalized column should have moved forward
    db_session.expire_all()
    snake = db_session.query(Snake).filter(Snake.id == snake_id).first()
    assert snake is not None
    assert snake.last_shed_at == date(2026, 4, 15)


def test_create_snake_feeding_log_denormalizes_last_fed_at(
    client, auth_headers, db_session
):
    """POST /snakes/{id}/feedings uses snake polymorphic path + denorms last_fed_at."""
    from app.models.snake import Snake
    from app.models.feeding_log import FeedingLog

    r = client.post(
        "/api/v1/snakes/",
        json={"name": "Monty", "scientific_name": "Python regius"},
        headers=auth_headers,
    )
    snake_id = r.json()["id"]

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
        f"/api/v1/snakes/{snake_id}/feedings",
        json=feeding_payload,
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    feeding = resp.json()
    assert feeding["food_type"] == "rat"
    assert feeding["accepted"] is True

    # Polymorphic parent was set to snake, not tarantula
    fl = db_session.query(FeedingLog).filter(FeedingLog.id == feeding["id"]).first()
    assert fl is not None
    assert fl.snake_id is not None
    assert fl.tarantula_id is None

    # Dashboard denorm moved forward
    db_session.expire_all()
    snake = db_session.query(Snake).filter(Snake.id == snake_id).first()
    assert snake.last_fed_at is not None
    # Compare at the minute level — timezone round-trips through JSON.
    assert snake.last_fed_at.replace(microsecond=0) == fed_at.replace(microsecond=0)


# ── Polymorphic CHECK holds ──────────────────────────────────────────────────

def test_feeding_log_rejects_both_parents(client, auth_headers, db_session):
    """Constructing a FeedingLog with BOTH tarantula_id AND snake_id should
    violate the Postgres `feeding_logs_must_have_exactly_one_parent` CHECK.

    The DB constraint is the real guard. Path-based endpoints can't produce
    this state — this test exists to ensure a future bulk-import or admin
    endpoint can't silently sneak a dual-parent row past the constraint.
    """
    from app.models.snake import Snake
    from app.models.tarantula import Tarantula
    from app.models.feeding_log import FeedingLog

    # Seed one of each
    r_snake = client.post(
        "/api/v1/snakes/",
        json={"name": "Conflict", "scientific_name": "Python regius"},
        headers=auth_headers,
    )
    snake_id = r_snake.json()["id"]

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
        snake_id=snake_id,
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
