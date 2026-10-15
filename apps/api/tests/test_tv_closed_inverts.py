"""Closed Tarantuverse inverts refuse NEW history (2026-10-12).

Same rule as Herpetoverse (tests/test_hv_closed_logs.py), centralised in
app/utils/closed_animals.py:

* NEW feedings, molts, substrate changes, care logs, photos, QR upload
  sessions, QR uploads and per-animal events on a died or transferred invert
  -> 409, on the generic /inverts/ routes AND the legacy facades
  (/tarantulas/, /scorpions/, /centipedes/, /whip-spiders/).
* Feeding Day skips a closed animal and reports it; the batch still saves.
* Editing / deleting existing entries, photo caption / set-main, revive,
  PUT /inverts/{id} and change-taxon stay open.

Fake-DB style, like test_hv_closed_logs.
"""
import asyncio
import inspect
import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.models.animal_event import AnimalEvent
from app.models.care_log import CareLog
from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.molt_log import MoltLog
from app.models.photo import Photo
from app.models.qr_upload_session import QRUploadSession
from app.models.scorpion import Scorpion
from app.models.substrate_change import SubstrateChange
from app.models.tarantula import Tarantula
from app.routers import animal_events as ae
from app.routers import animals as an
from app.routers import care_logs as cl
from app.routers import feedings as fr
from app.routers import inverts as iv
from app.routers import molts as ml
from app.routers import photos as ph
from app.routers import qr
from app.routers import substrate_changes as sc
from app.routers import transfers as tr
from app.schemas.animal_event import AnimalEventCreate, AnimalEventUpdate
from app.schemas.care_log import CareLogCreate, CareLogUpdate
from app.schemas.feeding import BulkFeedingRequest, FeedingLogCreate, FeedingLogUpdate
from app.schemas.molt import MoltLogCreate, MoltLogUpdate
from app.schemas.substrate_change import SubstrateChangeCreate, SubstrateChangeUpdate
from app.utils import closed_animals

NOW = datetime(2026, 10, 1, 12, tzinfo=timezone.utc)
DIED = ("died_at", date(2026, 9, 1))
GONE = ("transferred_out_at", datetime(2026, 9, 1, tzinfo=timezone.utc))
CLOSED = pytest.mark.parametrize("field,value", [DIED, GONE], ids=["died", "transferred"])


class Q:
    def __init__(self, first=None, all_=None):
        self._first, self._all = first, list(all_ or [])

    def filter(self, *a, **k):
        return self

    def order_by(self, *a):
        return self

    def first(self):
        return self._first

    def all(self):
        return list(self._all)

    def count(self):
        return len(self._all)

    def update(self, *a, **k):
        return 0


class DB:
    def __init__(self, by_model=None):
        self.by_model = by_model or {}
        self.commits, self.added, self.deleted = 0, [], []

    def query(self, model, *_):
        return self.by_model.get(model, Q())

    def add(self, obj):
        self.added.append(obj)

    def delete(self, obj):
        self.deleted.append(obj)

    def flush(self):
        pass

    def commit(self):
        self.commits += 1

    def rollback(self):
        pass

    def refresh(self, obj):
        pass

    def of(self, model):
        return [o for o in self.added if isinstance(o, model)]


def run(fn, **kw):
    return asyncio.run(inspect.unwrap(fn)(**kw))


@pytest.fixture
def owner():
    return NS(id=uuid.uuid4())


def invert(owner_id, **over):
    base = dict(
        id=uuid.uuid4(), user_id=owner_id, taxon="mantis", died_at=None, transferred_out_at=None,
        death_cause=None, death_notes=None, feeding_paused_reason=None, feeding_paused_until=None,
        last_substrate_change=None, substrate_type=None, substrate_depth=None, current_instar=None,
        photo_url="https://r2/hero.jpg", name="Mo", common_name="Orchid mantis",
        scientific_name="Hymenopus coronatus",
    )
    base.update(over)
    return NS(**base)


def _access(owner):
    return NS(owner=owner, actor=owner, role="owner", logged_by_user_id=None)


