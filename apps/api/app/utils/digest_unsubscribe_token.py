"""Signed one-click unsubscribe tokens for the daily email digest.

Sibling of utils/care_sheet_token.py and utils/share_token.py, deliberately NOT
the same key: the HMAC key is derived from API_SECRET_KEY with its own label, so
a care-sheet or share-card token can never be replayed as an unsubscribe (or the
reverse).

The token carries only the user id and never expires: an unsubscribe link in an
old email must keep working. All it can do is switch `email_digest_enabled` off
for that one account, so a leaked link is a nuisance at worst, never access.

Shape:  <b64url(16-byte user uuid)>.<b64url(hmac_sha256(body))>
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import uuid
from typing import Optional

from app.config import settings


def _key() -> bytes:
    return hashlib.sha256(f"digest-unsub|{settings.API_SECRET_KEY}".encode()).digest()


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def make_unsubscribe_token(user_id: uuid.UUID) -> str:
    body = uuid.UUID(str(user_id)).bytes
    sig = hmac.new(_key(), body, hashlib.sha256).digest()
    return f"{_b64(body)}.{_b64(sig)}"


def read_unsubscribe_token(token: str) -> Optional[uuid.UUID]:
    """The user id for a genuine token, else None (tampered, foreign key, junk)."""
    try:
        body_b64, sig_b64 = (token or "").split(".")
        body = _unb64(body_b64)
        sig = _unb64(sig_b64)
        if len(body) != 16:
            return None
        if not hmac.compare_digest(hmac.new(_key(), body, hashlib.sha256).digest(), sig):
            return None
        return uuid.UUID(bytes=body)
    except (ValueError, TypeError):
        return None
