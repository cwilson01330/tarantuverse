"""Closed HV animals refuse event and genotype writes (2026-10-08).

A died or transferred Herpetoverse animal is history (audit-2 M6,
routers/animals.py::refuse_if_closed). PUT /animals/{id} and brumation
already answered 409; the per-animal event log and the genotype routes did
not, so an old build or a stale tab could still change them. Reads stay open.
"""
import asyncio
import inspect
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.models.animal import Animal
from app.models.animal_event import AnimalEvent
from app.models.animal_genotype import AnimalGenotype
from app.models.gene import Gene
from app.routers import animal_events as ae
from app.routers import animal_genotypes as ag
from app.schemas.animal_event import AnimalEventCreate, AnimalEventUpdate
from app.schemas.animal_genotype import AnimalGenotypeCreate, AnimalGenotypeUpdate

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

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        pass


def run(fn, **kw):
    return asyncio.run(inspect.unwrap(fn)(**kw))


@pytest.fixture
def owner():
    return NS(id=uuid.uuid4())


def animal(owner_id, **over):
    base = dict(id=uuid.uuid4(), user_id=owner_id, died_at=None, transferred_out_at=None)
    base.update(over)
    return NS(**base)


def _access(owner):
    return NS(owner=owner, actor=owner, role="owner", logged_by_user_id=None)


def _patch_events(monkeypatch, owner, a):
    monkeypatch.setattr(ae, "load_animal", lambda db, user, aid, need, **k: (a, _access(owner)))
    monkeypatch.setattr(ae, "load_log_parent", lambda db, user, row, need, **k: (a, _access(owner)))


def _event(a):
    return NS(id=uuid.uuid4(), animal_id=a.id, invert_id=None, event_type="injury",
              severity="minor", notes=None, logged_by_user_id=None)


# ── events ──────────────────────────────────────────────────────────────────

@CLOSED
def test_create_event_on_closed_animal_is_409(monkeypatch, owner, field, value):
    a = animal(owner.id, **{field: value})
    _patch_events(monkeypatch, owner, a)
    db = DB()
    with pytest.raises(HTTPException) as e:
        run(ae.create_animal_event, animal_id=a.id, payload=AnimalEventCreate(event_type="observation"),
            db=db, current_user=owner)
    assert e.value.status_code == 409
    assert db.added == [] and db.commits == 0


@CLOSED
def test_update_event_on_closed_animal_is_409(monkeypatch, owner, field, value):
    a = animal(owner.id, **{field: value})
    _patch_events(monkeypatch, owner, a)
    ev = _event(a)
    db = DB({AnimalEvent: Q(first=ev)})
    with pytest.raises(HTTPException) as e:
        run(ae.update_animal_event, event_id=ev.id, payload=AnimalEventUpdate(severity="severe"),
            db=db, current_user=owner)
    assert e.value.status_code == 409
    assert ev.severity == "minor" and db.commits == 0


@CLOSED
def test_delete_event_on_closed_animal_is_409(monkeypatch, owner, field, value):
    a = animal(owner.id, **{field: value})
    _patch_events(monkeypatch, owner, a)
    ev = _event(a)
    db = DB({AnimalEvent: Q(first=ev)})
    with pytest.raises(HTTPException) as e:
        run(ae.delete_animal_event, event_id=ev.id, db=db, current_user=owner)
    assert e.value.status_code == 409
    assert db.deleted == [] and db.commits == 0


def test_event_message_matches_the_animal_route(monkeypatch, owner):
    a = animal(owner.id, died_at=date(2026, 9, 1))
    _patch_events(monkeypatch, owner, a)
    with pytest.raises(HTTPException) as e:
        run(ae.create_animal_event, animal_id=a.id, payload=AnimalEventCreate(event_type="observation"),
            db=DB(), current_user=owner)
    assert e.value.detail == "This animal is marked as died. Restore it before making changes."


def test_events_on_a_living_animal_still_work(monkeypatch, owner):
    a = animal(owner.id)
    _patch_events(monkeypatch, owner, a)
    db = DB()
    run(ae.create_animal_event, animal_id=a.id, payload=AnimalEventCreate(event_type="observation"),
        db=db, current_user=owner)
    assert len(db.added) == 1 and db.commits == 1

    ev = _event(a)
    db = DB({AnimalEvent: Q(first=ev)})
    run(ae.update_animal_event, event_id=ev.id, payload=AnimalEventUpdate(severity="severe"),
        db=db, current_user=owner)
    assert ev.severity == "severe"
    run(ae.delete_animal_event, event_id=ev.id, db=db, current_user=owner)
    assert db.deleted == [ev]