def _patch_loads(monkeypatch, owner, inv):
    """Point every TV module's load_invert / load_log_parent at `inv`."""
    for mod in (fr, ml, sc, cl, ph, ae, iv):
        if hasattr(mod, "load_invert"):
            monkeypatch.setattr(mod, "load_invert", lambda db, user, iid, need, **k: (inv, _access(owner)))
        if hasattr(mod, "load_log_parent"):
            monkeypatch.setattr(mod, "load_log_parent", lambda db, user, row, need, **k: (inv, _access(owner)))
    monkeypatch.setattr(ph, "enforce_photo_cap", lambda *a, **k: None)


class _File:
    content_type = "image/jpeg"
    filename = "a.jpg"

    async def read(self):
        return b"\xff\xd8\xff-bytes"


def _feed():
    return FeedingLogCreate(fed_at=NOW, accepted=True, food_type="fly")


def _molt():
    return MoltLogCreate(molted_at=NOW)


def _sub():
    return SubstrateChangeCreate(changed_at=date(2026, 10, 1))


def _care():
    return CareLogCreate(log_type="misted", logged_at=NOW - timedelta(hours=1))


def _storage():
    return patch.object(ph.storage_service, "upload_photo",
                        new=AsyncMock(return_value=("https://r2/p.jpg", "https://r2/t.jpg")))


def _photo(inv, db, o):
    with patch.object(ph, "validate_image_bytes", return_value="image/jpeg"), _storage() as up:
        out = run(ph.upload_invert_photo, invert_id=str(inv.id), file=_File(), caption=None,
                  db=db, current_user=o)
    return out, up


# ── generic /inverts/{id}/… creates ─────────────────────────────────────────

CREATES = {
    "feeding": (FeedingLog, lambda i, db, o: run(fr.create_invert_feeding_log, invert_id=i.id,
                                                 feeding_data=_feed(), db=db, current_user=o)),
    "molt": (MoltLog, lambda i, db, o: run(ml.create_invert_molt_log, invert_id=i.id,
                                           molt_data=_molt(), db=db, current_user=o)),
    "substrate": (SubstrateChange, lambda i, db, o: run(sc.create_invert_substrate_change, invert_id=i.id,
                                                        change_data=_sub(), db=db, current_user=o)),
    "care_log": (CareLog, lambda i, db, o: run(cl.create_care_log, invert_id=i.id, log_data=_care(),
                                               db=db, current_user=o)),
    "event": (AnimalEvent, lambda i, db, o: run(ae.create_invert_event, invert_id=i.id,
                                                payload=AnimalEventCreate(event_type="observation"),
                                                db=db, current_user=o)),
    "photo": (Photo, lambda i, db, o: _photo(i, db, o)),
    "qr_session": (QRUploadSession, lambda i, db, o: run(qr.create_invert_upload_session,
                                                         invert_id=str(i.id), db=db, current_user=o)),
}


def _db_for(inv):
    # The QR session route looks the invert up itself rather than via load_invert.
    return DB({Invert: Q(first=inv)})


@CLOSED
@pytest.mark.parametrize("kind", sorted(CREATES))
def test_new_entry_on_closed_invert_is_409(monkeypatch, owner, kind, field, value):
    inv = invert(owner.id, **{field: value})
    _patch_loads(monkeypatch, owner, inv)
    db = _db_for(inv)
    with _storage() as up:
        with pytest.raises(HTTPException) as e:
            CREATES[kind][1](inv, db, owner)
    assert e.value.status_code == 409
    up.assert_not_awaited()  # a refused photo never reaches R2
    assert db.added == [] and db.commits == 0
    # Denormalised hints on the record don't move either.
    assert inv.last_substrate_change is None and inv.current_instar is None


@pytest.mark.parametrize("kind", sorted(CREATES))
def test_new_entry_on_a_living_invert_still_works(monkeypatch, owner, kind):
    inv = invert(owner.id)
    _patch_loads(monkeypatch, owner, inv)
    db = _db_for(inv)
    CREATES[kind][1](inv, db, owner)
    assert len(db.of(CREATES[kind][0])) == 1 and db.commits == 1


