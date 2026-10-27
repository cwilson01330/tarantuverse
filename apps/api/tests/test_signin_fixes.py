"""Sign-in fixes (2026-10-26): keepers were locked out.

Causes this pins down:
  * Emails were matched exact-case, so "Cory@x.com" typed as "cory@x.com" (a
    phone keyboard capitalising the first letter) was "no such account", and a
    social sign-in with a differently-cased address created a SECOND account.
  * A 14-day token with no way to renew it quietly.
  * Password reset for a social-only account silently sent nothing.
  * /auth/oauth-login created an account for any unknown identity, so a keeper
    who tapped the wrong provider got a brand-new empty account.

Existing stored emails are never modified; lookups are case-insensitive and
only NEW rows store the normalised address.
"""
from __future__ import annotations

import inspect
import re
import uuid
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.config import settings
from app.models.user import User
from app.models.user_oauth_account import UserOAuthAccount
from app.routers import auth as auth_router
from app.services import apple_siwa
from app.services.email import EmailService
from app.utils.auth import create_access_token, decode_access_token, get_password_hash
from app.utils.rate_limit import limiter

pytestmark = pytest.mark.requires_postgres

PASSWORD = "TestPass1!"
OTHER_PASSWORD = "OtherPass2@"


@pytest.fixture(autouse=True)
def _fresh_limiter():
    limiter.reset()
    yield
    limiter.reset()


def _uname() -> str:
    return f"sf_{uuid.uuid4().hex[:10]}"


def _make_user(db, email, *, password=PASSWORD, verified=True, active=True, legacy_provider=None):
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        username=_uname(),
        hashed_password=get_password_hash(password) if password else None,
        is_active=active,
        is_verified=verified,
        oauth_provider=legacy_provider,
    )
    db.add(user)
    db.commit()
    return user


def _link(db, user, provider, sub=None):
    row = UserOAuthAccount(
        user_id=user.id,
        provider=provider,
        provider_account_id=sub or f"{provider}-{uuid.uuid4().hex[:8]}",
        provider_email=user.email,
    )
    db.add(row)
    db.commit()
    return row


def _count_users(db, email) -> int:
    from sqlalchemy import func
    return db.query(User).filter(func.lower(User.email) == email.lower()).count()


def _login(client, email, password=PASSWORD):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


# ── helpers ──────────────────────────────────────────────────────────────────

def test_normalize_email_strips_and_lowercases():
    from app.utils.emails import normalize_email
    assert normalize_email("  Cory.Wilson@Example.COM \n") == "cory.wilson@example.com"
    assert normalize_email("a@b.c") == "a@b.c"


def test_find_users_by_email_matches_any_case_exact_case_first(db_session):
    from app.utils.emails import find_users_by_email
    lower = _make_user(db_session, "dupfind@example.com")
    upper = _make_user(db_session, "DupFind@example.com")
    got = find_users_by_email(db_session, "DupFind@example.com")
    assert [u.id for u in got] == [upper.id, lower.id]
    got = find_users_by_email(db_session, "  dupfind@example.com ")
    assert [u.id for u in got] == [lower.id, upper.id]
    assert find_users_by_email(db_session, "nobody@example.com") == []


# ── register ─────────────────────────────────────────────────────────────────

def test_register_stores_lowercase_and_rejects_case_variant(client, db_session):
    r = client.post("/api/v1/auth/register", json={
        "email": "Fresh.Keeper@Example.com", "username": _uname(), "password": PASSWORD,
    })
    assert r.status_code == 201, r.text
    row = db_session.query(User).filter(User.email == "fresh.keeper@example.com").one()
    assert row.email == "fresh.keeper@example.com"

    for variant in ("fresh.keeper@example.com", "FRESH.KEEPER@EXAMPLE.COM", "Fresh.Keeper@example.com"):
        again = client.post("/api/v1/auth/register", json={
            "email": variant, "username": _uname(), "password": PASSWORD,
        })
        assert again.status_code == 400, again.text
        assert again.json()["detail"] == "Email already registered"
    assert _count_users(db_session, "fresh.keeper@example.com") == 1


def test_register_rejects_variant_of_a_legacy_capitalised_account(client, db_session):
    _make_user(db_session, "Legacy.Caps@example.com")
    r = client.post("/api/v1/auth/register", json={
        "email": "legacy.caps@example.com", "username": _uname(), "password": PASSWORD,
    })
    assert r.status_code == 400
    assert r.json()["detail"] == "Email already registered"


# ── login ────────────────────────────────────────────────────────────────────