def test_listing_events_on_a_closed_animal_stays_open(monkeypatch, owner):
    a = animal(owner.id, died_at=date(2026, 9, 1))
    _patch_events(monkeypatch, owner, a)
    ev = _event(a)
    out = run(ae.list_animal_events, animal_id=a.id, db=DB({AnimalEvent: Q(all_=[ev])}), current_user=owner)
    assert out == [ev]


def test_tv_invert_events_are_not_affected(monkeypatch, owner):
    """The rule is Herpetoverse's; an invert event's edit path is unchanged."""
    inv = NS(id=uuid.uuid4(), died_at=date(2026, 9, 1), transferred_out_at=None)
    monkeypatch.setattr(ae, "load_log_parent", lambda db, user, row, need, **k: (inv, _access(owner)))
    ev = NS(id=uuid.uuid4(), animal_id=None, invert_id=inv.id, severity="minor", logged_by_user_id=None)
    db = DB({AnimalEvent: Q(first=ev)})
    run(ae.update_animal_event, event_id=ev.id, payload=AnimalEventUpdate(severity="severe"),
        db=db, current_user=owner)
    assert ev.severity == "severe"


# ── genotype ────────────────────────────────────────────────────────────────

GENE_ID = uuid.uuid4()


def _geno_db(a, row=None):
    return DB({
        Animal: Q(first=a),
        Gene: Q(first=NS(id=GENE_ID)),
        AnimalGenotype: Q(first=row, all_=[row] if row else []),
    })


@CLOSED
def test_add_genotype_on_closed_animal_is_409(owner, field, value):
    a = animal(owner.id, **{field: value})
    db = _geno_db(a)
    with pytest.raises(HTTPException) as e:
        run(ag.add_genotype, animal_id=a.id,
            payload=AnimalGenotypeCreate(gene_id=GENE_ID, zygosity="het"), db=db, current_user=owner)
    assert e.value.status_code == 409 and db.added == [] and db.commits == 0


@CLOSED
def test_update_genotype_on_closed_animal_is_409(owner, field, value):
    a = animal(owner.id, **{field: value})
    row = NS(id=uuid.uuid4(), zygosity="het", poss_het_percentage=None)
    db = _geno_db(a, row)
    with pytest.raises(HTTPException) as e:
        run(ag.update_genotype, animal_id=a.id, genotype_id=row.id,
            payload=AnimalGenotypeUpdate(zygosity="visual"), db=db, current_user=owner)
    assert e.value.status_code == 409 and row.zygosity == "het" and db.commits == 0


@CLOSED
def test_delete_genotype_on_closed_animal_is_409(owner, field, value):
    a = animal(owner.id, **{field: value})
    row = NS(id=uuid.uuid4(), zygosity="het", poss_het_percentage=None)
    db = _geno_db(a, row)
    with pytest.raises(HTTPException) as e:
        run(ag.delete_genotype, animal_id=a.id, genotype_id=row.id, db=db, current_user=owner)
    assert e.value.status_code == 409 and db.deleted == [] and db.commits == 0


def test_transferred_genotype_message(owner):
    a = animal(owner.id, transferred_out_at=datetime(2026, 9, 1, tzinfo=timezone.utc))
    with pytest.raises(HTTPException) as e:
        run(ag.delete_genotype, animal_id=a.id, genotype_id=uuid.uuid4(), db=_geno_db(a), current_user=owner)
    assert e.value.detail == (
        "This animal was transferred to another keeper, so its record can't be changed."
    )


def test_genotype_writes_on_a_living_animal_still_work(owner):
    a = animal(owner.id)
    db = _geno_db(a)
    run(ag.add_genotype, animal_id=a.id,
        payload=AnimalGenotypeCreate(gene_id=GENE_ID, zygosity="het"), db=db, current_user=owner)
    assert len(db.added) == 1

    row = NS(id=uuid.uuid4(), zygosity="het", poss_het_percentage=None)
    db = _geno_db(a, row)
    run(ag.update_genotype, animal_id=a.id, genotype_id=row.id,
        payload=AnimalGenotypeUpdate(zygosity="visual"), db=db, current_user=owner)
    assert row.zygosity == "visual"
    run(ag.delete_genotype, animal_id=a.id, genotype_id=row.id, db=db, current_user=owner)
    assert db.deleted == [row]


def test_reading_a_closed_animals_genotype_stays_open(owner):
    a = animal(owner.id, died_at=date(2026, 9, 1))
    row = NS(id=uuid.uuid4())
    assert run(ag.list_genotype, animal_id=a.id, db=_geno_db(a, row), current_user=owner) == [row]
