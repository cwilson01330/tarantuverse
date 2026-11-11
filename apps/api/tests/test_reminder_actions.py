"""Effortless logging, Task 3: the buttons on a per-animal feeding reminder.

POST /api/v1/inverts/{invert_id}/reminder-action {action, reminder_date}:

- fed / refused create a feeding through the SAME path as
  POST /inverts/{id}/feedings (closed-animal 409, pause clearing, tarantula
  twin FK), food copied from the latest accepted meal, notes "Logged from
  reminder", `reminder_date` set. One reminder logs one outcome: a second tap
  (or a second phone, or Fed then Refused) returns the first log, created False.
  The unique partial index uq_feeding_logs_reminder backs this up under a race.
- tomorrow sets inverts.reminder_snoozed_until = the owner's local today + 1;
  never a log; safe to repeat.
- owner or a co-keeper logger+; strangers 404; 60/hour per user.
"""
import inspect
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.models.collection_member import CollectionMember
from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.notification_preferences import NotificationPreferences
from app.models.subscription import SubscriptionPlan, UserSubscription
from app.models.user import User
from app.routers import feedings as feedings_router
from app.utils.auth import create_access_token
from app.utils.closed_animals import DIED_DETAIL, TRANSFERRED_DETAIL
from app.utils.rate_limit import limiter

pytestmark = pytest.mark.requires_postgres

FEEDINGS_PY = Path(feedings_router.__file__)


@pytest.fixture(autouse=True)
def _fresh_limiter():
    limiter.reset()
    yield
    limiter.reset()


def _now():
    return datetime.now(timezone.utc)


def mk_user(db, tag="t3a"):
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


def mk_animal(client, user, name="Rosie", **extra):
    body = {"taxon": "tarantula", "feeding_interval_days": 7, **extra}
    if name is not None:
        body["name"] = name
    r = client.post("/api/v1/inverts/", json=body, headers=hdr(user))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def feed(client, user, aid, days_ago, *, accepted=True, food_type="cricket", food_size="medium"):
    r = client.post(
        f"/api/v1/inverts/{aid}/feedings",
        json={"fed_at": (_now() - timedelta(days=days_ago)).isoformat(), "food_type": food_type,
              "food_size": food_size, "accepted": accepted},
        headers=hdr(user),
    )
    assert r.status_code == 201, r.text


def act(client, user, aid, action, reminder_date="2026-11-10"):
    return client.post(
        f"/api/v1/inverts/{aid}/reminder-action",
        json={"action": action, "reminder_date": reminder_date},
        headers=hdr(user),
    )


def reminder_logs(db, aid):
    return db.query(FeedingLog).filter(FeedingLog.invert_id == uuid.UUID(aid),
                                       FeedingLog.reminder_date.isnot(None)).all()


@pytest.fixture()
def owner(db_session):
    return mk_user(db_session)


# ── fed / refused ────────────────────────────────────────────────────────────

def test_fed_creates_accepted_log_with_last_food(client, db_session, owner):
    aid = mk_animal(client, owner)
    feed(client, owner, aid, 20, food_type="dubia", food_size="large")
    feed(client, owner, aid, 10, accepted=False, food_type="cricket", food_size="small")  # refusals don't count

    r = act(client, owner, aid, "fed")
    assert r.status_code == 200, r.text
    assert r.json() == {"action": "fed", "created": True, "animal_name": "Rosie", "message": "Logged: Rosie ate"}

    [log] = reminder_logs(db_session, aid)
    assert log.accepted is True
    assert (log.food_type, log.food_size) == ("dubia", "large")
    assert log.notes == "Logged from reminder"
    assert log.reminder_date == date(2026, 11, 10)
    assert abs((_now() - log.fed_at).total_seconds()) < 120
    # Same path as a normal invert feeding: the tarantula twin FK is set too.
    assert log.tarantula_id == uuid.UUID(aid)
    assert log.logged_by_user_id is None  # the owner


def test_fed_without_earlier_meal_has_no_food(client, db_session, owner):
    aid = mk_animal(client, owner, name=None, common_name="Greenbottle")
    r = act(client, owner, aid, "fed")
    assert r.status_code == 200 and r.json()["message"] == "Logged: Greenbottle ate"
    [log] = reminder_logs(db_session, aid)
    assert (log.food_type, log.food_size) == (None, None)