def test_login_is_case_insensitive_and_leaves_stored_email_alone(client, db_session):
    user = _make_user(db_session, "Cory.Caps@example.com")
    for typed in ("Cory.Caps@example.com", "cory.caps@example.com", "CORY.CAPS@EXAMPLE.COM"):
        r = _login(client, typed)
        assert r.status_code == 200, (typed, r.text)
        assert r.json()["user"]["id"] == str(user.id)
    db_session.refresh(user)
    assert user.email == "Cory.Caps@example.com"


def test_login_failures_stay_generic(client, db_session):
    _make_user(db_session, "generic@example.com")
    wrong = _login(client, "generic@example.com", OTHER_PASSWORD)
    unknown = _login(client, "nobody-here@example.com")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": "Incorrect email or password"}


def test_login_social_only_account_with_password_is_generic_401(client, db_session):
    _make_user(db_session, "socialonly@example.com", password=None)
    r = _login(client, "socialonly@example.com")
    assert r.status_code == 401
    assert r.json() == {"detail": "Incorrect email or password"}


def test_login_case_duplicates_picks_password_match(client, db_session):
    first = _make_user(db_session, "Twin.Keeper@example.com", password=PASSWORD)
    second = _make_user(db_session, "twin.keeper@example.com", password=OTHER_PASSWORD)

    r = _login(client, "twin.keeper@example.com", PASSWORD)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["id"] == str(first.id)

    r = _login(client, "twin.keeper@example.com", OTHER_PASSWORD)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["id"] == str(second.id)

    r = _login(client, "twin.keeper@example.com", "NeitherPass3#")
    assert r.status_code == 401
    assert r.json() == {"detail": "Incorrect email or password"}


def test_login_duplicate_with_a_social_only_twin_still_finds_the_password_one(client, db_session):
    _make_user(db_session, "Mix.Twin@example.com", password=None)
    pw = _make_user(db_session, "mix.twin@example.com", password=PASSWORD)
    r = _login(client, "MIX.TWIN@example.com", PASSWORD)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["id"] == str(pw.id)


def test_login_inactive_account_still_403(client, db_session):
    _make_user(db_session, "Gone@example.com", active=False)
    r = _login(client, "gone@example.com")
    assert r.status_code == 403


# ── forgot-password ──────────────────────────────────────────────────────────

@pytest.fixture
def mails(monkeypatch):
    sent = SimpleNamespace(reset=[], social=[])

    async def fake_reset(to_email, reset_link, brand=None):
        sent.reset.append((to_email, reset_link, brand))

    async def fake_social(to_email, providers, brand=None):
        sent.social.append((to_email, list(providers), brand))

    monkeypatch.setattr(EmailService, "send_password_reset_email", staticmethod(fake_reset))
    monkeypatch.setattr(EmailService, "send_social_signin_email", staticmethod(fake_social), raising=False)
    return sent


def _forgot(client, email, **extra):
    return client.post("/api/v1/auth/forgot-password", json={"email": email, **extra})


def test_forgot_password_sends_reset_to_password_account_any_case(client, db_session, mails):
    user = _make_user(db_session, "Reset.Me@example.com")
    r = _forgot(client, "reset.me@example.com")
    assert r.status_code == 200
    assert len(mails.reset) == 1 and mails.social == []
    to, link, _brand = mails.reset[0]
    assert to == "Reset.Me@example.com"
    db_session.refresh(user)
    assert user.reset_token and f"token={user.reset_token}" in link


def test_forgot_password_sends_social_email_to_passwordless_account(client, db_session, mails):
    user = _make_user(db_session, "Social.Keeper@example.com", password=None)
    _link(db_session, user, "google")
    _link(db_session, user, "apple")
    r = _forgot(client, "social.keeper@example.com")
    assert r.status_code == 200
    assert mails.reset == []
    assert len(mails.social) == 1
    to, providers, _brand = mails.social[0]
    assert to == "Social.Keeper@example.com"
    assert sorted(providers) == ["Apple", "Google"]
    db_session.refresh(user)
    assert user.reset_token is None


def test_forgot_password_social_provider_from_legacy_column(client, db_session, mails):
    _make_user(db_session, "legacy.apple@example.com", password=None, legacy_provider="apple")
    _forgot(client, "legacy.apple@example.com")
    assert [p for _t, p, _b in mails.social] == [["Apple"]]


def test_forgot_password_no_providers_known_sends_nothing(client, db_session, mails):
    _make_user(db_session, "mystery@example.com", password=None)
    r = _forgot(client, "mystery@example.com")
    assert r.status_code == 200
    assert mails.reset == [] and mails.social == []


