"""Effortless logging, Task 2: the due rule gains two owner switches.

`services/feeding_status.py::compute_feeding_status` stays the ONE rule
(Feeding Day, analytics, single-animal stats, digest). It now reads the
collection OWNER's switches (`notification_preferences.refusal_restarts_wait`,
`.post_molt_pause_enabled`; no row = all off):

- refusal restarts the wait: the countdown runs from the newest feeding log of
  either kind (`last_offered_date`); `last_feeding_date` /
  `days_since_last_feeding` keep meaning "last meal".
- post-molt pause: the newest molt (invert_id OR the legacy tarantula_id) +
  window (the molt's `feeding_pause_days`, else the taxon/stage default) >= the
  keeper's today -> `post_molt_pause_until`, `is_overdue` False, no nudge. A
  keeper-set pause wins.

With every switch off the output is identical to before (pinned below).
Real Postgres through the TestClient.
"""
import uuid
from datetime import date, datetime, time, timedelta, timezone

import pytest

from app.models.collection_member import CollectionMember
from app.models.invert import Invert
from app.models.molt_log import MoltLog
from app.models.notification_preferences import NotificationPreferences
from app.models.user import User
from app.services import feeding_status
from app.services.feeding_status import FeedingRules, load_feeding_rules
from app.utils import post_molt_pause as pmp
from app.utils.auth import create_access_token

pytestmark = pytest.mark.requires_postgres

STATUS = "/api/v1/inverts/feeding-status"


# ── helpers ──────────────────────────────────────────────────────────────────

def _now():
    return datetime.now(timezone.utc)


def _today():
    return _now().date()  # no tz offset in these tests = UTC


def mk_user(db, tag="eff"):
    u = User(
        id=uuid.uuid4(),
        email=f"{tag}-{uuid.uuid4().hex[:8]}@test.local",
        username=f"{tag}_{uuid.uuid4().hex[:8]}",
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    return u


def hdr(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.id)})}"}


def set_rules(db, user, *, refusal=False, molt=False, smart=False):
    row = db.query(NotificationPreferences).filter(NotificationPreferences.user_id == user.id).first()
    if row is None:
        row = NotificationPreferences(user_id=user.id)
        db.add(row)
    row.refusal_restarts_wait = refusal
    row.post_molt_pause_enabled = molt
    row.smart_reminders_enabled = smart
    db.commit()


@pytest.fixture()
def keeper(db_session):
    return mk_user(db_session)


@pytest.fixture()
def h(keeper):
    return hdr(keeper)


@pytest.fixture()
def cutoff_30_days_ago(monkeypatch):
    """Animals created within the last 30 days are after the release cutoff."""
    monkeypatch.setattr(feeding_status, "FIRST_FEEDING_DUE_FROM", _today() - timedelta(days=30))


@pytest.fixture()
def after_cutoff(monkeypatch):
    monkeypatch.setattr(feeding_status, "FIRST_FEEDING_DUE_FROM", date(2020, 1, 1))


