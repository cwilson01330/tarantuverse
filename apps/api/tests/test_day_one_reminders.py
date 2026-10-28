"""Day one, Task 2: reminders for every account, the opt-in daily email digest,
and one-click unsubscribe.

  * Every account-creating path (password register, /oauth-login create) and every
    prefs route goes through `ensure_notification_preferences`; a migration
    backfills the accounts that never had a row.
  * The hourly digest run collects `DigestEmail`s for opted-in, reachable, active
    keepers with something due; `send_digest_emails` applies the daily cap, the
    one-per-UTC-day rule, and the unsubscribe headers/links.
  * The unsubscribe token has its own HMAC key; the public routes never 500.
  * `EmailService` never logs an address or a body.

Real Postgres through the TestClient. `EmailService.send_email` is always mocked
(or Resend's HTTP client is faked); nothing here can reach Resend.
"""
from __future__ import annotations

import asyncio
import importlib.util
import logging
import re
import uuid
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import text

from app.config import settings
from app.models.invert import Invert
from app.models.notification import Notification
from app.models.notification_preferences import NotificationPreferences
from app.models.user import User
from app.routers import auth as auth_router
from app.services import digest_email, feeding_status
from app.services.digest_email import DigestEmail, send_digest_emails
from app.services.digest_service import run_feeding_digests
from app.services.email import EmailService
from app.services.notification_prefs import ensure_notification_preferences
from app.utils.auth import create_access_token, get_password_hash
from app.utils.care_sheet_token import sign_care_sheet_token
from app.utils.digest_unsubscribe_token import make_unsubscribe_token, read_unsubscribe_token
from app.utils.frontend_origin import resolve_frontend_origin
from app.utils.rate_limit import limiter
from app.utils.share_token import sign_render_token

pytestmark = pytest.mark.requires_postgres

PREFS = "/api/v1/notification-preferences/"
UNSUB = "/api/v1/notification-preferences/email-unsubscribe"
MIGRATION = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "don_20261027_day_one.py"


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
    # The digest sender refuses a non-https origin (the .env default is localhost).
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://www.tarantuverse.com")


@pytest.fixture()
def after_cutoff(monkeypatch):
    monkeypatch.setattr(feeding_status, "FIRST_FEEDING_DUE_FROM", date(2020, 1, 1))


@pytest.fixture()
def send(monkeypatch):
    """Replaces EmailService.send_email; nothing reaches Resend."""
    mock = AsyncMock()
    monkeypatch.setattr(EmailService, "send_email", mock)
    return mock


# ── helpers ──────────────────────────────────────────────────────────────────

def _now():
    return datetime.now(timezone.utc)


def mk_user(db, email=None, *, active=True):
    tag = uuid.uuid4().hex[:8]
    u = User(
        id=uuid.uuid4(),
        email=email or f"dayone-{tag}@test.local",
        username=f"dayone_{tag}",
        hashed_password=get_password_hash("TestPass1!"),
        is_active=active,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    return u


def hdr(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.id)})}"}


def mk_animal(client, db, user, name, days_ago=9, **extra):
    body = {"taxon": "tarantula", "feeding_interval_days": 7, **extra}
    if name is not None:
        body["name"] = name
    r = client.post("/api/v1/inverts/", json=body, headers=hdr(user))
    assert r.status_code == 201, r.text
    inv = db.query(Invert).filter(Invert.id == uuid.UUID(r.json()["id"])).one()
    inv.created_at = datetime.combine((_now() - timedelta(days=days_ago)).date(), time(12, 0), tzinfo=timezone.utc)
    db.commit()
    return r.json()


def mk_prefs(db, user, *, email_on=True, digest_on=True):
    p = NotificationPreferences(
        user_id=user.id, daily_digest_enabled=digest_on, digest_hour=9, email_digest_enabled=email_on
    )
    db.add(p)
    db.commit()
    return p


def due_keeper(client, db, names=("Rosie", "Hairy"), *, email=None, active=True, email_on=True):
    """A keeper with one due animal per name, an email-on prefs row, then (optionally) deactivated."""
    u = mk_user(db, email)
    for n in names:
        mk_animal(client, db, u, n)
    prefs = mk_prefs(db, u, email_on=email_on)
    if not active:
        u.is_active = False
        db.commit()
    return u, prefs


def run(db, user):
    return run_feeding_digests(db, only_user_id=str(user.id), ignore_schedule=True)


