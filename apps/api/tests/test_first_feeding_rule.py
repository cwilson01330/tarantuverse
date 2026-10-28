"""Day one, Task 1: the first-feeding rule, one copy everywhere.

A never-fed animal (no ACCEPTED feeding) now has a baseline = the later of its
created_at (keeper-local date) and date_acquired. After the release cutoff
(`FIRST_FEEDING_DUE_FROM`) such an animal becomes due once local days since
baseline reach its interval; before it, it only gets the `needs_first_feeding`
nudge. An animal with NO feeding log at all (and a cadence, not paused, not due)
is `needs_first_feeding`; a refusal-only animal gets no nudge but follows the
same due rule. Grazers and paused animals never get either flag.

The cutoff is read at call time as a module attribute, so these tests move it
with monkeypatch: 2020-01-01 puts every test animal after it, 2099-01-01 before.
Real Postgres through the TestClient; animals/logs are made via public routes.
"""
import uuid
from datetime import date, datetime, time, timedelta, timezone

import pytest

from app.models.invert import Invert
from app.models.notification import Notification
from app.models.notification_preferences import NotificationPreferences
from app.models.user import User
from app.services import feeding_status
from app.utils.auth import create_access_token

pytestmark = pytest.mark.requires_postgres

STATUS = "/api/v1/inverts/feeding-status"
COLLECTION = "/api/v1/analytics/collection"

AFTER_CUTOFF = date(2020, 1, 1)   # every animal in these tests is created after it
BEFORE_CUTOFF = date(2099, 1, 1)  # every animal in these tests is created before it


# ── helpers ──────────────────────────────────────────────────────────────────

def _now():
    return datetime.now(timezone.utc)


def mk_user(db, tag="firstfeed"):
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


@pytest.fixture()
def keeper(db_session):
    return mk_user(db_session)


@pytest.fixture()
def h(keeper):
    return hdr(keeper)


@pytest.fixture()
def after_cutoff(monkeypatch):
    monkeypatch.setattr(feeding_status, "FIRST_FEEDING_DUE_FROM", AFTER_CUTOFF)


@pytest.fixture()
def before_cutoff(monkeypatch):
    monkeypatch.setattr(feeding_status, "FIRST_FEEDING_DUE_FROM", BEFORE_CUTOFF)


