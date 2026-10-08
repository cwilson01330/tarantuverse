"""Audit-2 (2026-10-08) Herpetoverse fixes, API half.

H1  GET /animals/{id}/delete-impact counts the pairings, clutches and
    offspring a delete takes with it (FK cascade), so both clients can say so.
M6  died / transferred animals are history: PUT /animals/{id} and
    POST /animals/{id}/brumation answer 409; bulk feedings skip them and 409
    when nothing is left. Restore (/revive) and delete stay open.
M7  POST /animals/{id}/brumation turns brumation on/off (start date = the
    keeper's local date, else today); Feeding Day never flags a brumating
    animal overdue and says so with `is_brumating`.
M3  pairing validation messages are worded per taxon ("others" is gone).
M4  clutch counts accept amphibian-sized spawns (bound 5000, was 200).

Fake-DB style, like test_enclosure_ownership / test_hv_collection_status.
"""
from __future__ import annotations

import asyncio
import inspect
import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models.animal import Animal
from app.models.clutch import Clutch
from app.models.feeding_log import FeedingLog
from app.models.reptile_offspring import ReptileOffspring
from app.models.reptile_pairing import ReptilePairing
from app.routers import animals as ar
from app.routers import reptile_pairings as rp
from app.schemas.animal import AnimalUpdate, BrumationRequest
from app.schemas.feeding import AnimalBulkFeedingRequest
from app.schemas.reptile_breeding import (
    CLUTCH_COUNT_MAX,
    ClutchCreate,
    ClutchUpdate,
)


# ── fakes ────────────────────────────────────────────────────────────────────

class Q:
    """A query that returns canned results whatever it's filtered by."""

    def __init__(self, first=None, all_=None, count=0):
        self._first, self._all, self._count = first, list(all_ or []), count
        self.updated = None

    def filter(self, *a, **k):
        return self

    def options(self, *a):
        return self

    def group_by(self, *a):
        return self

    def order_by(self, *a):
        return self

    def first(self):
        return self._first

    def all(self):
        return list(self._all)

    def count(self):
        return self._count

    def update(self, values, **k):
        self.updated = values
        return len(self._all)


class DB:
    def __init__(self, by_model=None):
        self.by_model = by_model or {}
        self.commits, self.added = 0, []

    def query(self, model, *_):
        return self.by_model.get(getattr(model, "class_", model), Q())

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        pass


def run(fn, **kw):
    return asyncio.run(inspect.unwrap(fn)(**kw))


def animal(owner_id, **over):
    base = dict(
        id=uuid.uuid4(), user_id=owner_id, taxon="snake", name="Hex",
        common_name=None, scientific_name=None, photo_url=None, location=None,
        died_at=None, transferred_out_at=None,
        brumation_active=False, brumation_started_at=None,
        feeding_paused_reason=None, feeding_paused_until=None,
        feeding_interval_days=7, feeds_on_cgd=False, herp_species=None,
        current_weight_g=None, feeding_schedule=None, enclosure_id=None,
        last_fed_at=None,
    )
    base.update(over)
    return NS(**base)


@pytest.fixture
def owner():
    return NS(id=uuid.uuid4(), is_active=True, is_premium_for_app=lambda app: True)


# ── M6: closed records refuse writes ────────────────────────────────────────

def test_closed_reason_and_refusal():
    assert ar.closed_reason(NS(died_at=None, transferred_out_at=None)) is None
    assert ar.closed_reason(NS(died_at=date.today(), transferred_out_at=None)) == "died"
    assert ar.closed_reason(NS(died_at=None, transferred_out_at=datetime.now(timezone.utc))) == "transferred"
    ar.refuse_if_closed(NS(died_at=None, transferred_out_at=None))  # living: no raise
    for a in (NS(died_at=date.today(), transferred_out_at=None),
              NS(died_at=None, transferred_out_at=datetime.now(timezone.utc))):
        with pytest.raises(HTTPException) as e:
            ar.refuse_if_closed(a)
        assert e.value.status_code == 409


@pytest.mark.parametrize("field,value", [
    ("died_at", date(2026, 9, 1)),
    ("transferred_out_at", datetime(2026, 9, 1, tzinfo=timezone.utc)),
])
def test_editing_a_closed_animal_is_a_409_and_writes_nothing(owner, field, value):
    a = animal(owner.id, **{field: value})
    db = DB({Animal: Q(first=a)})
    with pytest.raises(HTTPException) as e:
        run(ar.update_animal, animal_id=a.id, animal_data=AnimalUpdate(name="New"), current_user=owner, db=db)
    assert e.value.status_code == 409
    assert a.name == "Hex" and db.commits == 0


