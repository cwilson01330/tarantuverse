"""HV day one, Task 3: the daily digest push and the reminder email, per app.

Spec 2026-11-17-hv-day-one-and-smart-reminders-design.md §5 calls 4 and 6, §6 "Email":

  * a keeper with TV and HV animals due gets each app's reminder on that app:
    TV's plan (summary or per-animal, exactly as before) to the TV address, and
    one HV summary ("Feeding day" / "N animals are due for feeding.") to the HV
    address;
  * one email per app with something due, each branded and linked to its app
    (HV: Herpetoverse green, https://herpetoverse.com/app/feeding-day,
    /app/settings/notifications, /unsubscribe/<token>), each with its own
    once-a-UTC-day guard; both count toward DIGEST_EMAIL_DAILY_CAP;
  * the List-Unsubscribe GET for an HV email (`app=herpetoverse`) sends the
    browser to the HV unsubscribe page; the TV email is unchanged.

Real Postgres through the TestClient. Pushes and EmailService are mocked.
"""
from __future__ import annotations

import asyncio
import re
import uuid
from datetime import date, datetime, time, timedelta, timezone
from unittest.mock import AsyncMock

import pytest

from app.config import settings
from app.models.animal import Animal
from app.models.invert import Invert
from app.models.notification_preferences import NotificationPreferences
from app.models.user import User
from app.services import (
    animal_feeding_status,
    digest_email,
    digest_service,
    feeding_status,
    notification_service,
)
from app.services.digest_email import DigestEmail, send_digest_emails
from app.services.digest_service import run_feeding_digests
from app.services.email import EmailService
from app.services.push_tokens import set_push_token
from app.utils.auth import create_access_token
from app.utils.digest_unsubscribe_token import make_unsubscribe_token
from app.utils.frontend_origin import HERPETOVERSE, TARANTUVERSE, resolve_frontend_origin
from app.utils.rate_limit import limiter

pytestmark = pytest.mark.requires_postgres

UNSUB = "/api/v1/notification-preferences/email-unsubscribe"
TV_TOKEN = "ExponentPushToken[t3-tv]"
HV_TOKEN = "ExponentPushToken[t3-hv]"
HV_ORIGIN = "https://herpetoverse.com"


# ── fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _fresh_limiter():
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture(autouse=True)
def _no_real_sleep(monkeypatch):
    async def instant(_seconds):
        return None

    monkeypatch.setattr(digest_email.asyncio, "sleep", instant)


@pytest.fixture(autouse=True)
def _https_frontend(monkeypatch):
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://www.tarantuverse.com")


@pytest.fixture(autouse=True)
def _after_both_cutoffs(monkeypatch):
    monkeypatch.setattr(feeding_status, "FIRST_FEEDING_DUE_FROM", date(2020, 1, 1))
    monkeypatch.setattr(animal_feeding_status, "HV_FIRST_FEEDING_DUE_FROM", date(2020, 1, 1))


@pytest.fixture()
def send(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr(EmailService, "send_email", mock)
    return mock


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


def mk_user(db):
    tag = uuid.uuid4().hex[:8]
    u = User(id=uuid.uuid4(), email=f"hvmail-{tag}@test.local", username=f"hvmail_{tag}",
             is_active=True, is_verified=True)
    db.add(u)
    db.commit()
    return u


def hdr(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.id)})}"}


def mk_prefs(db, user, *, email_on=True, smart=False, tokens=True):
    p = NotificationPreferences(
        user_id=user.id, daily_digest_enabled=True, digest_hour=9, email_digest_enabled=email_on,
        push_notifications_enabled=True, quiet_hours_enabled=False, tz_offset_minutes=0,
        smart_reminders_enabled=smart,
    )
    db.add(p)
    db.commit()
    if tokens:
        set_push_token(db, user.id, "tarantuverse", TV_TOKEN)
        set_push_token(db, user.id, "herpetoverse", HV_TOKEN)
        db.commit()
    return p


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


def hv_due(client, user, name, days=20, **extra):
    body = {"taxon": "snake", "name": name, "feeding_interval_days": 7, **extra}
    r = client.post("/api/v1/animals/", json=body, headers=hdr(user))
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    r = client.post(f"/api/v1/animals/{aid}/feedings",
                    json={"fed_at": (_now() - timedelta(days=days, hours=1)).isoformat(),
                          "food_type": "mouse", "accepted": True},
                    headers=hdr(user))
    assert r.status_code == 201, r.text
    return aid