def animal(client, headers, name, *, taxon="tarantula", interval=7, **extra):
    body = {"taxon": taxon, "name": name, **extra}
    if interval is not None:
        body["feeding_interval_days"] = interval
    r = client.post("/api/v1/inverts/", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def created_days_ago(db, animal_id, days, tz_offset=None):
    """Move created_at to NOON UTC, `days` calendar days before the keeper's today."""
    local_today = (_now() - timedelta(minutes=tz_offset or 0)).date()
    stamp = datetime.combine(local_today - timedelta(days=days), time(12, 0), tzinfo=timezone.utc)
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


def item(client, headers, animal_id, **params):
    r = client.get(STATUS, headers=headers, params=params)
    assert r.status_code == 200, r.text
    return next(i for i in r.json() if i["id"] == animal_id)


# ── the rule ─────────────────────────────────────────────────────────────────

def test_never_fed_new_animal_nudges_then_due(client, db_session, h, after_cutoff):
    a = animal(client, h, "Fresh")
    created_days_ago(db_session, a["id"], 3)
    s = item(client, h, a["id"])
    assert s["needs_first_feeding"] is True
    assert s["is_overdue"] is False
    assert s["days_since_baseline"] == 3
    assert s["days_since_last_feeding"] is None

    created_days_ago(db_session, a["id"], 7)
    s = item(client, h, a["id"])
    assert s["needs_first_feeding"] is False
    assert s["is_overdue"] is True
    assert s["days_since_baseline"] == 7
    assert s["days_since_last_feeding"] is None


def test_pre_cutoff_never_fed_never_due(client, db_session, h, before_cutoff):
    a = animal(client, h, "Old")
    created_days_ago(db_session, a["id"], 400)
    s = item(client, h, a["id"])
    assert s["needs_first_feeding"] is True
    assert s["is_overdue"] is False
    # Still reported, so a client could say how long it has been.
    assert s["days_since_baseline"] == 400


def test_baseline_is_later_of_added_and_acquired(client, db_session, h, after_cutoff):
    today = _now().date()
    a = animal(client, h, "Acquired", date_acquired=(today - timedelta(days=2)).isoformat())
    created_days_ago(db_session, a["id"], 10)
    s = item(client, h, a["id"])
    assert s["days_since_baseline"] == 2
    assert s["is_overdue"] is False
    assert s["needs_first_feeding"] is True

    # An acquired date in the future pushes the baseline out: never negative, not due.
    b = animal(client, h, "Incoming", date_acquired=(today + timedelta(days=5)).isoformat())
    created_days_ago(db_session, b["id"], 10)
    s = item(client, h, b["id"])
    assert s["days_since_baseline"] == 0
    assert s["is_overdue"] is False
    assert s["needs_first_feeding"] is True


def test_acquired_earlier_than_added_uses_added(client, db_session, h, after_cutoff):
    today = _now().date()
    a = animal(client, h, "Bought long ago", date_acquired=(today - timedelta(days=30)).isoformat())
    created_days_ago(db_session, a["id"], 1)
    s = item(client, h, a["id"])
    assert s["days_since_baseline"] == 1
    assert s["is_overdue"] is False


def test_baseline_uses_local_day(client, db_session, h, after_cutoff):
    """A keeper west of UTC adds an animal at 9 pm local: the baseline is that
    LOCAL day (yesterday by the keeper's clock), not the UTC date it landed on."""
    a = animal(client, h, "Evening")
    offset = 300  # UTC-5
    local_today = (_now() - timedelta(minutes=offset)).date()
    inv = db_session.query(Invert).filter(Invert.id == uuid.UUID(a["id"])).one()
    # local_today 02:00 UTC == the previous evening, 9 pm, at UTC-5.
    inv.created_at = datetime.combine(local_today, time(2, 0), tzinfo=timezone.utc)
    db_session.commit()
    s = item(client, h, a["id"], tz_offset_minutes=offset)
    assert s["days_since_baseline"] == 1


def test_cutoff_compares_the_local_day(client, db_session, h, monkeypatch):
    """Created 9 pm on the cutoff's eve (keeper-local) is still BEFORE the cutoff,
    even though its UTC date is the cutoff day."""
    offset = 300  # UTC-5
    cutoff = _now().date() - timedelta(days=10)
    a = animal(client, h, "Eve")
    inv = db_session.query(Invert).filter(Invert.id == uuid.UUID(a["id"])).one()
    # cutoff 02:00 UTC == the evening before the cutoff at UTC-5.
    inv.created_at = datetime.combine(cutoff, time(2, 0), tzinfo=timezone.utc)
    db_session.commit()
    monkeypatch.setattr(feeding_status, "FIRST_FEEDING_DUE_FROM", cutoff)

    s = item(client, h, a["id"], tz_offset_minutes=offset)
    # Local day is before the cutoff: nudge only, however long it has been.
    assert s["is_overdue"] is False
    assert s["needs_first_feeding"] is True
    # With no offset the UTC date IS the cutoff day: after it, 10 days >= 7, due.
    s = item(client, h, a["id"])
    assert s["is_overdue"] is True
    assert s["needs_first_feeding"] is False


def test_shipped_cutoff_value():
    assert feeding_status.FIRST_FEEDING_DUE_FROM == date(2026, 10, 28)


def test_cutoff_is_read_at_call_time(client, db_session, h, monkeypatch):
    a = animal(client, h, "Flip")
    created_days_ago(db_session, a["id"], 10)
    monkeypatch.setattr(feeding_status, "FIRST_FEEDING_DUE_FROM", BEFORE_CUTOFF)
    assert item(client, h, a["id"])["is_overdue"] is False
    monkeypatch.setattr(feeding_status, "FIRST_FEEDING_DUE_FROM", AFTER_CUTOFF)
    assert item(client, h, a["id"])["is_overdue"] is True


def test_refusal_only_no_nudge_but_due(client, db_session, h, after_cutoff):
    a = animal(client, h, "Refuser")
    created_days_ago(db_session, a["id"], 7)
    feed(client, h, a["id"], 1, accepted=False)
    s = item(client, h, a["id"])
    assert s["needs_first_feeding"] is False
    assert s["is_overdue"] is True
    assert s["days_since_last_feeding"] is None
    assert s["days_since_baseline"] == 7


def test_refusal_only_young_has_no_nudge_and_not_due(client, db_session, h, after_cutoff):
    a = animal(client, h, "Refuser young")
    created_days_ago(db_session, a["id"], 2)
    feed(client, h, a["id"], 1, accepted=False)
    s = item(client, h, a["id"])
    assert s["needs_first_feeding"] is False
    assert s["is_overdue"] is False


def test_paused_never_fed_no_nudge(client, db_session, h, after_cutoff):
    a = animal(client, h, "Paused")
    created_days_ago(db_session, a["id"], 20)
    r = client.put(f"/api/v1/inverts/{a['id']}", json={"feeding_paused_reason": "premolt"}, headers=h)
    assert r.status_code == 200, r.text
    s = item(client, h, a["id"])
    assert s["is_feeding_paused"] is True
    assert s["needs_first_feeding"] is False
    assert s["is_overdue"] is False


def test_grazer_never_fed_no_nudge(client, db_session, h, after_cutoff):
    a = animal(client, h, "Isopods", taxon="isopod", interval=None)
    created_days_ago(db_session, a["id"], 20)
    s = item(client, h, a["id"])
    assert s["interval_days"] is None
    assert s["needs_first_feeding"] is False
    assert s["is_overdue"] is False


def test_fed_animal_unchanged(client, db_session, h, after_cutoff):
    a = animal(client, h, "Fed")
    created_days_ago(db_session, a["id"], 30)
    feed(client, h, a["id"], 8)
    s = item(client, h, a["id"])
    assert s["is_overdue"] is True
    assert s["needs_first_feeding"] is False
    assert s["days_since_baseline"] is None
    assert s["days_since_last_feeding"] == 8


def test_fed_animal_not_due_unchanged_before_cutoff(client, db_session, h, before_cutoff):
    a = animal(client, h, "Fed old")
    created_days_ago(db_session, a["id"], 400)
    feed(client, h, a["id"], 8)
    s = item(client, h, a["id"])
    # Once a feeding is logged the normal rule applies to every animal.
    assert s["is_overdue"] is True
    assert s["needs_first_feeding"] is False


def test_never_fed_float_to_the_top(client, db_session, h, after_cutoff):
    fed = animal(client, h, "Fed")
    never = animal(client, h, "Never")
    created_days_ago(db_session, fed["id"], 30)
    created_days_ago(db_session, never["id"], 1)
    feed(client, h, fed["id"], 12)
    r = client.get(STATUS, headers=h)
    ids = [i["id"] for i in r.json()]
    assert ids.index(never["id"]) < ids.index(fed["id"])


# ── one rule, every reader ───────────────────────────────────────────────────

def test_single_animal_stats_match_list(client, db_session, h, after_cutoff):
    due = animal(client, h, "Due")
    nudge = animal(client, h, "Nudge")
    created_days_ago(db_session, due["id"], 9)
    created_days_ago(db_session, nudge["id"], 2)
    for a in (due, nudge):
        s = item(client, h, a["id"])
        r = client.get(f"/api/v1/inverts/{a['id']}/feeding-stats", headers=h)
        assert r.status_code == 200, r.text
        stats = r.json()
        assert stats["is_overdue"] == s["is_overdue"]
        assert stats["needs_first_feeding"] == s["needs_first_feeding"]
        assert stats["days_since_baseline"] == s["days_since_baseline"]
        assert stats["days_since_last_feeding"] is None
    assert client.get(f"/api/v1/inverts/{due['id']}/feeding-stats", headers=h).json()["is_overdue"] is True


def test_single_animal_stats_honour_tz_offset(client, db_session, h, after_cutoff):
    a = animal(client, h, "Evening")
    offset = 300
    local_today = (_now() - timedelta(minutes=offset)).date()
    inv = db_session.query(Invert).filter(Invert.id == uuid.UUID(a["id"])).one()
    inv.created_at = datetime.combine(local_today, time(2, 0), tzinfo=timezone.utc)
    db_session.commit()
    r = client.get(f"/api/v1/inverts/{a['id']}/feeding-stats", headers=h, params={"tz_offset_minutes": offset})
    assert r.json()["days_since_baseline"] == 1


def test_digest_counts_never_fed_due(client, db_session, keeper, h, after_cutoff):
    from app.services.digest_service import run_feeding_digests

    due = animal(client, h, "Due")
    created_days_ago(db_session, due["id"], 9)
    db_session.add(NotificationPreferences(user_id=keeper.id, daily_digest_enabled=True, digest_hour=9))
    db_session.commit()
    out = run_feeding_digests(db_session, only_user_id=str(keeper.id), ignore_schedule=True)
    assert out["sent"] == 1
    notes = db_session.query(Notification).filter(
        Notification.user_id == keeper.id, Notification.type == "feeding_digest"
    ).all()
    assert len(notes) == 1
    assert notes[0].data["overdue"] == 1


def test_digest_ignores_pre_cutoff_never_fed(client, db_session, keeper, h, before_cutoff):
    from app.services.digest_service import run_feeding_digests

    old = animal(client, h, "Old")
    created_days_ago(db_session, old["id"], 400)
    db_session.add(NotificationPreferences(user_id=keeper.id, daily_digest_enabled=True, digest_hour=9))
    db_session.commit()
    out = run_feeding_digests(db_session, only_user_id=str(keeper.id), ignore_schedule=True)
    assert out["sent"] == 0
    assert db_session.query(Notification).filter(
        Notification.user_id == keeper.id, Notification.type == "feeding_digest"
    ).count() == 0


def test_digest_overdue_items_is_the_count(client, db_session, keeper, h, after_cutoff):
    from app.services import digest_service

    d1 = animal(client, h, "Due1")
    d2 = animal(client, h, "Due2")
    nudge = animal(client, h, "Nudge")
    for a, days in ((d1, 9), (d2, 8), (nudge, 1)):
        created_days_ago(db_session, a["id"], days)
    items = digest_service._overdue_items(db_session, keeper.id, None)
    assert {str(i.id) for i in items} == {d1["id"], d2["id"]}
    assert digest_service._overdue_count(db_session, keeper.id, None) == 2


def test_analytics_collection_with_never_fed_due(client, db_session, h, after_cutoff):
    a = animal(client, h, "Waiting")
    created_days_ago(db_session, a["id"], 9)
    r = client.get(COLLECTION, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["feeding_due_today"] == 1
    assert body["feeding_overdue"] == 1  # 9 days waited > 7-day interval
    assert body["first_due"]["tarantula_id"] == a["id"]
    assert body["first_due"]["days"] == 9
    assert body["first_due"]["usual_interval_days"] == 7
    # longest_gap stays fed-only.
    assert body["longest_gap"] is None


def test_analytics_due_exactly_on_interval_is_not_overdue_yet(client, db_session, h, after_cutoff):
    a = animal(client, h, "OnTheDay")
    created_days_ago(db_session, a["id"], 7)
    body = client.get(COLLECTION, headers=h).json()
    assert body["feeding_due_today"] == 1
    assert body["feeding_overdue"] == 0
    assert body["first_due"]["days"] == 7
