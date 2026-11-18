"""HV day one + smart reminders, Task 7: the HV reminder buttons, snooze and
per-animal pushes (spec 2026-11-17-hv-day-one-and-smart-reminders-design.md §5
calls 8 and 10, §7).

- POST /api/v1/animals/{animal_id}/reminder-action {action, reminder_date}:
  fed / refused write ONE feeding through the same helper as
  POST /animals/{id}/feedings (closed 409, pause ended by a meal, last_fed_at
  forward-only, co-keeper attribution), notes "Logged from reminder",
  `reminder_date` set. Fed copies food type + size from the latest ACCEPTED
  meal, never prey weight; Refused logs no prey. First outcome wins, backed by
  the unique partial index uq_feeding_logs_reminder_animal.
- tomorrow sets animals.reminder_snoozed_until = owner-local today + 1; the
  digest leaves that animal out of the per-animal pushes.
- The digest plans HV like TV: switch on + 1-3 HV due -> one HV push each
  (category feeding_due, data animal_id, deeplink /reptile/<id>, app
  herpetoverse); otherwise one HV summary. TV's plan is unchanged and separate.
- notifications.app: HV rows stay out of the TV bell (default list / unread
  count / read-all / clear-all); `?app=herpetoverse` is HV's view.
- Migration backfill: switches ON only for accounts with HV animals and no
  inverts. Reports take --app herpetoverse.
- Step 1 minors: set_push_token drops another app's row holding the same
  token; create_notification logs a failed push (no token in the log).
"""
import importlib.util
import inspect
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.models.animal import Animal
from app.models.collection_member import CollectionMember
from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.notification import Notification
from app.models.notification_preferences import NotificationPreferences
from app.models.push_token import PushToken
from app.models.subscription import SubscriptionPlan, UserSubscription
from app.models.user import User
from app.routers import feedings as feedings_router
from app.services import animal_feeding_status, digest_service, feeding_status, notification_service
from app.services.digest_service import run_feeding_digests
from app.services.notification_service import _validate_deeplink, create_notification
from app.services.push_tokens import set_push_token
from app.utils.auth import create_access_token
from app.utils.rate_limit import limiter

pytestmark = pytest.mark.requires_postgres

FEEDINGS_PY = Path(feedings_router.__file__)
MIGRATION = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "hvr_20261118_hv_reminders.py"
TV_TOKEN = "ExponentPushToken[t7-tv]"
HV_TOKEN = "ExponentPushToken[t7-hv]"
DAY = "2026-11-18"


# ── fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _fresh_limiter():
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture(autouse=True)
def _after_both_cutoffs(monkeypatch):
    monkeypatch.setattr(feeding_status, "FIRST_FEEDING_DUE_FROM", date(2020, 1, 1))
    monkeypatch.setattr(animal_feeding_status, "HV_FIRST_FEEDING_DUE_FROM", date(2020, 1, 1))


@pytest.fixture()
def pushes(monkeypatch):
    sent = []
    monkeypatch.setattr(notification_service.PushNotificationService, "send_notification",
                        staticmethod(lambda **kw: sent.append(kw)))
    return sent


@pytest.fixture()
def calls(monkeypatch):
    """Every create_notification call the digest makes (kwargs), still executed."""
    seen = []
    real = digest_service.create_notification

    def spy(db, **kw):
        seen.append(kw)
        return real(db, **kw)

    monkeypatch.setattr(digest_service, "create_notification", spy)
    return seen


# ── helpers ──────────────────────────────────────────────────────────────────

def _now():
    return datetime.now(timezone.utc)


def mk_user(db, tag="t7"):
    u = User(id=uuid.uuid4(), email=f"{tag}-{uuid.uuid4().hex[:8]}@test.local",
             username=f"{tag}_{uuid.uuid4().hex[:8]}", is_active=True, is_verified=True)
    db.add(u)
    db.commit()
    return u


def hdr(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.id)})}"}


def mk_snake(client, user, name="Monty", **extra):
    body = {"taxon": "snake", "feeding_interval_days": 7, **extra}
    if name is not None:
        body["name"] = name
    r = client.post("/api/v1/animals/", json=body, headers=hdr(user))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def feed(client, user, aid, days_ago, *, accepted=True, food_type="mouse", food_size="medium",
         prey_weight_g=None):
    body = {"fed_at": (_now() - timedelta(days=days_ago, hours=1)).isoformat(), "food_type": food_type,
            "food_size": food_size, "accepted": accepted}
    if prey_weight_g is not None:
        body["prey_weight_g"] = prey_weight_g
    r = client.post(f"/api/v1/animals/{aid}/feedings", json=body, headers=hdr(user))
    assert r.status_code == 201, r.text


def hv_due(client, user, name, days=20):
    aid = mk_snake(client, user, name)
    feed(client, user, aid, days)
    return aid


