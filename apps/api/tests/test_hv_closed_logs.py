"""Closed HV animals refuse NEW logs (2026-10-08).

A died or transferred Herpetoverse animal is history (audit-2,
routers/animals.py::refuse_if_closed). Events and genotype already answered
409 (test_hv_closed_events_genotype.py); this closes the per-animal log and
photo routes: feeding, quick-feed, shed, weight, photo upload and the QR
photo upload.

The rule chosen for EXISTING entries is the TV one. Tarantuverse's invert log
routes (feedings / molts / substrate / care logs / photos) refuse nothing on a
died or transferred invert, and the TV clients only hide "add" on a died
invert — editing or deleting a mistaken entry stays possible. So on HV:

* NEW logs / photos on a closed animal -> 409.
* Editing or deleting an existing log, and photo caption edits -> still open.
* TV invert events keep TV log-route parity -> still open (not refused).

Also pinned: revive reopens logging; a hold-back linking an offspring to a
closed animal saves the link but copies no genotype rows.

Fake-DB style, like test_hv_closed_events_genotype.
"""
import asyncio
import inspect
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.models.animal import Animal
from app.models.animal_event import AnimalEvent
from app.models.animal_genotype import AnimalGenotype
from app.models.feeding_log import FeedingLog
from app.models.gene import Gene
from app.models.photo import Photo
from app.models.qr_upload_session import QRUploadSession
from app.models.reptile_offspring import ReptileOffspring
from app.models.shed_log import ShedLog
from app.models.weight_log import WeightLog
from app.routers import animal_events as ae
from app.routers import animals as an
from app.routers import feedings as fr
from app.routers import photos as ph
from app.routers import qr
from app.routers import reptile_offspring as ro
from app.routers import sheds as sh
from app.routers import weight_logs as wl
from app.schemas.animal_event import AnimalEventCreate, AnimalEventUpdate
from app.schemas.feeding import FeedingLogCreate, FeedingLogUpdate
from app.schemas.reptile_breeding import ReptileOffspringUpdate
from app.schemas.shed_log import ShedLogCreate, ShedLogUpdate
from app.schemas.weight_log import WeightLogCreate, WeightLogUpdate

NOW = datetime(2026, 10, 1, 12, tzinfo=timezone.utc)
DIED = ("died_at", date(2026, 9, 1))
GONE = ("transferred_out_at", datetime(2026, 9, 1, tzinfo=timezone.utc))
CLOSED = pytest.mark.parametrize("field,value", [DIED, GONE], ids=["died", "transferred"])


class Q:
    def __init__(self, first=None, all_=None, count=0, scalar=None):
        self._first, self._all, self._count, self._scalar = first, list(all_ or []), count, scalar

    def filter(self, *a, **k):
        return self

    def order_by(self, *a):
        return self

    def first(self):
        return self._first

    def all(self):
        return list(self._all)

    def count(self):
        return self._count

    def scalar(self):
        return self._scalar

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


def animal(owner_id, **over):
    base = dict(
        id=uuid.uuid4(), user_id=owner_id, died_at=None, transferred_out_at=None,
        death_cause=None, death_notes=None, last_fed_at=None, last_shed_at=None,
        current_weight_g=None, feeding_paused_reason=None, feeding_paused_until=None,
        photo_url="https://r2/hero.jpg", name="Noodle", common_name="Ball python",
        scientific_name="Python regius", taxon="snake",
    )
    base.update(over)
    return NS(**base)


def _access(owner):
    return NS(owner=owner, actor=owner, role="owner", logged_by_user_id=None)


def _patch_loads(monkeypatch, owner, a):
    """Point every module's load_animal / load_log_parent at `a`."""
    for mod in (fr, sh, wl, ph, ae, an):
        if hasattr(mod, "load_animal"):
            monkeypatch.setattr(mod, "load_animal", lambda db, user, aid, need, **k: (a, _access(owner)))
        if hasattr(mod, "load_log_parent"):
            monkeypatch.setattr(mod, "load_log_parent", lambda db, user, row, need, **k: (a, _access(owner)))


class _File:
    content_type = "image/jpeg"
    filename = "a.jpg"

    async def read(self):
        return b"\xff\xd8\xff-bytes"


def _feed():
    return FeedingLogCreate(fed_at=NOW, accepted=True, food_type="rat")