# ── preferences exist for everyone ───────────────────────────────────────────

def _prefs_for(db, user_id):
    return db.query(NotificationPreferences).filter(NotificationPreferences.user_id == user_id).all()


def test_register_creates_prefs(client, db_session):
    r = client.post("/api/v1/auth/register", json={
        "email": "Reminder.New@Example.com", "username": "reminder_newkeeper", "password": "TestPass1!",
    })
    assert r.status_code == 201, r.text
    user = db_session.query(User).filter(User.email == "reminder.new@example.com").one()
    rows = _prefs_for(db_session, user.id)
    assert len(rows) == 1
    assert rows[0].daily_digest_enabled is True
    assert rows[0].digest_hour == 9
    assert rows[0].email_digest_enabled is False


def test_oauth_create_creates_prefs(client, db_session, monkeypatch):
    verified = {"provider_account_id": "g-dayone-1", "email": "oauth.reminder@example.com", "name": None, "picture": None}
    monkeypatch.setattr(auth_router, "verify_google_id_token", lambda tok: verified)
    r = client.post("/api/v1/auth/oauth-login", json={"provider": "google", "id_token": "signed.token"})
    assert r.status_code == 200, r.text
    assert r.json()["is_new_user"] is True
    rows = _prefs_for(db_session, uuid.UUID(r.json()["user"]["id"]))
    assert len(rows) == 1
    assert rows[0].daily_digest_enabled is True
    assert rows[0].email_digest_enabled is False


def test_get_put_push_token_share_helper(client, db_session):
    # GET on a user with no row creates exactly one, with the defaults.
    a = mk_user(db_session)
    r = client.get(PREFS, headers=hdr(a))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["daily_digest_enabled"] is True and body["digest_hour"] == 9
    assert body["email_digest_enabled"] is False
    assert body["feeding_reminder_hours"] == 24 and body["quiet_hours_start"] == "22:00"
    assert client.get(PREFS, headers=hdr(a)).status_code == 200
    assert len(_prefs_for(db_session, a.id)) == 1

    # PUT and push-token on a user with no row create the same row.
    b = mk_user(db_session)
    r = client.put(PREFS, json={"email_digest_enabled": True}, headers=hdr(b))
    assert r.status_code == 200, r.text
    assert r.json()["email_digest_enabled"] is True
    assert r.json()["daily_digest_enabled"] is True and r.json()["digest_hour"] == 9
    assert len(_prefs_for(db_session, b.id)) == 1

    c = mk_user(db_session)
    r = client.post(PREFS + "push-token", json={"token": "ExponentPushToken[x]", "tz_offset_minutes": 300}, headers=hdr(c))
    assert r.status_code == 200, r.text
    assert r.json()["tz_offset_minutes"] == 300 and r.json()["daily_digest_enabled"] is True
    assert len(_prefs_for(db_session, c.id)) == 1

    # An explicit null on the email switch is ignored (NOT NULL column), not a 500.
    r = client.put(PREFS, json={"email_digest_enabled": None}, headers=hdr(b))
    assert r.status_code == 200 and r.json()["email_digest_enabled"] is True


def test_ensure_helper_is_idempotent_and_flushes_without_commit(db_session):
    u = mk_user(db_session)
    first = ensure_notification_preferences(db_session, u.id)
    again = ensure_notification_preferences(db_session, u.id)
    assert first.id == again.id
    assert first.daily_digest_enabled is True and first.email_digest_enabled is False
    assert first.sitter_activity_enabled is True and first.community_activity_enabled is False
    assert len(_prefs_for(db_session, u.id)) == 1


def _migration():
    spec = importlib.util.spec_from_file_location("don_20261027_day_one", MIGRATION)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_migration_metadata():
    m = _migration()
    assert m.revision == "don_20261027_day_one"
    assert m.down_revision == "whn_20261023_whats_new_seen"