def tv_due(client, user, name, days=20):
    r = client.post("/api/v1/inverts/", json={"taxon": "tarantula", "name": name, "feeding_interval_days": 7},
                    headers=hdr(user))
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    r = client.post(f"/api/v1/inverts/{aid}/feedings",
                    json={"fed_at": (_now() - timedelta(days=days, hours=1)).isoformat(), "food_type": "cricket"},
                    headers=hdr(user))
    assert r.status_code == 201, r.text
    return aid


def act(client, user, aid, action, reminder_date=DAY):
    return client.post(f"/api/v1/animals/{aid}/reminder-action",
                       json={"action": action, "reminder_date": reminder_date}, headers=hdr(user))


def reminder_logs(db, aid):
    return db.query(FeedingLog).filter(FeedingLog.animal_id == uuid.UUID(aid),
                                       FeedingLog.reminder_date.isnot(None)).all()


def animal_row(db, aid):
    a = db.query(Animal).filter(Animal.id == uuid.UUID(aid)).one()
    db.refresh(a)
    return a


def mk_prefs(db, user, *, smart=True, tz=0, tokens=True, apps=("tarantuverse", "herpetoverse"), legacy=None):
    p = NotificationPreferences(
        user_id=user.id, daily_digest_enabled=True, digest_hour=9, email_digest_enabled=False,
        push_notifications_enabled=True, quiet_hours_enabled=False, tz_offset_minutes=tz,
        smart_reminders_enabled=smart,
    )
    db.add(p)
    db.commit()
    if tokens:
        if "tarantuverse" in apps:
            set_push_token(db, user.id, "tarantuverse", TV_TOKEN)
        if "herpetoverse" in apps:
            set_push_token(db, user.id, "herpetoverse", HV_TOKEN)
        db.commit()
    if legacy:
        p.expo_push_token = legacy
        db.commit()
    return p


def run(db, user):
    return run_feeding_digests(db, only_user_id=str(user.id), ignore_schedule=True)


def rows(db, user):
    return (db.query(Notification).filter(Notification.user_id == user.id)
            .order_by(Notification.created_at, Notification.title).all())


@pytest.fixture()
def owner(db_session):
    return mk_user(db_session)


# ── fed / refused ────────────────────────────────────────────────────────────

def test_hv_reminder_action_idempotent(client, db_session, owner):
    """Review focus 5: two taps, a second phone, or Refused after Fed -> one log."""
    aid = mk_snake(client, owner)
    first = act(client, owner, aid, "fed")
    assert first.status_code == 200, first.text
    assert first.json() == {"action": "fed", "created": True, "animal_name": "Monty",
                            "message": "Logged: Monty ate"}
    for action in ("fed", "refused"):
        again = act(client, owner, aid, action)
        assert again.status_code == 200, again.text
        assert again.json() == {"action": action, "created": False, "animal_name": "Monty",
                                "message": "Already logged: Monty ate"}
    [log] = reminder_logs(db_session, aid)
    assert log.accepted is True
    # A different reminder day is a new reminder.
    assert act(client, owner, aid, "refused", reminder_date="2026-11-19").json()["created"] is True
    assert len(reminder_logs(db_session, aid)) == 2


def test_fed_copies_prey_type_and_size_not_weight(client, db_session, owner):
    aid = mk_snake(client, owner)
    feed(client, owner, aid, 20, food_type="mouse", food_size="adult", prey_weight_g=28)
    feed(client, owner, aid, 10, accepted=False, food_type="rat", food_size="pinky")  # refusals don't count

    r = act(client, owner, aid, "fed")
    assert r.status_code == 200, r.text
    [log] = reminder_logs(db_session, aid)
    assert log.accepted is True
    assert (log.food_type, log.food_size) == ("mouse", "adult")
    assert log.prey_weight_g is None
    assert log.notes == "Logged from reminder"
    assert log.reminder_date == date(2026, 11, 18)
    assert log.logged_by_user_id is None  # the owner
    assert log.animal_id == uuid.UUID(aid) and log.invert_id is None
    assert abs((_now() - log.fed_at).total_seconds()) < 120
    # Same as a normal logged feeding: last_fed_at moves forward.
    a = animal_row(db_session, aid)
    assert a.last_fed_at is not None and abs((a.last_fed_at - log.fed_at).total_seconds()) < 1


def test_fed_without_earlier_meal_has_no_prey(client, db_session, owner):
    aid = mk_snake(client, owner, name=None, common_name="Ball python")
    r = act(client, owner, aid, "fed")
    assert r.status_code == 200 and r.json()["message"] == "Logged: Ball python ate"
    [log] = reminder_logs(db_session, aid)
    assert (log.food_type, log.food_size, log.prey_weight_g) == (None, None, None)