def test_messages_match_herpetoverse(monkeypatch, owner):
    """Both apps say the same thing (routers/animals.py::refuse_if_closed)."""
    for field, value in (DIED, GONE):
        inv = invert(owner.id, **{field: value})
        _patch_loads(monkeypatch, owner, inv)
        with pytest.raises(HTTPException) as tv:
            CREATES["feeding"][1](inv, DB(), owner)
        with pytest.raises(HTTPException) as hv:
            an.refuse_if_closed(NS(**{"died_at": None, "transferred_out_at": None, field: value}))
        assert tv.value.detail == hv.value.detail
    assert closed_animals.DIED_DETAIL == "This animal is marked as died. Restore it before making changes."


# ── legacy facade creates (same animals, older clients) ─────────────────────

def _legacy_db(kind, inv):
    """Tarantula / scorpion facades load the legacy row; the lifecycle lives
    on the `inverts` twin (same PK). Centipede / whip-spider load the invert."""
    if kind == "tarantula":
        legacy = NS(id=inv.id, user_id=inv.user_id, died_at=None, name="T", common_name=None,
                    scientific_name=None, photo_url="x", feeding_paused_reason=None)
        return DB({Tarantula: Q(first=legacy), Invert: Q(first=inv)})
    if kind == "scorpion":
        legacy = NS(id=inv.id, user_id=inv.user_id, died_at=None, name="S", common_name=None,
                    scientific_name=None, photo_url="x", feeding_paused_reason=None)
        return DB({Scorpion: Q(first=legacy), Invert: Q(first=inv)})
    return DB({Invert: Q(first=inv)})


FACADES = {
    "tarantula": dict(
        feeding=lambda i, db, o: run(fr.create_feeding_log, tarantula_id=i.id, feeding_data=_feed(), db=db, current_user=o),
        molt=lambda i, db, o: run(ml.create_molt_log, tarantula_id=i.id, molt_data=_molt(), db=db, current_user=o),
        substrate=lambda i, db, o: run(sc.create_substrate_change, tarantula_id=i.id, change_data=_sub(), db=db, current_user=o),
        photo=lambda i, db, o: run(ph.upload_photo, tarantula_id=str(i.id), file=_File(), caption=None, db=db, current_user=o),
        qr_session=lambda i, db, o: run(qr.create_upload_session, tarantula_id=str(i.id), db=db, current_user=o),
    ),
    "scorpion": dict(
        feeding=lambda i, db, o: run(fr.create_scorpion_feeding_log, scorpion_id=i.id, feeding_data=_feed(), db=db, current_user=o),
        molt=lambda i, db, o: run(ml.create_scorpion_molt_log, scorpion_id=i.id, molt_data=_molt(), db=db, current_user=o),
        substrate=lambda i, db, o: run(sc.create_scorpion_substrate_change, scorpion_id=i.id, change_data=_sub(), db=db, current_user=o),
        photo=lambda i, db, o: run(ph.upload_scorpion_photo, scorpion_id=str(i.id), file=_File(), caption=None, db=db, current_user=o),
        qr_session=lambda i, db, o: run(qr.create_scorpion_upload_session, scorpion_id=str(i.id), db=db, current_user=o),
    ),
    "centipede": dict(
        feeding=lambda i, db, o: run(fr.create_centipede_feeding_log, centipede_id=i.id, feeding_data=_feed(), db=db, current_user=o),
        molt=lambda i, db, o: run(ml.create_centipede_molt_log, centipede_id=i.id, molt_data=_molt(), db=db, current_user=o),
        substrate=lambda i, db, o: run(sc.create_centipede_substrate_change, centipede_id=i.id, change_data=_sub(), db=db, current_user=o),
        photo=lambda i, db, o: run(ph.upload_centipede_photo, centipede_id=str(i.id), file=_File(), caption=None, db=db, current_user=o),
        qr_session=lambda i, db, o: run(qr.create_centipede_upload_session, centipede_id=str(i.id), db=db, current_user=o),
    ),
    "whip_spider": dict(
        feeding=lambda i, db, o: run(fr.create_whip_spider_feeding_log, whip_spider_id=i.id, feeding_data=_feed(), db=db, current_user=o),
        molt=lambda i, db, o: run(ml.create_whip_spider_molt_log, whip_spider_id=i.id, molt_data=_molt(), db=db, current_user=o),
        substrate=lambda i, db, o: run(sc.create_whip_spider_substrate_change, whip_spider_id=i.id, change_data=_sub(), db=db, current_user=o),
        photo=lambda i, db, o: run(ph.upload_whip_spider_photo, whip_spider_id=str(i.id), file=_File(), caption=None, db=db, current_user=o),
    ),
}
FACADE_CASES = [(t, k) for t, routes in FACADES.items() for k in routes]


