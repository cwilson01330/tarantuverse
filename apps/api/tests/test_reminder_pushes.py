"""Effortless logging, Task 3: per-animal feeding reminders from the daily digest.

`services/reminder_pushes.plan_reminder_pushes` decides what the digest sends:

- the owner's `smart_reminders_enabled` on, 1–3 TV animals due, 0 HV due ->
  one push per animal (title = the animal, body "Due for a meal · …", deeplink
  /invert/<id>, data {type: feeding_due, invert_id, reminder_date}, Expo
  categoryId "feeding_due");
- otherwise today's summary; categoryId "feeding_summary" only with the switch on;
- switch off -> byte-identical to the digest before this change.

"Tomorrow" (inverts.reminder_snoozed_until) drops an animal from the per-animal
pushes only. Pure planning tests need no database; digest runs use Postgres.
"""
import uuid
from datetime import date, datetime, time, timedelta, timezone

import httpx
import pytest

from app.models.invert import Invert
from app.models.notification import Notification
from app.models.notification_preferences import NotificationPreferences
from app.models.user import User
from app.schemas.invert import InvertFeedingStatusItem
from app.services import digest_service, feeding_status, notification_service
from app.services.digest_service import run_feeding_digests
from app.services.notification_service import _validate_deeplink
from app.services.reminder_pushes import ReminderPush, ago_phrase, plan_reminder_pushes
from app.utils import push_notifications
from app.utils.auth import create_access_token
from app.utils.push_notifications import PushNotificationService

TODAY = date(2026, 11, 10)
NOW = datetime(2026, 11, 10, 15, 0, tzinfo=timezone.utc)
TOKEN = "ExponentPushToken[t3-test]"


def _item(name="Rosie", *, ate_days=None, offered_days=None, **extra):
    last = NOW - timedelta(days=ate_days) if ate_days is not None else None
    offered = NOW - timedelta(days=offered_days) if offered_days is not None else None
    return InvertFeedingStatusItem(
        id=uuid.uuid4(),
        name=name,
        taxon="tarantula",
        last_feeding_date=last,
        days_since_last_feeding=ate_days,
        last_offered_date=offered,
        is_overdue=True,
        **extra,
    )


def _plan(due, hv=0, smart=True, **kw):
    return plan_reminder_pushes(due, hv, smart, TODAY, "SUMMARY", now=NOW, **kw)


# ── pure planning ────────────────────────────────────────────────────────────

def test_ago_phrase():
    assert ago_phrase(0) == "today"
    assert ago_phrase(1) == "1 day ago"
    assert ago_phrase(5) == "5 days ago"


def test_one_to_three_due_get_one_each():
    ate = _item("Rosie", ate_days=12)
    offered = _item("Hairy", ate_days=20, offered_days=9)          # refusal after the last meal
    never = _item(None, common_name="Greenbottle")                  # no meal, no offer
    pushes = _plan([ate, offered, never])

    assert [p.title for p in pushes] == ["Rosie", "Hairy", "Greenbottle"]
    assert [p.body for p in pushes] == [
        "Due for a meal · last ate 12 days ago",
        "Due for a meal · last offered 9 days ago",
        "Due for a meal · no meal logged yet",
    ]
    for p, i in zip(pushes, (ate, offered, never)):
        assert isinstance(p, ReminderPush)
        assert p.deeplink == f"/invert/{i.id}"
        assert p.data == {"type": "feeding_due", "invert_id": str(i.id), "reminder_date": "2026-11-10"}
        assert p.category_id == "feeding_due"
        assert p.type == "feeding_due"

    one = _plan([_item("Solo", ate_days=1)])
    assert len(one) == 1 and one[0].body == "Due for a meal · last ate 1 day ago"


def test_last_offered_only_when_later_than_last_meal():
    # last_offered == the last meal (the newest log was the meal) -> "last ate".
    same = _item("Same", ate_days=15, offered_days=15)
    assert _plan([same])[0].body == "Due for a meal · last ate 15 days ago"
    # A refusal on a never-fed animal -> "last offered".
    refused_only = _item("Fresh", offered_days=0)
    assert _plan([refused_only])[0].body == "Due for a meal · last offered today"