def test_refused_logs_no_prey(client, db_session, owner):
    aid = mk_snake(client, owner)
    feed(client, owner, aid, 20, food_type="mouse", food_size="adult", prey_weight_g=28)
    r = act(client, owner, aid, "refused")
    assert r.status_code == 200, r.text
    assert r.json() == {"action": "refused", "created": True, "animal_name": "Monty",
                        "message": "Logged: Monty refused"}
    [log] = reminder_logs(db_session, aid)
    assert log.accepted is False and log.notes == "Logged from reminder"
    assert (log.food_type, log.food_size, log.prey_weight_g) == (None, None, None)


def test_meal_ends_a_pause_refusal_keeps_it(client, db_session, owner):
    aid = mk_snake(client, owner)
    a = animal_row(db_session, aid)
    a.feeding_paused_reason = "hunger_strike"
    db_session.commit()
    assert act(client, owner, aid, "refused").status_code == 200
    assert animal_row(db_session, aid).feeding_paused_reason == "hunger_strike"
    assert act(client, owner, aid, "fed", reminder_date="2026-11-19").status_code == 200
    assert animal_row(db_session, aid).feeding_paused_reason is None


def test_unique_index_blocks_race(client, db_session, owner, monkeypatch):
    """The other phone's insert lands between our check and our insert: the
    unique index refuses ours, the existing row comes back (no 500)."""
    aid = mk_snake(client, owner)
    other = FeedingLog(animal_id=uuid.UUID(aid), fed_at=_now(), accepted=False,
                       notes="Logged from reminder", reminder_date=date(2026, 11, 18))
    db_session.add(other)
    db_session.commit()

    real = feedings_router._animal_reminder_feeding
    seen = []

    def blind_first_check(db, animal_id, reminder_date):
        seen.append(1)
        return None if len(seen) == 1 else real(db, animal_id, reminder_date)

    monkeypatch.setattr(feedings_router, "_animal_reminder_feeding", blind_first_check)
    r = act(client, owner, aid, "fed")
    assert r.status_code == 200, r.text
    assert r.json()["created"] is False and r.json()["message"] == "Already logged: Monty refused"
    assert len(seen) == 2
    [log] = reminder_logs(db_session, aid)
    assert log.id == other.id
    assert act(client, owner, aid, "fed", reminder_date="2026-11-20").json()["created"] is True


def test_ordinary_feedings_are_not_reminder_logs(client, db_session, owner):
    aid = mk_snake(client, owner)
    feed(client, owner, aid, 0)
    feed(client, owner, aid, 0)
    assert reminder_logs(db_session, aid) == []
    assert act(client, owner, aid, "fed").json()["created"] is True


def test_invert_and_animal_reminder_indexes_are_separate(client, db_session, owner):
    """A TV reminder log and an HV reminder log on the same day never collide."""
    tv = tv_due(client, owner, "Rosie")
    hv = mk_snake(client, owner)
    assert client.post(f"/api/v1/inverts/{tv}/reminder-action", json={"action": "fed", "reminder_date": DAY},
                       headers=hdr(owner)).json()["created"] is True
    assert act(client, owner, hv, "fed").json()["created"] is True


# ── tomorrow ─────────────────────────────────────────────────────────────────

def test_tomorrow_snoozes_and_the_digest_skips_that_animal(client, db_session, owner, pushes):
    monty = hv_due(client, owner, "Monty")
    noodle = hv_due(client, owner, "Noodle")
    mk_prefs(db_session, owner, smart=True, tz=0)

    for _ in range(2):  # safe to repeat
        r = act(client, owner, monty, "tomorrow")
        assert r.status_code == 200, r.text
        assert r.json() == {"action": "tomorrow", "created": False, "animal_name": "Monty",
                            "message": "We'll remind you tomorrow"}
    a = animal_row(db_session, monty)
    assert a.reminder_snoozed_until == _now().date() + timedelta(days=1)
    assert a.feeding_paused_reason is None  # not a feeding pause
    assert db_session.query(FeedingLog).filter(FeedingLog.animal_id == uuid.UUID(monty),
                                               FeedingLog.reminder_date.isnot(None)).count() == 0

    run(db_session, owner)
    assert [p["data"]["animal_id"] for p in pushes] == [noodle]

    # Still due on Feeding Day.
    r = client.get("/api/v1/animals/feeding-status", headers=hdr(owner))
    assert {i["id"]: i["is_overdue"] for i in r.json()}[monty] is True

    # On the stored day the reminder comes back.
    a.reminder_snoozed_until = _now().date()
    db_session.commit()
    pushes.clear()
    run(db_session, owner)
    assert sorted(p["title"] for p in pushes) == ["Monty", "Noodle"]


