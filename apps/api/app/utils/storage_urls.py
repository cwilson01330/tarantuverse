"""Which photo links point into our own storage bucket.

The bucket has had more than one public address: every link stored before
2026-10 starts with its r2.dev address, new uploads use R2_PUBLIC_URL
(photos.tarantuverse.com). Until `rewrite_photo_urls.py` has moved every
stored link to the new address — and for as long as a stray old link exists —
code that asks "is this URL ours?" must accept both, or deleting an animal
would leave its old photos behind, the full export would skip them and share
cards would drop them.

Only an exact LEADING base counts, followed by "/". A link that merely
contains the base ("https://evil.example/https://pub-…r2.dev/…") or a
look-alike host ("https://pub-…r2.dev.evil.com/…") is never ours: photo_url
and avatar_url are free text, and these checks guard deletes and server-side
fetches.
"""
from __future__ import annotations

from typing import Iterable, Optional, Sequence, Union


def _norm(base: Optional[str]) -> str:
    return (base or "").strip().rstrip("/")


def photo_bases(primary: Optional[str] = None, legacy: Optional[str] = None) -> list[str]:
    """Every public address of our bucket, current first. Only https
    addresses are accepted; blanks and duplicates are dropped.

    With no arguments, reads R2_PUBLIC_URL and R2_LEGACY_PUBLIC_URLS — but
    only when R2 is configured (R2_PUBLIC_URL set): local dev stores
    /uploads/… paths and has no bucket address at all.
    """
    if primary is None and legacy is None:
        from app.config import settings

        primary = settings.R2_PUBLIC_URL
        if not _norm(primary):
            return []
        legacy = settings.R2_LEGACY_PUBLIC_URLS
    out: list[str] = []
    for b in [primary or "", *(legacy or "").split(",")]:
        b = _norm(b)
        if b.startswith("https://") and b not in out:
            out.append(b)
    return out


def _as_list(bases: Union[str, Sequence[str], None]) -> list[str]:
    if bases is None:
        return photo_bases()
    if isinstance(bases, str):
        bases = [bases]
    return [b for b in (_norm(x) for x in bases) if b]


def key_for_url(url: Optional[str], bases: Union[str, Sequence[str], None] = None) -> Optional[str]:
    """The bucket key a link points at, or None when it isn't ours."""
    if not url:
        return None
    for b in _as_list(bases):
        prefix = b + "/"
        if url.startswith(prefix) and len(url) > len(prefix):
            return url[len(prefix):]
    return None


def is_our_photo_url(url: Optional[str], bases: Union[str, Sequence[str], None] = None) -> bool:
    return key_for_url(url, bases) is not None


def url_variants(key: str, bases: Iterable[str]) -> list[str]:
    """The same object's link under every address — for 'is this file still
    referenced?' checks, which must match a row whatever address it stores."""
    return [f"{_norm(b)}/{key}" for b in bases if _norm(b)]