def test_forgot_password_case_duplicates_each_get_the_right_email(client, db_session, mails):
    with_pw = _make_user(db_session, "Dupe.Reset@example.com", password=PASSWORD)
    social = _make_user(db_session, "dupe.reset@example.com", password=None)
    _link(db_session, social, "google")
    r = _forgot(client, "DUPE.RESET@example.com")
    assert r.status_code == 200
    assert [t for t, _l, _b in mails.reset] == ["Dupe.Reset@example.com"]
    assert [(t, p) for t, p, _b in mails.social] == [("dupe.reset@example.com", ["Google"])]
    db_session.refresh(with_pw)
    assert with_pw.reset_token


def test_forgot_password_response_is_identical_for_every_outcome(client, db_session, mails):
    _make_user(db_session, "has.pw@example.com")
    social = _make_user(db_session, "no.pw@example.com", password=None)
    _link(db_session, social, "google")
    bodies = [
        _forgot(client, "has.pw@example.com"),
        _forgot(client, "no.pw@example.com"),
        _forgot(client, "unknown.person@example.com"),
    ]
    assert {r.status_code for r in bodies} == {200}
    assert len({r.text for r in bodies}) == 1
    assert bodies[0].json() == {
        "message": "If an account exists for that email, a password reset link has been sent."
    }
    assert len(mails.reset) == 1 and len(mails.social) == 1  # nothing for the unknown address


def test_forgot_password_social_email_uses_the_requesting_brand(client, db_session, mails):
    social = _make_user(db_session, "hv.social@example.com", password=None)
    _link(db_session, social, "apple")
    _forgot(client, "hv.social@example.com", frontend_url="https://herpetoverse.com")
    assert mails.social[0][2].name == "Herpetoverse"
    _forgot(client, "hv.social@example.com")
    assert mails.social[1][2].name == "Tarantuverse"


@pytest.mark.parametrize("brand_name,origin", [("Tarantuverse", None), ("Herpetoverse", "https://herpetoverse.com")])
def test_social_signin_email_copy(monkeypatch, brand_name, origin):
    import asyncio
    from app.utils.frontend_origin import brand_for_origin, resolve_frontend_origin

    captured = []

    async def fake_send(to_email, subject, content):
        captured.append((to_email, subject, content))

    monkeypatch.setattr(EmailService, "send_email", staticmethod(fake_send))
    brand = brand_for_origin(resolve_frontend_origin(origin))
    asyncio.run(EmailService.send_social_signin_email("k@example.com", ["Google", "Apple"], brand=brand))

    to, subject, html = captured[0]
    assert to == "k@example.com"
    assert subject == f"How you sign in to {brand_name}"
    assert "no password" in html
    assert "signs in with Google and Apple" in html
    assert "button on the login screen" in html
    assert "<a " not in html and "reset-password" not in html and "http" not in html


def test_social_signin_email_single_provider_and_default_brand(monkeypatch):
    import asyncio
    captured = []

    async def fake_send(to_email, subject, content):
        captured.append((subject, content))

    monkeypatch.setattr(EmailService, "send_email", staticmethod(fake_send))
    asyncio.run(EmailService.send_social_signin_email("k@example.com", ["Apple"]))
    subject, html = captured[0]
    assert subject == "How you sign in to Tarantuverse"
    assert "signs in with Apple" in html and "Google" not in html


# ── /auth/refresh ────────────────────────────────────────────────────────────

def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_refresh_returns_a_fresh_token_and_keeps_the_old_one_alive(client, db_session):
    user = _make_user(db_session, "refresh.me@example.com")
    old = _login(client, "refresh.me@example.com").json()["access_token"]

    r = client.post("/api/v1/auth/refresh", headers=_bearer(old))
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"access_token", "token_type", "user"}
    assert body["token_type"] == "bearer"
    assert body["user"]["id"] == str(user.id)
    assert body["access_token"] != old

    old_claims, new_claims = decode_access_token(old), decode_access_token(body["access_token"])
    assert new_claims["sub"] == str(user.id)
    assert new_claims["jti"] != old_claims["jti"]
    assert new_claims["iat"] >= old_claims["iat"] and new_claims["exp"] >= old_claims["exp"]

    # not revoked: both work
    assert client.get("/api/v1/auth/me", headers=_bearer(old)).status_code == 200
    assert client.get("/api/v1/auth/me", headers=_bearer(body["access_token"])).status_code == 200


