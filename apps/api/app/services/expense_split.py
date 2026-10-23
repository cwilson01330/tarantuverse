"""
Expense split service (spec 2026-10-22 §1).

Two jobs, kept apart from the router so they can be tested without a request:

1. `resolve_targets` - turn a split request (mode + ids / location) into the
   ordered list of `(kind, id)` targets for the collection OWNER.
2. `divide_amount` / `build_shares` - divide the purchase to the cent.

Every set of animals comes from `active_inverts_query` / `active_colonies_query`
/ `active_animals_query` (`app.utils.limits`), the single source of truth for
"open" rows, so a died / transferred / archived / ended animal can never receive
a share. Those names are imported at module level on purpose: tests replace them
here (`app.services.expense_split.active_inverts_query`).
"""
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable, Optional, Sequence
from uuid import UUID

from fastapi import HTTPException

from app.models.expense import (
    EXPENSE_SPLIT_MODES,
    MAX_EXPENSE_SHARES,
    ExpenseShare,
)
from app.utils.limits import (
    active_animals_query,
    active_colonies_query,
    active_inverts_query,
)
from app.utils.locations import (
    SCOPE_HERPETOVERSE,
    SCOPE_TARANTUVERSE,
    canonical_location,
    location_key,
)

# (kind, id) with kind in "invert" | "colony" | "animal".
Target = tuple[str, UUID]

_CENT = Decimal("0.01")
_EPOCH = datetime.min.replace(tzinfo=timezone.utc)


def divide_amount(amount: Decimal, n: int) -> list[Decimal]:
    """Divide `amount` into `n` parts of whole cents that sum exactly to it.

    The input is first rounded half-up to cents; the first `extra` parts carry
    the leftover penny, so the same shares get it on every re-divide.
    """
    if n < 1:
        raise ValueError("n must be at least 1")
    cents = int((Decimal(amount) * 100).to_integral_value(ROUND_HALF_UP))
    base, extra = divmod(cents, n)
    return [
        (Decimal(base + (1 if i < extra else 0)) / 100).quantize(_CENT)
        for i in range(n)
    ]


def _sorted(rows: Iterable) -> list:
    """Deterministic order: created_at, then id (done in Python so the query
    needs no ORDER BY)."""
    return sorted(rows, key=lambda r: (r.created_at or _EPOCH, r.id))


def _as_uuid(value) -> Optional[UUID]:
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


def _open_rows(db, owner_id, app: str) -> tuple[list, list]:
    """(inverts or animals, colonies) - the owner's open rows, ordered."""
    if app == "tarantuverse":
        animals = _sorted(active_inverts_query(db, owner_id).all())
        colonies = _sorted(active_colonies_query(db, owner_id).all())
        return animals, colonies
    return _sorted(active_animals_query(db, owner_id).all()), []


def _targets(app: str, animals: Sequence, colonies: Sequence) -> list[Target]:
    kind = "invert" if app == "tarantuverse" else "animal"
    return [(kind, r.id) for r in animals] + [("colony", r.id) for r in colonies]


def _check_count(targets: Sequence) -> None:
    if len(targets) > MAX_EXPENSE_SHARES:
        raise HTTPException(
            400,
            f"A purchase can be split across at most {MAX_EXPENSE_SHARES} animals",
        )


def resolve_targets(
    db,
    owner_id: UUID,
    app: str,
    mode: str,
    *,
    invert_ids: Iterable = (),
    colony_ids: Iterable = (),
    animal_ids: Iterable = (),
    location: Optional[str] = None,
) -> tuple[list[Target], Optional[str]]:
    """The targets a purchase is split across, plus the `split_label`
    (the canonical location name in `location` mode, else None).

    Raises HTTPException: 400 for a bad request, 404 "Animal not found" for any
    id that isn't one of the owner's open animals / colonies in this app.
    """
    if mode not in EXPENSE_SPLIT_MODES:
        raise HTTPException(400, "Unknown split mode")
    if app not in (SCOPE_TARANTUVERSE, SCOPE_HERPETOVERSE):
        raise HTTPException(400, "Unknown app")
    if mode == "none":
        return [], None

    animals, colonies = _open_rows(db, owner_id, app)

    if mode == "collection":
        targets = _targets(app, animals, colonies)
        _check_count(targets)
        return targets, None

    if mode == "location":
        canonical = canonical_location(db, owner_id, location, app)
        if canonical is None:
            raise HTTPException(400, "No animals at that location")
        key = location_key(canonical)
        animals = [r for r in animals if location_key(r.location) == key]
        colonies = [r for r in colonies if location_key(r.location) == key]
        targets = _targets(app, animals, colonies)
        if not targets:
            raise HTTPException(400, "No animals at that location")
        _check_count(targets)
        return targets, canonical

    # mode == "animals"
    invert_ids, colony_ids, animal_ids = list(invert_ids), list(colony_ids), list(animal_ids)
    if app == "tarantuverse":
        if animal_ids:
            raise HTTPException(400, "Use invert or colony ids on Tarantuverse")
    else:
        if colony_ids:
            raise HTTPException(400, "Colonies are Tarantuverse only")
        if invert_ids:
            raise HTTPException(400, "Use animal ids on Herpetoverse")
    requested_animals = invert_ids if app == "tarantuverse" else animal_ids

    wanted_animals = {_as_uuid(i) for i in requested_animals}
    wanted_colonies = {_as_uuid(i) for i in colony_ids}
    if not wanted_animals and not wanted_colonies:
        raise HTTPException(400, "Pick at least one animal")
    _check_count(list(wanted_animals) + list(wanted_colonies))

    open_animals = {r.id for r in animals}
    open_colonies = {r.id for r in colonies}
    if not wanted_animals <= open_animals or not wanted_colonies <= open_colonies:
        raise HTTPException(404, "Animal not found")

    animals = [r for r in animals if r.id in wanted_animals]
    colonies = [r for r in colonies if r.id in wanted_colonies]
    return _targets(app, animals, colonies), None


def build_shares(amount: Decimal, targets: list[Target]) -> list[ExpenseShare]:
    """Unsaved `ExpenseShare` rows (no expense_id yet), positions 0..n-1,
    the amount divided to the cent in target order."""
    if not targets:
        return []
    parts = divide_amount(amount, len(targets))
    column = {"invert": "invert_id", "colony": "colony_id", "animal": "animal_id"}
    shares = []
    for position, ((kind, target_id), part) in enumerate(zip(targets, parts)):
        shares.append(ExpenseShare(**{column[kind]: target_id}, amount=part, position=position))
    return shares