def test_refused_creates_refusal(client, db_session, owner):
    aid = mk_animal(client, owner)
    feed(client, owner, aid, 20)
    r = act(client, owner, aid, "refused")
    assert r.status_code == 200, r.text
    assert r.json() == {"action": "refused", "created": True, "animal_name": "Rosie",
                        "message": "Logged: Rosie refused"}
    [log] = reminder_logs(db_session, aid)
    assert log.accepted is False and log.notes == "Logged from reminder"


def test_fed_clears_a_feeding_pause_like_the_normal_route(client, db_session, owner):
    aid = mk_animal(client, owner)
    inv = db_session.query(Invert).filter(Invert.id == uuid.UUID(aid)).one()
    inv.feeding_paused_reason = "premolt"
    db_session.commit()
    assert act(client, owner, aid, "refused").status_code == 200
    db_session.refresh(inv)
    assert inv.feeding_paused_reason == "premolt"  # a refusal confirms the pause
    assert act(client, owner, aid, "fed", reminder_date="2026-11-11").status_code == 200
    db_session.refresh(inv)
    assert inv.feeding_paused_reason is None


def test_second_tap_returns_existing(client, db_session, owner):
    aid = mk_animal(client, owner)
    first = act(client, owner, aid, "fed")
    assert first.json()["created"] is True
    for action in ("fed", "refused"):  # Fed then Refused: the first wins
        again = act(client, owner, aid, action)
        assert again.status_code == 200, again.text
        assert again.json() == {"action": action, "created": False, "animal_name": "Rosie",
                                "message": "Already logged: Rosie ate"}
    [log] = reminder_logs(db_session, aid)
    assert log.accepted is True
    # A different reminder day is a new reminder.
    assert act(client, owner, aid, "fed", reminder_date="2026-11-11").json()["created"] is True
    assert len(reminder_logs(db_session, aid)) == 2


def test_unique_index_blocks_race(client, db_session, owner, monkeypatch):
    """The other phone's insert lands between our check and our insert: the
    unique index refuses ours, and the existing row comes back (no 500)."""
    aid = mk_animal(client, owner)
    other = FeedingLog(invert_id=uuid.UUID(aid), fed_at=_now(), accepted=False,
                       notes="Logged from reminder", reminder_date=date(2026, 11, 10))
    db_session.add(other)
    db_session.commit()

    real = feedings_router._reminder_feeding
    calls = []

    def blind_first_check(db, invert_id, reminder_date):
        calls.append(1)
        return None if len(calls) == 1 else real(db, invert_id, reminder_date)

    monkeypatch.setattr(feedings_router, "_reminder_feeding", blind_first_check)
    r = act(client, owner, aid, "fed")
    assert r.status_code == 200, r.text
    assert r.json()["created"] is False
    assert r.json()["message"] == "Already logged: Rosie refused"
    assert len(calls) == 2
    [log] = reminder_logs(db_session, aid)
    assert log.id == other.id and log.accepted is False
    # The session is still usable after the refused insert.
    assert act(client, owner, aid, "fed", reminder_date="2026-11-12").json()["created"] is True


def test_ordinary_feedings_are_not_reminder_logs(client, db_session, owner):
    """Normal logs keep reminder_date NULL, so any number of them can share a day."""
    aid = mk_animal(client, owner)
    feed(client, owner, aid, 0)
    feed(client, owner, aid, 0)
    assert reminder_logs(db_session, aid) == []
    assert act(client, owner, aid, "fed").json()["created"] is True


# ── tomorrow ─────────────────────────────────────────────────────────────────

def _prefs(db, user, tz):
    p = NotificationPreferences(user_id=user.id, tz_offset_minutes=tz)
    db.add(p)
    db.commit()
    return p


def test_tomorrow_sets_snooze(client, db_session, owner):
    aid = mk_animal(client, owner)
    _prefs(db_session, owner, 0)
    local_today = _now().date()
    for _ in range(2):  # safe to repeat
        r = act(client, owner, aid, "tomorrow")
        assert r.status_code == 200, r.text
        assert r.json() == {"action": "tomorrow", "created": False, "animal_name": "Rosie",
                            "message": "We'll remind you tomorrow"}
    inv = db_session.query(Invert).filter(Invert.id == uuid.UUID(aid)).one()
    db_session.refresh(inv)
    assert inv.reminder_snoozed_until == local_today + timedelta(days=1)
    assert db_session.query(FeedingLog).filter(FeedingLog.invert_id == uuid.UUID(aid)).count() == 0
    assert inv.feeding_paused_reason is None  # not a feeding pause


