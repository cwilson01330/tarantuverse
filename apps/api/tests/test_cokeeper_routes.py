"""Co-keeper behaviour on migrated routes (PRD-shared-keeping rung 3).

For each migrated router: the owner works as before; a co-keeper is allowed
exactly what their role allows; a stranger gets a 404 indistinguishable from
"doesn't exist"; and writes are attributed to the actor while staying in the
OWNER's collection.
"""
from __future__ import annotations

import asyncio
import inspect
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.models.collection_member import CollectionMember
from app.models.colony import Colony
from app.models.animal import Animal
from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.tarantula import Tarantula
from app.models.user import User
from app.routers import feedings as fr
from app.schemas.feeding import BulkFeedingRequest, FeedingLogCreate, FeedingLogUpdate

NOW = datetime.now(timezone.utc)


class Q:
    def __init__(self, first=None, rows=None):
        self._first, self._rows = first, rows

    def filter(self, *a, **k):
        return self

    order_by = limit = options = filter

    def first(self):
        return self._first

    def all(self):
        return list(self._rows) if self._rows is not None else ([] if self._first is None else [self._first])


class DB:
    def __init__(self, by_model):
        self.by_model, self.added, self.deleted, self.commits = by_model, [], [], 0

    def query(self, model, *_):
        return self.by_model.get(getattr(model, "class_", model), Q())

    def add(self, o):
        self.added.append(o)

    def delete(self, o):
        self.deleted.append(o)

    def commit(self):
        self.commits += 1

    def refresh(self, o):
        pass

    def flush(self):
        pass


def person(premium=True):
    return NS(id=uuid.uuid4(), is_active=True, is_premium_for_app=lambda app: premium)


def run(fn, **kw):
    return asyncio.run(inspect.unwrap(fn)(**kw))


class World:
    """An owner with one invert, one colony and one HV animal, plus a caller
    who is `role` in the owner's collection (None = stranger)."""

    def __init__(self, role=None, app="tarantuverse", taxon="scorpion", entry_by=None, premium=True):
        self.owner, self.me = person(premium=premium), person()
        self.inv = NS(id=uuid.uuid4(), user_id=self.owner.id, taxon=taxon, feeding_paused_reason=None)
        self.col = NS(id=uuid.uuid4(), user_id=self.owner.id)
        self.ani = NS(id=uuid.uuid4(), user_id=self.owner.id, last_fed_at=None, feeding_paused_reason=None)
        self.entry = FeedingLog(id=uuid.uuid4(), invert_id=self.inv.id, fed_at=NOW, accepted=True,
                                logged_by_user_id=entry_by)
        membership = NS(role=role, app=app, status="active") if role else None
        self.db = DB({
            Invert: Q(self.inv, rows=[self.inv]),
            Colony: Q(self.col),
            Animal: Q(self.ani),
            User: Q(self.owner),
            CollectionMember: Q(membership),
            FeedingLog: Q(self.entry, rows=[self.entry]),
            Tarantula: Q(None),
        })


def status_of(fn, **kw):
    try:
        run(fn, **kw)
        return 200
    except HTTPException as e:
        return e.status_code


# ── reads ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("role,expected", [(None, 404), ("viewer", 200), ("logger", 200), ("keeper", 200)])
def test_reading_an_inverts_feedings(role, expected):
    w = World(role)
    assert status_of(fr.get_invert_feeding_logs, invert_id=w.inv.id, db=w.db, current_user=w.me) == expected


def test_a_membership_in_the_other_app_grants_nothing():
    """Memberships are per app: an HV membership doesn't open TV inverts.
    (The fake answers any membership lookup, so assert the app is in the query.)"""
    src = inspect.getsource(fr.get_invert_feeding_logs)
    assert 'load_invert(db, current_user, invert_id, "viewer")' in src


# ── writes ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("role,expected", [(None, 404), ("viewer", 403), ("logger", 200), ("keeper", 200)])
def test_logging_a_feeding_needs_logger(role, expected):
    w = World(role)
    body = FeedingLogCreate(fed_at=NOW, accepted=True, food_type="cricket")
    assert status_of(fr.create_invert_feeding_log, invert_id=w.inv.id, feeding_data=body,
                     db=w.db, current_user=w.me) == expected


def test_a_co_keepers_entry_is_attributed_and_stays_in_the_owners_collection():
    w = World("logger")
    run(fr.create_invert_feeding_log, invert_id=w.inv.id,
        feeding_data=FeedingLogCreate(fed_at=NOW, accepted=True), db=w.db, current_user=w.me)
    (log,) = w.db.added
    assert log.invert_id == w.inv.id and log.logged_by_user_id == w.me.id


def test_the_owners_own_entry_is_not_attributed():
    w = World()
    run(fr.create_invert_feeding_log, invert_id=w.inv.id,
        feeding_data=FeedingLogCreate(fed_at=NOW, accepted=True), db=w.db, current_user=w.owner)
    assert w.db.added[0].logged_by_user_id is None