def run(db, user):
    return run_feeding_digests(db, only_user_id=str(user.id), ignore_schedule=True)


def by_app(emails):
    return {e.app: e for e in emails}


# ── pushes per app ───────────────────────────────────────────────────────────

def test_tv_and_hv_due_get_one_summary_each_on_their_own_app(client, db_session, pushes, calls):
    u = mk_user(db_session)
    tv_due(client, u, "Rosie")
    tv_due(client, u, "Hairy")
    hv_due(client, u, "Monty")
    mk_prefs(db_session, u, email_on=False)

    out = run(db_session, u)
    assert out["checked"] == 1 and out["sent"] == 1

    # TV: exactly the call TV made before (no `app` kwarg = tarantuverse).
    assert calls[0] == {
        "user_id": u.id, "type": "feeding_digest", "title": "Feeding day",
        "body": "2 animals are due for feeding.", "deeplink": "/feeding-day",
        "data": {"overdue": 2}, "push": True, "push_category": None,
    }
    # HV: its own summary, its own count, addressed to the HV app.
    assert calls[1] == {
        "user_id": u.id, "type": "feeding_digest", "title": "Feeding day",
        "body": "1 animal is due for feeding.", "deeplink": "/feeding-day",
        "data": {"overdue": 1}, "push": True, "push_category": None,
        "app": "herpetoverse",
    }
    assert len(calls) == 2
    assert [(p["expo_push_token"], p["body"]) for p in pushes] == [
        (TV_TOKEN, "2 animals are due for feeding."),
        (HV_TOKEN, "1 animal is due for feeding."),
    ]
    assert "category_id" not in pushes[1]


def test_hv_only_keeper_gets_the_hv_summary_only(client, db_session, pushes, calls):
    u = mk_user(db_session)
    hv_due(client, u, "Monty")
    hv_due(client, u, "Noodle")
    # Switch off: the HV summary (with it on, 1-3 due get one push each —
    # tests/test_hv_reminders.py).
    mk_prefs(db_session, u, email_on=False, smart=False)

    out = run(db_session, u)
    assert out["sent"] == 1
    assert [c.get("app") for c in calls] == ["herpetoverse"]
    assert calls[0]["body"] == "2 animals are due for feeding."
    assert calls[0]["data"] == {"overdue": 2}
    assert [p["expo_push_token"] for p in pushes] == [HV_TOKEN]


def test_tv_only_keeper_gets_no_hv_push(client, db_session, pushes, calls):
    u = mk_user(db_session)
    tv_due(client, u, "Rosie")
    mk_prefs(db_session, u, email_on=False)
    run(db_session, u)
    assert [c.get("app") for c in calls] == [None]
    assert [p["expo_push_token"] for p in pushes] == [TV_TOKEN]


def test_smart_tv_plan_ignores_hv_due(client, db_session, pushes, calls):
    """Spec §7: each app is planned on its own — HV due no longer forces TV's
    per-animal reminders into a summary."""
    u = mk_user(db_session)
    rosie = tv_due(client, u, "Rosie", days=12)
    hv_due(client, u, "Monty")
    mk_prefs(db_session, u, email_on=False, smart=True)

    run(db_session, u)
    # HV Step 2: HV is planned the same way, on its own app.
    assert [(c["type"], c.get("app")) for c in calls] == [("feeding_due", None), ("feeding_due", "herpetoverse")]
    assert calls[0]["deeplink"] == f"/invert/{rosie}"
    assert calls[0]["push_category_id"] == "feeding_due"
    assert [p["expo_push_token"] for p in pushes] == [TV_TOKEN, HV_TOKEN]


# ── which emails a run collects ──────────────────────────────────────────────

def test_tv_and_hv_due_collect_two_emails_naming_each_apps_animals(client, db_session):
    u = mk_user(db_session)
    tv_due(client, u, "Rosie")
    hv_due(client, u, "Monty")
    hv_due(client, u, None, common_name="Ball python")
    mk_prefs(db_session, u)

    emails = by_app(run(db_session, u)["emails"])
    assert set(emails) == {"tarantuverse", "herpetoverse"}
    tv, hv = emails["tarantuverse"], emails["herpetoverse"]
    assert (tv.due_count, tv.names, tv.to) == (1, ["Rosie"], u.email)
    assert hv.due_count == 2 and sorted(hv.names) == ["Ball python", "Monty"] and hv.to == u.email