def test_title_falls_back_to_scientific_name():
    i = _item(None, scientific_name="Brachypelma hamorii", ate_days=8)
    assert _plan([i])[0].title == "Brachypelma hamorii"


def test_four_due_get_summary_with_button():
    due = [_item(f"A{n}", ate_days=20) for n in range(4)]
    pushes = _plan(due)
    assert len(pushes) == 1
    p = pushes[0]
    assert (p.title, p.body, p.deeplink, p.data) == ("Feeding day", "SUMMARY", "/feeding-day", {"overdue": 4})
    assert p.category_id == "feeding_summary"
    assert p.type == "feeding_digest"


def test_hv_due_forces_summary():
    pushes = _plan([_item("Rosie", ate_days=20)], hv=1)
    assert len(pushes) == 1
    assert pushes[0].deeplink == "/feeding-day"
    assert pushes[0].data == {"overdue": 2}
    assert pushes[0].category_id == "feeding_summary"


def test_switch_off_is_todays_push():
    pushes = _plan([_item("Rosie", ate_days=20)], smart=False)
    assert len(pushes) == 1
    p = pushes[0]
    assert (p.title, p.body, p.deeplink, p.data, p.category_id, p.type) == (
        "Feeding day", "SUMMARY", "/feeding-day", {"overdue": 1}, None, "feeding_digest"
    )
    # Snoozes are ignored with the switch off.
    snoozed = _item("Snoozed", ate_days=20)
    assert _plan([snoozed], smart=False, snoozed_ids={snoozed.id})[0].data == {"overdue": 1}


def test_nothing_due_plans_nothing():
    assert _plan([], hv=0) == []
    assert _plan([], hv=0, smart=False) == []


def test_snoozed_animals_drop_from_per_animal_pushes_only():
    a, b = _item("A", ate_days=20), _item("B", ate_days=20)
    pushes = _plan([a, b], snoozed_ids={a.id})
    assert [p.title for p in pushes] == ["B"]
    # Five due, two snoozed -> three awake -> one each.
    five = [_item(f"N{n}", ate_days=20) for n in range(5)]
    assert len(_plan(five, snoozed_ids={five[0].id, five[1].id})) == 3
    # Everything snoozed and no HV due -> no push at all.
    assert _plan([a, b], snoozed_ids={a.id, b.id}) == []
    # HV due -> the summary, counting the snoozed animals too.
    assert _plan([a, b], hv=1, snoozed_ids={a.id, b.id})[0].data == {"overdue": 3}


# ── deeplink vocabulary (controller ruling 1) ───────────────────────────────

def test_invert_deeplink_allowed_for_feeding_due_only():
    link = f"/invert/{uuid.uuid4()}"
    assert _validate_deeplink(link, "feeding_due") == link
    assert _validate_deeplink(link, "feeding_digest") is None
    assert _validate_deeplink(link, "test") is None
    assert _validate_deeplink("/invert/not-an-id/../x", "feeding_due") is None
    assert _validate_deeplink("/feeding-day", "feeding_digest") == "/feeding-day"
    for patterns in notification_service.TYPE_DEEPLINK_PATTERNS.values():
        for p in patterns:
            assert p.startswith("^") and p.endswith("$"), p


# ── push plumbing ────────────────────────────────────────────────────────────

class _Resp:
    def raise_for_status(self):
        pass

    def json(self):
        return {"data": [{"status": "ok"}]}


@pytest.fixture()
def expo_posts(monkeypatch):
    posts = []

    class FakeClient:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, url, json=None, headers=None):
            posts.append(json)
            return _Resp()

    monkeypatch.setattr(push_notifications.httpx, "Client", FakeClient)
    return posts


def test_category_id_goes_into_the_expo_message(expo_posts):
    PushNotificationService.send_notification(TOKEN, "T", "B", data={"x": 1}, category_id="feeding_due")
    assert expo_posts[-1]["categoryId"] == "feeding_due"
    PushNotificationService.send_notification(TOKEN, "T", "B", data={"x": 1})
    assert "categoryId" not in expo_posts[-1]


# ── digest runs (Postgres) ───────────────────────────────────────────────────

def _now():
    return datetime.now(timezone.utc)