def test_tomorrow_uses_the_owners_local_day(client, db_session, owner):
    aid = mk_snake(client, owner)
    mk_prefs(db_session, owner, tz=-14 * 60, tokens=False)  # UTC+14
    assert act(client, owner, aid, "tomorrow").status_code == 200
    local_today = (_now() + timedelta(hours=14)).date()
    assert animal_row(db_session, aid).reminder_snoozed_until == local_today + timedelta(days=1)


def test_everything_snoozed_sends_no_hv_push(client, db_session, owner, pushes):
    monty = hv_due(client, owner, "Monty")
    mk_prefs(db_session, owner, smart=True)
    assert act(client, owner, monty, "tomorrow").status_code == 200
    out = run(db_session, owner)
    assert out["sent"] == 0 and pushes == [] and rows(db_session, owner) == []


# ── access / closed / validation ─────────────────────────────────────────────

def _make_premium(db, user):
    plan = SubscriptionPlan(name=f"plan-{uuid.uuid4().hex[:10]}", display_name="Premium", app="herpetoverse")
    db.add(plan)
    db.commit()
    db.add(UserSubscription(user_id=user.id, plan_id=plan.id, status="active"))
    db.commit()


def _member(db, owner, member, role):
    db.add(CollectionMember(
        owner_user_id=owner.id, member_user_id=member.id, app="herpetoverse", role=role,
        invited_email=member.email, status="active", accepted_at=_now(),
    ))
    db.commit()


def test_roles_logger_ok_viewer_403_stranger_404(client, db_session, owner):
    _make_premium(db_session, owner)
    aid = mk_snake(client, owner)
    logger_user = mk_user(db_session, "logger")
    viewer_user = mk_user(db_session, "viewer")
    stranger = mk_user(db_session, "stranger")
    _member(db_session, owner, logger_user, "logger")
    _member(db_session, owner, viewer_user, "viewer")

    assert act(client, viewer_user, aid, "fed").status_code == 403
    assert act(client, viewer_user, aid, "tomorrow").status_code == 403
    for action in ("fed", "tomorrow"):
        assert act(client, stranger, aid, action).status_code == 404
    assert act(client, owner, str(uuid.uuid4()), "fed").status_code == 404
    assert reminder_logs(db_session, aid) == []

    r = act(client, logger_user, aid, "fed")
    assert r.status_code == 200, r.text
    [log] = reminder_logs(db_session, aid)
    assert log.logged_by_user_id == logger_user.id


@pytest.mark.parametrize("field,value", [
    ("died_at", date(2026, 11, 1)),
    ("transferred_out_at", datetime(2026, 11, 1, tzinfo=timezone.utc)),
], ids=["died", "transferred"])
@pytest.mark.parametrize("action", ["fed", "refused", "tomorrow"])
def test_closed_animal_409(client, db_session, owner, field, value, action):
    aid = mk_snake(client, owner)
    a = animal_row(db_session, aid)
    setattr(a, field, value)
    db_session.commit()
    r = act(client, owner, aid, action)
    assert r.status_code == 409, r.text
    assert db_session.query(FeedingLog).filter(FeedingLog.animal_id == uuid.UUID(aid)).count() == 0
    assert animal_row(db_session, aid).reminder_snoozed_until is None


def test_bad_action_and_date_are_422(client, db_session, owner):
    aid = mk_snake(client, owner)
    assert act(client, owner, aid, "ate").status_code == 422
    assert act(client, owner, aid, "fed", reminder_date="yesterday").status_code == 422


def test_rate_limited_logger_route():
    src = FEEDINGS_PY.read_text(encoding="utf-8")
    route = src.index('"/animals/{animal_id}/reminder-action"')
    window = src[route: route + 400]
    assert '@limiter.limit("60/hour", key_func=user_or_ip)' in window
    assert '@policy("logger")' in window
    assert getattr(feedings_router.animal_reminder_action, "__access_policy__", None) == "logger"


def test_normal_route_and_action_share_one_helper():
    normal = inspect.getsource(inspect.unwrap(feedings_router.create_animal_feeding_log))
    action = inspect.getsource(inspect.unwrap(feedings_router.animal_reminder_action))
    assert "_create_animal_feeding(" in normal
    assert "_create_animal_feeding(" in action
    assert "FeedingLog(" not in action
    assert "prey_weight_g" not in action


# ── digest: HV per-animal pushes ─────────────────────────────────────────────

