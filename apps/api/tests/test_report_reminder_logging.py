"""report_reminder_logging.py: counts on a fixture, and it stays read-only."""
import inspect
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

import report_reminder_logging as rpt
from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.notification_preferences import NotificationPreferences
from app.models.user import User

NOW = datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)


def mk_user(db, tag, *, email=None, active=True):
    u = User(
        id=uuid.uuid4(), email=email or f"{tag}-{uuid.uuid4().hex[:6]}@test.local",
        username=f"{tag}_{uuid.uuid4().hex[:6]}", hashed_password="x", is_active=active, is_verified=True,
    )
    db.add(u)
    db.flush()
    return u


def prefs(db, user, smart=False, refusal=False, molt=False):
    db.add(NotificationPreferences(
        user_id=user.id, smart_reminders_enabled=smart, refusal_restarts_wait=refusal,
        post_molt_pause_enabled=molt,
    ))


def animal(db, user):
    a = Invert(id=uuid.uuid4(), user_id=user.id, taxon="tarantula", name="T")
    db.add(a)
    db.flush()
    return a


def feed(db, inv, days_ago, reminder=False):
    db.add(FeedingLog(
        id=uuid.uuid4(), invert_id=inv.id, fed_at=NOW - timedelta(days=days_ago), accepted=True,
        created_at=NOW - timedelta(days=days_ago),
        notes="Logged from reminder" if reminder else None,
        reminder_date=(NOW - timedelta(days=days_ago)).date() if reminder else None,
    ))


@pytest.fixture()
def world(db_session):
    db = db_session
    on = mk_user(db, "on"); prefs(db, on, True, True, True)
    off = mk_user(db, "off"); prefs(db, off)
    bare = mk_user(db, "bare")  # no prefs row = all off
    stale = mk_user(db, "stale"); prefs(db, stale, True)
    merged = mk_user(db, "m", email="gone@merged.invalid"); prefs(db, merged, True)
    inactive = mk_user(db, "i", active=False); prefs(db, inactive, True)
    a_on, a_off, a_bare, a_stale = (animal(db, u) for u in (on, off, bare, stale))
    feed(db, a_on, 1, reminder=True)
    feed(db, a_on, 2, reminder=True)
    feed(db, a_on, 3)
    feed(db, a_off, 1, reminder=True)   # reminder log from a switch-off keeper
    feed(db, a_bare, 5)
    feed(db, a_stale, 45)               # outside the 30 day window
    feed(db, animal(db, merged), 1, reminder=True)
    db.commit()
    return db


def test_report_counts(world):
    r = dict(rpt.build_rows(world, now=NOW))
    assert r["reminder_logged_feedings_total"] == "3"
    assert r["reminder_logged_feedings_smart_on"] == "2"
    assert r["reminder_logged_feedings_smart_off"] == "1"
    assert r["keepers_smart_reminders_on"] == "2"      # on + stale
    assert r["keepers_refusal_restarts_wait_on"] == "1"
    assert r["keepers_post_molt_pause_on"] == "1"
    assert r["keepers_total"] == "4"                    # merged + inactive excluded
    # smart on: on(logged) + stale(not in window) -> 1 of 2; off: off + bare, both logged -> 2 of 2
    assert r["logged_30d_smart_on"] == "1 of 2 (50.0%)"
    assert r["logged_30d_smart_off"] == "2 of 2 (100.0%)"


def test_report_is_read_only():
    src = inspect.getsource(rpt.main)
    assert "SET TRANSACTION READ ONLY" in src
    assert src.index("SET TRANSACTION READ ONLY") < src.index("build_rows")
    assert "commit(" not in inspect.getsource(rpt)
