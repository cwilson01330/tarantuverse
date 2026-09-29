"""Stateless, short-lived tokens for rendering a share card.

The renderer (on the web app) fetches card DATA with this token and nothing
else — no login. So the token is the capability: HMAC-signed with a key
derived from API_SECRET_KEY (domain-separated from the invite-code key), and
dead after 15 minutes. No table: a token that outlives its use is harmless
once expired, and nothing needs revoking.
"""
import base64
import hashlib
import hmac
import json
import time
from typing import Optional

from app.config import settings


def _key() -> bytes:
    return hashlib.sha256(f"share-card-render|{settings.API_SECRET_KEY}".encode()).digest()


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sign_render_token(payload: dict, ttl_seconds: int = 900, now: Optional[float] = None) -> str:
    body = dict(payload, exp=int((now if now is not None else time.time()) + ttl_seconds))
    raw = json.dumps(body, separators=(",", ":"), sort_keys=True).encode()
    sig = hmac.new(_key(), raw, hashlib.sha256).digest()
    return f"{_b64(raw)}.{_b64(sig)}"


def verify_render_token(token: str, now: Optional[float] = None) -> Optional[dict]:
    try:
        body_b64, sig_b64 = token.split(".")
        raw = _unb64(body_b64)
        if not hmac.compare_digest(hmac.new(_key(), raw, hashlib.sha256).digest(), _unb64(sig_b64)):
            return None
        body = json.loads(raw)
    except (ValueError, TypeError, json.JSONDecodeError):
        return None
    if not isinstance(body, dict) or body.get("exp", 0) < (now if now is not None else time.time()):
        return None
    return body