def test_hv_one_to_three_due_get_one_push_each_on_the_hv_app(client, db_session, owner, pushes, calls):
    monty = hv_due(client, owner, "Monty", days=12)
    noodle = hv_due(client, owner, "Noodle", days=9)
    mk_prefs(db_session, owner, smart=True)

    out = run(db_session, owner)
    assert out["sent"] == 1
    today = _now().date().isoformat()
    assert sorted((c["type"], c["title"], c["body"], c["app"]) for c in calls) == [
        ("feeding_due", "Monty", "Due for a meal · last ate 12 days ago", "herpetoverse"),
        ("feeding_due", "Noodle", "Due for a meal · last ate 9 days ago", "herpetoverse"),
    ]
    by_title = {p["title"]: p for p in pushes}
    for aid, title in ((monty, "Monty"), (noodle, "Noodle")):
        p = by_title[title]
        assert p["expo_push_token"] == HV_TOKEN
        assert p["category_id"] == "feeding_due"
        assert p["data"]["animal_id"] == aid and "invert_id" not in p["data"]
        assert p["data"]["reminder_date"] == today
        assert p["data"]["deeplink"] == f"/reptile/{aid}"
    stored = rows(db_session, owner)
    assert {r.deeplink for r in stored} == {f"/reptile/{monty}", f"/reptile/{noodle}"}
    assert {r.app for r in stored} == {"herpetoverse"}
    assert {r.data["animal_id"] for r in stored} == {monty, noodle}


def test_hv_more_than_three_due_get_the_hv_summary(client, db_session, owner, pushes, calls):
    for n in range(4):
        hv_due(client, owner, f"S{n}")
    mk_prefs(db_session, owner, smart=True)
    run(db_session, owner)
    assert [(c["type"], c["title"], c["body"], c["deeplink"], c["data"], c["app"]) for c in calls] == [
        ("feeding_digest", "Feeding day", "4 animals are due for feeding.", "/feeding-day", {"overdue": 4},
         "herpetoverse"),
    ]
    assert calls[0]["push_category_id"] == "feeding_summary"
    assert [p["expo_push_token"] for p in pushes] == [HV_TOKEN]


def test_hv_switch_off_is_the_step_one_summary(client, db_session, owner, pushes, calls):
    hv_due(client, owner, "Monty")
    mk_prefs(db_session, owner, smart=False)
    run(db_session, owner)
    assert calls == [{
        "user_id": owner.id, "type": "feeding_digest", "title": "Feeding day",
        "body": "1 animal is due for feeding.", "deeplink": "/feeding-day",
        "data": {"overdue": 1}, "push": True, "push_category": None, "app": "herpetoverse",
    }]
    assert "category_id" not in pushes[0]


def test_hv_per_animal_pushes_need_an_hv_address(client, db_session, owner, pushes, calls):
    """Without its own HV address the push would go to the TV app, whose bridge
    only knows invert_id; so the keeper gets the plain HV summary instead."""
    # (a) HV address present -> per-animal pushes.
    hv_due(client, owner, "Monty", days=12)
    mk_prefs(db_session, owner, smart=True, apps=("herpetoverse",))
    run(db_session, owner)
    assert [(c["title"], c["push_category_id"]) for c in calls] == [("Monty", "feeding_due")]


@pytest.mark.parametrize("setup", ["tv_row", "legacy_column"])
def test_hv_without_an_hv_address_gets_the_switch_off_summary(client, db_session, owner, pushes, calls, setup):
    hv_due(client, owner, "Monty", days=12)
    if setup == "tv_row":
        mk_prefs(db_session, owner, smart=True, apps=("tarantuverse",))
    else:
        mk_prefs(db_session, owner, smart=True, tokens=False, legacy="ExponentPushToken[legacy]")
    run(db_session, owner)
    assert calls == [{
        "user_id": owner.id, "type": "feeding_digest", "title": "Feeding day",
        "body": "1 animal is due for feeding.", "deeplink": "/feeding-day",
        "data": {"overdue": 1}, "push": True, "push_category": None, "app": "herpetoverse",
    }]
    assert "category_id" not in pushes[0]


def test_hv_without_an_hv_address_four_due_is_still_the_plain_summary(client, db_session, owner, pushes, calls):
    for n in range(4):
        hv_due(client, owner, f"S{n}")
    mk_prefs(db_session, owner, smart=True, apps=("tarantuverse",))
    run(db_session, owner)
    assert len(calls) == 1 and "push_category_id" not in calls[0] and calls[0]["data"] == {"overdue": 4}


def test_both_addresses_tv_plan_unchanged_and_hv_per_animal(client, db_session, owner, pushes, calls):
    rosie = tv_due(client, owner, "Rosie", days=12)
    monty = hv_due(client, owner, "Monty", days=12)
    mk_prefs(db_session, owner, smart=True)
    run(db_session, owner)
    assert [(c["title"], c["data"].get("invert_id"), c["data"].get("animal_id"), c.get("app")) for c in calls] == [
        ("Rosie", rosie, None, None), ("Monty", None, monty, "herpetoverse")]