def test_migration_backfill_sql(db_session):
    m = _migration()
    without = mk_user(db_session)
    with_row = mk_user(db_session)
    mk_prefs(db_session, with_row, email_on=True)
    assert _prefs_for(db_session, without.id) == []

    db_session.execute(text(m.BACKFILL_SQL))
    db_session.execute(text(m.BACKFILL_SQL))  # idempotent
    db_session.commit()

    rows = _prefs_for(db_session, without.id)
    assert len(rows) == 1
    assert rows[0].daily_digest_enabled is True and rows[0].digest_hour == 9
    assert rows[0].email_digest_enabled is False
    assert rows[0].feeder_low_stock_enabled is True and rows[0].sitter_activity_enabled is True
    # An existing row is never touched.
    kept = _prefs_for(db_session, with_row.id)
    assert len(kept) == 1 and kept[0].email_digest_enabled is True

    # Every NOT NULL column of the table has a real value on the backfilled row.
    not_null = [r[0] for r in db_session.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'notification_preferences' AND is_nullable = 'NO'"
    ))]
    assert {"id", "user_id", "daily_digest_enabled", "digest_hour", "email_digest_enabled",
            "feeder_low_stock_enabled", "sitter_activity_enabled"} <= set(not_null)
    got = db_session.execute(
        text("SELECT " + ", ".join(not_null) + " FROM notification_preferences WHERE user_id = :u"),
        {"u": str(without.id)},
    ).one()
    assert all(v is not None for v in got)


# ── who gets an email ────────────────────────────────────────────────────────

def test_email_only_when_opted_in_and_due(client, db_session, after_cutoff):
    off, _ = due_keeper(client, db_session, ("Off",), email_on=False)
    out = run(db_session, off)
    assert out["sent"] == 1 and out["emails"] == []  # in-app digest still goes out

    nothing_due = mk_user(db_session)
    mk_animal(client, db_session, nothing_due, "Fresh", days_ago=1)
    mk_prefs(db_session, nothing_due, email_on=True)
    out = run(db_session, nothing_due)
    assert out["sent"] == 0 and out["emails"] == []

    on, _ = due_keeper(client, db_session, ("Rosie", "Hairy"), email_on=True)
    out = run(db_session, on)
    assert out["checked"] == 1 and out["sent"] == 1
    assert len(out["emails"]) == 1
    e = out["emails"][0]
    assert isinstance(e, DigestEmail)
    assert e.user_id == on.id and e.to == on.email
    assert e.due_count == 2
    assert sorted(e.names) == ["Hairy", "Rosie"]


def test_email_names_fall_back_and_cap_at_ten(client, db_session, after_cutoff):
    u = mk_user(db_session)
    mk_animal(client, db_session, u, None, common_name="Greenbottle")
    mk_animal(client, db_session, u, None, scientific_name="Brachypelma hamorii")
    mk_animal(client, db_session, u, None)
    mk_prefs(db_session, u)
    e = run(db_session, u)["emails"][0]
    assert sorted(e.names) == ["Brachypelma hamorii", "Greenbottle", "Unnamed"]

    big = mk_user(db_session)
    for i in range(12):
        mk_animal(client, db_session, big, f"Spider {i}")
    mk_prefs(db_session, big)
    e = run(db_session, big)["emails"][0]
    assert e.due_count == 12 and len(e.names) == 10


def test_email_skips_unreachable_accounts(client, db_session, after_cutoff):
    inactive, _ = due_keeper(client, db_session, active=False)
    merged, _ = due_keeper(client, db_session, email=f"merged-{uuid.uuid4().hex[:8]}@merged.invalid")
    robot, _ = due_keeper(client, db_session, email=f"robot{uuid.uuid4().hex[:6]}@cloudtestlabaccounts.com")
    good, _ = due_keeper(client, db_session)

    for bad in (inactive, merged, robot):
        out = run(db_session, bad)
        assert out["emails"] == [], bad.email
    assert len(run(db_session, good)["emails"]) == 1

    # The merged / test-domain accounts still get the in-app notification (it is
    # only the email that is withheld); the inactive one gets neither.
    def notes(u):
        return db_session.query(Notification).filter(
            Notification.user_id == u.id, Notification.type == "feeding_digest").count()

    assert notes(merged) == 1 and notes(robot) == 1 and notes(good) == 1
    assert notes(inactive) == 0


def test_digest_skips_inactive_users(client, db_session, after_cutoff):
    u, _ = due_keeper(client, db_session, active=False)
    out = run(db_session, u)
    assert out["checked"] == 0 and out["sent"] == 0 and out["emails"] == []
    assert db_session.query(Notification).filter(Notification.user_id == u.id).count() == 0


def test_email_once_per_utc_day(client, db_session, after_cutoff):
    u, prefs = due_keeper(client, db_session)
    prefs.email_digest_last_sent_on = _now().date()
    db_session.commit()
    out = run(db_session, u)
    assert out["sent"] == 1 and out["emails"] == []  # even in ignore_schedule mode

    prefs.email_digest_last_sent_on = _now().date() - timedelta(days=1)
    db_session.commit()
    assert len(run(db_session, u)["emails"]) == 1


