"""Sign in with Apple token revocation (App Store guideline 5.1.1(v), 2026-10-12).

Sign-in exchanges the optional authorization code for a refresh token and
stores it encrypted on the apple oauth row; account deletion revokes it first.
None of it may ever block a sign-in or a deletion.
"""
import asyncio
import json
import uuid
from types import SimpleNamespace as NS
from unittest.mock import MagicMock

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from jose import jwt

from app.config import settings
from app.routers import auth as auth_router
from app.services import apple_siwa

TV_BUNDLE = "com.tarantuverse.app"
HV_BUNDLE = "com.herpetoverse.app"


def _pem() -> str:
    key = ec.generate_private_key(ec.SECP256R1())
    return key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, "APPLE_SIWA_TEAM_ID", "TEAM123456")
    monkeypatch.setattr(settings, "APPLE_SIWA_KEY_ID", "KEY1234567")
    monkeypatch.setattr(settings, "APPLE_SIWA_PRIVATE_KEY", _pem())


@pytest.fixture
def unconfigured(monkeypatch):
    for k in ("APPLE_SIWA_TEAM_ID", "APPLE_SIWA_KEY_ID", "APPLE_SIWA_PRIVATE_KEY"):
        monkeypatch.setattr(settings, k, "")


@pytest.fixture
def apple(monkeypatch):
    """Records every request to Apple; `respond` decides the reply."""
    calls = []
    state = {"respond": lambda req: httpx.Response(200, json={})}

    def handler(request: httpx.Request):
        form = dict(httpx.QueryParams(request.content.decode()))
        calls.append((str(request.url), form))
        return state["respond"](request)

    monkeypatch.setattr(apple_siwa, "_transport", httpx.MockTransport(handler))
    return NS(calls=calls, state=state)


def _id_token(sub: str) -> str:
    return jwt.encode({"sub": sub}, "x", algorithm="HS256")


def run(coro):
    return asyncio.run(coro)


# ── client secret ────────────────────────────────────────────────────────────

def test_client_secret_is_es256_for_the_bundle(configured):
    secret = apple_siwa.make_client_secret(HV_BUNDLE, now=1_700_000_000)
    assert jwt.get_unverified_header(secret) == {"alg": "ES256", "kid": "KEY1234567", "typ": "JWT"}
    claims = jwt.get_unverified_claims(secret)
    assert claims["iss"] == "TEAM123456"
    assert claims["sub"] == HV_BUNDLE
    assert claims["aud"] == "https://appleid.apple.com"
    assert claims["exp"] - claims["iat"] <= 300


def test_escaped_newlines_in_env_key_still_sign(monkeypatch, configured):
    monkeypatch.setattr(settings, "APPLE_SIWA_PRIVATE_KEY", _pem().replace("\n", "\\n"))
    assert apple_siwa.make_client_secret(TV_BUNDLE)


# ── storage ──────────────────────────────────────────────────────────────────

def test_sealed_token_round_trips_and_is_not_plaintext():
    sealed = apple_siwa.seal_refresh_token(TV_BUNDLE, "r.secret.token")
    assert "r.secret.token" not in sealed and sealed.startswith("siwa1:")
    assert apple_siwa.open_refresh_token(sealed) == {
        "client_id": TV_BUNDLE, "refresh_token": "r.secret.token",
    }
    assert apple_siwa.open_refresh_token(None) is None
    assert apple_siwa.open_refresh_token("plain-legacy-value") is None
    assert apple_siwa.open_refresh_token("siwa1:garbage") is None


# ── sign-in exchange ─────────────────────────────────────────────────────────

def test_exchange_stores_encrypted_token_for_the_issuing_bundle(configured, apple):
    apple.state["respond"] = lambda req: httpx.Response(
        200, json={"refresh_token": "r.abc", "id_token": _id_token("apple-sub-1")}
    )
    row = NS(refresh_token=None)
    verified = {"provider_account_id": "apple-sub-1", "client_id": HV_BUNDLE}

    assert run(apple_siwa.store_from_authorization_code(row, "code-xyz", verified)) is True

    url, form = apple.calls[0]
    assert url == apple_siwa.APPLE_TOKEN_URL
    assert form["grant_type"] == "authorization_code"
    assert form["code"] == "code-xyz"
    assert form["client_id"] == HV_BUNDLE
    assert jwt.get_unverified_claims(form["client_secret"])["sub"] == HV_BUNDLE
    assert apple_siwa.open_refresh_token(row.refresh_token) == {
        "client_id": HV_BUNDLE, "refresh_token": "r.abc",
    }


def test_exchange_for_a_different_apple_account_is_not_stored(configured, apple):
    apple.state["respond"] = lambda req: httpx.Response(
        200, json={"refresh_token": "r.abc", "id_token": _id_token("someone-else")}
    )
    row = NS(refresh_token=None)
    verified = {"provider_account_id": "apple-sub-1", "client_id": TV_BUNDLE}
    assert run(apple_siwa.store_from_authorization_code(row, "code", verified)) is False
    assert row.refresh_token is None


def test_exchange_error_never_raises(configured, apple):
    apple.state["respond"] = lambda req: httpx.Response(400, json={"error": "invalid_grant"})
    row = NS(refresh_token=None)
    assert run(apple_siwa.store_from_authorization_code(
        row, "code", {"provider_account_id": "s", "client_id": TV_BUNDLE})) is False

    def boom(req):
        raise httpx.ConnectError("down")
    apple.state["respond"] = boom
    assert run(apple_siwa.store_from_authorization_code(
        row, "code", {"provider_account_id": "s", "client_id": TV_BUNDLE})) is False
    assert row.refresh_token is None