def test_tv_and_hv_keeper_gets_both_plans_separately(client, db_session, owner, pushes, calls):
    rosie = tv_due(client, owner, "Rosie", days=12)
    monty = hv_due(client, owner, "Monty", days=12)
    mk_prefs(db_session, owner, smart=True)
    run(db_session, owner)
    today = _now().date().isoformat()
    # TV: exactly the call the TV-only digest makes (no `app` kwarg).
    assert calls[0] == {
        "user_id": owner.id, "type": "feeding_due", "title": "Rosie",
        "body": "Due for a meal · last ate 12 days ago", "deeplink": f"/invert/{rosie}",
        "data": {"type": "feeding_due", "invert_id": rosie, "reminder_date": today},
        "push": True, "push_category": None, "push_category_id": "feeding_due",
    }
    assert calls[1] == {
        "user_id": owner.id, "type": "feeding_due", "title": "Monty",
        "body": "Due for a meal · last ate 12 days ago", "deeplink": f"/reptile/{monty}",
        "data": {"type": "feeding_due", "animal_id": monty, "reminder_date": today},
        "push": True, "push_category": None, "push_category_id": "feeding_due", "app": "herpetoverse",
    }
    assert len(calls) == 2
    assert [p["expo_push_token"] for p in pushes] == [TV_TOKEN, HV_TOKEN]


def test_tv_snooze_does_not_hide_an_hv_animal_and_vice_versa(client, db_session, owner, pushes):
    rosie = tv_due(client, owner, "Rosie")
    monty = hv_due(client, owner, "Monty")
    mk_prefs(db_session, owner, smart=True)
    assert act(client, owner, monty, "tomorrow").status_code == 200
    run(db_session, owner)
    assert [p["title"] for p in pushes] == ["Rosie"]
    assert pushes[0]["data"]["invert_id"] == rosie


def test_reptile_deeplink_is_allowed_for_feeding_due_only():
    aid = str(uuid.uuid4())
    assert _validate_deeplink(f"/reptile/{aid}", "feeding_due") == f"/reptile/{aid}"
    assert _validate_deeplink(f"/reptile/{aid}", "feeding_digest") is None
    assert _validate_deeplink("/reptile/x/../y", "feeding_due") is None


# ── notifications inbox per app ──────────────────────────────────────────────

def test_hv_rows_stay_out_of_the_tv_bell(client, db_session, owner):
    create_notification(db_session, user_id=owner.id, type="feeding_digest", title="TV", push=False)
    create_notification(db_session, user_id=owner.id, type="feeding_digest", title="TVx", push=False,
                        app="tarantuverse")
    create_notification(db_session, user_id=owner.id, type="feeding_digest", title="HV", push=False,
                        app="herpetoverse")
    stored = {n.title: n.app for n in rows(db_session, owner)}
    assert stored == {"TV": None, "TVx": "tarantuverse", "HV": "herpetoverse"}

    def titles(qs=""):
        r = client.get(f"/api/v1/notifications/{qs}", headers=hdr(owner))
        assert r.status_code == 200, r.text
        return sorted(n["title"] for n in r.json())

    def unread(qs=""):
        r = client.get(f"/api/v1/notifications/unread-count{qs}", headers=hdr(owner))
        assert r.status_code == 200, r.text
        return r.json()["unread_count"]

    # No param = everything (old HV store builds that can't get the OTA).
    assert titles() == ["HV", "TV", "TVx"] and unread() == 3
    # TV's view (new TV clients send app=tarantuverse): no HV rows.
    assert titles("?app=tarantuverse") == ["TV", "TVx"] and unread("?app=tarantuverse") == 2
    # HV's view: untagged + HV.
    assert titles("?app=herpetoverse") == ["HV", "TV"] and unread("?app=herpetoverse") == 2
    assert client.get("/api/v1/notifications/?app=nope", headers=hdr(owner)).status_code == 422

    # read-all / clear-all from TV leave the HV row alone.
    assert client.post("/api/v1/notifications/read-all?app=tarantuverse", headers=hdr(owner)).status_code == 200
    assert unread("?app=tarantuverse") == 0 and unread("?app=herpetoverse") == 1
    assert client.delete("/api/v1/notifications/?app=tarantuverse", headers=hdr(owner)).status_code == 204
    assert titles() == ["HV"]
    assert client.post("/api/v1/notifications/read-all?app=herpetoverse", headers=hdr(owner)).status_code == 200
    assert unread("?app=herpetoverse") == 0
    assert client.delete("/api/v1/notifications/?app=herpetoverse", headers=hdr(owner)).status_code == 204
    assert rows(db_session, owner) == []


# ── migration backfill ───────────────────────────────────────────────────────