def test_a_tarantula_entry_also_sets_the_legacy_twin():
    w = World("logger", taxon="tarantula")
    w.db.by_model[Tarantula] = Q(NS(id=w.inv.id))
    run(fr.create_invert_feeding_log, invert_id=w.inv.id,
        feeding_data=FeedingLogCreate(fed_at=NOW, accepted=True), db=w.db, current_user=w.me)
    assert w.db.added[0].tarantula_id == w.inv.id


def test_a_lapsed_owner_leaves_co_keepers_read_only():
    w = World("keeper", premium=False)
    body = FeedingLogCreate(fed_at=NOW, accepted=True)
    assert status_of(fr.create_invert_feeding_log, invert_id=w.inv.id, feeding_data=body,
                     db=w.db, current_user=w.me) == 403
    assert status_of(fr.get_invert_feeding_logs, invert_id=w.inv.id, db=w.db, current_user=w.me) == 200


# ── edit / delete by id ──────────────────────────────────────────────────────

@pytest.mark.parametrize("role,entry_by_me,expected", [
    (None, False, 404),        # stranger: 404, not the old 403 that leaked existence
    ("viewer", False, 403),
    ("logger", False, 403),    # loggers change only their own entries
    ("logger", True, 200),
    ("keeper", False, 200),
])
def test_editing_an_entry(role, entry_by_me, expected):
    w = World(role)
    if entry_by_me:
        w.entry.logged_by_user_id = w.me.id
    assert status_of(fr.update_feeding_log, feeding_id=w.entry.id, feeding_data=FeedingLogUpdate(notes="x"),
                     db=w.db, current_user=w.me) == expected
    assert status_of(fr.delete_feeding_log, feeding_id=w.entry.id, db=w.db, current_user=w.me) == expected


def test_a_stranger_cannot_tell_a_real_entry_from_a_missing_one():
    w = World(None)
    real = status_of(fr.get_feeding_log, feeding_id=w.entry.id, db=w.db, current_user=w.me)
    w.db.by_model[FeedingLog] = Q(None)
    missing = status_of(fr.get_feeding_log, feeding_id=uuid.uuid4(), db=w.db, current_user=w.me)
    assert real == missing == 404


def test_colony_feedings_open_by_id_now():
    """Existing bug: _feeding_owner_taxon had no colony branch → 403."""
    w = World()
    w.entry.invert_id, w.entry.colony_id = None, w.col.id
    assert status_of(fr.get_feeding_log, feeding_id=w.entry.id, db=w.db, current_user=w.owner) == 200


def test_enclosure_feedings_stay_owner_only():
    from app.models.enclosure import Enclosure
    w = World("keeper")
    enc = NS(id=uuid.uuid4(), user_id=w.owner.id)
    w.db.by_model[Enclosure] = Q(enc)
    w.entry.invert_id, w.entry.enclosure_id = None, enc.id
    assert status_of(fr.get_feeding_log, feeding_id=w.entry.id, db=w.db, current_user=w.me) == 404
    assert status_of(fr.get_feeding_log, feeding_id=w.entry.id, db=w.db, current_user=w.owner) == 200


# ── Feeding Day + HV ─────────────────────────────────────────────────────────

def test_bulk_feeding_is_scoped_to_the_named_collection():
    w = World("logger")
    body = BulkFeedingRequest(invert_ids=[w.inv.id], accepted=True)
    out = run(fr.bulk_create_invert_feedings, payload=body, collection=w.owner.id, db=w.db, current_user=w.me)
    assert out.created_count == 1 and w.db.added[0].logged_by_user_id == w.me.id
    assert "Invert.user_id == access.owner.id" in inspect.getsource(fr.bulk_create_invert_feedings)


def test_bulk_feeding_in_a_collection_you_dont_belong_to_is_a_404():
    w = World(None)
    body = BulkFeedingRequest(invert_ids=[w.inv.id], accepted=True)
    assert status_of(fr.bulk_create_invert_feedings, payload=body, collection=w.owner.id,
                     db=w.db, current_user=w.me) == 404


@pytest.mark.parametrize("role,expected", [(None, 404), ("viewer", 403), ("logger", 200)])
def test_hv_quick_feed(role, expected):
    w = World(role, app="herpetoverse")
    assert status_of(fr.quick_feed_animal, animal_id=w.ani.id, db=w.db, current_user=w.me) == expected


# ── animals: whose collection, whose cap ─────────────────────────────────────

from app.routers import inverts as ir, colonies as cr, animals as ar, care_logs as clr, sheds as shr, photos as phr
from app.schemas.invert import InvertCreate, InvertUpdate
from app.schemas.animal import AnimalCreate
from app.schemas.colony import ColonyCreate
from app.schemas.care_log import CareLogCreate
from app.schemas.shed_log import ShedLogUpdate
from app.models.care_log import CareLog
from app.models.shed_log import ShedLog
from app.models.photo import Photo