def test_tomorrow_uses_the_owners_local_day(client, db_session, owner):
    aid = mk_animal(client, owner)
    _prefs(db_session, owner, -14 * 60)  # UTC+14: always ahead of (or equal to) UTC
    local_today = (_now() + timedelta(hours=14)).date()
    assert act(client, owner, aid, "tomorrow").status_code == 200
    inv = db_session.query(Invert).filter(Invert.id == uuid.UUID(aid)).one()
    db_session.refresh(inv)
    assert inv.reminder_snoozed_until == local_today + timedelta(days=1)


# ── access / closed / validation ─────────────────────────────────────────────

@pytest.mark.parametrize("field,detail", [("died_at", DIED_DETAIL), ("transferred_out_at", TRANSFERRED_DETAIL)])
@pytest.mark.parametrize("action", ["fed", "refused", "tomorrow"])
def test_closed_animal_409(client, db_session, owner, field, detail, action):
    aid = mk_animal(client, owner)
    inv = db_session.query(Invert).filter(Invert.id == uuid.UUID(aid)).one()
    setattr(inv, field, _now())
    db_session.commit()
    r = act(client, owner, aid, action)
    assert r.status_code == 409, r.text
    assert r.json()["detail"] == detail
    assert db_session.query(FeedingLog).filter(FeedingLog.invert_id == uuid.UUID(aid)).count() == 0
    db_session.refresh(inv)
    assert inv.reminder_snoozed_until is None


def test_stranger_404(client, db_session, owner):
    aid = mk_animal(client, owner)
    stranger = mk_user(db_session, "stranger")
    for action in ("fed", "tomorrow"):
        assert act(client, stranger, aid, action).status_code == 404
    assert act(client, owner, str(uuid.uuid4()), "fed").status_code == 404
    assert reminder_logs(db_session, aid) == []


def _make_premium(db, user):
    plan = SubscriptionPlan(name=f"plan-{uuid.uuid4().hex[:10]}", display_name="Premium", app="tarantuverse")
    db.add(plan)
    db.commit()
    db.add(UserSubscription(user_id=user.id, plan_id=plan.id, status="active"))
    db.commit()


def _member(db, owner, member, role):
    db.add(CollectionMember(
        owner_user_id=owner.id, member_user_id=member.id, app="tarantuverse", role=role,
        invited_email=member.email, status="active", accepted_at=_now(),
    ))
    db.commit()


def test_co_keeper_logger_allowed(client, db_session, owner):
    _make_premium(db_session, owner)
    aid = mk_animal(client, owner)
    logger_user = mk_user(db_session, "logger")
    viewer_user = mk_user(db_session, "viewer")
    _member(db_session, owner, logger_user, "logger")
    _member(db_session, owner, viewer_user, "viewer")

    assert act(client, viewer_user, aid, "fed").status_code == 403
    r = act(client, logger_user, aid, "fed")
    assert r.status_code == 200, r.text
    [log] = reminder_logs(db_session, aid)
    assert log.logged_by_user_id == logger_user.id


def test_bad_action_and_date_are_422(client, db_session, owner):
    aid = mk_animal(client, owner)
    assert act(client, owner, aid, "ate").status_code == 422
    assert act(client, owner, aid, "fed", reminder_date="yesterday").status_code == 422


def test_rate_limited_route():
    src = FEEDINGS_PY.read_text(encoding="utf-8")
    route = src.index('"/inverts/{invert_id}/reminder-action"')
    window = src[route: route + 400]
    assert '@limiter.limit("60/hour", key_func=user_or_ip)' in window
    assert '@policy("logger")' in window
    fn = feedings_router.invert_reminder_action
    assert getattr(fn, "__access_policy__", None) == "logger"


def test_normal_route_and_action_share_one_helper():
    """No duplicated create logic: both call _create_invert_feeding."""
    normal = inspect.getsource(inspect.unwrap(feedings_router.create_invert_feeding_log))
    action = inspect.getsource(inspect.unwrap(feedings_router.invert_reminder_action))
    assert "_create_invert_feeding(" in normal
    assert "_create_invert_feeding(" in action
    assert "FeedingLog(" not in action