def mk_user(db):
    tag = uuid.uuid4().hex[:8]
    u = User(id=uuid.uuid4(), email=f"t3-{tag}@test.local", username=f"t3_{tag}", is_active=True, is_verified=True)
    db.add(u)
    db.commit()
    return u


def hdr(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.id)})}"}


def mk_prefs(db, user, *, smart):
    p = NotificationPreferences(
        user_id=user.id, daily_digest_enabled=True, digest_hour=9, email_digest_enabled=False,
        push_notifications_enabled=True, expo_push_token=TOKEN, quiet_hours_enabled=False,
        tz_offset_minutes=0, smart_reminders_enabled=smart,
    )
    db.add(p)
    db.commit()
    return p


def due_animal(client, user, name, days=20):
    r = client.post("/api/v1/inverts/", json={"taxon": "tarantula", "name": name, "feeding_interval_days": 7},
                    headers=hdr(user))
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    r = client.post(f"/api/v1/inverts/{aid}/feedings",
                    json={"fed_at": (_now() - timedelta(days=days, minutes=1)).isoformat(), "food_type": "cricket"},
                    headers=hdr(user))
    assert r.status_code == 201, r.text
    return aid


@pytest.fixture()
def pushes(monkeypatch):
    sent = []
    monkeypatch.setattr(notification_service.PushNotificationService, "send_notification",
                        staticmethod(lambda **kw: sent.append(kw)))
    return sent


def run(db, user):
    return run_feeding_digests(db, only_user_id=str(user.id), ignore_schedule=True)


def _rows(db, user):
    return db.query(Notification).filter(Notification.user_id == user.id).order_by(Notification.title).all()


@pytest.mark.requires_postgres
def test_switch_off_digest_is_byte_identical(client, db_session, monkeypatch, pushes):
    """Pin today's digest call exactly: same create_notification kwargs, same push."""
    u = mk_user(db_session)
    due_animal(client, u, "Rosie")
    due_animal(client, u, "Hairy")
    mk_prefs(db_session, u, smart=False)

    calls = []
    real = digest_service.create_notification

    def spy(db, **kw):
        calls.append(kw)
        return real(db, **kw)

    monkeypatch.setattr(digest_service, "create_notification", spy)
    out = run(db_session, u)

    assert out["sent"] == 1 and out["checked"] == 1
    assert calls == [{
        "user_id": u.id, "type": "feeding_digest", "title": "Feeding day",
        "body": "2 animals are due for feeding.", "deeplink": "/feeding-day",
        "data": {"overdue": 2}, "push": True, "push_category": None,
    }]
    assert len(pushes) == 1
    push = pushes[0]
    assert "category_id" not in push
    assert push["title"] == "Feeding day" and push["body"] == "2 animals are due for feeding."
    assert push["data"]["deeplink"] == "/feeding-day" and push["data"]["overdue"] == 2
    assert push["data"]["type"] == "feeding_digest"


@pytest.mark.requires_postgres
def test_switch_on_one_push_per_animal(client, db_session, pushes):
    u = mk_user(db_session)
    rosie = due_animal(client, u, "Rosie", days=12)
    hairy = due_animal(client, u, "Hairy", days=9)
    mk_prefs(db_session, u, smart=True)

    out = run(db_session, u)
    assert out["sent"] == 1

    rows = _rows(db_session, u)
    assert [(r.type, r.title, r.body) for r in rows] == [
        ("feeding_due", "Hairy", "Due for a meal · last ate 9 days ago"),
        ("feeding_due", "Rosie", "Due for a meal · last ate 12 days ago"),
    ]
    today = _now().date().isoformat()
    by_title = {p["title"]: p for p in pushes}
    for row, aid in ((rows[0], hairy), (rows[1], rosie)):
        assert row.deeplink == f"/invert/{aid}"
        assert row.data == {"type": "feeding_due", "invert_id": aid, "reminder_date": today}
        push = by_title[row.title]
        assert push["category_id"] == "feeding_due"
        # The stored row and the push carry the same link.
        assert push["data"]["deeplink"] == row.deeplink
        assert push["data"]["invert_id"] == aid and push["data"]["reminder_date"] == today
        assert push["data"]["notification_id"] == str(row.id)