def test_refresh_refuses_a_revoked_token(client, db_session):
    _make_user(db_session, "revoked.refresh@example.com")
    token = _login(client, "revoked.refresh@example.com").json()["access_token"]
    assert client.post("/api/v1/auth/logout", headers=_bearer(token)).status_code == 200
    r = client.post("/api/v1/auth/refresh", headers=_bearer(token))
    assert r.status_code == 401


def test_refresh_refuses_an_expired_token(client, db_session):
    user = _make_user(db_session, "expired.refresh@example.com")
    dead = create_access_token(data={"sub": str(user.id)}, expires_delta=timedelta(seconds=-30))
    assert client.post("/api/v1/auth/refresh", headers=_bearer(dead)).status_code == 401


def test_refresh_needs_a_token_and_a_live_account(client, db_session):
    assert client.post("/api/v1/auth/refresh").status_code in (401, 403)
    user = _make_user(db_session, "now.inactive@example.com")
    token = create_access_token(data={"sub": str(user.id)})
    user.is_active = False
    db_session.commit()
    r = client.post("/api/v1/auth/refresh", headers=_bearer(token))
    # 401, not 403: the clients only sign out on 401 (a retired account's device was stuck)
    assert r.status_code == 401
    assert r.headers.get("www-authenticate") == "Bearer"
    assert r.json()["detail"] == "Account is no longer active"


def test_deactivated_account_gets_401_on_any_authenticated_route(client, db_session):
    user = _make_user(db_session, "retired.session@example.com")
    token = create_access_token(data={"sub": str(user.id)})
    assert client.get("/api/v1/auth/me", headers=_bearer(token)).status_code == 200
    user.is_active = False
    db_session.commit()
    r = client.get("/api/v1/auth/me", headers=_bearer(token))
    assert r.status_code == 401
    assert r.headers.get("www-authenticate") == "Bearer"
    assert "Inactive user" not in r.text


def test_current_active_user_dependency_also_401s_when_inactive():
    from fastapi import HTTPException
    from app.utils.dependencies import get_current_active_user

    class _U:
        is_active = False

    with pytest.raises(HTTPException) as exc:
        get_current_active_user(_U())
    assert exc.value.status_code == 401
    assert exc.value.headers == {"WWW-Authenticate": "Bearer"}


def test_refresh_is_rate_limited_per_hour():
    fn = auth_router.refresh_access_token
    assert hasattr(fn, "__wrapped__"), "refresh must be wrapped by @limiter.limit"
    src = Path(inspect.getsourcefile(auth_router)).read_text(encoding="utf-8")
    assert re.search(
        r'@limiter\.limit\("30/hour", key_func=user_or_ip\)\s*\nasync def refresh_access_token', src
    )


def test_refresh_limit_is_per_user_not_per_ip(client, db_session):
    """TV web refreshes from Vercel's shared addresses: one budget per ACCOUNT."""
    a = _make_user(db_session, "rl.a@example.com")
    b = _make_user(db_session, "rl.b@example.com")
    tok_a = create_access_token(data={"sub": str(a.id)})
    tok_b = create_access_token(data={"sub": str(b.id)})
    shared_ip = {"CF-Connecting-IP": "203.0.113.9"}

    for _ in range(30):
        r = client.post("/api/v1/auth/refresh", headers={**_bearer(tok_a), **shared_ip})
        assert r.status_code == 200, r.text
    # A is out of budget...
    assert client.post("/api/v1/auth/refresh", headers={**_bearer(tok_a), **shared_ip}).status_code == 429
    # ...but B, from the very same address, still has all 30.
    for _ in range(30):
        r = client.post("/api/v1/auth/refresh", headers={**_bearer(tok_b), **shared_ip})
        assert r.status_code == 200, r.text
    assert client.post("/api/v1/auth/refresh", headers={**_bearer(tok_b), **shared_ip}).status_code == 429


def test_user_or_ip_key_function(db_session):
    from starlette.requests import Request
    from app.utils.rate_limit import user_or_ip

    def req(headers):
        return Request({
            "type": "http", "method": "POST", "path": "/", "query_string": b"",
            "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
            "client": ("10.0.0.1", 1234),
        })

    good = create_access_token(data={"sub": "user-123"})
    assert user_or_ip(req({"Authorization": f"Bearer {good}"})) == "user:user-123"
    # unreadable / forged / expired / absent -> the client address, never a user key
    ip = {"CF-Connecting-IP": "198.51.100.7"}
    assert user_or_ip(req({"Authorization": "Bearer not.a.jwt", **ip})) == "198.51.100.7"
    expired = create_access_token(data={"sub": "user-123"}, expires_delta=timedelta(seconds=-30))
    assert user_or_ip(req({"Authorization": f"Bearer {expired}", **ip})) == "198.51.100.7"
    assert user_or_ip(req(ip)) == "198.51.100.7"


