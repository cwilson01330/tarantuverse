"""Reminder settings that actually do something (audit-2 H4).

* The daily feeding digest's on/off, hour and timezone are settable through
  PUT /notification-preferences/ and come back on GET.
* Quiet hours, which the settings screens have always offered, now hold the
  PUSH (never the in-app row) inside the window on the keeper's own clock.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace as NS

import pytest
from pydantic import ValidationError

from app.routers.notification_preferences import update_values
from app.schemas.notification_preferences import (
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
)
from app.services import notification_service
from app.services.notification_service import in_quiet_hours


# ---------------------------------------------------------------------------
# Digest settings on the API
# ---------------------------------------------------------------------------

def test_update_accepts_digest_settings():
    u = NotificationPreferencesUpdate(daily_digest_enabled=False, digest_hour=18, tz_offset_minutes=300)
    assert update_values(u) == {"daily_digest_enabled": False, "digest_hour": 18, "tz_offset_minutes": 300}


@pytest.mark.parametrize("bad", [{"digest_hour": 24}, {"digest_hour": -1},
                                 {"tz_offset_minutes": 900}, {"tz_offset_minutes": -900}])
def test_update_rejects_impossible_hours_and_offsets(bad):
    with pytest.raises(ValidationError):
        NotificationPreferencesUpdate(**bad)


def test_offsets_at_the_edges_of_the_world_are_valid():
    # UTC+14 (Kiribati) is -840 in getTimezoneOffset terms; UTC-12 is +720.
    NotificationPreferencesUpdate(tz_offset_minutes=-840)
    NotificationPreferencesUpdate(tz_offset_minutes=720)


def test_explicit_null_on_a_not_null_column_is_ignored():
    u = NotificationPreferencesUpdate(daily_digest_enabled=None, digest_hour=None,
                                      tz_offset_minutes=None, sitter_activity_enabled=None,
                                      quiet_hours_enabled=True)
    assert update_values(u) == {"quiet_hours_enabled": True}


def test_unsent_fields_are_left_alone():
    """A TV client must not reset fields only Herpetoverse edits."""
    u = NotificationPreferencesUpdate(digest_hour=7)
    assert update_values(u) == {"digest_hour": 7}


def _row(**over):
    base = dict(
        id=uuid.uuid4(), user_id=uuid.uuid4(),
        feeding_reminders_enabled=True, feeding_reminder_hours=24,
        substrate_reminders_enabled=True, substrate_reminder_days=90,
        molt_predictions_enabled=True, maintenance_reminders_enabled=True,
        maintenance_reminder_days=30, feeder_low_stock_enabled=True,
        push_notifications_enabled=True, direct_messages_enabled=True,
        forum_replies_enabled=True, new_followers_enabled=True,
        community_activity_enabled=False, sitter_activity_enabled=True,
        quiet_hours_enabled=False, quiet_hours_start="22:00", quiet_hours_end="08:00",
        expo_push_token=None, daily_digest_enabled=False, digest_hour=20, tz_offset_minutes=-60,
    )
    base.update(over)
    return NS(**base)


def test_response_carries_the_digest_settings():
    r = NotificationPreferencesResponse.model_validate(_row())
    assert (r.daily_digest_enabled, r.digest_hour, r.tz_offset_minutes) == (False, 20, -60)


def test_response_survives_a_row_without_them():
    r = NotificationPreferencesResponse.model_validate(
        _row(daily_digest_enabled=None, digest_hour=None, tz_offset_minutes=None))
    assert r.digest_hour is None


# ---------------------------------------------------------------------------
# Quiet hours
# ---------------------------------------------------------------------------

def _at(h, m=0):
    return datetime(2026, 10, 8, h, m, tzinfo=timezone.utc)


def _prefs(**over):
    p = dict(quiet_hours_enabled=True, quiet_hours_start="22:00", quiet_hours_end="08:00", tz_offset_minutes=0)
    p.update(over)
    return NS(**p)


@pytest.mark.parametrize("hour,quiet", [(21, False), (22, True), (23, True), (0, True), (7, True), (8, False), (12, False)])
def test_window_that_wraps_midnight(hour, quiet):
    assert in_quiet_hours(_prefs(), _at(hour)) is quiet


@pytest.mark.parametrize("hour,quiet", [(12, False), (13, True), (14, True), (15, False)])
def test_window_inside_one_day(hour, quiet):
    assert in_quiet_hours(_prefs(quiet_hours_start="13:00", quiet_hours_end="15:00"), _at(hour)) is quiet


def test_uses_the_keepers_clock_not_utc():
    # 03:00 UTC is 22:00 in New York (UTC-5 => getTimezoneOffset 300): quiet.
    assert in_quiet_hours(_prefs(tz_offset_minutes=300), _at(3)) is True
    # 21:00 UTC is 06:00 the next day in Tokyo (UTC+9 => -540): quiet.
    assert in_quiet_hours(_prefs(tz_offset_minutes=-540), _at(21)) is True
    # 12:00 UTC is 07:00 in New York: still quiet; 14:00 UTC is 09:00: not.
    assert in_quiet_hours(_prefs(tz_offset_minutes=300), _at(12)) is True
    assert in_quiet_hours(_prefs(tz_offset_minutes=300), _at(14)) is False


@pytest.mark.parametrize("over", [
    {"quiet_hours_enabled": False},
    {"tz_offset_minutes": None},          # unknown clock: deliver rather than guess
    {"quiet_hours_start": "08:00", "quiet_hours_end": "08:00"},
    {"quiet_hours_start": "late", "quiet_hours_end": "08:00"},
    {"quiet_hours_start": None},
])
def test_never_quiet_when_it_cannot_be_known(over):
    assert in_quiet_hours(_prefs(**over), _at(23)) is False


def test_no_prefs_row_is_never_quiet():
    assert in_quiet_hours(None, _at(23)) is False


class _Query:
    def __init__(self, row):
        self.row = row

    def filter(self, *a, **k):
        return self

    def first(self):
        return self.row


class _DB:
    def __init__(self, prefs):
        self.prefs = prefs
        self.added = []

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        pass

    def refresh(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()

    def query(self, model):
        return _Query(self.prefs)


@pytest.fixture
def pushes(monkeypatch):
    sent = []
    monkeypatch.setattr(notification_service.PushNotificationService, "send_notification",
                        staticmethod(lambda **kw: sent.append(kw)))
    return sent


def _push_prefs(**over):
    p = dict(push_notifications_enabled=True, expo_push_token="ExponentPushToken[x]",
             direct_messages_enabled=True, quiet_hours_enabled=True,
             quiet_hours_start="22:00", quiet_hours_end="08:00", tz_offset_minutes=0)
    p.update(over)
    return NS(**p)


def test_quiet_hours_hold_the_push_but_keep_the_row(monkeypatch, pushes):
    monkeypatch.setattr(notification_service, "in_quiet_hours", lambda prefs, now=None: True)
    db = _DB(_push_prefs())
    notification_service.create_notification(
        db, user_id=uuid.uuid4(), type="feeding_digest", title="Feeding day", body="2 animals are due for feeding.",
        deeplink="/feeding-day", push=True)
    assert len(db.added) == 1, "the in-app notification is always written"
    assert pushes == []


def test_outside_quiet_hours_the_push_goes(monkeypatch, pushes):
    monkeypatch.setattr(notification_service, "in_quiet_hours", lambda prefs, now=None: False)
    db = _DB(_push_prefs())
    notification_service.create_notification(
        db, user_id=uuid.uuid4(), type="direct_message", title="New message", push=True,
        push_category="direct_messages_enabled")
    assert len(pushes) == 1


def test_a_sitter_lockout_pushes_even_in_quiet_hours(monkeypatch, pushes):
    monkeypatch.setattr(notification_service, "in_quiet_hours", lambda prefs, now=None: True)
    db = _DB(_push_prefs())
    notification_service.create_notification(
        db, user_id=uuid.uuid4(), type="sitter_pass_locked", title="Sitter link locked", push=True)
    assert len(pushes) == 1


def test_digest_type_is_not_exempt():
    assert "feeding_digest" not in notification_service.QUIET_HOURS_EXEMPT_TYPES