def test_hv_only_keeper_gets_the_hv_email_only(client, db_session):
    u = mk_user(db_session)
    hv_due(client, u, "Monty")
    mk_prefs(db_session, u)
    emails = run(db_session, u)["emails"]
    assert [(e.app, e.due_count, e.names) for e in emails] == [("herpetoverse", 1, ["Monty"])]


def test_tv_email_defaults_to_tarantuverse(client, db_session):
    u = mk_user(db_session)
    tv_due(client, u, "Rosie")
    mk_prefs(db_session, u)
    [e] = run(db_session, u)["emails"]
    assert e.app == "tarantuverse"
    assert DigestEmail(user_id=u.id, to="x@y.z", due_count=1).app == "tarantuverse"


def test_once_a_day_guard_is_per_app(client, db_session):
    u = mk_user(db_session)
    tv_due(client, u, "Rosie")
    hv_due(client, u, "Monty")
    prefs = mk_prefs(db_session, u)
    today = _now().date()

    prefs.email_digest_last_sent_on = today
    db_session.commit()
    assert [e.app for e in run(db_session, u)["emails"]] == ["herpetoverse"]

    prefs.email_digest_last_sent_on = None
    prefs.email_digest_last_sent_on_hv = today
    db_session.commit()
    assert [e.app for e in run(db_session, u)["emails"]] == ["tarantuverse"]

    prefs.email_digest_last_sent_on = today
    db_session.commit()
    assert run(db_session, u)["emails"] == []


# ── sending ──────────────────────────────────────────────────────────────────

def _email(user, app="tarantuverse", n=2, names=("Rosie", "Hairy")):
    return DigestEmail(user_id=user.id, to=user.email, due_count=n, names=list(names), app=app)


def test_hv_email_is_herpetoverse_branded_and_linked(db_session, send):
    u = mk_user(db_session)
    prefs = mk_prefs(db_session, u, tokens=False)
    assert asyncio.run(send_digest_emails(db_session, [_email(u, "herpetoverse", 2, ("Monty", "Noodle"))])) == 1

    to, subject, body = send.await_args.args[:3]
    headers = send.await_args.kwargs["headers"]
    token = make_unsubscribe_token(u.id)
    assert to == u.email
    assert subject == "2 animals are due to eat today"
    assert "Monty" in body and "Noodle" in body
    hrefs = re.findall(r'href="([^"]+)"', body)
    assert hrefs == [
        f"{HV_ORIGIN}/app/feeding-day",
        f"{HV_ORIGIN}/unsubscribe/{token}",
        f"{HV_ORIGIN}/app/settings/notifications",
    ]
    assert HERPETOVERSE.button_hex in body and TARANTUVERSE.button_hex not in body
    assert "tarantuverse" not in body.lower()
    assert "Herpetoverse" in body
    assert "from Herpetoverse" in body
    assert headers["List-Unsubscribe"] == (
        f"<{settings.API_PUBLIC_URL.rstrip('/')}/api/v1/notification-preferences/email-unsubscribe"
        f"?token={token}&app=herpetoverse>"
    )
    assert headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"

    db_session.refresh(prefs)
    assert prefs.email_digest_last_sent_on_hv == _now().date()
    assert prefs.email_digest_last_sent_on is None


def test_tv_email_output_is_unchanged(db_session, send):
    """Snapshot of the TV email's subject, links, colour and headers."""
    u = mk_user(db_session)
    prefs = mk_prefs(db_session, u, tokens=False)
    assert asyncio.run(send_digest_emails(db_session, [_email(u)])) == 1

    to, subject, body = send.await_args.args[:3]
    headers = send.await_args.kwargs["headers"]
    token = make_unsubscribe_token(u.id)
    origin = resolve_frontend_origin(None)
    assert subject == "2 animals are due to eat today"
    assert re.findall(r'href="([^"]+)"', body) == [
        f"{origin}/dashboard/feeding-day",
        f"{origin}/unsubscribe/{token}",
        f"{origin}/dashboard/settings/notifications",
    ]
    assert TARANTUVERSE.button_hex in body
    assert headers == {
        "List-Unsubscribe": (
            f"<{settings.API_PUBLIC_URL.rstrip('/')}/api/v1/notification-preferences/email-unsubscribe?token={token}>"
        ),
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }
    db_session.refresh(prefs)
    assert prefs.email_digest_last_sent_on == _now().date()
    assert prefs.email_digest_last_sent_on_hv is None