# ── maximum session age (auth_time) ──────────────────────────────────────────

def test_sign_in_paths_stamp_auth_time(client, db_session, monkeypatch):
    import time
    _make_user(db_session, "stamp.pw@example.com")
    claims = decode_access_token(_login(client, "stamp.pw@example.com").json()["access_token"])
    assert abs(claims["auth_time"] - time.time()) < 30

    _patch_verify(monkeypatch, "google", "stamp.oauth@example.com", sub="g-stamp")
    claims = decode_access_token(_oauth(client, "google").json()["access_token"])
    assert abs(claims["auth_time"] - time.time()) < 30


def test_refresh_preserves_auth_time(client, db_session):
    import time
    user = _make_user(db_session, "keep.authtime@example.com")
    original = int(time.time()) - 40 * 86400
    old = create_access_token(data={"sub": str(user.id), "auth_time": original})

    r = client.post("/api/v1/auth/refresh", headers=_bearer(old))
    assert r.status_code == 200, r.text
    new = decode_access_token(r.json()["access_token"])
    assert new["auth_time"] == original  # not reset to "now"
    assert new["iat"] > original

    # and it keeps being carried through a second refresh
    r2 = client.post("/api/v1/auth/refresh", headers=_bearer(r.json()["access_token"]))
    assert r2.status_code == 200
    assert decode_access_token(r2.json()["access_token"])["auth_time"] == original


def test_refresh_refuses_a_session_older_than_180_days(client, db_session):
    import time
    from app.utils.auth import MAX_SESSION_AGE
    assert MAX_SESSION_AGE == timedelta(days=180)
    user = _make_user(db_session, "too.old@example.com")
    now = int(time.time())

    stale = create_access_token(data={"sub": str(user.id), "auth_time": now - 181 * 86400})
    r = client.post("/api/v1/auth/refresh", headers=_bearer(stale))
    assert r.status_code == 401

    fresh_enough = create_access_token(data={"sub": str(user.id), "auth_time": now - 179 * 86400})
    assert client.post("/api/v1/auth/refresh", headers=_bearer(fresh_enough)).status_code == 200


def test_refresh_of_a_token_without_auth_time_uses_iat(client, db_session):
    """Tokens issued before the claim existed: their iat is the sign-in time."""
    import time
    from datetime import datetime, timezone
    from jose import jwt
    user = _make_user(db_session, "legacy.token@example.com")

    def legacy(age_days):
        now = datetime.now(timezone.utc)
        return jwt.encode(
            {
                "sub": str(user.id), "jti": str(uuid.uuid4()),
                "iat": int(now.timestamp()) - age_days * 86400,
                "exp": int(now.timestamp()) + 3600,
            },
            settings.API_SECRET_KEY, algorithm=settings.API_ALGORITHM,
        )

    ok = legacy(10)
    r = client.post("/api/v1/auth/refresh", headers=_bearer(ok))
    assert r.status_code == 200, r.text
    assert abs(decode_access_token(r.json()["access_token"])["auth_time"] - (int(time.time()) - 10 * 86400)) <= 2

    assert client.post("/api/v1/auth/refresh", headers=_bearer(legacy(181))).status_code == 401


# ── OAuth ────────────────────────────────────────────────────────────────────

def _verified(provider, email, sub=None):
    base = {"provider_account_id": sub or f"{provider}-sub-1", "email": email, "name": None, "picture": None}
    if provider == "apple":
        base["client_id"] = "com.tarantuverse.app"
    return base


@pytest.fixture
def siwa(monkeypatch):
    """Records every authorization-code exchange; hands back a refresh token."""
    calls = []

    async def fake_exchange(code, client_id, expected_sub=None):
        calls.append((code, client_id, expected_sub))
        return "r.refresh"

    monkeypatch.setattr(apple_siwa, "exchange_authorization_code", fake_exchange)
    return calls


def _patch_verify(monkeypatch, provider, email, sub=None):
    v = _verified(provider, email, sub)
    if provider == "google":
        monkeypatch.setattr(auth_router, "verify_google_id_token", lambda tok: v)
    else:
        monkeypatch.setattr(auth_router, "verify_apple_identity_token", lambda tok: v)
    return v