def test_editing_a_living_animal_still_works(owner):
    a = animal(owner.id)
    db = DB({Animal: Q(first=a)})
    run(ar.update_animal, animal_id=a.id, animal_data=AnimalUpdate(name="New"), current_user=owner, db=db)
    assert a.name == "New" and db.commits == 1


def test_revive_and_delete_do_not_refuse_closed_records():
    """Restoring and deleting are how a keeper fixes a mistaken mark-died."""
    for fn in (ar.revive_animal, ar.delete_animal):
        assert "refuse_if_closed" not in inspect.getsource(inspect.unwrap(fn))


def _bulk(monkeypatch, owner, animals, accepted=True):
    monkeypatch.setattr(ar, "scope_collection", lambda *a, **k: NS(owner=owner, logged_by_user_id=None))
    db = DB({Animal: Q(all_=animals)})
    body = AnimalBulkFeedingRequest(animal_ids=[a.id for a in animals], accepted=accepted)
    return db, run(ar.bulk_create_animal_feedings, payload=body, collection=None, db=db, current_user=owner)


def test_bulk_feeding_skips_died_and_transferred_animals(monkeypatch, owner):
    alive = animal(owner.id)
    dead = animal(owner.id, died_at=date(2026, 9, 1))
    gone = animal(owner.id, transferred_out_at=datetime(2026, 9, 1, tzinfo=timezone.utc))
    db, res = _bulk(monkeypatch, owner, [alive, dead, gone])
    assert res.created_ids == [alive.id]
    reasons = {s.animal_id: s.reason for s in res.skipped}
    assert reasons[dead.id] == "Marked as died"
    assert reasons[gone.id] == "Transferred to another keeper"
    assert [log.animal_id for log in db.added] == [alive.id]


def test_bulk_feeding_with_only_closed_animals_is_a_409(monkeypatch, owner):
    dead = animal(owner.id, died_at=date(2026, 9, 1))
    with pytest.raises(HTTPException) as e:
        _bulk(monkeypatch, owner, [dead])
    assert e.value.status_code == 409


# ── M7: brumation ───────────────────────────────────────────────────────────

def test_starting_brumation_defaults_to_today_and_ending_clears(owner):
    a = animal(owner.id)
    db = DB({Animal: Q(first=a)})
    run(ar.set_brumation, animal_id=a.id, payload=BrumationRequest(active=True), db=db, current_user=owner)
    assert a.brumation_active is True and a.brumation_started_at == date.today()

    run(ar.set_brumation, animal_id=a.id, payload=BrumationRequest(active=False), db=db, current_user=owner)
    assert a.brumation_active is False and a.brumation_started_at is None


def test_starting_brumation_keeps_the_keepers_local_date(owner):
    a = animal(owner.id)
    db = DB({Animal: Q(first=a)})
    run(ar.set_brumation, animal_id=a.id,
        payload=BrumationRequest(active=True, started_at=date(2026, 10, 7)), db=db, current_user=owner)
    assert a.brumation_started_at == date(2026, 10, 7)


def test_restarting_an_active_brumation_does_not_reset_its_start(owner):
    a = animal(owner.id, brumation_active=True, brumation_started_at=date(2026, 9, 15))
    db = DB({Animal: Q(first=a)})
    run(ar.set_brumation, animal_id=a.id, payload=BrumationRequest(active=True), db=db, current_user=owner)
    assert a.brumation_started_at == date(2026, 9, 15)


def test_brumation_on_a_died_animal_is_a_409(owner):
    a = animal(owner.id, died_at=date(2026, 9, 1))
    db = DB({Animal: Q(first=a)})
    with pytest.raises(HTTPException) as e:
        run(ar.set_brumation, animal_id=a.id, payload=BrumationRequest(active=True), db=db, current_user=owner)
    assert e.value.status_code == 409 and a.brumation_active is False


def test_brumation_is_keeper_level():
    assert getattr(ar.set_brumation, "__access_policy__", None) == "keeper"


