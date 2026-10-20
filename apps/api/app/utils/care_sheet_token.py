"""Stateless tokens for printable sitter care sheets (routers/care_sheets.py).

Sibling of utils/share_token.py, deliberately NOT the same key: the HMAC key
is derived from API_SECRET_KEY with its own label, so a share-card render
token can never be replayed as a care sheet (or the reverse).

The token is the whole capability — no table, nothing to revoke; it simply
dies after CARE_SHEET_TTL. It carries only ids, the owner/creator ids, units,
the keeper's timezone offset and the keeper's note; every animal fact is
re-read live when the sheet is opened.

Shape:  <b64url(zlib(json))>.<b64url(hmac_sha256)>
The body is compressed because up to 60 UUIDs plus a 500-character note
would otherwise make a URL path several kilobytes long.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import zlib
from typing import Optional, Tuple

from app.config import settings

CARE_SHEET_TTL_SECONDS = 24 * 60 * 60
# A decompressed body is never legitimately bigger than this; refusing more
# keeps a hand-made zlib bomb from costing anything.
_MAX_BODY_BYTES = 16 * 1024

EXPIRED = "expired"
INVALID = "invalid"


def _key() -> bytes:
    return hashlib.sha256(f"care-sheet|{settings.API_SECRET_KEY}".encode()).digest()


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sign_care_sheet_token(
    payload: dict, ttl_seconds: int = CARE_SHEET_TTL_SECONDS, now: Optional[float] = None
) -> Tuple[str, int]:
    """(token, exp epoch seconds)."""
    exp = int((now if now is not None else time.time()) + ttl_seconds)
    body = dict(payload, exp=exp)
    raw = zlib.compress(
        json.dumps(body, separators=(",", ":"), sort_keys=True, ensure_ascii=False).encode("utf-8"), 9
    )
    sig = hmac.new(_key(), raw, hashlib.sha256).digest()
    return f"{_b64(raw)}.{_b64(sig)}", exp


def read_care_sheet_token(token: str, now: Optional[float] = None) -> Tuple[Optional[dict], Optional[str]]:
    """(claims, None) for a good token, else (None, EXPIRED | INVALID).

    The signature is checked BEFORE anything is decompressed or parsed, so a
    forged token costs one HMAC and nothing else.
    """
    try:
        body_b64, sig_b64 = (token or "").split(".")
        raw = _unb64(body_b64)
        if not hmac.compare_digest(hmac.new(_key(), raw, hashlib.sha256).digest(), _unb64(sig_b64)):
            return None, INVALID
        d = zlib.decompressobj()
        plain = d.decompress(raw, _MAX_BODY_BYTES)
        if d.unconsumed_tail:
            return None, INVALID
        body = json.loads(plain.decode("utf-8"))
    except (ValueError, TypeError, zlib.error, UnicodeDecodeError):
        return None, INVALID
    if not isinstance(body, dict):
        return None, INVALID
    exp = body.get("exp")
    if not isinstance(exp, int) or exp < (now if now is not None else time.time()):
        return None, EXPIRED
    return body, None