def test_one_keeper_gets_both_emails_in_one_run(db_session, send):
    u = mk_user(db_session)
    prefs = mk_prefs(db_session, u, tokens=False)
    n = asyncio.run(send_digest_emails(db_session, [_email(u), _email(u, "herpetoverse", 1, ("Monty",))]))
    assert n == 2 and send.await_count == 2
    db_session.refresh(prefs)
    assert prefs.email_digest_last_sent_on == _now().date()
    assert prefs.email_digest_last_sent_on_hv == _now().date()


def test_send_rechecks_the_guard_per_app(db_session, send):
    u = mk_user(db_session)
    prefs = mk_prefs(db_session, u, tokens=False)
    prefs.email_digest_last_sent_on_hv = _now().date()
    db_session.commit()
    n = asyncio.run(send_digest_emails(db_session, [_email(u, "herpetoverse"), _email(u)]))
    assert n == 1
    assert send.await_args.args[2].count("/dashboard/feeding-day") == 1


def test_cap_counts_both_apps(db_session, monkeypatch, send):
    monkeypatch.setattr(settings, "DIGEST_EMAIL_DAILY_CAP", 2)
    today = _now().date()
    tv_sent, hv_sent = mk_user(db_session), mk_user(db_session)
    p1 = mk_prefs(db_session, tv_sent, tokens=False)
    p1.email_digest_last_sent_on = today
    p2 = mk_prefs(db_session, hv_sent, tokens=False)
    p2.email_digest_last_sent_on_hv = today
    db_session.commit()

    x = mk_user(db_session)
    mk_prefs(db_session, x, tokens=False)
    assert asyncio.run(send_digest_emails(db_session, [_email(x, "herpetoverse"), _email(x)])) == 0
    assert send.await_count == 0


def test_cap_counts_a_keepers_two_emails_as_two(db_session, monkeypatch, send):
    monkeypatch.setattr(settings, "DIGEST_EMAIL_DAILY_CAP", 3)
    u = mk_user(db_session)
    p = mk_prefs(db_session, u, tokens=False)
    p.email_digest_last_sent_on = _now().date()
    p.email_digest_last_sent_on_hv = _now().date()
    db_session.commit()
    other = mk_user(db_session)
    mk_prefs(db_session, other, tokens=False)
    # 2 already today -> one more fits.
    assert asyncio.run(send_digest_emails(db_session, [_email(other), _email(other, "herpetoverse")])) == 1


def test_no_digest_email_goes_when_the_tv_origin_is_not_https(db_session, monkeypatch, send):
    """Safety stop kept from before: a non-https FRONTEND_URL drops ALL digest emails, TV and HV."""
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://localhost:3000")
    u = mk_user(db_session)
    prefs = mk_prefs(db_session, u, tokens=False)
    n = asyncio.run(send_digest_emails(db_session, [_email(u), _email(u, "herpetoverse")]))
    assert n == 0
    send.assert_not_awaited()
    db_session.refresh(prefs)
    assert prefs.email_digest_last_sent_on is None
    assert prefs.email_digest_last_sent_on_hv is None


# ── unsubscribe ──────────────────────────────────────────────────────────────

def test_get_unsubscribe_with_app_redirects_to_herpetoverse(client, db_session):
    u = mk_user(db_session)
    p = mk_prefs(db_session, u, tokens=False)
    token = make_unsubscribe_token(u.id)

    r = client.get(UNSUB, params={"token": token, "app": "herpetoverse"}, follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["location"] == f"{HV_ORIGIN}/unsubscribe/{token}"

    for params in ({"token": token}, {"token": token, "app": "tarantuverse"}, {"token": token, "app": "other"}):
        r = client.get(UNSUB, params=params, follow_redirects=False)
        assert r.status_code == 303
        assert r.headers["location"] == f"{resolve_frontend_origin(None)}/unsubscribe/{token}"

    # A forged token is still a 404 with the app parameter.
    assert client.get(UNSUB, params={"token": "garbage", "app": "herpetoverse"}).status_code == 404

    # One-click POST from the HV header works and turns the (one) switch off.
    db_session.refresh(p)
    assert p.email_digest_enabled is True
    r = client.post(UNSUB, params={"token": token, "app": "herpetoverse"})
    assert r.status_code == 200 and r.json() == {"ok": True}
    db_session.refresh(p)
    assert p.email_digest_enabled is False


# ── migration ────────────────────────────────────────────────────────────────

def test_migration_chains_after_push_tokens():
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "hve_20261118_hv_email_guard.py"
    spec = importlib.util.spec_from_file_location("hve_migration", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.revision == "hve_20261118_hv_email_guard"
    assert mod.down_revision == "pta_20261118_push_tokens_per_app"