@pytest.mark.requires_postgres
def test_switch_on_four_due_summary_with_button(client, db_session, pushes):
    u = mk_user(db_session)
    for n in range(4):
        due_animal(client, u, f"A{n}")
    mk_prefs(db_session, u, smart=True)
    run(db_session, u)
    rows = _rows(db_session, u)
    assert [(r.type, r.body, r.deeplink) for r in rows] == [
        ("feeding_digest", "4 animals are due for feeding.", "/feeding-day")]
    assert pushes[0]["category_id"] == "feeding_summary"


@pytest.mark.requires_postgres
def test_hv_due_forces_summary_in_digest(client, db_session, monkeypatch, pushes):
    u = mk_user(db_session)
    due_animal(client, u, "Rosie")
    mk_prefs(db_session, u, smart=True)
    monkeypatch.setattr(digest_service, "_animal_overdue_count", lambda db, uid, tz: 1)
    run(db_session, u)
    rows = _rows(db_session, u)
    assert [(r.type, r.body) for r in rows] == [("feeding_digest", "2 animals are due for feeding.")]
    assert pushes[0]["category_id"] == "feeding_summary"


@pytest.mark.requires_postgres
def test_snoozed_animal_skipped_from_pushes(client, db_session, pushes, monkeypatch):
    u = mk_user(db_session)
    rosie = due_animal(client, u, "Rosie")
    hairy = due_animal(client, u, "Hairy")
    mk_prefs(db_session, u, smart=True)
    inv = db_session.query(Invert).filter(Invert.id == uuid.UUID(rosie)).one()
    inv.reminder_snoozed_until = _now().date() + timedelta(days=1)
    db_session.commit()

    run(db_session, u)
    assert [r.title for r in _rows(db_session, u)] == ["Hairy"]
    assert [p["data"]["invert_id"] for p in pushes] == [hairy]

    # Still due everywhere else (Feeding Day / badges).
    r = client.get("/api/v1/inverts/feeding-status", headers=hdr(u))
    status = {i["id"]: i for i in r.json()}
    assert status[rosie]["is_overdue"] is True

    # "Tomorrow" stored today + 1: on that day the reminder comes back.
    for resumed_on in (_now().date(), _now().date() - timedelta(days=1)):
        inv.reminder_snoozed_until = resumed_on
        db_session.commit()
        pushes.clear()
        run(db_session, u)
        assert sorted(p["title"] for p in pushes) == ["Hairy", "Rosie"]


@pytest.mark.requires_postgres
def test_everything_snoozed_sends_nothing(client, db_session, pushes):
    u = mk_user(db_session)
    rosie = due_animal(client, u, "Rosie")
    mk_prefs(db_session, u, smart=True)
    inv = db_session.query(Invert).filter(Invert.id == uuid.UUID(rosie)).one()
    inv.reminder_snoozed_until = _now().date() + timedelta(days=1)
    db_session.commit()
    out = run(db_session, u)
    assert out["sent"] == 0
    assert _rows(db_session, u) == [] and pushes == []


@pytest.mark.requires_postgres
def test_category_id_reaches_expo_payload(client, db_session, expo_posts):
    """End to end through create_notification -> send_notification -> the Expo body."""
    u = mk_user(db_session)
    aid = due_animal(client, u, "Rosie")
    mk_prefs(db_session, u, smart=True)
    run(db_session, u)
    assert len(expo_posts) == 1
    msg = expo_posts[0]
    assert msg["categoryId"] == "feeding_due"
    assert msg["data"]["deeplink"] == f"/invert/{aid}"
    assert msg["title"] == "Rosie"


@pytest.mark.requires_postgres
def test_quiet_hours_still_hold_per_animal_pushes(client, db_session, monkeypatch, pushes):
    u = mk_user(db_session)
    due_animal(client, u, "Rosie")
    mk_prefs(db_session, u, smart=True)
    monkeypatch.setattr(notification_service, "in_quiet_hours", lambda prefs, now=None: True)
    run(db_session, u)
    assert pushes == []
    assert [r.type for r in _rows(db_session, u)] == ["feeding_due"]  # the bell row is kept
