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
    """Can this link be READ right now?

    A PIN lockout (`locked_at`) deliberately does NOT end reading. Whoever
    triggered it already holds the link and has already seen the list, so
    blocking reads protects nothing — it only strands the real sitter halfway
    through someone's feeding round. A lockout pauses LOGGING; see
    session_can_log and get_logging_pass. (Security review 2026-09-28, M1.)
    """
    now = now or datetime.now(timezone.utc)
    return (
        p.revoked_at is None
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


def create_pass_session(p: KeeperPass, *, logging: bool = False) -> tuple[str, datetime]:
    """Short-lived session for a live pass. Never outlives the pass itself.

    `logging=True` mints a WRITE-capable session. Only /sitter/unlock does
    that, and only after the PIN checks out. The `pb` claim binds the session
    to the PIN it was unlocked with, so changing the PIN (or turning logging
    off, which clears it) ends every write session on its next request.
    """
    now = datetime.now(timezone.utc)
    exp = min(now + PASS_SESSION_TTL, p.expires_at)
    claims = {
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
    }
    if logging:
        if not p.can_log or not p.pin_hash:
            raise ValueError("A write session needs a pass with logging on and a PIN set")
        claims["pb"] = _pin_binding(p.pin_hash)
    token = jwt.encode(claims, _session_key(), algorithm="HS256")
    return token, exp


# ── PIN (rung 2) ──────────────────────────────────────────────────────────────
#
# The PIN is the control that turns a forwarded link from "a stranger can
# falsify feeding records" into "a stranger sees a feeding list" (T1). It is
# told to the sitter SEPARATELY from the link — out loud, or in a different
# message — so one leaked message isn't enough to write.
#
# 4–6 digits is weak on its own; what makes it hold is the lockout: 5 wrong
# guesses lock the whole pass and tell the keeper (T4). An attacker needs the
# 256-bit link AND to land a 1-in-10,000 guess in 5 tries.

MAX_PIN_FAILURES = 5
_PIN_CONTEXT = b"tarantuverse/sitter-pass-pin/v1"


class WeakPinError(ValueError):
    pass


def validate_pin(pin: str) -> str:
    """Return the PIN if it's acceptable, else raise WeakPinError with a
    message a keeper can act on. Rejects the handful of PINs guessed first."""
    pin = (pin or "").strip()
    if not pin.isdigit() or not 4 <= len(pin) <= 6 or not pin.isascii():
        raise WeakPinError("Use 4 to 6 digits.")
    if len(set(pin)) == 1:
        raise WeakPinError("Pick a PIN that isn't the same digit repeated.")
    steps = {int(b) - int(a) for a, b in zip(pin, pin[1:])}
    if steps in ({1}, {-1}):
        raise WeakPinError("Pick a PIN that isn't a straight run like 1234.")
    return pin


def hash_pin(pin: str) -> str:
    from app.utils.auth import pwd_context  # bcrypt; slow on purpose

    return pwd_context.hash(validate_pin(pin))


def verify_pin(pin: str, pin_hash: Optional[str]) -> bool:
    from app.utils.auth import pwd_context

    if not pin_hash or not isinstance(pin, str) or len(pin) > 12:
        return False
    try:
        return bool(pwd_context.verify(pin.strip(), pin_hash))
    except (ValueError, TypeError):
        return False


def _pin_binding(pin_hash: str) -> str:
    # The bcrypt hash carries a fresh salt, so a new PIN — even the same
    # digits — always yields a new binding. Hashed again so no fragment of
    # the bcrypt string itself ends up in a token.
    return hmac.new(_PIN_CONTEXT, pin_hash.encode("utf-8"), hashlib.sha256).hexdigest()[:16]


def session_can_log(p: KeeperPass, claims: dict) -> bool:
    """Is this session allowed to write RIGHT NOW? Re-checked every request:
    logging turned off, PIN changed, or PIN cleared all end it immediately."""
    if not p.can_log or not p.pin_hash or p.locked_at is not None:
        return False
    return hmac.compare_digest(str(claims.get("pb", "")), _pin_binding(p.pin_hash))


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


def get_current_pass_with_claims(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> tuple[KeeperPass, dict]:
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
    return p, claims


def get_current_pass(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> KeeperPass:
    """The pass alone, for routes that don't care whether logging is unlocked."""
    return get_current_pass_with_claims(credentials=credentials, db=db)[0]


# Shown when a read session tries to write, or a write session outlived the
# PIN it was unlocked with. 403 (not 401): the link itself is still good, so
# the page should ask for the PIN again rather than say the list has ended.
PIN_NEEDED = "Enter the PIN to log feedings."
# After 5 wrong PINs. 423, not 401: the feeding list still works.
LOGGING_PAUSED = (
    "Too many wrong PINs, so logging on this link is paused. You can still see the "
    "feeding list. Ask the keeper to unlock logging."
)


def get_logging_pass(
    pc: tuple = Depends(get_current_pass_with_claims),
) -> KeeperPass:
    """Dependency for sitter WRITE endpoints: a live pass AND a session
    unlocked with the pass's current PIN AND logging still switched on."""
    p, claims = pc
    if p.locked_at is not None:
        raise HTTPException(status.HTTP_423_LOCKED, detail=LOGGING_PAUSED)
    if not session_can_log(p, claims):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=PIN_NEEDED)
    return p