def test_existing_digest_result_shape_has_emails(client, db_session, after_cutoff):
    u = mk_user(db_session)
    mk_prefs(db_session, u, email_on=False)
    out = run(db_session, u)
    assert set(out) == {"checked", "sent", "emails"}


# ── sending ──────────────────────────────────────────────────────────────────

def _digest(user, n=2, names=("Rosie", "Hairy")):
    return DigestEmail(user_id=user.id, to=user.email, due_count=n, names=list(names))


def test_email_cap(db_session, monkeypatch, send):
    monkeypatch.setattr(settings, "DIGEST_EMAIL_DAILY_CAP", 1)
    a, pa = mk_user(db_session), None
    b = mk_user(db_session)
    pa = mk_prefs(db_session, a)
    pb = mk_prefs(db_session, b)

    n = asyncio.run(send_digest_emails(db_session, [_digest(a), _digest(b)]))
    assert n == 1
    assert send.await_count == 1
    db_session.refresh(pa)
    db_session.refresh(pb)
    assert pa.email_digest_last_sent_on == _now().date()
    assert pb.email_digest_last_sent_on is None

    # Rows already sent today count against the cap on the next call.
    assert asyncio.run(send_digest_emails(db_session, [_digest(b)])) == 0
    assert send.await_count == 1


def test_email_cap_counts_earlier_sends_today(db_session, monkeypatch, send):
    monkeypatch.setattr(settings, "DIGEST_EMAIL_DAILY_CAP", 2)
    earlier = mk_user(db_session)
    pe = mk_prefs(db_session, earlier)
    pe.email_digest_last_sent_on = _now().date()
    db_session.commit()
    x, y = mk_user(db_session), mk_user(db_session)
    mk_prefs(db_session, x)
    mk_prefs(db_session, y)
    assert asyncio.run(send_digest_emails(db_session, [_digest(x), _digest(y)])) == 1


def test_email_has_unsubscribe_headers_and_link(db_session, send):
    u = mk_user(db_session)
    mk_prefs(db_session, u)
    assert asyncio.run(send_digest_emails(db_session, [_digest(u, 2)])) == 1

    call = send.await_args
    to, subject, html = call.args[:3]
    headers = call.kwargs["headers"]
    token = make_unsubscribe_token(u.id)
    assert to == u.email
    assert subject == "2 animals are due to eat today"
    assert headers["List-Unsubscribe"] == (
        f"<{settings.API_PUBLIC_URL.rstrip('/')}/api/v1/notification-preferences/email-unsubscribe?token={token}>"
    )
    assert headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert f"/unsubscribe/{token}" in html
    assert "/dashboard/feeding-day" in html
    assert "/dashboard/settings/notifications" in html
    assert "Open Feeding Day" in html
    assert "You're getting this because you turned on daily email reminders." in html
    assert "Unsubscribe" in html and "Reminder settings" in html
    assert "<h2" in html and "2 animals are due to eat today" in html


def test_email_singular_subject_and_html_escaping(db_session, send):
    u = mk_user(db_session)
    mk_prefs(db_session, u)
    evil = '<script>alert(1)</script> & "Bob"'
    asyncio.run(send_digest_emails(db_session, [_digest(u, 1, (evil,))]))
    to, subject, html = send.await_args.args[:3]
    assert subject == "1 animal is due to eat today"
    assert "<script>" not in html
    assert "&lt;script&gt;" in html and "&amp;" in html
    # No user data in any URL but the signed token.
    for url in re.findall(r'href="([^"]+)"', html):
        assert "script" not in url and u.email not in url and str(u.id) not in url


def test_send_failure_is_skipped_and_logged_without_address(db_session, monkeypatch, caplog):
    boom = AsyncMock(side_effect=[RuntimeError("resend down"), None])
    monkeypatch.setattr(EmailService, "send_email", boom)
    a, b = mk_user(db_session), mk_user(db_session)
    pa, pb = mk_prefs(db_session, a), mk_prefs(db_session, b)
    with caplog.at_level(logging.DEBUG):
        n = asyncio.run(send_digest_emails(db_session, [_digest(a), _digest(b)]))
    assert n == 1
    db_session.refresh(pa)
    db_session.refresh(pb)
    assert pa.email_digest_last_sent_on is None and pb.email_digest_last_sent_on == _now().date()
    blob = "\n".join(r.getMessage() for r in caplog.records)
    assert a.email not in blob and b.email not in blob


