"""Effortless logging, Task 1: the three per-keeper switches and the new columns.

Switches off => behaviour identical to before. Rows that already exist get all
three FALSE (server_default); only `ensure_notification_preferences` writes TRUE.
"""
from __future__ import annotations

import importlib.util
import inspect
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.molt_log import MoltLog
from app.models.notification_preferences import NotificationPreferences
from app.models.user import User
from app.services.notification_prefs import ensure_notification_preferences
from app.utils.auth import create_access_token, get_password_hash

pytestmark = pytest.mark.requires_postgres

PREFS = "/api/v1/notification-preferences/"
SWITCHES = ("smart_reminders_enabled", "refusal_restarts_wait", "post_molt_pause_enabled")
MIGRATION = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "eff_20261110_effortless_logging.py"


def mk_user(db):
    tag = uuid.uuid4().hex[:8]
    u = User(
        id=uuid.uuid4(),
        email=f"eff-{tag}@test.local",
        username=f"eff_{tag}",
        hashed_password=get_password_hash("TestPass1!"),
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    return u


def hdr(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.id)})}"}


def _migration():
    spec = importlib.util.spec_from_file_location("eff_20261110_effortless_logging", MIGRATION)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_existing_rows_default_off(db_session):
    u = mk_user(db_session)
    # A row written the way every pre-existing row was: none of the new columns named.
    # (quiet_hours_* are named only because their old server defaults are the
    # over-quoted literal '''22:00''' and don't fit varchar(5) — unrelated to this task.)
    db_session.execute(
        text(
            "INSERT INTO notification_preferences (id, user_id, quiet_hours_start, quiet_hours_end) "
            "VALUES (:i, :u, '22:00', '08:00')"
        ),
        {"i": str(uuid.uuid4()), "u": str(u.id)},
    )
    db_session.commit()
    row = db_session.execute(
        text(
            "SELECT smart_reminders_enabled, refusal_restarts_wait, post_molt_pause_enabled "
            "FROM notification_preferences WHERE user_id = :u"
        ),
        {"u": str(u.id)},
    ).one()
    assert tuple(row) == (False, False, False)


def test_new_rows_from_ensure_are_on(db_session):
    u = mk_user(db_session)
    prefs = ensure_notification_preferences(db_session, u.id)
    for name in SWITCHES:
        assert getattr(prefs, name) is True, name


def test_get_returns_switches(client, db_session):
    u = mk_user(db_session)
    r = client.get(PREFS, headers=hdr(u))
    assert r.status_code == 200, r.text
    for name in SWITCHES:
        assert r.json()[name] is True, name

    # A pre-existing row reads back all off.
    old = mk_user(db_session)
    db_session.add(NotificationPreferences(user_id=old.id))
    db_session.commit()
    r = client.get(PREFS, headers=hdr(old))
    assert r.status_code == 200, r.text
    for name in SWITCHES:
        assert r.json()[name] is False, name


def test_put_toggles_each_switch(client, db_session):
    u = mk_user(db_session)
    db_session.add(NotificationPreferences(user_id=u.id))
    db_session.commit()
    for name in SWITCHES:
        r = client.put(PREFS, json={name: True}, headers=hdr(u))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body[name] is True
        others = [n for n in SWITCHES if n != name]
        # Earlier loop turns stay on; the ones not yet touched stay off.
        for other in others:
            assert body[other] is (SWITCHES.index(other) < SWITCHES.index(name)), (name, other)

    # Only the named field changes, and it can be turned back off.
    r = client.put(PREFS, json={"refusal_restarts_wait": False}, headers=hdr(u))
    assert r.status_code == 200, r.text
    assert r.json()["refusal_restarts_wait"] is False
    assert r.json()["smart_reminders_enabled"] is True
    assert r.json()["post_molt_pause_enabled"] is True

    # An explicit null is ignored (NOT NULL columns), not a 500.
    r = client.put(PREFS, json={"smart_reminders_enabled": None}, headers=hdr(u))
    assert r.status_code == 200, r.text
    assert r.json()["smart_reminders_enabled"] is True


def test_models_carry_new_columns():
    assert "feeding_pause_days" in MoltLog.__table__.c
    assert "reminder_date" in FeedingLog.__table__.c
    assert "reminder_snoozed_until" in Invert.__table__.c


def test_db_has_columns_and_index(db_session):
    cols = {
        (r[0], r[1])
        for r in db_session.execute(
            text(
                "SELECT table_name, column_name FROM information_schema.columns "
                "WHERE (table_name, column_name) IN ("
                "('molt_logs','feeding_pause_days'),('feeding_logs','reminder_date'),"
                "('inverts','reminder_snoozed_until'))"
            )
        )
    }
    assert len(cols) == 3
    idx = db_session.execute(
        text("SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_feeding_logs_reminder'")
    ).scalar()
    assert idx is not None
    assert "UNIQUE" in idx and "(invert_id, reminder_date)" in idx and "reminder_date IS NOT NULL" in idx


def test_feeding_pause_days_check(db_session):
    # CHECK 0-60 exists on the live table.
    defn = db_session.execute(
        text(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
            "WHERE conname = 'ck_molt_logs_feeding_pause_days'"
        )
    ).scalar()
    assert defn is not None and "60" in defn and "0" in defn


def test_migration_round_trip():
    """Static check of the migration module (no existing test runs alembic in-process)."""
    m = _migration()
    assert m.revision == "eff_20261110_effortless_logging"
    assert m.down_revision == "ros_20261110_restore_offspring_status"

    up = inspect.getsource(m.upgrade)
    down = inspect.getsource(m.downgrade)
    for col in (*SWITCHES, "feeding_pause_days", "reminder_date", "reminder_snoozed_until"):
        assert col in up, col
        assert col in down, col
    assert "uq_feeding_logs_reminder" in up and "uq_feeding_logs_reminder" in down
    assert "reminder_date IS NOT NULL" in up
    assert "unique=True" in up
