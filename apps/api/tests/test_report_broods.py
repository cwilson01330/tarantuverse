"""report_broods.py: counts on a fixture, and it stays read-only."""
import inspect
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

import report_broods as rpt
from app.models.colony import Colony
from app.models.egg_sac import EggSac
from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.molt_log import MoltLog
from app.models.offspring import Offspring, OffspringStatus
from app.models.photo import Photo
from app.models.user import User

NOW = datetime(2026, 12, 7, 12, 0, tzinfo=timezone.utc)
SINCE = date(2026, 11, 23)


def mk_user(db, tag, *, email=None, active=True):
    u = User(
        id=uuid.uuid4(), email=email or f"{tag}-{uuid.uuid4().hex[:6]}@test.local",
        username=f"{tag}_{uuid.uuid4().hex[:6]}", hashed_password="x", is_active=active, is_verified=True,
    )
    db.add(u)
    db.flush()
    return u


def animal(db, user, taxon="true_spider"):
    a = Invert(id=uuid.uuid4(), user_id=user.id, taxon=taxon, name="A")
    db.add(a)
    db.flush()
    return a


def sac(db, user, mother, outcome=None, days_ago=3):
    s = EggSac(
        id=uuid.uuid4(), user_id=user.id, mother_invert_id=mother.id,
        laid_date=SINCE, outcome=outcome, created_at=(NOW - timedelta(days=days_ago)).date(),
    )
    db.add(s)
    db.flush()
    return s


def feed(db, inv, days_ago, quantity=1):
    t = NOW - timedelta(days=days_ago)
    db.add(FeedingLog(id=uuid.uuid4(), invert_id=inv.id, fed_at=t, accepted=True,
                      created_at=t, quantity=quantity))


@pytest.fixture()
def world(db_session):
    db = db_session
    k = mk_user(db, "k")
    merged = mk_user(db, "m", email="gone@merged.invalid")
    inactive = mk_user(db, "i", active=False)
    spider = animal(db, k, "true_spider")
    mantis = animal(db, k, "mantis")
    s1 = sac(db, k, spider)                       # open
    s2 = sac(db, k, spider, outcome="hatched")
    sac(db, k, mantis, outcome="failed")
    sac(db, k, spider, days_ago=40)               # before --since
    sac(db, merged, animal(db, merged), outcome="hatched")  # excluded
    sac(db, inactive, animal(db, inactive))                  # excluded
    # a group made from s2, two spiders split out of it
    db.add(Colony(id=uuid.uuid4(), user_id=k.id, taxon="true_spider", name="G",
                  egg_sac_id=s2.id, stage_counts={"slings": 5}, visibility="private",
                  created_at=NOW - timedelta(days=2)))
    for _ in range(2):
        kid = animal(db, k, "true_spider")
        db.add(Offspring(egg_sac_id=s2.id, user_id=k.id, invert_id=kid.id,
                         status=OffspringStatus.KEPT, created_at=SINCE))
    db.add(Offspring(egg_sac_id=s2.id, user_id=k.id, status=OffspringStatus.SOLD, created_at=SINCE))
    # molt followed by a photo within 2 days (yes), one not (no)
    m = NOW - timedelta(days=5)
    for inv, gap in ((spider, 1), (mantis, 3)):  # 3 days later is too late
        db.add(MoltLog(id=uuid.uuid4(), invert_id=inv.id, molted_at=m, created_at=m))
        db.add(Photo(id=uuid.uuid4(), invert_id=inv.id, url="https://x/p.jpg",
                     taken_at=m + timedelta(days=gap), created_at=m + timedelta(days=gap)))
    feed(db, spider, 1, quantity=8)
    feed(db, spider, 2)
    feed(db, animal(db, merged), 1, quantity=9)   # excluded keeper
    db.commit()
    return db


def test_report_counts(world):
    r = dict(rpt.build_rows(world, SINCE, now=NOW))
    assert r["sacs_logged_total"] == "3"
    assert r["sacs_logged_true_spider_no_pairing"] == "2"
    assert r["sacs_logged_mantis_no_pairing"] == "1"
    assert r["sacs_hatched"] == "1"
    assert r["sacs_failed"] == "1"
    assert r["groups_created_from_sacs"] == "1"
    assert r["spiders_split_out"] == "2"
    assert r["molts_followed_by_photo_2d"] == "1 of 2 (50.0%)"
    assert r["feedings_with_quantity_over_1"] == "1"
    assert r["true_spider_keepers_fed_30d"] == "1 (baseline 17 on 2026-11-12)"


def test_report_is_read_only():
    src = inspect.getsource(rpt.main)
    assert "SET TRANSACTION READ ONLY" in src
    assert src.index("SET TRANSACTION READ ONLY") < src.index("build_rows")
    assert "commit(" not in inspect.getsource(rpt)