def test_missing_config_skips_exchange_and_revoke(unconfigured, apple, caplog):
    row = NS(refresh_token=None)
    assert run(apple_siwa.store_from_authorization_code(
        row, "code", {"provider_account_id": "s", "client_id": TV_BUNDLE})) is False
    sealed = apple_siwa.seal_refresh_token(TV_BUNDLE, "r.abc")
    assert run(apple_siwa.revoke_stored_tokens([sealed])) == 0
    assert apple.calls == []
    assert "not configured" in caplog.text


def test_no_code_means_no_call(configured, apple):
    row = NS(refresh_token=None)
    assert run(apple_siwa.store_from_authorization_code(
        row, None, {"provider_account_id": "s", "client_id": TV_BUNDLE})) is False
    assert apple.calls == []


def test_oauth_login_and_link_pass_the_code_through():
    import inspect
    login = inspect.getsource(auth_router.oauth_login)
    assert "apple_siwa.store_from_authorization_code" in login
    assert '"authorization_code"' in login and '"authorizationCode"' in login
    link = inspect.getsource(auth_router.link_account_direct)
    assert "apple_siwa.store_from_authorization_code" in link


def test_verified_apple_claims_name_the_issuing_bundle(monkeypatch):
    from app.services import oauth_verification as ov
    monkeypatch.setattr(settings, "APPLE_OAUTH_CLIENT_IDS", f"{TV_BUNDLE},{HV_BUNDLE}")
    monkeypatch.setattr(ov, "_decode_with_jwks", lambda *a, **k: {
        "sub": "s1", "email": "a@b.c", "aud": HV_BUNDLE, "iss": ov.APPLE_ISSUER,
    })
    assert ov.verify_apple_identity_token("t")["client_id"] == HV_BUNDLE


# ── account deletion ─────────────────────────────────────────────────────────

def _delete_with(monkeypatch, stored):
    """Run DELETE /auth/me against a mock session; return (result, db, order)."""
    order = []
    db = MagicMock()
    db.commit.side_effect = lambda: order.append("commit")
    monkeypatch.setattr(apple_siwa, "stored_tokens_for_user", lambda _db, _uid: stored)
    real_revoke = apple_siwa.revoke_stored_tokens

    async def tracking_revoke(values):
        order.append("revoke")
        return await real_revoke(values)
    monkeypatch.setattr(apple_siwa, "revoke_stored_tokens", tracking_revoke)
    monkeypatch.setattr(auth_router, "collect_for_user", lambda _db, _uid: [])

    async def no_files(_db, _files):
        return None
    monkeypatch.setattr(auth_router, "delete_files", no_files)
    import app.models.collection_member as cm
    monkeypatch.setattr(cm, "end_memberships_of", lambda _db, _uid: None)

    user = NS(id=uuid.uuid4())
    result = run(auth_router.delete_account(current_user=user, db=db))
    return result, db, order


def test_deletion_revokes_the_stored_token_first(monkeypatch, configured, apple):
    sealed = apple_siwa.seal_refresh_token(TV_BUNDLE, "r.abc")
    result, db, order = _delete_with(monkeypatch, [sealed])

    assert result == {"message": "Account deleted successfully"}
    assert order == ["revoke", "commit"]
    url, form = apple.calls[0]
    assert url == apple_siwa.APPLE_REVOKE_URL
    assert form["token"] == "r.abc"
    assert form["token_type_hint"] == "refresh_token"
    assert form["client_id"] == TV_BUNDLE


def test_apple_error_does_not_block_deletion(monkeypatch, configured, apple):
    apple.state["respond"] = lambda req: httpx.Response(500, text="nope")
    sealed = apple_siwa.seal_refresh_token(TV_BUNDLE, "r.abc")
    result, db, order = _delete_with(monkeypatch, [sealed])
    assert result == {"message": "Account deleted successfully"}
    assert "commit" in order and len(apple.calls) == 1


def test_apple_outage_does_not_block_deletion(monkeypatch, configured, apple):
    def boom(req):
        raise httpx.ConnectTimeout("timeout")
    apple.state["respond"] = boom
    sealed = apple_siwa.seal_refresh_token(TV_BUNDLE, "r.abc")
    result, _db, order = _delete_with(monkeypatch, [sealed])
    assert result == {"message": "Account deleted successfully"}
    assert "commit" in order


def test_deletion_without_config_still_deletes(monkeypatch, unconfigured, apple):
    sealed = apple_siwa.seal_refresh_token(TV_BUNDLE, "r.abc")
    result, _db, order = _delete_with(monkeypatch, [sealed])
    assert result == {"message": "Account deleted successfully"}
    assert apple.calls == [] and "commit" in order


def test_deletion_survives_a_failing_token_lookup(monkeypatch, configured, apple):
    def broken(_db, _uid):
        raise RuntimeError("db hiccup")
    db = MagicMock()
    monkeypatch.setattr(apple_siwa, "stored_tokens_for_user", broken)
    monkeypatch.setattr(auth_router, "collect_for_user", lambda _db, _uid: [])

    async def no_files(_db, _files):
        return None
    monkeypatch.setattr(auth_router, "delete_files", no_files)
    import app.models.collection_member as cm
    monkeypatch.setattr(cm, "end_memberships_of", lambda _db, _uid: None)
    result = run(auth_router.delete_account(current_user=NS(id=uuid.uuid4()), db=db))
    assert result == {"message": "Account deleted successfully"}
    db.commit.assert_called()
