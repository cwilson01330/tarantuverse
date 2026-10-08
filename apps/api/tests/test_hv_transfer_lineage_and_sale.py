"""HV transfers carry pedigree and close the sale (audit 2026-10-08, HV M2).

The invert transfer snapshot carries dam/sire from the breeding module and the
invert claim flips the linked Offspring to SOLD. The HV path did neither: the
snapshot's dam/sire were hard-coded None and a hatchling sold through a
transfer stayed "kept" / "available" in the breeder's clutch.

In-memory SQLite built from the real model tables.
"""
import inspect
import uuid
from datetime import date
from types import SimpleNamespace as NS

import pytest
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.models.animal import Animal
from app.models.clutch import Clutch
from app.models.reptile_offspring import ReptileOffspring, ReptileOffspringStatus
from app.models.reptile_pairing import ReptilePairing
from app.routers import transfers


@compiles(JSONB, "sqlite")
def _jsonb_as_json(_type, _compiler, **_kw):
    return "JSON"


@compiles(ARRAY, "sqlite")
def _array_as_json(_type, _compiler, **_kw):
    return "JSON"


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    for model in (Animal, ReptilePairing, Clutch, ReptileOffspring):
        model.__table__.create(engine)
    s = sessionmaker(bind=engine, autoflush=False)()
    try:
        yield s
    finally:
        s.close()
        engine.dispose()


SELLER = uuid.uuid4()


def _animal(db, **kw):
    a = Animal(id=uuid.uuid4(), user_id=SELLER, taxon=kw.pop("taxon", "snake"), name=kw.pop("name", "x"), **kw)
    db.add(a)
    db.flush()
    return a


def _bred_hatchling(db, status=ReptileOffspringStatus.AVAILABLE):
    dam = _animal(db, name="Dam", scientific_name="Python regius")
    sire = _animal(db, name="Sire", scientific_name="Python regius (pied)")
    pairing = ReptilePairing(id=uuid.uuid4(), user_id=SELLER, male_animal_id=sire.id,
                             female_animal_id=dam.id, taxon="snake", paired_date=date(2026, 1, 5))
    db.add(pairing)
    db.flush()
    clutch = Clutch(id=uuid.uuid4(), user_id=SELLER, pairing_id=pairing.id, laid_date=date(2026, 3, 1))
    db.add(clutch)
    db.flush()
    baby = _animal(db, name="Hatchling", scientific_name="Python regius")
    off = ReptileOffspring(id=uuid.uuid4(), clutch_id=clutch.id, user_id=SELLER,
                           animal_id=baby.id, status=status)
    db.add(off)
    db.flush()
    return baby, off


SELLER_USER = NS(id=SELLER, username="breeder", display_name="Breeder")


def test_snapshot_carries_lineage_for_a_bred_hatchling(db):
    baby, _ = _bred_hatchling(db)
    snap = transfers._build_animal_snapshot(db, baby, SELLER_USER)
    assert snap["dam_scientific_name"] == "Python regius"
    assert snap["sire_scientific_name"] == "Python regius (pied)"
    assert snap["sac_laid_date"] == "2026-03-01"


def test_snapshot_degrades_without_a_breeding_link(db):
    plain = _animal(db, name="Bought in", scientific_name="Pogona vitticeps")
    snap = transfers._build_animal_snapshot(db, plain, SELLER_USER)
    assert snap["dam_scientific_name"] is None
    assert snap["sire_scientific_name"] is None
    assert snap["sac_laid_date"] is None


def test_claim_marks_the_hatchling_sold(db):
    baby, off = _bred_hatchling(db)
    assert transfers.mark_reptile_offspring_sold(db, baby.id, "buyer", date(2026, 10, 8)) is True
    db.flush()
    db.refresh(off)
    assert off.status == ReptileOffspringStatus.SOLD
    assert off.buyer_info == "buyer"
    assert off.status_date == date(2026, 10, 8)


def test_no_offspring_row_is_a_no_op(db):
    plain = _animal(db)
    assert transfers.mark_reptile_offspring_sold(db, plain.id, "buyer", date.today()) is False


def test_the_hv_claim_path_calls_it_before_commit():
    src = inspect.getsource(transfers._claim_animal_transfer)
    call = src.index("mark_reptile_offspring_sold(db, source.id")
    assert call < src.index("db.commit()")