@CLOSED
@pytest.mark.parametrize("taxon,kind", FACADE_CASES, ids=[f"{t}-{k}" for t, k in FACADE_CASES])
def test_legacy_facade_create_on_closed_invert_is_409(monkeypatch, owner, taxon, kind, field, value):
    inv = invert(owner.id, taxon=taxon, **{field: value})
    monkeypatch.setattr(ph, "enforce_photo_cap", lambda *a, **k: None)
    db = _legacy_db(taxon, inv)
    with _storage() as up:
        with pytest.raises(HTTPException) as e:
            FACADES[taxon][kind](inv, db, owner)
    assert e.value.status_code == 409
    up.assert_not_awaited()
    assert db.added == [] and db.commits == 0


def test_legacy_row_marked_died_without_a_twin_is_still_refused(owner):
    legacy = NS(id=uuid.uuid4(), died_at=date(2026, 9, 1))
    with pytest.raises(HTTPException) as e:
        closed_animals.refuse_if_closed_legacy(DB(), legacy)
    assert e.value.status_code == 409


@pytest.mark.parametrize("taxon", ["tarantula", "scorpion", "centipede", "whip_spider"])
def test_legacy_facade_feeding_on_a_living_invert_still_works(owner, taxon):
    inv = invert(owner.id, taxon=taxon)
    db = _legacy_db(taxon, inv)
    with patch.object(fr, "create_activity", new=AsyncMock()):
        FACADES[taxon]["feeding"](inv, db, owner)
    assert len(db.of(FeedingLog)) == 1


# ── QR upload onto a session opened before the animal closed ────────────────

def _qr_upload(kind, parent, db):
    s = QRUploadSession(token="tok", invert_id=parent.id, user_id=parent.user_id, used_count=0,
                        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10), is_active=True)
    db.by_model[QRUploadSession] = Q(first=s)
    with patch.object(qr, "_session_parent", return_value=(kind, parent)), \
         patch.object(qr, "validate_image_bytes", return_value="image/jpeg"), \
         patch.object(qr.storage_service, "upload_photo",
                      new=AsyncMock(return_value=("https://r2/p.jpg", "https://r2/t.jpg"))) as up:
        try:
            out = asyncio.run(qr.upload_photo_via_token("tok", file=_File(), caption=None, db=db))
        except HTTPException as e:
            return e, s, up
    return out, s, up


@CLOSED
def test_qr_upload_onto_a_closed_invert_is_409(owner, field, value):
    inv = invert(owner.id, **{field: value})
    db = DB()
    err, s, up = _qr_upload("invert", inv, db)
    assert isinstance(err, HTTPException) and err.status_code == 409
    up.assert_not_awaited()
    assert db.added == [] and s.used_count == 0


@CLOSED
def test_qr_upload_onto_a_tarantula_whose_twin_closed_is_409(owner, field, value):
    inv = invert(owner.id, taxon="tarantula", **{field: value})
    legacy = NS(id=inv.id, user_id=owner.id, died_at=None, photo_url="x")
    db = DB({Invert: Q(first=inv)})
    err, s, up = _qr_upload("tarantula", legacy, db)
    assert isinstance(err, HTTPException) and err.status_code == 409
    up.assert_not_awaited()


def test_qr_upload_onto_a_living_invert_still_works(owner):
    inv = invert(owner.id)
    db = DB()
    out, s, up = _qr_upload("invert", inv, db)
    assert out["success"] is True and s.used_count == 1
    (photo,) = db.of(Photo)
    assert str(photo.invert_id) == str(inv.id)


# ── Feeding Day skips closed animals, saves the rest ────────────────────────

