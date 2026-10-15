"""
Sign in with Apple: authorization-code exchange and token revocation.

WHY THIS EXISTS
---------------
App Store guideline 5.1.1(v): an app that offers Sign in with Apple and lets
people delete their account must REVOKE the user's Apple tokens when the
account is deleted. Revocation needs a refresh token, and a refresh token only
comes from exchanging the one-time `authorizationCode` that
expo-apple-authentication hands the client at sign-in. The identity token
alone (all the clients used to send) can't be revoked.

FLOW
----
  sign-in  : client sends `authorization_code` next to the identity token.
             After the identity token is verified, the code is exchanged at
             https://appleid.apple.com/auth/token (client_id = the bundle id
             in the identity token's `aud`), and the refresh token is stored,
             encrypted, on the user's apple `user_oauth_accounts` row.
  deletion : every stored apple refresh token is revoked at
             https://appleid.apple.com/auth/revoke BEFORE the account rows go.
             Unlinking Apple revokes too.

NEVER BLOCKING
--------------
Nothing here may fail a sign-in or a deletion. A missing config, an Apple
outage or a bad code is logged and the caller carries on — exactly what
happened before this module existed.

STORAGE
-------
The refresh token is a long-lived credential, so it is stored Fernet-encrypted
with a key derived from API_SECRET_KEY, together with the client id it belongs
to (revocation must use the same client id). Rotating API_SECRET_KEY makes the
stored tokens unreadable; revocation then logs a warning and the deletion
still goes ahead.

CONFIG (env)
------------
APPLE_SIWA_TEAM_ID, APPLE_SIWA_KEY_ID, APPLE_SIWA_PRIVATE_KEY (.p8 contents).
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import time
from typing import Any, Dict, Iterable, List, Optional

import httpx
from cryptography.fernet import Fernet, InvalidToken
from jose import jwt

from app.config import settings

logger = logging.getLogger(__name__)

APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token"
APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke"
APPLE_AUDIENCE = "https://appleid.apple.com"

# Stored-value prefix, so a future format change can be told apart.
_STORED_PREFIX = "siwa1:"

# Tests swap this for an httpx.MockTransport. None = real network.
_transport: Optional[httpx.AsyncBaseTransport] = None
_TIMEOUT_SECONDS = 10.0


# ── Config / client secret ───────────────────────────────────────────────────

def _private_key() -> str:
    raw = (settings.APPLE_SIWA_PRIVATE_KEY or "").strip()
    # Render env vars often hold the .p8 with literal "\n" sequences.
    return raw.replace("\\n", "\n")


def is_configured() -> bool:
    return bool(
        (settings.APPLE_SIWA_TEAM_ID or "").strip()
        and (settings.APPLE_SIWA_KEY_ID or "").strip()
        and _private_key()
    )


def make_client_secret(client_id: str, *, now: Optional[int] = None) -> str:
    """The ES256 JWT Apple accepts as `client_secret` (max 6 months; we mint
    a fresh 5-minute one per call)."""
    issued = int(now if now is not None else time.time())
    claims = {
        "iss": settings.APPLE_SIWA_TEAM_ID.strip(),
        "iat": issued,
        "exp": issued + 300,
        "aud": APPLE_AUDIENCE,
        "sub": client_id,
    }
    return jwt.encode(
        claims,
        _private_key(),
        algorithm="ES256",
        headers={"kid": settings.APPLE_SIWA_KEY_ID.strip()},
    )


# ── Encrypted storage ────────────────────────────────────────────────────────

def _fernet() -> Fernet:
    digest = hashlib.sha256(
        b"tarantuverse:siwa-refresh-token:v1:" + settings.API_SECRET_KEY.encode()
    ).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def seal_refresh_token(client_id: str, refresh_token: str) -> str:
    payload = json.dumps({"c": client_id, "t": refresh_token}).encode()
    return _STORED_PREFIX + _fernet().encrypt(payload).decode()


def open_refresh_token(stored: Optional[str]) -> Optional[Dict[str, str]]:
    """Return {"client_id", "refresh_token"} or None if absent/unreadable."""
    if not stored or not stored.startswith(_STORED_PREFIX):
        return None
    try:
        data = json.loads(_fernet().decrypt(stored[len(_STORED_PREFIX):].encode()))
    except (InvalidToken, ValueError):
        logger.warning("[siwa] stored Apple refresh token could not be decrypted")
        return None
    if not data.get("c") or not data.get("t"):
        return None
    return {"client_id": data["c"], "refresh_token": data["t"]}


# ── HTTP ─────────────────────────────────────────────────────────────────────

async def _post(url: str, data: Dict[str, str]) -> httpx.Response:
    async with httpx.AsyncClient(transport=_transport, timeout=_TIMEOUT_SECONDS) as client:
        return await client.post(url, data=data)


async def exchange_authorization_code(
    code: str, client_id: str, expected_sub: Optional[str] = None
) -> Optional[str]:
    """Exchange a sign-in authorization code for a refresh token.

    Returns the refresh token, or None (logged) on any failure. When
    `expected_sub` is given, the `sub` in Apple's returned id_token must match
    it, so a code from a different Apple account can't be attached to this
    user.
    """
    if not code or not client_id:
        return None
    if not is_configured():
        logger.warning(
            "[siwa] APPLE_SIWA_* not configured; skipping authorization-code "
            "exchange (account deletion will not be able to revoke Apple tokens)"
        )
        return None
    try:
        resp = await _post(APPLE_TOKEN_URL, {
            "client_id": client_id,
            "client_secret": make_client_secret(client_id),
            "code": code,
            "grant_type": "authorization_code",
        })
        if resp.status_code != 200:
            logger.warning("[siwa] code exchange failed (%s): %s", resp.status_code, resp.text[:300])
            return None
        body = resp.json()
        refresh_token = body.get("refresh_token")
        if not refresh_token:
            logger.warning("[siwa] code exchange returned no refresh_token")
            return None
        if expected_sub and body.get("id_token"):
            # Straight from Apple over TLS; only the subject is compared.
            sub = jwt.get_unverified_claims(body["id_token"]).get("sub")
            if sub != expected_sub:
                logger.warning("[siwa] code exchange subject mismatch; not storing token")
                return None
        return refresh_token
    except Exception:
        logger.exception("[siwa] code exchange errored")
        return None


async def revoke_refresh_token(refresh_token: str, client_id: str) -> bool:
    """Revoke one refresh token. Returns True on success; never raises."""
    if not refresh_token or not client_id:
        return False
    if not is_configured():
        logger.warning("[siwa] APPLE_SIWA_* not configured; skipping Apple token revocation")
        return False
    try:
        resp = await _post(APPLE_REVOKE_URL, {
            "client_id": client_id,
            "client_secret": make_client_secret(client_id),
            "token": refresh_token,
            "token_type_hint": "refresh_token",
        })
        if resp.status_code != 200:
            logger.warning("[siwa] revoke failed (%s): %s", resp.status_code, resp.text[:300])
            return False
        return True
    except Exception:
        logger.exception("[siwa] revoke errored")
        return False


# ── Model-level helpers used by the auth router ──────────────────────────────

async def store_from_authorization_code(
    oauth_account: Any, code: Optional[str], verified: Dict[str, Any]
) -> bool:
    """Exchange `code` and seal the refresh token onto an apple
    UserOAuthAccount row (caller commits). Never raises."""
    if not code or oauth_account is None:
        return False
    try:
        client_id = verified.get("client_id")
        refresh_token = await exchange_authorization_code(
            code, client_id, expected_sub=verified.get("provider_account_id")
        )
        if not refresh_token:
            return False
        oauth_account.refresh_token = seal_refresh_token(client_id, refresh_token)
        return True
    except Exception:
        logger.exception("[siwa] storing Apple refresh token failed")
        return False


async def revoke_stored_tokens(stored_values: Iterable[Optional[str]]) -> int:
    """Revoke every readable stored token. Returns how many succeeded."""
    done = 0
    for stored in stored_values:
        opened = open_refresh_token(stored)
        if not opened:
            continue
        if await revoke_refresh_token(opened["refresh_token"], opened["client_id"]):
            done += 1
    return done


def stored_tokens_for_user(db: Any, user_id: Any) -> List[str]:
    """Sealed Apple refresh tokens on the user's apple oauth rows."""
    from app.models.user_oauth_account import UserOAuthAccount

    rows = db.query(UserOAuthAccount).filter(
        UserOAuthAccount.user_id == user_id,
        UserOAuthAccount.provider == "apple",
    ).all()
    return [r.refresh_token for r in rows if r.refresh_token]