def load_migration():
    spec = importlib.util.spec_from_file_location("hvr_migration", MIGRATION)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_switch_backfill_only_for_hv_only_accounts(db_session):
    def account(hv, tv):
        u = mk_user(db_session, "bf")
        db_session.add(NotificationPreferences(user_id=u.id, smart_reminders_enabled=False,
                                               refusal_restarts_wait=False, post_molt_pause_enabled=False))
        if hv:
            db_session.add(Animal(user_id=u.id, taxon="snake", name="S"))
        if tv:
            db_session.add(Invert(user_id=u.id, taxon="tarantula", name="T"))
        db_session.commit()
        return u

    hv_only, both, tv_only, neither = account(True, False), account(True, True), account(False, True), account(False, False)
    load_migration().backfill_hv_switches(db_session.connection())
    db_session.expire_all()

    def switches(u):
        p = db_session.query(NotificationPreferences).filter(NotificationPreferences.user_id == u.id).one()
        return (p.smart_reminders_enabled, p.refusal_restarts_wait, p.post_molt_pause_enabled)

    assert switches(hv_only) == (True, True, False)
    for u in (both, tv_only, neither):
        assert switches(u) == (False, False, False)


def test_migration_revision_chain():
    mod = load_migration()
    assert mod.revision == "hvr_20261118_hv_reminders"
    assert mod.down_revision == "hve_20261118_hv_email_guard"


# ── reports ──────────────────────────────────────────────────────────────────

def test_reminder_report_app_filter(db_session):
    import report_reminder_logging as rpt

    now = datetime(2026, 11, 20, 12, tzinfo=timezone.utc)
    hv_on, hv_off, tv = mk_user(db_session, "rhv"), mk_user(db_session, "rhvoff"), mk_user(db_session, "rtv")
    for u, smart in ((hv_on, True), (hv_off, False), (tv, True)):
        db_session.add(NotificationPreferences(user_id=u.id, smart_reminders_enabled=smart,
                                               refusal_restarts_wait=smart, post_molt_pause_enabled=False))
    a_on = Animal(id=uuid.uuid4(), user_id=hv_on.id, taxon="snake", name="A")
    a_off = Animal(id=uuid.uuid4(), user_id=hv_off.id, taxon="snake", name="B")
    inv = Invert(id=uuid.uuid4(), user_id=tv.id, taxon="tarantula", name="T")
    db_session.add_all([a_on, a_off, inv])
    db_session.flush()
    for parent, days, rem in (({"animal_id": a_on.id}, 1, True), ({"animal_id": a_on.id}, 2, True),
                              ({"animal_id": a_off.id}, 45, False), ({"invert_id": inv.id}, 1, True)):
        db_session.add(FeedingLog(**parent, fed_at=now - timedelta(days=days), accepted=True,
                                  created_at=now - timedelta(days=days),
                                  reminder_date=(now - timedelta(days=days)).date() if rem else None))
    db_session.commit()

    hv = dict(rpt.build_rows(db_session, now=now, app="herpetoverse"))
    assert hv["reminder_logged_feedings_total"] == "2"
    assert hv["reminder_logged_feedings_smart_on"] == "2"
    assert hv["keepers_total"] == "2"            # accounts with HV animals
    assert hv["keepers_smart_reminders_on"] == "1"
    assert hv["keepers_refusal_restarts_wait_on"] == "1"
    assert "keepers_post_molt_pause_on" not in hv  # HV has no post-molt pause
    assert hv["logged_30d_smart_on"] == "1 of 1 (100.0%)"
    assert hv["logged_30d_smart_off"] == "0 of 1 (0.0%)"
    # Default = TV, unchanged: the HV reminder logs are not counted there.
    assert rpt.build_rows(db_session, now=now) == rpt.build_rows(db_session, now=now, app="tarantuverse")
    assert dict(rpt.build_rows(db_session, now=now))["reminder_logged_feedings_smart_on"] == "1"


def test_reports_main_take_app(db_session, capsys):
    import report_activation
    import report_reminder_logging

    assert report_reminder_logging.main(["--csv", "--app", "herpetoverse"]) == 0
    assert report_activation.main(["--csv", "--app", "herpetoverse"]) == 0
    with pytest.raises(SystemExit):
        report_activation.main(["--app", "nope"])


def test_activation_report_app_filter(client, db_session):
    import report_activation as ra

    now = datetime.now(timezone.utc)
    wk = ra._week_start(now).isoformat()

    def week(app):
        return next(r for r in ra.build_rows(db_session, now, app=app) if r["signup_week"] == wk)

    before_hv, before_tv = week("herpetoverse"), week("tarantuverse")
    hv_user = mk_user(db_session, "acthv")
    aid = mk_snake(client, hv_user)
    feed(client, hv_user, aid, 0)
    set_push_token(db_session, hv_user.id, "herpetoverse", HV_TOKEN)
    db_session.commit()

    hv_row, tv_row = week("herpetoverse"), week("tarantuverse")
    assert int(hv_row["signups"]) == int(before_hv["signups"]) + 1
    n = int(hv_row["signups"])
    # The HV keeper counts for HV animals, HV feedings and an HV push address.
    for col, before in (("animal_1d_pct", before_hv), ("fed_7d_pct", before_hv), ("reminders_pct", before_hv)):
        had = round(float(before[col] or 0) * (n - 1) / 100)
        assert round(float(hv_row[col]) * n / 100) == had + 1, col
    # ... and for nothing on TV (no inverts, no TV push address).
    m = int(tv_row["signups"])
    for col in ("animal_1d_pct", "fed_7d_pct", "reminders_pct"):
        had = round(float(before_tv[col] or 0) * (m - 1) / 100)
        assert round(float(tv_row[col] or 0) * m / 100) == had, col
    assert ra.build_rows(db_session, now) == ra.build_rows(db_session, now, app="tarantuverse")