def _shed():
    return ShedLogCreate(shed_at=NOW)


def _weigh():
    return WeightLogCreate(weighed_at=NOW, weight_g=Decimal("1200"))


def _upload_photo(a, db):
    with patch.object(ph, "validate_image_bytes", return_value="image/jpeg"), \
         patch.object(ph.storage_service, "upload_photo",
                      new=AsyncMock(return_value=("https://r2/p.jpg", "https://r2/t.jpg"))) as up:
        out = run(ph.upload_animal_photo, animal_id=str(a.id), file=_File(), caption=None,
                  db=db, current_user=NS(id=a.user_id))
    return out, up


# ── NEW logs on a closed animal → 409 ───────────────────────────────────────

CREATES = {
    "feeding": lambda a, db, o: run(fr.create_animal_feeding_log, animal_id=a.id, feeding_data=_feed(),
                                    db=db, current_user=o),
    "quick_feed": lambda a, db, o: run(fr.quick_feed_animal, animal_id=a.id, db=db, current_user=o),
    "shed": lambda a, db, o: run(sh.create_shed, animal_id=a.id, shed_data=_shed(), db=db, current_user=o),
    "weight": lambda a, db, o: run(wl.create_weight_log, animal_id=a.id, payload=_weigh(),
                                   db=db, current_user=o),
}


@CLOSED
@pytest.mark.parametrize("kind", sorted(CREATES))
def test_new_log_on_closed_animal_is_409(monkeypatch, owner, kind, field, value):
    a = animal(owner.id, **{field: value})
    _patch_loads(monkeypatch, owner, a)
    db = DB()
    with pytest.raises(HTTPException) as e:
        CREATES[kind](a, db, owner)
    assert e.value.status_code == 409
    assert db.added == [] and db.commits == 0
    # Denormalised hints on the record don't move either.
    assert a.last_fed_at is None and a.last_shed_at is None and a.current_weight_g is None


@CLOSED
def test_photo_upload_on_closed_animal_is_409_before_storage(monkeypatch, owner, field, value):
    a = animal(owner.id, **{field: value})
    _patch_loads(monkeypatch, owner, a)
    db = DB()
    with patch.object(ph.storage_service, "upload_photo", new=AsyncMock()) as up:
        with pytest.raises(HTTPException) as e:
            run(ph.upload_animal_photo, animal_id=str(a.id), file=_File(), caption=None,
                db=db, current_user=owner)
    assert e.value.status_code == 409
    up.assert_not_awaited()  # nothing reaches R2
    assert db.added == [] and db.commits == 0


def test_messages_match_refuse_if_closed(monkeypatch, owner):
    a = animal(owner.id, died_at=date(2026, 9, 1))
    _patch_loads(monkeypatch, owner, a)
    with pytest.raises(HTTPException) as e:
        CREATES["feeding"](a, DB(), owner)
    assert e.value.detail == "This animal is marked as died. Restore it before making changes."

    b = animal(owner.id, transferred_out_at=NOW)
    _patch_loads(monkeypatch, owner, b)
    with pytest.raises(HTTPException) as e:
        CREATES["weight"](b, DB(), owner)
    assert e.value.detail == "This animal was transferred to another keeper, so its record can't be changed."


# ── living animals are unaffected ───────────────────────────────────────────

@pytest.mark.parametrize("kind,model", [("feeding", FeedingLog), ("quick_feed", FeedingLog),
                                        ("shed", ShedLog), ("weight", WeightLog)])
def test_new_logs_on_a_living_animal_still_work(monkeypatch, owner, kind, model):
    a = animal(owner.id)
    _patch_loads(monkeypatch, owner, a)
    db = DB()
    CREATES[kind](a, db, owner)
    assert len(db.of(model)) == 1 and db.commits == 1


def test_photo_upload_on_a_living_animal_still_works(monkeypatch, owner):
    a = animal(owner.id)
    _patch_loads(monkeypatch, owner, a)
    db = DB()
    out, up = _upload_photo(a, db)
    up.assert_awaited_once()
    assert len(db.of(Photo)) == 1 and out["url"] == "https://r2/p.jpg"