def animal(client, headers, name, *, taxon="tarantula", interval=14, life_stage="adult", **extra):
    body = {"taxon": taxon, "name": name, **extra}
    if life_stage is not None:
        body["life_stage"] = life_stage
    if interval is not None:
        body["feeding_interval_days"] = interval
    r = client.post("/api/v1/inverts/", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def created_days_ago(db, animal_id, days):
    stamp = datetime.combine(_today() - timedelta(days=days), time(12, 0), tzinfo=timezone.utc)
    inv = db.query(Invert).filter(Invert.id == uuid.UUID(animal_id)).one()
    inv.created_at = stamp
    db.commit()


def feed(client, headers, animal_id, days_ago, accepted=True):
    when = _now() - timedelta(days=days_ago, hours=1)
    r = client.post(
        f"/api/v1/inverts/{animal_id}/feedings",
        json={"fed_at": when.isoformat(), "food_type": "cricket", "accepted": accepted},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


def molt_at(days_ago):
    """Noon UTC, `days_ago` days before today (negative = in the future)."""
    return datetime.combine(_today() - timedelta(days=days_ago), time(12, 0), tzinfo=timezone.utc)


def molt(client, headers, animal_id, days_ago, **extra):
    r = client.post(
        f"/api/v1/inverts/{animal_id}/molts",
        json={"molted_at": molt_at(days_ago).isoformat(), **extra},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


def items(client, headers, **params):
    r = client.get(STATUS, headers=headers, params=params)
    assert r.status_code == 200, r.text
    return {i["id"]: i for i in r.json()}


def item(client, headers, animal_id, **params):
    return items(client, headers, **params)[animal_id]


def flags(s):
    return (s["is_overdue"], s["days_since_last_feeding"], s["needs_first_feeding"], s["is_feeding_paused"])


# ── switches off: identical to today ────────────────────────────────────────

@pytest.mark.parametrize("prefs_row", ["none", "all_false"])
def test_switches_off_output_identical(client, db_session, keeper, h, cutoff_30_days_ago, prefs_row):
    if prefs_row == "all_false":
        set_rules(db_session, keeper)

    fed = animal(client, h, "Fed20")
    feed(client, h, fed["id"], 20)

    refused = animal(client, h, "Refused3")
    feed(client, h, refused["id"], 20)
    feed(client, h, refused["id"], 3, accepted=False)

    new_never = animal(client, h, "NewNever")
    created_days_ago(db_session, new_never["id"], 20)

    old_never = animal(client, h, "OldNever")
    created_days_ago(db_session, old_never["id"], 40)

    paused = animal(client, h, "KeeperPaused")
    feed(client, h, paused["id"], 20)
    inv = db_session.query(Invert).filter(Invert.id == uuid.UUID(paused["id"])).one()
    inv.feeding_paused_reason = "premolt"
    db_session.commit()

    grazer = animal(client, h, "Grazer", taxon="millipede", interval=None)

    molted = animal(client, h, "Molted")
    feed(client, h, molted["id"], 20)
    molt(client, h, molted["id"], 5)

    got = items(client, h)
    assert flags(got[fed["id"]]) == (True, 20, False, False)
    assert flags(got[refused["id"]]) == (True, 20, False, False)
    assert flags(got[new_never["id"]]) == (True, None, False, False)
    assert flags(got[old_never["id"]]) == (False, None, True, False)
    s = got[paused["id"]]
    assert (s["is_overdue"], s["needs_first_feeding"], s["is_feeding_paused"]) == (False, False, True)
    s = got[grazer["id"]]
    assert (s["is_overdue"], s["needs_first_feeding"], s["is_feeding_paused"]) == (False, False, False)
    assert flags(got[molted["id"]]) == (True, 20, False, False)
    for s in got.values():
        assert s["last_offered_date"] is None
        assert s["post_molt_pause_until"] is None
    for aid in (fed["id"], molted["id"]):
        r = client.get(f"/api/v1/inverts/{aid}/feeding-stats", headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["post_molt_pause_until"] is None


def test_load_feeding_rules_missing_row_is_all_off(db_session, keeper):
    other = mk_user(db_session)
    set_rules(db_session, other, refusal=True, molt=False)
    rules = load_feeding_rules(db_session, [keeper.id, other.id])
    assert rules[keeper.id] == FeedingRules()
    assert rules[other.id] == FeedingRules(refusal_restarts_wait=True, post_molt_pause=False)
    assert load_feeding_rules(db_session, []) == {}


# ── refusal restarts the wait ───────────────────────────────────────────────

def test_refusal_restarts_wait(client, db_session, keeper, h):
    a = animal(client, h, "Picky")
    feed(client, h, a["id"], 20)
    refusal = feed(client, h, a["id"], 3, accepted=False)

    s = item(client, h, a["id"])
    assert s["is_overdue"] is True

    set_rules(db_session, keeper, refusal=True)
    s = item(client, h, a["id"])
    assert s["is_overdue"] is False
    assert s["days_since_last_feeding"] == 20  # still "last meal"
    assert datetime.fromisoformat(s["last_offered_date"]) == datetime.fromisoformat(refusal["fed_at"])
    assert datetime.fromisoformat(s["last_feeding_date"]) < datetime.fromisoformat(s["last_offered_date"])


def test_refusal_switch_on_still_due_after_full_wait(client, db_session, keeper, h):
    """The refusal only restarts the countdown; it doesn't silence the animal."""
    set_rules(db_session, keeper, refusal=True)
    a = animal(client, h, "Picky")
    feed(client, h, a["id"], 40)
    feed(client, h, a["id"], 15, accepted=False)
    s = item(client, h, a["id"])
    assert s["is_overdue"] is True
    assert s["days_since_last_feeding"] == 40


def test_refusal_switch_on_meal_only_unchanged(client, db_session, keeper, h):
    set_rules(db_session, keeper, refusal=True)
    a = animal(client, h, "Eater")
    meal = feed(client, h, a["id"], 20)
    s = item(client, h, a["id"])
    assert s["is_overdue"] is True
    assert datetime.fromisoformat(s["last_offered_date"]) == datetime.fromisoformat(meal["fed_at"])


def test_refusal_counts_for_never_fed(client, db_session, keeper, h, after_cutoff):
    a = animal(client, h, "NeverAte")
    created_days_ago(db_session, a["id"], 20)
    feed(client, h, a["id"], 2, accepted=False)

    s = item(client, h, a["id"])
    assert s["is_overdue"] is True  # off: refusal-only follows the baseline rule
    assert s["needs_first_feeding"] is False

    set_rules(db_session, keeper, refusal=True)
    s = item(client, h, a["id"])
    assert s["is_overdue"] is False
    assert s["needs_first_feeding"] is False
    assert s["days_since_last_feeding"] is None
    assert s["days_since_baseline"] == 20


# ── post-molt pause: windows ────────────────────────────────────────────────

def test_default_pause_table():
    assert pmp.default_pause_days("tarantula", "sling") == 7
    assert pmp.default_pause_days("tarantula", "juvenile") == 10
    assert pmp.default_pause_days("tarantula", "adult") == 14
    assert pmp.default_pause_days("tarantula", None) == 14
    assert pmp.default_pause_days("tarantula", "subadult") == 14  # unknown -> adult
    assert pmp.default_pause_days("scorpion", "sling") == 4
    assert pmp.default_pause_days("scorpion", "juvenile") == 7
    assert pmp.default_pause_days("true_spider", "sling") == 7
    assert pmp.default_pause_days("mantis", "adult") == 3
    for taxon in ("millipede", "centipede", "isopod", "roach", "other", "whip_spider", "vinegaroon", None):
        assert pmp.default_pause_days(taxon, "adult") is None
    assert set(pmp.DEFAULT_PAUSE_DAYS) == {"tarantula", "scorpion", "true_spider", "mantis"}


def test_pause_until_unit():
    today = date(2026, 11, 10)
    assert pmp.pause_until(date(2026, 11, 5), today, 14) == date(2026, 11, 19)
    assert pmp.pause_until(date(2026, 11, 5), today, 5) == today  # last paused day
    assert pmp.pause_until(date(2026, 11, 5), today, 4) is None
    assert pmp.pause_until(date(2026, 11, 5), today, 0) is None
    assert pmp.pause_until(date(2026, 11, 5), today, None) is None
    assert pmp.pause_until(date(2026, 11, 20), today, 3) == date(2026, 11, 13)  # future = today
    # future molt anchors at the day it was logged
    assert pmp.pause_until(date(2026, 12, 10), today, 14, date(2026, 10, 21)) is None
    assert pmp.pause_until(date(2026, 12, 10), today, 14, date(2026, 11, 9)) == date(2026, 11, 23)


@pytest.mark.parametrize("taxon,stage,days", [
    ("tarantula", "sling", 7),
    ("tarantula", "juvenile", 10),
    ("tarantula", "adult", 14),
    ("tarantula", None, 14),
    ("scorpion", "sling", 4),
    ("mantis", "adult", 3),
])
def test_post_molt_pause_windows(client, db_session, keeper, h, taxon, stage, days):
    set_rules(db_session, keeper, molt=True)
    a = animal(client, h, "M", taxon=taxon, life_stage=stage, interval=7)
    feed(client, h, a["id"], 20)
    molt(client, h, a["id"], 2)
    s = item(client, h, a["id"])
    assert s["post_molt_pause_until"] == (molt_at(2).date() + timedelta(days=days)).isoformat()
    assert s["is_overdue"] is False
    assert s["days_since_last_feeding"] == 20
    assert s["is_feeding_paused"] is False  # still the keeper-pause flag only


def test_millipede_gets_no_pause(client, db_session, keeper, h):
    set_rules(db_session, keeper, molt=True)
    a = animal(client, h, "Milli", taxon="millipede", interval=None)
    molt(client, h, a["id"], 1)
    assert item(client, h, a["id"])["post_molt_pause_until"] is None


def test_adult_tarantula_five_days_after_molt(client, db_session, keeper, h):
    a = animal(client, h, "Adult", interval=14)
    feed(client, h, a["id"], 20)
    molt(client, h, a["id"], 5)
    assert item(client, h, a["id"])["is_overdue"] is True  # switch off

    set_rules(db_session, keeper, molt=True)
    s = item(client, h, a["id"])
    assert s["post_molt_pause_until"] == (molt_at(5).date() + timedelta(days=14)).isoformat()
    assert s["is_overdue"] is False


def test_accepted_meal_after_molt_ends_the_pause(client, db_session, keeper, h):
    set_rules(db_session, keeper, molt=True)
    a = animal(client, h, "Eating", interval=14)
    feed(client, h, a["id"], 20)
    molt(client, h, a["id"], 3)
    assert item(client, h, a["id"])["post_molt_pause_until"] is not None

    # A refusal after the molt confirms the pause; it does not end it.
    feed(client, h, a["id"], 2, accepted=False)
    assert item(client, h, a["id"])["post_molt_pause_until"] is not None

    # An accepted meal on/after the molt's day ends it: no pause label.
    feed(client, h, a["id"], 1)
    s = item(client, h, a["id"])
    assert s["post_molt_pause_until"] is None
    assert s["is_overdue"] is False  # just fed


def test_post_molt_pause_clears_first_feeding_nudge(client, db_session, keeper, h, after_cutoff):
    set_rules(db_session, keeper, molt=True)
    a = animal(client, h, "Fresh", interval=14)
    created_days_ago(db_session, a["id"], 20)
    molt(client, h, a["id"], 2)
    s = item(client, h, a["id"])
    assert s["post_molt_pause_until"] is not None
    assert s["is_overdue"] is False
    assert s["needs_first_feeding"] is False


# ── post-molt pause: per-molt override ──────────────────────────────────────

@pytest.mark.parametrize("override,paused", [(3, False), (0, False), (30, True)])
def test_post_molt_override(client, db_session, keeper, h, override, paused):
    set_rules(db_session, keeper, molt=True)
    a = animal(client, h, "Override")
    feed(client, h, a["id"], 20)
    molt(client, h, a["id"], 5, feeding_pause_days=override)
    s = item(client, h, a["id"])
    if paused:
        assert s["post_molt_pause_until"] == (molt_at(5).date() + timedelta(days=override)).isoformat()
        assert s["is_overdue"] is False
    else:
        assert s["post_molt_pause_until"] is None
        assert s["is_overdue"] is True


def test_override_applies_to_newest_molt_only(client, db_session, keeper, h):
    set_rules(db_session, keeper, molt=True)
    a = animal(client, h, "Two")
    molt(client, h, a["id"], 8, feeding_pause_days=30)
    molt(client, h, a["id"], 3, feeding_pause_days=0)
    assert item(client, h, a["id"])["post_molt_pause_until"] is None


# ── post-molt pause: back-dated, deleted, future ────────────────────────────

def test_backdated_and_deleted_molt(client, db_session, keeper, h):
    set_rules(db_session, keeper, molt=True)
    a = animal(client, h, "Late")
    feed(client, h, a["id"], 50)
    molt(client, h, a["id"], 40)  # logged today, dated 40 days ago
    s = item(client, h, a["id"])
    assert s["post_molt_pause_until"] is None
    assert s["is_overdue"] is True

    recent = molt(client, h, a["id"], 2)
    assert item(client, h, a["id"])["post_molt_pause_until"] is not None

    r = client.delete(f"/api/v1/molts/{recent['id']}", headers=h)
    assert r.status_code == 204, r.text
    s = item(client, h, a["id"])
    assert s["post_molt_pause_until"] is None
    assert s["is_overdue"] is True


def test_future_molt_runs_from_today(client, db_session, keeper, h):
    set_rules(db_session, keeper, molt=True)
    a = animal(client, h, "Future")
    feed(client, h, a["id"], 20)
    molt(client, h, a["id"], -5)
    s = item(client, h, a["id"])
    assert s["post_molt_pause_until"] == (_today() + timedelta(days=14)).isoformat()
    assert s["is_overdue"] is False


def test_future_molt_logged_long_ago_does_not_pause(client, db_session, keeper, h):
    """A molt dated +30 days, logged 20 days ago: one window from logging."""
    set_rules(db_session, keeper, molt=True)
    a = animal(client, h, "Typo")
    feed(client, h, a["id"], 20)
    m = molt(client, h, a["id"], -30)
    row = db_session.query(MoltLog).filter(MoltLog.id == uuid.UUID(m["id"])).one()
    row.created_at = _now() - timedelta(days=20)
    db_session.commit()
    s = item(client, h, a["id"])
    assert s["post_molt_pause_until"] is None
    assert s["is_overdue"] is True


def test_future_molt_does_not_shadow_real_past_molt(client, db_session, keeper, h):
    set_rules(db_session, keeper, molt=True)
    a = animal(client, h, "Shadow")
    feed(client, h, a["id"], 20)
    molt(client, h, a["id"], 2)
    molt(client, h, a["id"], -30)  # typo'd future molt
    s = item(client, h, a["id"])
    assert s["post_molt_pause_until"] == (molt_at(2).date() + timedelta(days=14)).isoformat()


def test_keeper_pause_wins(client, db_session, keeper, h):
    set_rules(db_session, keeper, molt=True)
    a = animal(client, h, "Both")
    feed(client, h, a["id"], 20)
    molt(client, h, a["id"], 2)
    inv = db_session.query(Invert).filter(Invert.id == uuid.UUID(a["id"])).one()
    inv.feeding_paused_reason = "post_molt"
    inv.feeding_paused_until = _today() + timedelta(days=30)
    db_session.commit()
    s = item(client, h, a["id"])
    assert s["is_feeding_paused"] is True
    assert s["post_molt_pause_until"] is None
    assert s["is_overdue"] is False


def test_tz_offset_moves_the_molt_day(client, db_session, keeper, h):
    """The molt's keeper-local day sets the window, not its UTC day."""
    set_rules(db_session, keeper, molt=True)
    a = animal(client, h, "Tz")
    # 02:00 UTC two days ago is still the day before in UTC-5 (offset +300).
    stamp = datetime.combine(_today() - timedelta(days=2), time(2, 0), tzinfo=timezone.utc)
    r = client.post(f"/api/v1/inverts/{a['id']}/molts", json={"molted_at": stamp.isoformat()}, headers=h)
    assert r.status_code == 201
    s = item(client, h, a["id"], tz_offset_minutes=300)
    local_molt_day = (stamp - timedelta(minutes=300)).date()
    assert s["post_molt_pause_until"] == (local_molt_day + timedelta(days=14)).isoformat()


# ── legacy tarantula molts ──────────────────────────────────────────────────

def test_legacy_tarantula_molt_counts(client, db_session, keeper, h):
    set_rules(db_session, keeper, molt=True)
    r = client.post("/api/v1/tarantulas/", json={"name": "Legacy"}, headers=h)
    assert r.status_code in (200, 201), r.text
    tid = r.json()["id"]
    assert db_session.query(Invert).filter(Invert.id == uuid.UUID(tid)).first() is not None
    db_session.add(MoltLog(tarantula_id=uuid.UUID(tid), invert_id=None, molted_at=molt_at(2)))
    db_session.commit()
    s = item(client, h, tid)
    # Unknown stage -> adult figure.
    assert s["post_molt_pause_until"] == (molt_at(2).date() + timedelta(days=14)).isoformat()


# ── whose rules: the owner's ────────────────────────────────────────────────

def _member(db, owner, member, role="viewer"):
    db.add(CollectionMember(
        owner_user_id=owner.id, member_user_id=member.id, app="tarantuverse", role=role,
        invited_email=member.email, status="active", accepted_at=_now(),
    ))
    db.commit()


def test_co_keeper_sees_owner_rules(client, db_session, keeper, h):
    co = mk_user(db_session, "cokeeper")
    set_rules(db_session, keeper, molt=True, refusal=True)
    set_rules(db_session, co)  # the co-keeper's own switches are all off
    _member(db_session, keeper, co)

    a = animal(client, h, "Shared")
    feed(client, h, a["id"], 20)
    molt(client, h, a["id"], 2)

    s = item(client, hdr(co), a["id"], collection=str(keeper.id))
    assert s["post_molt_pause_until"] is not None
    assert s["last_offered_date"] is not None
    assert s["is_overdue"] is False


def test_co_keepers_switch_does_not_apply_to_owner_animals(client, db_session, keeper, h):
    co = mk_user(db_session, "cokeeper")
    set_rules(db_session, co, molt=True, refusal=True)
    _member(db_session, keeper, co)

    a = animal(client, h, "Shared")
    feed(client, h, a["id"], 20)
    molt(client, h, a["id"], 2)

    s = item(client, hdr(co), a["id"], collection=str(keeper.id))
    assert s["post_molt_pause_until"] is None
    assert s["last_offered_date"] is None
    assert s["is_overdue"] is True


def test_single_animal_stats_follow_the_rule(client, db_session, keeper, h):
    set_rules(db_session, keeper, molt=True)
    a = animal(client, h, "Stats")
    feed(client, h, a["id"], 20)
    molt(client, h, a["id"], 2)
    r = client.get(f"/api/v1/inverts/{a['id']}/feeding-stats", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["is_overdue"] is False
    assert r.json()["post_molt_pause_until"] == (molt_at(2).date() + timedelta(days=14)).isoformat()


def test_queries_stay_batched(client, db_session, keeper, h):
    """One molt query and one offered query for the whole collection."""
    from sqlalchemy import event

    set_rules(db_session, keeper, molt=True, refusal=True)
    for i in range(5):
        a = animal(client, h, f"S{i}")
        feed(client, h, a["id"], 20)
        feed(client, h, a["id"], 2, accepted=False)
        molt(client, h, a["id"], 3)

    molt_selects, feeding_selects = [], []

    def spy(conn, cursor, statement, params, context, executemany):
        s = statement.lower().lstrip()
        if s.startswith("select") and "molt_logs" in s:
            molt_selects.append(statement)
        if s.startswith("select") and "feeding_logs" in s:
            feeding_selects.append(statement)

    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", spy)
    try:
        got = items(client, h)
    finally:
        event.remove(engine, "before_cursor_execute", spy)
    assert len(got) == 5
    assert len(molt_selects) == 1, molt_selects
    assert len(feeding_selects) <= 3, feeding_selects


def test_switches_off_skip_the_extra_queries(client, db_session, keeper, h):
    from sqlalchemy import event

    a = animal(client, h, "Quiet")
    molt(client, h, a["id"], 3)
    molt_selects = []

    def spy(conn, cursor, statement, params, context, executemany):
        s = statement.lower().lstrip()
        if s.startswith("select") and "molt_logs" in s:
            molt_selects.append(statement)

    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", spy)
    try:
        items(client, h)
    finally:
        event.remove(engine, "before_cursor_execute", spy)
    assert molt_selects == []


# ── GET /inverts/{id}/post-molt-pause ───────────────────────────────────────

def _pause_info(client, headers, animal_id):
    return client.get(f"/api/v1/inverts/{animal_id}/post-molt-pause", headers=headers)


def test_post_molt_pause_endpoint(client, db_session, keeper, h):
    adult = animal(client, h, "Adult")
    sling = animal(client, h, "Sling", taxon="scorpion", life_stage="sling")
    milli = animal(client, h, "Milli", taxon="millipede", interval=None)

    r = _pause_info(client, h, adult["id"])
    assert r.status_code == 200, r.text
    assert r.json() == {"enabled": False, "default_days": 14}

    set_rules(db_session, keeper, molt=True)
    assert _pause_info(client, h, adult["id"]).json() == {"enabled": True, "default_days": 14}
    assert _pause_info(client, h, sling["id"]).json() == {"enabled": True, "default_days": 4}
    assert _pause_info(client, h, milli["id"]).json() == {"enabled": True, "default_days": None}


def test_post_molt_pause_endpoint_access(client, db_session, keeper, h):
    a = animal(client, h, "Private")
    stranger = mk_user(db_session, "stranger")
    assert _pause_info(client, hdr(stranger), a["id"]).status_code == 404

    viewer = mk_user(db_session, "viewer")
    _member(db_session, keeper, viewer, role="viewer")
    assert _pause_info(client, hdr(viewer), a["id"]).status_code == 403


def test_post_molt_pause_endpoint_reads_owner_switch(client, db_session, keeper, h, monkeypatch):
    """A logger co-keeper sees the OWNER's switch, not their own."""
    monkeypatch.setattr(User, "is_premium_for_app", lambda self, app: True)
    co = mk_user(db_session, "logger")
    set_rules(db_session, co, molt=True)
    _member(db_session, keeper, co, role="logger")
    a = animal(client, h, "Shared")
    r = _pause_info(client, hdr(co), a["id"])
    assert r.status_code == 200, r.text
    assert r.json() == {"enabled": False, "default_days": 14}

    set_rules(db_session, keeper, molt=True)
    set_rules(db_session, co, molt=False)
    assert _pause_info(client, hdr(co), a["id"]).json()["enabled"] is True


# ── molt routes store the override ──────────────────────────────────────────

def test_molt_routes_store_override(client, db_session, keeper, h):
    when = molt_at(1).isoformat()

    a = animal(client, h, "Inv")
    r = client.post(f"/api/v1/inverts/{a['id']}/molts", json={"molted_at": when, "feeding_pause_days": 9}, headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["feeding_pause_days"] == 9
    inv_molt_id = r.json()["id"]

    r = client.post("/api/v1/tarantulas/", json={"name": "Legacy"}, headers=h)
    assert r.status_code in (200, 201), r.text
    tid = r.json()["id"]
    r = client.post(f"/api/v1/tarantulas/{tid}/molts", json={"molted_at": when, "feeding_pause_days": 0}, headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["feeding_pause_days"] == 0

    r = client.post("/api/v1/enclosures/", json={"name": "Communal", "is_communal": True}, headers=h)
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    r = client.post(f"/api/v1/enclosures/{eid}/molts", json={"molted_at": when, "feeding_pause_days": 21}, headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["feeding_pause_days"] == 21

    # Default stays NULL (= use the table).
    r = client.post(f"/api/v1/inverts/{a['id']}/molts", json={"molted_at": molt_at(0).isoformat()}, headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["feeding_pause_days"] is None

    # PUT changes it, keeps it when not sent, and can clear it.
    r = client.put(f"/api/v1/molts/{inv_molt_id}", json={"feeding_pause_days": 30}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["feeding_pause_days"] == 30
    r = client.put(f"/api/v1/molts/{inv_molt_id}", json={"notes": "fangs black"}, headers=h)
    assert r.json()["feeding_pause_days"] == 30
    r = client.put(f"/api/v1/molts/{inv_molt_id}", json={"feeding_pause_days": None}, headers=h)
    assert r.json()["feeding_pause_days"] is None
    row = db_session.query(MoltLog).filter(MoltLog.id == uuid.UUID(inv_molt_id)).one()
    db_session.refresh(row)
    assert row.feeding_pause_days is None

    r = client.get(f"/api/v1/inverts/{a['id']}/molts", headers=h)
    assert r.status_code == 200
    assert "feeding_pause_days" in r.json()[0]


@pytest.mark.parametrize("bad", [-1, 61])
def test_molt_override_bounds(client, h, bad):
    a = animal(client, h, "Bounds")
    r = client.post(
        f"/api/v1/inverts/{a['id']}/molts",
        json={"molted_at": molt_at(1).isoformat(), "feeding_pause_days": bad},
        headers=h,
    )
    assert r.status_code == 422
    good = client.post(
        f"/api/v1/inverts/{a['id']}/molts",
        json={"molted_at": molt_at(1).isoformat(), "feeding_pause_days": 5},
        headers=h,
    )
    assert good.status_code == 201
    r = client.put(f"/api/v1/molts/{good.json()['id']}", json={"feeding_pause_days": bad}, headers=h)
    assert r.status_code == 422