def test_activation_reminders_read_push_tokens(db_session):
    """A legacy-column-only account is not a reminder; a push_tokens row for the app is."""
    import report_activation as ra

    now = datetime.now(timezone.utc)
    wk = ra._week_start(now).isoformat()

    def week(app="tarantuverse"):
        r = next(r for r in ra.build_rows(db_session, now, app=app) if r["signup_week"] == wk)
        n = int(r["signups"])
        return n, round(float(r["reminders_pct"] or 0) * n / 100)

    n0, r0 = week()
    u = mk_user(db_session, "actlegacy")
    db_session.add(NotificationPreferences(user_id=u.id, expo_push_token="ExponentPushToken[legacy-only]"))
    db_session.commit()
    n1, r1 = week()
    assert (n1, r1) == (n0 + 1, r0)  # signed up, but the legacy column is not a reminder

    set_push_token(db_session, u.id, "tarantuverse", TV_TOKEN)
    db_session.commit()
    n2, r2 = week()
    assert (n2, r2) == (n1, r0 + 1)
    # A TV address does not count for the HV report.
    nh, rh = week("herpetoverse")
    set_push_token(db_session, u.id, "herpetoverse", HV_TOKEN)
    db_session.commit()
    assert week("herpetoverse")[1] == rh + 1


# ── Step 1 minors ────────────────────────────────────────────────────────────

def test_set_push_token_drops_the_other_apps_row_with_the_same_token(db_session, owner):
    phone = "ExponentPushToken[same-phone]"
    # An old HV build registered without `app` -> its token sits under tarantuverse.
    set_push_token(db_session, owner.id, None, phone)
    db_session.commit()
    # After its OTA the HV app registers the same token as herpetoverse.
    set_push_token(db_session, owner.id, "herpetoverse", phone)
    db_session.commit()
    got = {r.app: r.token for r in db_session.query(PushToken).filter(PushToken.user_id == owner.id)}
    assert got == {"herpetoverse": phone}

    # A different token for the other app is left alone.
    set_push_token(db_session, owner.id, "tarantuverse", TV_TOKEN)
    db_session.commit()
    got = {r.app: r.token for r in db_session.query(PushToken).filter(PushToken.user_id == owner.id)}
    assert got == {"herpetoverse": phone, "tarantuverse": TV_TOKEN}

    # Another account holding the same token is not touched.
    other = mk_user(db_session, "other")
    set_push_token(db_session, other.id, "tarantuverse", phone)
    db_session.commit()
    assert db_session.query(PushToken).filter(PushToken.user_id == owner.id,
                                              PushToken.app == "herpetoverse").one().token == phone


def test_failed_push_is_logged_without_the_token(db_session, owner, monkeypatch, caplog):
    mk_prefs(db_session, owner, tokens=True)

    def boom(**kw):
        raise RuntimeError("expo down")

    monkeypatch.setattr(notification_service.PushNotificationService, "send_notification",
                        staticmethod(boom))
    with caplog.at_level(logging.WARNING, logger=notification_service.logger.name):
        n = create_notification(db_session, user_id=owner.id, type="feeding_digest", title="Feeding day",
                                app="herpetoverse")
    assert n.id is not None  # the row is still written
    text = "\n".join(r.getMessage() for r in caplog.records)
    assert "push" in text.lower()
    assert HV_TOKEN not in text and TV_TOKEN not in text and owner.email not in text


def test_no_app_param_read_all_and_clear_all_touch_everything(client, db_session, owner):
    create_notification(db_session, user_id=owner.id, type="feeding_digest", title="TV", push=False)
    create_notification(db_session, user_id=owner.id, type="feeding_digest", title="HV", push=False,
                        app="herpetoverse")
    assert client.post("/api/v1/notifications/read-all", headers=hdr(owner)).status_code == 200
    r = client.get("/api/v1/notifications/unread-count", headers=hdr(owner))
    assert r.json()["unread_count"] == 0
    assert client.delete("/api/v1/notifications/", headers=hdr(owner)).status_code == 204
    assert rows(db_session, owner) == []