def _oauth(client, provider, **extra):
    body = {"provider": provider, "id_token": "signed.token"}
    body.update(extra)
    return client.post("/api/v1/auth/oauth-login", json=body)


def test_oauth_default_still_creates(client, db_session, monkeypatch):
    _patch_verify(monkeypatch, "google", "Brand.New@Example.com")
    r = _oauth(client, "google")  # an old client: no allow_create
    assert r.status_code == 200, r.text
    assert r.json()["is_new_user"] is True
    row = db_session.query(User).filter(User.id == r.json()["user"]["id"]).one()
    assert row.email == "brand.new@example.com"


def test_oauth_refuses_inactive_account_linked_or_by_email(client, db_session, monkeypatch, siwa):
    # Linked account, deactivated: same 403 as password login, no token.
    linked = _make_user(db_session, "gone.linked@example.com", password=None, active=False)
    _link(db_session, linked, "apple", sub="apple-sub-gone")
    _patch_verify(monkeypatch, "apple", "gone.linked@example.com", sub="apple-sub-gone")
    r = _oauth(client, "apple", authorization_code="code-1")
    assert r.status_code == 403, r.text
    assert "access_token" not in r.text
    assert siwa == []  # nothing exchanged for a refused sign-in

    # Only an inactive account matches by email: refused, never linked.
    _make_user(db_session, "gone.email@example.com", active=False)
    _patch_verify(monkeypatch, "google", "gone.email@example.com", sub="google-sub-gone")
    r = _oauth(client, "google")
    assert r.status_code == 403, r.text
    assert db_session.query(UserOAuthAccount).filter(
        UserOAuthAccount.provider_account_id == "google-sub-gone").count() == 0


def test_oauth_allow_create_false_refuses_google_with_no_account(client, db_session, monkeypatch):
    _patch_verify(monkeypatch, "google", "Nobody.Yet@Example.com")
    r = _oauth(client, "google", allow_create=False)
    assert r.status_code == 409, r.text
    assert r.json() == {"detail": {
        "code": "oauth_no_account", "provider": "google", "email": "Nobody.Yet@Example.com",
    }}
    assert _count_users(db_session, "nobody.yet@example.com") == 0
    assert db_session.query(UserOAuthAccount).filter(
        UserOAuthAccount.provider_account_id == "google-sub-1").count() == 0


def test_oauth_apple_no_account_is_refused_before_the_code_is_spent_then_retry_succeeds(
    client, db_session, monkeypatch, siwa
):
    _patch_verify(monkeypatch, "apple", "apple.newbie@example.com", sub="apple-sub-new")
    first = _oauth(client, "apple", allow_create=False, authorization_code="one-time-code")
    assert first.status_code == 409, first.text
    assert first.json() == {"detail": {
        "code": "oauth_no_account", "provider": "apple", "email": "apple.newbie@example.com",
    }}
    assert siwa == []  # the single-use code was NOT consumed
    assert _count_users(db_session, "apple.newbie@example.com") == 0

    retry = _oauth(client, "apple", allow_create=True, authorization_code="one-time-code")
    assert retry.status_code == 200, retry.text
    assert retry.json()["is_new_user"] is True
    assert len(siwa) == 1 and siwa[0][0] == "one-time-code"
    assert _count_users(db_session, "apple.newbie@example.com") == 1
    row = db_session.query(UserOAuthAccount).filter(
        UserOAuthAccount.provider_account_id == "apple-sub-new").one()
    assert row.refresh_token and row.refresh_token.startswith("siwa1:")


def test_oauth_allow_create_false_still_signs_in_a_linked_account(client, db_session, monkeypatch, siwa):
    user = _make_user(db_session, "linked.already@example.com", password=None)
    _link(db_session, user, "apple", sub="apple-sub-linked")
    _patch_verify(monkeypatch, "apple", "whatever@privaterelay.appleid.com", sub="apple-sub-linked")
    r = _oauth(client, "apple", allow_create=False, authorization_code="c")
    assert r.status_code == 200, r.text
    assert r.json()["user"]["id"] == str(user.id) and r.json()["is_new_user"] is False
    assert len(siwa) == 1


