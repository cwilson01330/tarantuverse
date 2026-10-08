"""Keeper-defined animal locations — one canonical spelling per keeper.

A location is where an animal physically lives: "Spider room", "Rack 2",
"Office shelf". It exists so Collection and Feeding Day can be walked in the
order a keeper walks their house. It is free text, but free text that is
allowed to drift becomes clutter: "spider room", "Spider Room" and
"Spider room " are one place, and if the app files them as three, a keeper
with a big collection ends up with a list of near-duplicates and stops using
the feature. So every write — create, edit, bulk-assign, import — goes through
`canonical_location`, and grouping reads compare `location_key`.

Rules (pinned by tests/test_locations.py):
  * trim, collapse internal whitespace, strip trailing punctuation
  * blank → None (no empty-string locations)
  * cap at MAX_LOCATION_LEN characters (a location is a label, not a note)
  * snap to the keeper's EXISTING spelling when one matches case-insensitively:
    the first spelling a keeper uses wins, everything after it conforms

SCOPES. A keeper's location vocabulary is per keeper AND per product: Tarantuverse
and Herpetoverse are separate apps over one account, so "Rack 1" in the spider
room and "Rack 1" in the reptile room are different places. Every DB-touching
helper takes `scope` ("tarantuverse" by default, or "herpetoverse") which picks
the tables it looks at — the text rules above are shared, only the row set
differs. Tarantuverse = inverts + colonies; Herpetoverse = animals.
"""
from __future__ import annotations

import re
from typing import Iterable, List, Optional
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

MAX_LOCATION_LEN = 40

_WS = re.compile(r"\s+")
_TRAILING_PUNCT = re.compile(r"[\s.,;:!\-_/\\]+$")


def normalize_location(raw: Optional[str]) -> Optional[str]:
    """Pure text cleanup, no DB. Returns None for blank input."""
    if raw is None:
        return None
    text = _WS.sub(" ", str(raw)).strip()
    text = _TRAILING_PUNCT.sub("", text).strip()
    if not text:
        return None
    if len(text) > MAX_LOCATION_LEN:
        text = text[:MAX_LOCATION_LEN].rstrip()
    return text or None


def location_key(value: Optional[str]) -> Optional[str]:
    """The grouping key: lower-cased canonical text. None stays None."""
    norm = normalize_location(value)
    return norm.lower() if norm else None


SCOPE_TARANTUVERSE = "tarantuverse"
SCOPE_HERPETOVERSE = "herpetoverse"


def _location_models(scope: str = SCOPE_TARANTUVERSE):
    """The tables whose `location` column makes up this scope's vocabulary."""
    # Imported lazily: utils must not import models at module load (circular
    # import through app.models.__init__).
    if scope == SCOPE_HERPETOVERSE:
        from app.models.animal import Animal

        return (Animal,)
    if scope != SCOPE_TARANTUVERSE:
        raise ValueError(f"unknown location scope: {scope!r}")
    from app.models.invert import Invert
    from app.models.colony import Colony

    return (Invert, Colony)


def existing_locations(
    db: Session, user_id: UUID | str, scope: str = SCOPE_TARANTUVERSE
) -> List[str]:
    """Every distinct location spelling this keeper has on file in this scope
    (animals and colonies for TV, animals for HV), in the spelling actually
    stored."""
    seen: dict[str, str] = {}
    for model in _location_models(scope):
        rows = (
            db.query(model.location)
            .filter(model.user_id == user_id, model.location.isnot(None))
            .distinct()
            .all()
        )
        for (value,) in rows:
            key = location_key(value)
            if key and key not in seen:
                seen[key] = value
    return list(seen.values())


def snap_to_existing(value: Optional[str], existing: Iterable[str]) -> Optional[str]:
    """Return the existing spelling that matches `value` case-insensitively,
    else the normalised value itself."""
    norm = normalize_location(value)
    if norm is None:
        return None
    key = norm.lower()
    for candidate in existing:
        if candidate is not None and candidate.lower() == key:
            return candidate
    return norm


def canonical_location(
    db: Session, user_id: UUID | str, raw: Optional[str], scope: str = SCOPE_TARANTUVERSE
) -> Optional[str]:
    """The value to STORE for this keeper: normalised, then snapped to their
    existing spelling (in this scope) if they already have this place on file."""
    norm = normalize_location(raw)
    if norm is None:
        return None
    return snap_to_existing(norm, existing_locations(db, user_id, scope))


def list_locations(
    db: Session, user_id: UUID | str, scope: str = SCOPE_TARANTUVERSE
) -> List[dict]:
    """[{name, count}] alphabetical. Deceased and transferred-out animals are
    excluded from the counts — they no longer live anywhere — but an inactive
    colony's location still counts so a keeper can see the label is in use
    before renaming it. Tarantuverse = animals + colonies; Herpetoverse =
    animals."""
    counts: dict[str, dict] = {}

    rows: list = []
    for model in _location_models(scope):
        query = db.query(model.location, func.count(model.id)).filter(
            model.user_id == user_id, model.location.isnot(None)
        )
        if hasattr(model, "died_at"):
            # Animal rows (inverts / animals) carry the lifecycle columns;
            # colonies don't, and keep counting.
            query = query.filter(
                model.transferred_out_at.is_(None), model.died_at.is_(None)
            )
        rows.extend(query.group_by(model.location).all())
    for value, n in rows:
        key = location_key(value)
        if not key:
            continue
        entry = counts.setdefault(key, {"name": value, "count": 0})
        entry["count"] += int(n)
    return sorted(counts.values(), key=lambda e: e["name"].lower())


def rename_location(
    db: Session, user_id: UUID | str, old: str, new: str, scope: str = SCOPE_TARANTUVERSE
) -> int:
    """Rename every animal (+ colony, on Tarantuverse) at `old` to `new` for
    this keeper, within one scope.

    Renaming onto a name that already exists is a MERGE: the target's existing
    spelling wins and both groups end up under it. Returns rows changed.
    Does not commit — the caller owns the transaction.
    """
    old_key = location_key(old)
    if old_key is None:
        return 0
    target = canonical_location(db, user_id, new, scope)
    if target is None:
        return 0
    moved = 0
    for model in _location_models(scope):
        moved += (
            db.query(model)
            .filter(model.user_id == user_id, func.lower(model.location) == old_key)
            .update({model.location: target}, synchronize_session=False)
        )
    return moved