def test_revive_reopens_logging(monkeypatch, owner):
    """The undo path: a mistaken mark-died is fixed by /revive, after which
    logging works again — the refusal never blocks the fix."""
    a = animal(owner.id, died_at=date(2026, 9, 1), death_cause="unknown")
    _patch_loads(monkeypatch, owner, a)
    with pytest.raises(HTTPException):
        CREATES["feeding"](a, DB(), owner)
    run(an.revive_animal, animal_id=a.id, db=DB(), current_user=owner)
    assert a.died_at is None
    db = DB()
    CREATES["feeding"](a, db, owner)
    assert len(db.of(FeedingLog)) == 1


# ── existing entries stay editable (TV parity) ──────────────────────────────

@CLOSED
def test_existing_logs_on_closed_animal_can_still_be_edited_and_deleted(monkeypatch, owner, field, value):
    a = animal(owner.id, **{field: value})
    _patch_loads(monkeypatch, owner, a)

    feeding = NS(id=uuid.uuid4(), animal_id=a.id, notes=None, logged_by_user_id=None)
    db = DB({FeedingLog: Q(first=feeding)})
    run(fr.update_feeding_log, feeding_id=feeding.id, feeding_data=FeedingLogUpdate(notes="typo fixed"),
        db=db, current_user=owner)
    assert feeding.notes == "typo fixed"
    run(fr.delete_feeding_log, feeding_id=feeding.id, db=db, current_user=owner)
    assert db.deleted == [feeding]

    shed = NS(id=uuid.uuid4(), animal_id=a.id, notes=None, logged_by_user_id=None)
    db = DB({ShedLog: Q(first=shed)})
    run(sh.update_shed, shed_id=shed.id, shed_data=ShedLogUpdate(notes="partial"), db=db, current_user=owner)
    assert shed.notes == "partial"
    run(sh.delete_shed, shed_id=shed.id, db=db, current_user=owner)
    assert db.deleted == [shed]

    weigh = NS(id=uuid.uuid4(), animal_id=a.id, notes=None, logged_by_user_id=None)
    db = DB({WeightLog: Q(first=weigh)})
    run(wl.update_weight_log, weight_log_id=weigh.id, payload=WeightLogUpdate(notes="scale off"),
        db=db, current_user=owner)
    assert weigh.notes == "scale off"
    run(wl.delete_weight_log, weight_log_id=weigh.id, db=db, current_user=owner)
    assert db.deleted == [weigh]


@CLOSED
def test_existing_photo_caption_on_closed_animal_can_still_be_edited(monkeypatch, owner, field, value):
    a = animal(owner.id, **{field: value})
    _patch_loads(monkeypatch, owner, a)
    photo = NS(id=str(uuid.uuid4()), animal_id=a.id, url="u", thumbnail_url="t", caption=None,
               taken_at=None, created_at=NOW, logged_by_user_id=None)
    out = run(ph.update_photo, photo_id=photo.id, data=ph.PhotoUpdate(caption="last photo"),
              db=DB({Photo: Q(first=photo)}), current_user=owner)
    assert out["caption"] == "last photo"


# ── QR photo upload on a session opened before the animal closed ───────────

def _qr_upload(a, owner):
    s = QRUploadSession(token="tok", animal_id=a.id, user_id=owner.id, used_count=0,
                        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10), is_active=True)
    db = DB({QRUploadSession: Q(first=s)})
    with patch.object(qr, "_session_parent", return_value=("animal", a)), \
         patch.object(qr, "validate_image_bytes", return_value="image/jpeg"), \
         patch.object(qr.storage_service, "upload_photo",
                      new=AsyncMock(return_value=("https://r2/p.jpg", "https://r2/t.jpg"))) as up:
        try:
            out = asyncio.run(qr.upload_photo_via_token("tok", file=_File(), caption=None, db=db))
        except HTTPException as e:
            return e, db, s, up
    return out, db, s, up


@CLOSED
def test_qr_upload_onto_a_closed_animal_is_409(owner, field, value):
    a = animal(owner.id, **{field: value})
    err, db, s, up = _qr_upload(a, owner)
    assert isinstance(err, HTTPException) and err.status_code == 409
    up.assert_not_awaited()
    assert db.added == [] and s.used_count == 0


def test_qr_upload_onto_a_living_animal_still_works(owner):
    a = animal(owner.id)
    out, db, s, up = _qr_upload(a, owner)
    assert out["success"] is True and s.used_count == 1
    (photo,) = db.of(Photo)
    assert str(photo.animal_id) == str(a.id)