def test_oauth_email_match_is_case_insensitive_and_links_instead_of_duplicating(
    client, db_session, monkeypatch
):
    user = _make_user(db_session, "Mixed.Link@example.com")
    _patch_verify(monkeypatch, "google", "mixed.link@example.com", sub="g-sub-link")
    for extra in ({}, {"allow_create": False}):
        r = _oauth(client, "google", **extra)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["id"] == str(user.id)
        assert r.json()["is_new_user"] is False
    assert _count_users(db_session, "mixed.link@example.com") == 1
    assert db_session.query(UserOAuthAccount).filter(
        UserOAuthAccount.user_id == user.id, UserOAuthAccount.provider == "google").count() == 1


def test_oauth_case_duplicates_prefers_the_verified_account(client, db_session, monkeypatch):
    _make_user(db_session, "Dup.Oauth@example.com", verified=False)
    ok = _make_user(db_session, "dup.oauth@example.com", verified=True)
    _patch_verify(monkeypatch, "google", "dup.oauth@example.com", sub="g-sub-dup")
    r = _oauth(client, "google")
    assert r.status_code == 200, r.text
    assert r.json()["user"]["id"] == str(ok.id)


def test_oauth_unverified_match_still_refuses_to_link(client, db_session, monkeypatch):
    _make_user(db_session, "Unverified.Only@example.com", verified=False)
    _patch_verify(monkeypatch, "google", "unverified.only@example.com", sub="g-sub-unv")
    r = _oauth(client, "google", allow_create=False)
    assert r.status_code == 409
    assert "not verified" in r.json()["detail"]


def test_oauth_allow_create_string_false_is_honoured(client, db_session, monkeypatch):
    _patch_verify(monkeypatch, "google", "stringy@example.com")
    r = _oauth(client, "google", allow_create="false")
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "oauth_no_account"


# Removed code-exchange routes ----------------------------------------------

def test_unused_code_exchange_routes_are_gone():
    """/auth/oauth/google, /auth/oauth/apple and /auth/link-account were
    removed on 2026-10-27: no client called them, and the Apple ones decoded
    identity tokens without checking the signature. Every sign-in goes
    through /auth/oauth-login (and linking through /auth/link-account-direct),
    which verify the token."""
    from app.main import app

    paths = {getattr(r, "path", None) for r in app.routes}
    for gone in ("/api/v1/auth/oauth/google", "/api/v1/auth/oauth/apple", "/api/v1/auth/link-account"):
        assert gone not in paths, gone
    # The verified routes that replace them are still there.
    assert "/api/v1/auth/oauth-login" in paths
    assert "/api/v1/auth/link-account-direct" in paths


def test_no_unverified_apple_token_decoding_left():
    import pathlib
    root = pathlib.Path(__file__).resolve().parents[1] / "app"
    offenders = [
        str(f.relative_to(root)) for f in root.rglob("*.py")
        if '"verify_signature": False' in f.read_text(encoding="utf-8")
        and "apple" in f.read_text(encoding="utf-8").lower()
    ]
    assert offenders == [], offenders


# ── resend-verification + static guard ───────────────────────────────────────

def test_resend_verification_finds_the_account_in_any_case(client, db_session, monkeypatch):
    sent = []

    async def fake(to_email, link, brand=None):
        sent.append(to_email)

    monkeypatch.setattr(settings, "EMAIL_VERIFICATION_REQUIRED", True)
    monkeypatch.setattr(EmailService, "send_verification_email", staticmethod(fake))
    _make_user(db_session, "Needs.Verify@example.com", verified=False)
    r = client.post("/api/v1/auth/resend-verification", json={"email": "needs.verify@example.com"})
    assert r.status_code == 200
    assert sent == ["Needs.Verify@example.com"]


def test_no_exact_case_user_email_lookup_left_in_the_auth_router():
    """Every sign-in lookup goes through utils.emails.find_users_by_email."""
    src = Path(inspect.getsourcefile(auth_router)).read_text(encoding="utf-8")
    assert not re.search(r"User\.email\s*==", src), "use find_users_by_email (case-insensitive)"


# ── forgot-password: sends happen after the response (M1) ────────────────────