def test_bulk_feeding_skips_closed_animals_and_reports_them(monkeypatch, owner):
    alive = invert(owner.id)
    died = invert(owner.id, died_at=date(2026, 9, 1))
    gone = invert(owner.id, transferred_out_at=NOW)
    stranger = uuid.uuid4()
    monkeypatch.setattr(fr, "scope_collection", lambda *a, **k: _access(owner))
    db = DB({Invert: Q(all_=[alive, died, gone])})
    out = run(fr.bulk_create_invert_feedings,
              payload=BulkFeedingRequest(invert_ids=[alive.id, died.id, gone.id, stranger], accepted=True),
              collection=None, db=db, current_user=owner)
    assert out.created_ids == [alive.id] and out.created_count == 1
    reasons = {s.invert_id: s.reason for s in out.skipped}
    assert reasons == {
        died.id: closed_animals.DIED_SKIP_REASON,
        gone.id: closed_animals.TRANSFERRED_SKIP_REASON,
        stranger: "Not found or not yours",
    }
    (log,) = db.of(FeedingLog)
    assert log.invert_id == alive.id and db.commits == 1


def test_bulk_feeding_of_only_closed_animals_saves_nothing_but_does_not_fail(monkeypatch, owner):
    died = invert(owner.id, died_at=date(2026, 9, 1))
    monkeypatch.setattr(fr, "scope_collection", lambda *a, **k: _access(owner))
    db = DB({Invert: Q(all_=[died])})
    out = run(fr.bulk_create_invert_feedings, payload=BulkFeedingRequest(invert_ids=[died.id]),
              collection=None, db=db, current_user=owner)
    assert out.created_count == 0 and len(out.skipped) == 1 and db.of(FeedingLog) == []


# ── existing entries stay editable ──────────────────────────────────────────

@CLOSED
def test_existing_entries_on_closed_invert_can_still_be_edited_and_deleted(monkeypatch, owner, field, value):
    inv = invert(owner.id, **{field: value})
    _patch_loads(monkeypatch, owner, inv)

    feeding = NS(id=uuid.uuid4(), invert_id=inv.id, notes=None, logged_by_user_id=None)
    db = DB({FeedingLog: Q(first=feeding)})
    run(fr.update_feeding_log, feeding_id=feeding.id, feeding_data=FeedingLogUpdate(notes="typo"),
        db=db, current_user=owner)
    assert feeding.notes == "typo"
    run(fr.delete_feeding_log, feeding_id=feeding.id, db=db, current_user=owner)
    assert db.deleted == [feeding]

    molt = NS(id=uuid.uuid4(), invert_id=inv.id, tarantula_id=None, notes=None, logged_by_user_id=None,
              molted_at=NOW)
    db = DB({MoltLog: Q(first=molt)})
    run(ml.update_molt_log, molt_id=molt.id, molt_data=MoltLogUpdate(notes="fatal"), db=db, current_user=owner)
    assert molt.notes == "fatal"
    run(ml.delete_molt_log, molt_id=molt.id, db=db, current_user=owner)
    assert db.deleted == [molt]

    change = NS(id=uuid.uuid4(), invert_id=inv.id, notes=None, logged_by_user_id=None)
    db = DB({SubstrateChange: Q(first=change)})
    run(sc.update_substrate_change, change_id=change.id, change_data=SubstrateChangeUpdate(notes="x"),
        db=db, current_user=owner)
    assert change.notes == "x"
    run(sc.delete_substrate_change, change_id=change.id, db=db, current_user=owner)
    assert db.deleted == [change]

    care = NS(id=uuid.uuid4(), invert_id=inv.id, notes=None, logged_by_user_id=None)
    db = DB({CareLog: Q(first=care)})
    run(cl.update_care_log, log_id=care.id, log_data=CareLogUpdate(notes="y"), db=db, current_user=owner)
    assert care.notes == "y"
    run(cl.delete_care_log, log_id=care.id, db=db, current_user=owner)
    assert db.deleted == [care]

    ev = NS(id=uuid.uuid4(), animal_id=None, invert_id=inv.id, severity="minor", logged_by_user_id=None)
    db = DB({AnimalEvent: Q(first=ev)})
    run(ae.update_animal_event, event_id=ev.id, payload=AnimalEventUpdate(severity="severe"),
        db=db, current_user=owner)
    assert ev.severity == "severe"
    run(ae.delete_animal_event, event_id=ev.id, db=db, current_user=owner)
    assert db.deleted == [ev]