def test_send_skips_everything_when_frontend_origin_is_not_https(db_session, monkeypatch, send, caplog):
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://localhost:3000")
    a, b = mk_user(db_session), mk_user(db_session)
    pa, pb = mk_prefs(db_session, a), mk_prefs(db_session, b)
    with caplog.at_level(logging.DEBUG):
        n = asyncio.run(send_digest_emails(db_session, [_digest(a), _digest(b)]))
    assert n == 0
    assert send.await_count == 0
    db_session.refresh(pa)
    db_session.refresh(pb)
    assert pa.email_digest_last_sent_on is None and pb.email_digest_last_sent_on is None
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING and "not https" in r.getMessage()]
    assert len(warnings) == 1 and "2 email(s)" in warnings[0].getMessage()
    blob = "\n".join(r.getMessage() for r in caplog.records)
    assert a.email not in blob and b.email not in blob


def test_send_skips_users_who_opted_out_meanwhile(db_session, send):
    u = mk_user(db_session)
    p = mk_prefs(db_session, u, email_on=False)
    assert asyncio.run(send_digest_emails(db_session, [_digest(u)])) == 0
    assert send.await_count == 0
    assert p.email_digest_last_sent_on is None


def test_run_digests_endpoint_sends_and_reports(client, db_session, monkeypatch, send, after_cutoff):
    monkeypatch.setenv("CRON_SECRET", "s3cret")
    u, _ = due_keeper(client, db_session)
    r = client.post(
        "/api/v1/notifications/run-digests",
        params={"test_user_id": str(u.id), "ignore_schedule": "true"},
        headers={"X-Cron-Secret": "s3cret"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["emails_sent"] == 1 and body["sent"] == 1
    assert "emails" not in body
    assert send.await_count == 1


# ── unsubscribe ──────────────────────────────────────────────────────────────

def test_unsubscribe_turns_off(client, db_session):
    u = mk_user(db_session)
    p = mk_prefs(db_session, u, email_on=True)
    token = make_unsubscribe_token(u.id)
    r = client.post(UNSUB, params={"token": token})
    assert r.status_code == 200 and r.json() == {"ok": True}
    db_session.refresh(p)
    assert p.email_digest_enabled is False

    p.email_digest_enabled = True
    db_session.commit()
    # GET changes nothing: it redirects to the web page, which POSTs.
    r = client.get(UNSUB, params={"token": token}, follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["location"] == f"{resolve_frontend_origin(None)}/unsubscribe/{token}"
    db_session.refresh(p)
    assert p.email_digest_enabled is True

    # Repeat is fine; the push/in-app digest is untouched.
    assert client.post(UNSUB, params={"token": token}).status_code == 200
    assert p.daily_digest_enabled is True


def test_unsubscribe_tampered_and_deleted(client, db_session):
    u = mk_user(db_session)
    p = mk_prefs(db_session, u, email_on=True)
    token = make_unsubscribe_token(u.id)
    body, sig = token.split(".")
    flipped = ("A" if sig[0] != "A" else "B") + sig[1:]
    for bad in (f"{body}.{flipped}", "garbage", "", "a.b", f"{token}x", "...", body):
        for method in (client.get, client.post):
            r = method(UNSUB, params={"token": bad})
            assert r.status_code == 404, (bad, r.status_code)
    r = client.get(UNSUB)  # no token at all
    assert r.status_code == 404
    db_session.refresh(p)
    assert p.email_digest_enabled is True

    # A real token for an account that no longer exists: idempotent success.
    gone = uuid.uuid4()
    assert client.post(UNSUB, params={"token": make_unsubscribe_token(gone)}).json() == {"ok": True}
    # A real user with no prefs row: also fine, and no row is invented.
    bare = mk_user(db_session)
    r = client.post(UNSUB, params={"token": make_unsubscribe_token(bare.id)})
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert _prefs_for(db_session, bare.id) == []


def test_unsubscribe_long_garbage_token_is_404_not_422(client, db_session):
    # A forged token of any length is "not valid" (404), never a validation error.
    for bad in ("x" * 500, ("a" * 200) + "." + ("b" * 200)):
        for method in (client.get, client.post):
            assert method(UNSUB, params={"token": bad}).status_code == 404


def test_unsubscribe_one_click_post_with_form_body(client, db_session):
    # What a mail client sends for List-Unsubscribe-Post: a form body, token in the URL.
    u = mk_user(db_session)
    p = mk_prefs(db_session, u, email_on=True)
    r = client.post(
        f"{UNSUB}?token={make_unsubscribe_token(u.id)}",
        data={"List-Unsubscribe": "One-Click"},
    )
    assert r.status_code == 200 and r.json() == {"ok": True}
    db_session.refresh(p)
    assert p.email_digest_enabled is False


def test_digest_email_repr_hides_the_address():
    e = DigestEmail(user_id=uuid.uuid4(), to="very.private@example.org", due_count=1, names=["Rosie"])
    assert "very.private@example.org" not in repr(e)
    assert e.to == "very.private@example.org"


def test_unsubscribe_is_public_and_rate_limited(client, db_session):
    u = mk_user(db_session)
    mk_prefs(db_session, u)
    token = make_unsubscribe_token(u.id)
    statuses = [
        client.get(UNSUB, params={"token": token}, follow_redirects=False).status_code
        for _ in range(32)
    ]
    assert statuses[0] == 303 and statuses[-1] == 429
    limiter.reset()
    posts = [client.post(UNSUB, params={"token": token}).status_code for _ in range(32)]
    assert posts[0] == 200 and posts[-1] == 429


def test_token_roundtrip_and_no_expiry():
    uid = uuid.uuid4()
    t = make_unsubscribe_token(uid)
    assert read_unsubscribe_token(t) == uid
    assert re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", t)


def test_token_key_is_separate():
    uid = uuid.uuid4()
    care, _exp = sign_care_sheet_token({"o": uid.hex})
    assert read_unsubscribe_token(care) is None
    assert read_unsubscribe_token(sign_render_token({"o": uid.hex})) is None
    # And an unsubscribe token is no care sheet / render token.
    from app.utils.care_sheet_token import read_care_sheet_token
    from app.utils.share_token import verify_render_token
    t = make_unsubscribe_token(uid)
    assert read_care_sheet_token(t)[0] is None
    assert verify_render_token(t) is None


# ── logging ──────────────────────────────────────────────────────────────────

ADDRESS = "very.private.keeper@example.org"
BODY_MARK = "SECRET-BODY-MARKER-7731"


def test_email_service_never_logs_address(monkeypatch, caplog):
    # Mock mode (no API key).
    monkeypatch.setattr(settings, "RESEND_API_KEY", "")
    with caplog.at_level(logging.DEBUG):
        asyncio.run(EmailService.send_email(ADDRESS, "Hello subject", f"<p>{BODY_MARK}</p>"))
    blob = "\n".join(r.getMessage() for r in caplog.records)
    assert ADDRESS not in blob and BODY_MARK not in blob
    assert "mock email: Hello subject" in blob

    # Success path through a faked Resend client; headers ride in the JSON body.
    posted = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None):
            posted.update(url=url, json=json)
            return FakeResponse()

    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr("app.services.email.httpx.AsyncClient", FakeClient)
    caplog.clear()
    with caplog.at_level(logging.DEBUG):
        asyncio.run(EmailService.send_email(
            ADDRESS, "Hello subject", f"<p>{BODY_MARK}</p>", headers={"List-Unsubscribe": "<https://x/y>"}
        ))
    blob = "\n".join(r.getMessage() for r in caplog.records)
    assert ADDRESS not in blob and BODY_MARK not in blob
    assert posted["json"]["to"] == [ADDRESS]
    assert posted["json"]["headers"] == {"List-Unsubscribe": "<https://x/y>"}

    # No headers -> no "headers" key at all (existing mails are unchanged).
    asyncio.run(EmailService.send_email(ADDRESS, "Plain", "<p>x</p>"))
    assert "headers" not in posted["json"]

    # Failure path: logs the failure, never the address.
    class FailingClient(FakeClient):
        async def post(self, url, headers=None, json=None):
            raise RuntimeError("network down")

    monkeypatch.setattr("app.services.email.httpx.AsyncClient", FailingClient)
    caplog.clear()
    with caplog.at_level(logging.DEBUG):
        with pytest.raises(RuntimeError):
            asyncio.run(EmailService.send_email(ADDRESS, "Hello subject", f"<p>{BODY_MARK}</p>"))
    blob = "\n".join(r.getMessage() + (r.exc_text or "") for r in caplog.records)
    assert ADDRESS not in blob and BODY_MARK not in blob
