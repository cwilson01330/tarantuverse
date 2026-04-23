"""URL slug generation helper.

Shared between the alembic backfill for `reptile_species.slug` and the
runtime `POST /reptile-species/` create path so backfill + live writes
never drift in behavior. If this ever changes, both sides move together.

Design choices
--------------
- ASCII-only. Scientific names are already Latin; common names may contain
  accented characters (e.g. "Rosé" in a morph name one day), so we fold
  diacritics with unicodedata.normalize('NFKD') before stripping non-ASCII.
  Keeps slugs safe for every URL tool, log aggregator, and analytics
  dashboard without any locale config.
- Lowercase, hyphen-separated. Matches the href pattern elsewhere in the
  app (`/app/species/ball-python` not `/app/species/Ball-Python`).
- Collapses runs of whitespace/punctuation into a single hyphen and
  trims leading/trailing hyphens — no double-hyphen artifacts, no
  trailing `-` when the source ends in punctuation.
- Idempotent: slugify(slugify(x)) == slugify(x). Needed for safe re-runs
  of the backfill and for editorial overrides that may be pre-slugged.
- Uniqueness-aware disambiguator (`slugify_unique`) — the DB has a
  unique index on `reptile_species.slug`, so on a collision we append
  `-2`, `-3`, … until we find a free slot. The caller provides the
  "is this taken?" check so we stay agnostic to migration vs runtime.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Callable


_SLUG_STRIP_RE = re.compile(r"[^a-z0-9]+")
_SLUG_TRIM_RE = re.compile(r"^-+|-+$")


def slugify(text: str) -> str:
    """Convert an arbitrary string to a URL-safe slug.

    Examples:
        >>> slugify("Ball Python")
        'ball-python'
        >>> slugify("Python regius")
        'python-regius'
        >>> slugify("  Rosy Boa — Mexican  ")
        'rosy-boa-mexican'
        >>> slugify("ball-python")   # idempotent
        'ball-python'
    """
    if not text:
        return ""
    # Fold diacritics → ASCII ("Café" → "Cafe"). NFKD decomposes; we drop combining marks.
    normalized = unicodedata.normalize("NFKD", text)
    ascii_bytes = normalized.encode("ascii", "ignore")
    ascii_str = ascii_bytes.decode("ascii").lower()
    # Replace any run of non-alphanumeric with a single hyphen
    collapsed = _SLUG_STRIP_RE.sub("-", ascii_str)
    # Strip leading/trailing hyphens
    trimmed = _SLUG_TRIM_RE.sub("", collapsed)
    return trimmed


def slugify_unique(
    text: str,
    is_taken: Callable[[str], bool],
    fallback: str = "species",
) -> str:
    """Slugify and disambiguate against an existing-slug predicate.

    Returns a slug guaranteed not-taken according to `is_taken`. If the
    source text slugifies to empty (e.g. all non-ASCII symbols), falls
    back to `fallback` before applying the disambiguator.

    Collision pattern: `ball-python`, `ball-python-2`, `ball-python-3`, …

    The caller owns the "is this taken?" check — at migration time it's
    a SQL query against rows already assigned a slug; at runtime it's
    a session query. Either way this function has no DB dependency.
    """
    base = slugify(text) or fallback
    if not is_taken(base):
        return base
    # Disambiguate. Start at 2 because the unqualified slug is "1" conceptually.
    suffix = 2
    while True:
        candidate = f"{base}-{suffix}"
        if not is_taken(candidate):
            return candidate
        suffix += 1
