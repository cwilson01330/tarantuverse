"""Which app a keeper came from, for links and branding in auth emails.

Tarantuverse and Herpetoverse share one API and one user table, so an auth
email only knows which product to name — and which site to link back to —
if the client says so. Clients pass `frontend_url`; it is honored only if it
is on this allowlist, and anything else falls back to the default
`FRONTEND_URL`. It never raises: a stale or odd client must not be able to
turn a sensitive flow (reset, verification) into a 4xx.

Before this module the allowlist lived inline in forgot-password only, so a
Herpetoverse signup got a verification email titled "Tarantuverse" that
linked to tarantuverse.com — a site a reptile keeper has never heard of,
which reads as phishing and gets ignored.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

from app.config import settings

TRUSTED_FRONTEND_ORIGINS = frozenset({
    "https://tarantuverse.com",
    "https://www.tarantuverse.com",
    "https://herpetoverse.com",
    "https://www.herpetoverse.com",
})


@dataclass(frozen=True)
class Brand:
    name: str
    # Button colour in the email. Herpetoverse uses its deep green rather than
    # the primary #00C853: white text on the primary fails contrast.
    button_hex: str


TARANTUVERSE = Brand(name="Tarantuverse", button_hex="#7c3aed")
HERPETOVERSE = Brand(name="Herpetoverse", button_hex="#0B6B3A")


def resolve_frontend_origin(requested: Optional[str]) -> str:
    """The allowlisted origin the client asked for, else the default."""
    candidate = (requested or "").strip().rstrip("/")
    if candidate in TRUSTED_FRONTEND_ORIGINS:
        return candidate
    return settings.FRONTEND_URL.rstrip("/")


def brand_for_origin(origin: str) -> Brand:
    host = (urlparse(origin).hostname or "").lower()
    if host == "herpetoverse.com" or host.endswith(".herpetoverse.com"):
        return HERPETOVERSE
    return TARANTUVERSE