def test_forgot_password_emails_are_scheduled_as_background_tasks(client, db_session, monkeypatch):
    """The sends must not run inside the request: the handler only schedules them."""
    from fastapi import BackgroundTasks
    scheduled = []

    def spy(self, func, *args, **kwargs):
        scheduled.append((func.__name__, func, args, kwargs))
        # do NOT run anything: if the handler awaited the sender itself this would show
        return None

    monkeypatch.setattr(BackgroundTasks, "add_task", spy)
    sent = []

    async def boom(*a, **k):
        sent.append(a)

    monkeypatch.setattr(EmailService, "send_password_reset_email", staticmethod(boom))
    monkeypatch.setattr(EmailService, "send_social_signin_email", staticmethod(boom), raising=False)

    _make_user(db_session, "bg.pw@example.com")
    social = _make_user(db_session, "bg.social@example.com", password=None)
    _link(db_session, social, "google")

    for addr in ("bg.pw@example.com", "bg.social@example.com", "bg.unknown@example.com"):
        r = _forgot(client, addr)
        assert r.status_code == 200
    assert sent == [], "no email may be sent inside the request"
    names = [n for n, *_ in scheduled]
    assert names == ["_send_quietly", "_send_quietly"]  # pw account + social account, none for unknown
    (_, _, args1, _), (_, _, args2, _) = scheduled
    assert args1[0] is boom or getattr(args1[0], "__name__", "") == "boom"
    assert args1[1] == "bg.pw@example.com" and args2[1] == "bg.social@example.com"
    assert args2[2] == ["Google"]


def test_forgot_password_response_unchanged_when_the_sender_raises(client, db_session, monkeypatch):
    async def down(*a, **k):
        raise RuntimeError("Resend is down")

    monkeypatch.setattr(EmailService, "send_password_reset_email", staticmethod(down))
    monkeypatch.setattr(EmailService, "send_social_signin_email", staticmethod(down), raising=False)

    _make_user(db_session, "down.pw@example.com")
    social = _make_user(db_session, "down.social@example.com", password=None)
    _link(db_session, social, "apple")

    responses = [
        _forgot(client, "down.pw@example.com"),
        _forgot(client, "down.social@example.com"),
        _forgot(client, "down.unknown@example.com"),
    ]
    assert {r.status_code for r in responses} == {200}
    assert len({r.text for r in responses}) == 1


def test_forgot_password_one_failing_send_does_not_stop_the_other_twin(client, db_session, monkeypatch):
    delivered = []

    async def flaky_reset(to_email, reset_link, brand=None):
        if to_email.startswith("Flaky"):
            raise RuntimeError("boom")
        delivered.append(to_email)

    monkeypatch.setattr(EmailService, "send_password_reset_email", staticmethod(flaky_reset))
    _make_user(db_session, "Flaky.Twin@example.com")
    _make_user(db_session, "flaky.twin@example.com")
    r = _forgot(client, "flaky.twin@example.com")
    assert r.status_code == 200
    assert delivered == ["flaky.twin@example.com"]


# ── inactive twins never shadow an active account (M4) ───────────────────────

def test_login_inactive_twin_sorted_first_does_not_hide_the_active_twin(client, db_session):
    inactive = _make_user(db_session, "Shadow.Twin@example.com", password=PASSWORD, active=False)
    active = _make_user(db_session, "shadow.twin@example.com", password=PASSWORD, active=True)
    # exact-typed-case order puts the inactive one first
    from app.utils.emails import find_users_by_email
    assert find_users_by_email(db_session, "Shadow.Twin@example.com")[0].id == inactive.id

    r = _login(client, "Shadow.Twin@example.com", PASSWORD)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["id"] == str(active.id)


def test_login_only_inactive_accounts_still_403(client, db_session):
    _make_user(db_session, "All.Gone@example.com", active=False)
    _make_user(db_session, "all.gone@example.com", active=False)
    assert _login(client, "all.gone@example.com").status_code == 403


def test_forgot_password_skips_an_inactive_twin_when_an_active_one_exists(client, db_session, mails):
    _make_user(db_session, "Skip.Inactive@example.com", active=False)
    _make_user(db_session, "skip.inactive@example.com", active=True)
    assert _forgot(client, "skip.inactive@example.com").status_code == 200
    assert [t for t, _l, _b in mails.reset] == ["skip.inactive@example.com"]


def test_forgot_password_all_inactive_still_mails_as_before(client, db_session, mails):
    _make_user(db_session, "only.inactive@example.com", active=False)
    _forgot(client, "only.inactive@example.com")
    assert [t for t, _l, _b in mails.reset] == ["only.inactive@example.com"]


def test_oauth_skips_an_inactive_twin_when_an_active_verified_one_exists(client, db_session, monkeypatch):
    _make_user(db_session, "Oauth.Shadow@example.com", verified=True, active=False)
    live = _make_user(db_session, "oauth.shadow@example.com", verified=True, active=True)
    _patch_verify(monkeypatch, "google", "OAUTH.SHADOW@example.com", sub="g-shadow")
    r = _oauth(client, "google")
    assert r.status_code == 200, r.text
    assert r.json()["user"]["id"] == str(live.id)