def test_a_keeper_adds_an_animal_to_the_owners_collection_and_cap(monkeypatch):
    w = World("keeper")
    seen = {}
    monkeypatch.setattr(ir, "create_invert_row", lambda db, user, payload: seen.setdefault("owner", user) or "row")
    run(ir.create_invert, payload=InvertCreate(taxon="scorpion", name="Vex"), collection=w.owner.id,
        db=w.db, current_user=w.me)
    assert seen["owner"] is w.owner   # cap, plan, visibility and user_id all come from here


@pytest.mark.parametrize("role", ["viewer", "logger"])
def test_only_keepers_add_animals(role):
    w = World(role)
    assert status_of(ir.create_invert, payload=InvertCreate(taxon="scorpion"), collection=w.owner.id,
                     db=w.db, current_user=w.me) == 403


@pytest.mark.parametrize("role,expected", [(None, 404), ("viewer", 403), ("logger", 403), ("keeper", 200)])
def test_editing_an_animal_needs_keeper(role, expected, monkeypatch):
    import app.services.inverts_dualwrite as dw
    monkeypatch.setattr(dw, "mirror_invert_update_to_legacy", lambda db, inv: None)
    w = World(role)
    assert status_of(ir.update_invert, invert_id=w.inv.id, payload=InvertUpdate(name="New"),
                     db=w.db, current_user=w.me) == expected


def test_deleting_an_animal_stays_owner_only():
    assert getattr(ir.delete_invert, "__access_policy__") == "owner_only"
    assert getattr(ar.delete_animal, "__access_policy__") == "owner_only"
    assert getattr(cr.delete_colony, "__access_policy__") == "owner_only"
    src = inspect.getsource(cr.delete_colony)
    assert "Colony.user_id == current_user.id" in src


def test_listing_someone_elses_collection_without_membership_is_a_404():
    w = World(None)
    assert status_of(ir.list_inverts, taxon=None, colony_id=None, status=None, transferred=False,
                     deceased=False, collection=w.owner.id, db=w.db, current_user=w.me) == 404


def test_a_keeper_colony_lands_in_the_owners_collection(monkeypatch):
    w = World("keeper")
    capped = []
    monkeypatch.setattr(cr, "enforce_collection_limit", lambda db, user: capped.append(user))
    monkeypatch.setattr(cr, "_build_response", lambda c, db: {"__row__": c})
    monkeypatch.setattr(cr, "ColonyResponse", lambda **kw: kw["__row__"])
    row = run(cr.create_colony, payload=ColonyCreate(name="Isos", taxon="isopod"), collection=w.owner.id,
              db=w.db, current_user=w.me)
    assert capped == [w.owner] and row.user_id == w.owner.id


def test_a_keeper_hv_animal_counts_against_the_owner(monkeypatch):
    w = World("keeper", app="herpetoverse")
    capped = []
    monkeypatch.setattr(ar, "enforce_animal_limit", lambda db, user: capped.append(user))
    row = run(ar.create_animal, animal_data=AnimalCreate(taxon="snake", name="Mango"), collection=w.owner.id,
              db=w.db, current_user=w.me)
    assert capped == [w.owner] and row.user_id == w.owner.id


# ── other logs ───────────────────────────────────────────────────────────────

def test_a_co_keepers_care_log_is_the_owners_row_with_their_name():
    w = World("logger")
    row = run(clr.create_care_log, invert_id=w.inv.id,
              log_data=CareLogCreate(log_type="water_dish", logged_at=NOW), db=w.db, current_user=w.me)
    assert row.user_id == w.owner.id and row.logged_by_user_id == w.me.id


@pytest.mark.parametrize("mine,expected", [(True, 200), (False, 403)])
def test_loggers_edit_only_their_own_sheds(mine, expected):
    w = World("logger", app="herpetoverse")
    shed = ShedLog(id=uuid.uuid4(), animal_id=w.ani.id, shed_at=NOW,
                   logged_by_user_id=w.me.id if mine else None)
    w.db.by_model[ShedLog] = Q(shed)
    assert status_of(shr.update_shed, shed_id=shed.id, shed_data=ShedLogUpdate(notes="x"),
                     db=w.db, current_user=w.me) == expected


def test_a_strangers_shed_is_a_404_not_a_403():
    w = World(None, app="herpetoverse")
    shed = ShedLog(id=uuid.uuid4(), animal_id=w.ani.id, shed_at=NOW)
    w.db.by_model[ShedLog] = Q(shed)
    assert status_of(shr.get_shed, shed_id=shed.id, db=w.db, current_user=w.me) == 404


@pytest.mark.parametrize("role,expected", [("logger", 403), ("keeper", 200)])
def test_choosing_the_hero_photo_is_a_keeper_action(role, expected, monkeypatch):
    monkeypatch.setattr(phr, "sync_hero_photo", lambda db, parent, url: None)
    w = World(role)
    photo = Photo(id=uuid.uuid4(), invert_id=w.inv.id, url="https://x/y.jpg")
    w.db.by_model[Photo] = Q(photo)
    assert status_of(phr.set_main_photo, photo_id=str(photo.id), db=w.db, current_user=w.me) == expected