@CLOSED
def test_photo_caption_and_set_main_on_closed_invert_stay_open(monkeypatch, owner, field, value):
    inv = invert(owner.id, **{field: value})
    _patch_loads(monkeypatch, owner, inv)
    photo = NS(id=str(uuid.uuid4()), invert_id=inv.id, url="https://r2/last.jpg", thumbnail_url="t",
               caption=None, taken_at=None, created_at=NOW, logged_by_user_id=None)
    out = run(ph.update_photo, photo_id=photo.id, data=ph.PhotoUpdate(caption="last photo"),
              db=DB({Photo: Q(first=photo)}), current_user=owner)
    assert out["caption"] == "last photo"
    out = run(ph.set_main_photo, photo_id=photo.id, db=DB({Photo: Q(first=photo)}), current_user=owner)
    assert inv.photo_url == "https://r2/last.jpg"


def test_revive_reopens_logging(monkeypatch, owner):
    """The undo path: /revive clears died_at, after which logging works."""
    inv = invert(owner.id, died_at=date(2026, 9, 1), death_cause="unknown")
    _patch_loads(monkeypatch, owner, inv)
    with pytest.raises(HTTPException):
        CREATES["feeding"][1](inv, DB(), owner)
    with patch("app.services.inverts_dualwrite.mirror_invert_update_to_legacy"):
        run(iv.revive_invert, invert_id=inv.id, db=DB(), current_user=owner)
    assert inv.died_at is None
    db = DB()
    CREATES["feeding"][1](inv, db, owner)
    assert len(db.of(FeedingLog)) == 1


# ── static guards: who refuses, who doesn't ─────────────────────────────────

REFUSING = [
    fr.create_feeding_log, fr.create_scorpion_feeding_log, fr.create_centipede_feeding_log,
    fr.create_whip_spider_feeding_log, fr.create_invert_feeding_log, fr.bulk_create_invert_feedings,
    ml.create_molt_log, ml.create_scorpion_molt_log, ml.create_centipede_molt_log,
    ml.create_whip_spider_molt_log, ml.create_invert_molt_log,
    sc.create_substrate_change, sc.create_scorpion_substrate_change, sc.create_centipede_substrate_change,
    sc.create_whip_spider_substrate_change, sc.create_invert_substrate_change,
    cl.create_care_log, ae.create_invert_event,
    ph.upload_photo, ph.upload_scorpion_photo, ph.upload_centipede_photo,
    ph.upload_whip_spider_photo, ph.upload_invert_photo,
    qr.create_upload_session, qr.create_invert_upload_session, qr.create_scorpion_upload_session,
    qr.create_centipede_upload_session, qr.upload_photo_via_token,
]
OPEN = [
    fr.update_feeding_log, fr.delete_feeding_log, ml.update_molt_log, ml.delete_molt_log,
    sc.update_substrate_change, sc.delete_substrate_change, cl.update_care_log, cl.delete_care_log,
    ph.update_photo, ph.delete_photo, ph.set_main_photo,
    iv.update_invert, iv.revive_invert, iv.change_taxon,
]
HELPERS = ("refuse_if_closed_invert", "refuse_if_closed_legacy", "skip_reason")


@pytest.mark.parametrize("fn", REFUSING, ids=lambda f: f.__name__)
def test_every_tv_create_route_uses_the_closed_helper(fn):
    src = inspect.getsource(inspect.unwrap(fn))
    assert any(h in src for h in HELPERS), f"{fn.__name__} doesn't refuse closed inverts"


@pytest.mark.parametrize("fn", OPEN, ids=lambda f: f.__name__)
def test_edit_delete_and_lifecycle_routes_stay_open(fn):
    src = inspect.getsource(inspect.unwrap(fn))
    assert not any(h in src for h in HELPERS), f"{fn.__name__} should stay open on a closed invert"


def test_transfer_claims_are_unaffected():
    """Claims write the BUYER's new animal and its copied photos directly —
    never through the refusing routes — so the rule can't block a claim."""
    assert "closed_animals" not in inspect.getsource(tr)