# ── TV invert events keep TV invert log-route parity ───────────────────────

@CLOSED
def test_invert_events_on_a_closed_invert_are_not_refused(monkeypatch, owner, field, value):
    """TV's invert log routes don't refuse a died/transferred invert, so
    neither do invert events. Change both together if TV gets the rule."""
    inv = NS(id=uuid.uuid4(), **{"died_at": None, "transferred_out_at": None, field: value})
    monkeypatch.setattr(ae, "load_invert", lambda db, user, iid, need, **k: (inv, _access(owner)))
    monkeypatch.setattr(ae, "load_log_parent", lambda db, user, row, need, **k: (inv, _access(owner)))
    db = DB()
    run(ae.create_invert_event, invert_id=inv.id, payload=AnimalEventCreate(event_type="observation"),
        db=db, current_user=owner)
    assert len(db.of(AnimalEvent)) == 1

    ev = NS(id=uuid.uuid4(), animal_id=None, invert_id=inv.id, severity="minor", logged_by_user_id=None)
    db = DB({AnimalEvent: Q(first=ev)})
    run(ae.update_animal_event, event_id=ev.id, payload=AnimalEventUpdate(severity="severe"),
        db=db, current_user=owner)
    assert ev.severity == "severe"
    run(ae.delete_animal_event, event_id=ev.id, db=db, current_user=owner)
    assert db.deleted == [ev]


def test_tv_invert_log_routes_have_no_closed_rule():
    """The parity above rests on this. If a TV invert log route starts
    refusing closed inverts, revisit create_invert_event too."""
    from app.routers import care_logs, molts, substrate_changes
    for fn in (fr.create_invert_feeding_log, molts.create_invert_molt_log, ph.upload_invert_photo):
        src = inspect.getsource(fn)
        assert "refuse_if_closed" not in src and "died_at" not in src
    for mod in (care_logs, substrate_changes, molts):
        assert "refuse_if_closed" not in inspect.getsource(mod)


# ── hold-back genotype copy skips a closed animal ──────────────────────────

GENE = NS(id=uuid.uuid4(), common_name="Clown", gene_type="recessive",
          species_scientific_name="Python regius")


@CLOSED
def test_copy_recorded_genotype_skips_a_closed_animal(field, value):
    a = NS(id=uuid.uuid4(), scientific_name="Python regius", died_at=None, transferred_out_at=None)
    setattr(a, field, value)
    db = DB({AnimalGenotype: Q(count=0), Gene: Q(all_=[GENE])})
    assert ro._copy_recorded_genotype(db, a, [{"gene_key": "clown", "zygosity": "hom"}]) == 0
    assert db.of(AnimalGenotype) == []


def test_copy_recorded_genotype_still_writes_for_a_living_animal():
    a = NS(id=uuid.uuid4(), scientific_name="Python regius", died_at=None, transferred_out_at=None)
    db = DB({AnimalGenotype: Q(count=0), Gene: Q(all_=[GENE])})
    assert ro._copy_recorded_genotype(db, a, [{"gene_key": "clown", "zygosity": "hom"}]) == 1


@CLOSED
def test_holdback_link_to_a_closed_animal_saves_without_genotype(field, value):
    """Linking still saves (and doesn't error); only the gene copy is skipped."""
    owner = NS(id=uuid.uuid4(), is_active=True, is_premium_for_app=lambda app: True)
    a = NS(id=uuid.uuid4(), user_id=owner.id, scientific_name="Python regius",
           died_at=None, transferred_out_at=None)
    setattr(a, field, value)
    o = NS(id=uuid.uuid4(), user_id=owner.id, clutch_id=uuid.uuid4(), animal_id=None,
           recorded_genotype=[{"gene_key": "Clown", "zygosity": "hom"}], status="hatched")
    db = DB({ReptileOffspring: Q(first=o), Animal: Q(first=a),
             AnimalGenotype: Q(count=0), Gene: Q(all_=[GENE])})
    run(ro.update_offspring, offspring_id=o.id,
        payload=ReptileOffspringUpdate(animal_id=a.id, status="kept"), db=db, current_user=owner)
    assert o.animal_id == a.id and db.commits >= 1
    assert db.of(AnimalGenotype) == []
