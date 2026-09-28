"""
Sitter-pass credentials (PRD-shared-keeping).

Two credentials, both deliberately incompatible with a user login:

1. The PASS TOKEN — 256 bits from `secrets.token_urlsafe(32)`, handed to the
   keeper once and carried in the URL *fragment* (`/sit#<token>`), so it never
   reaches a server log, a Referer header, or a link-preview bot. Only its
   SHA-256 hash is stored.

2. The PASS SESSION — a short-lived JWT the sitter's page gets by exchanging
   the token in a POST body. It is signed with a key DERIVED from
   API_SECRET_KEY, not with API_SECRET_KEY itself. That is the whole point:
   `get_current_user` verifies with API_SECRET_KEY, so a pass session fails
   its signature check outright — no claim-shape reasoning required, and no
   future change to user-token claims can make one pass as the other. The
   reverse holds too: a user token can never authenticate as a pass.

Every request re-loads the pass and re-checks revoked / expired / locked, so
revoking in the app takes effect on the sitter's very next request (T9).
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.sitter_pass import KeeperPass

PASS_SESSION_TTL = timedelta(hours=12)
PASS_SESSION_AUDIENCE = "sitter-pass"
PASS_SESSION_TYPE = "sitter_pass"

# One message for every way a pass can be unusable. The PRD requires the
# sitter never be told WHICH of expired / revoked / invalid it was — that
# distinction is information for someone probing links, not for a sitter.
UNAVAILABLE = "This feeding list isn't available. Ask the keeper for a new link."

_bearer = HTTPBearer(auto_error=False)


def _session_key() -> str:
    return hmac.new(
        settings.API_SECRET_KEY.encode("utf-8"),
        b"tarantuverse/sitter-pass-session/v1",
        hashlib.sha256,
    ).hexdigest()


def hash_pass_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def new_pass_token() -> tuple[str, str, str]:
    """(raw token, sha256 hex, 6-char display prefix). Persist only the last two."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_pass_token(raw), raw[:6]


def pass_is_live(p: KeeperPass, now: Optional[datetime] = None) -> bool:
    now = now or datetime.now(timezone.utc)
    return (
        p.revoked_at is None
        and p.locked_at is None
        and p.starts_at <= now < p.expires_at
        and owner_is_active(p)
    )


def owner_is_active(p: KeeperPass) -> bool:
    """A deactivated account's links die with it.

    Deactivation is what an admin does to a compromised or abusive account —
    and a deactivated keeper can't log in to revoke anything themselves, so
    leaving their links live would strand them open until expiry.
    """
    owner = getattr(p, "owner", None)
    return owner is None or bool(getattr(owner, "is_active", True))


def create_pass_session(p: KeeperPass) -> tuple[str, datetime]:
    """Short-lived session for a live pass. Never outlives the pass itself."""
    now = datetime.now(timezone.utc)
    exp = min(now + PASS_SESSION_TTL, p.expires_at)
    token = jwt.encode(
        {
            "typ": PASS_SESSION_TYPE,
            "aud": PASS_SESSION_AUDIENCE,
            "pid": str(p.id),
            # Binds the session to the LINK that minted it. Rotating a pass
            # replaces token_hash, so every session from the old link stops
            # validating on its next request — without this, rotation would
            # leave a forwarded link's sessions alive for up to 12 hours.
            "th": _token_binding(p.token_hash),
            "iat": now,
            "exp": exp,
        },
        _session_key(),
        algorithm="HS256",
    )
    return token, exp


def _token_binding(token_hash: str) -> str:
    # 64 bits of the (already one-way) hash is plenty to tell links apart and
    # reveals nothing usable about the token itself.
    return token_hash[:16]


def decode_pass_session_claims(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(
            token,
            _session_key(),
            algorithms=["HS256"],
            audience=PASS_SESSION_AUDIENCE,
        )
    except JWTError:
        return None
    if payload.get("typ") != PASS_SESSION_TYPE:
        return None
    return payload


def decode_pass_session(token: str) -> Optional[uuid.UUID]:
    payload = decode_pass_session_claims(token)
    if payload is None:
        return None
    try:
        return uuid.UUID(str(payload.get("pid")))
    except (TypeError, ValueError):
        return None


def get_current_pass(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> KeeperPass:
    """Dependency for sitter endpoints. Re-checks the pass on EVERY request."""
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=UNAVAILABLE)
    claims = decode_pass_session_claims(credentials.credentials)
    if claims is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=UNAVAILABLE)
    try:
        pass_id = uuid.UUID(str(claims.get("pid")))
    except (TypeError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=UNAVAILABLE)
    p = db.query(KeeperPass).filter(KeeperPass.id == pass_id).first()
    if (
        p is None
        or not pass_is_live(p)
        or not hmac.compare_digest(str(claims.get("th", "")), _token_binding(p.token_hash))
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=UNAVAILABLE)
    return p