def test_feeding_day_never_flags_a_brumating_animal_overdue(monkeypatch, owner):
    resting = animal(owner.id, brumation_active=True)
    awake = animal(owner.id)
    long_ago = datetime.now(timezone.utc) - timedelta(days=30)

    monkeypatch.setattr(ar, "scope_collection", lambda *a, **k: NS(owner=owner))
    monkeypatch.setattr(ar, "active_animals_query", lambda *a, **k: Q(all_=[resting, awake]))
    db = DB({FeedingLog: Q(all_=[(resting.id, long_ago), (awake.id, long_ago)])})
    items = {i.id: i for i in run(ar.list_feeding_status, tz_offset_minutes=None, collection=None,
                                  current_user=owner, db=db)}
    assert items[resting.id].is_overdue is False and items[resting.id].is_brumating is True
    assert items[awake.id].is_overdue is True and items[awake.id].is_brumating is False


# ── H1: what a delete takes with it ─────────────────────────────────────────

def test_delete_impact_counts_pairings_clutches_and_offspring(owner):
    a = animal(owner.id)
    db = DB({
        Animal: Q(first=a),
        ReptilePairing: Q(all_=[(uuid.uuid4(),), (uuid.uuid4(),)]),
        Clutch: Q(all_=[(uuid.uuid4(),), (uuid.uuid4(),), (uuid.uuid4(),)]),
        ReptileOffspring: Q(count=11),
    })
    res = run(ar.get_delete_impact, animal_id=a.id, db=db, current_user=owner)
    assert (res.pairings, res.clutches, res.offspring) == (2, 3, 11)


def test_delete_impact_is_zero_for_a_non_parent(owner):
    a = animal(owner.id)
    res = run(ar.get_delete_impact, animal_id=a.id, db=DB({Animal: Q(first=a)}), current_user=owner)
    assert (res.pairings, res.clutches, res.offspring) == (0, 0, 0)


def test_delete_impact_404s_for_someone_elses_animal(owner):
    with pytest.raises(HTTPException) as e:
        run(ar.get_delete_impact, animal_id=uuid.uuid4(), db=DB({Animal: Q(first=None)}), current_user=owner)
    assert e.value.status_code == 404


def test_delete_impact_is_owner_only_like_delete():
    assert getattr(ar.get_delete_impact, "__access_policy__", None) == "owner_only"
    assert getattr(ar.delete_animal, "__access_policy__", None) == "owner_only"


def test_delete_impact_matches_either_parent_slot():
    """A pairing is the animal's whether it's the male or the female."""
    src = inspect.getsource(inspect.unwrap(ar.get_delete_impact))
    assert "male_animal_id == animal_id" in src and "female_animal_id == animal_id" in src


# ── M3: taxon-aware pairing messages ────────────────────────────────────────

def test_pairing_messages_never_say_others():
    m = rp.taxon_parent_messages("other")
    assert "others" not in m["taxon"].lower()
    assert m["male"].endswith("animal.") and m["female"].endswith("animal.")


@pytest.mark.parametrize("taxon,plural", [
    ("snake", "snakes"), ("tortoise", "tortoises"), ("frog", "frogs"), ("salamander", "salamanders"),
])
def test_pairing_messages_use_real_plurals(taxon, plural):
    assert rp.taxon_parent_messages(taxon)["taxon"] == f"Both parents must be {plural}."


def test_every_hv_taxon_has_pairing_wording():
    from app.models.animal import ANIMAL_TAXON_VALUES

    for t in ANIMAL_TAXON_VALUES:
        msgs = rp.taxon_parent_messages(t)
        assert set(msgs) == {"taxon", "male", "female"}
        assert "others" not in msgs["taxon"]


# ── M4: amphibian-sized clutches ────────────────────────────────────────────

def test_clutch_counts_take_a_frog_spawn():
    c = ClutchCreate(pairing_id=uuid.uuid4(), laid_date=date(2026, 10, 1), expected_count=3200, slug_count=400)
    assert c.expected_count == 3200
    assert ClutchUpdate(hatched_count=CLUTCH_COUNT_MAX).hatched_count == CLUTCH_COUNT_MAX


def test_clutch_counts_still_have_a_ceiling():
    with pytest.raises(ValidationError):
        ClutchCreate(pairing_id=uuid.uuid4(), laid_date=date(2026, 10, 1), expected_count=CLUTCH_COUNT_MAX + 1)
    with pytest.raises(ValidationError):
        ClutchUpdate(viable_count=-1)
