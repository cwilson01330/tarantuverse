"""
Expense tracking schemas (spec 2026-10-22 §2).

Money rules live here so every route shares them:
  * `amount` is rounded half-up to cents FIRST, then must satisfy
    0 < amount <= 100000 (so "0.004" -> 0.00 -> refused, "30.005" -> 30.01).
  * `spent_on` is between 1990-01-01 and server UTC today + 1 day (a keeper
    east of UTC is already "tomorrow").
  * `description` is trimmed, 1-120 chars; `notes` <= 500 (blank -> None).
Amounts leave the API as Decimal (Pydantic v2 serialises them as strings such
as "30.00", the same as `price_paid`).
"""
import math
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.expense import (
    EXPENSE_APPS,
    EXPENSE_CATEGORIES,
    EXPENSE_SPLIT_MODES,
    MAX_EXPENSE_SHARES,
)

EXPENSE_MAX_AMOUNT = Decimal("100000")
EXPENSE_MIN_DATE = date(1990, 1, 1)
EXPENSE_DESCRIPTION_MAX = 120
EXPENSE_NOTES_MAX = 500

_APP_PATTERN = "^(" + "|".join(EXPENSE_APPS) + ")$"
_CATEGORY_PATTERN = "^(" + "|".join(EXPENSE_CATEGORIES) + ")$"
_MODE_PATTERN = "^(" + "|".join(EXPENSE_SPLIT_MODES) + ")$"
_CENT = Decimal("0.01")
AMOUNT_TOO_LOW = "Amount must be more than $0"
AMOUNT_TOO_HIGH = "Amount can be at most $100,000.00"


# ── validators shared by create + update ─────────────────────────────────────

def clean_amount(value: Any) -> Decimal:
    """str / int / float / Decimal -> Decimal rounded half-up to cents, in range."""
    if isinstance(value, bool) or value is None:
        raise ValueError("Amount must be a number")
    try:
        # str() first so a float like 30.005 means "30.005", not its binary tail.
        d = Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        raise ValueError("Amount must be a number")
    if not d.is_finite():
        raise ValueError("Amount must be a number")
    if d <= 0:
        # Checked before quantize(): "-1e30" would otherwise overflow into "too big".
        raise ValueError(AMOUNT_TOO_LOW)
    try:
        d = d.quantize(_CENT, rounding=ROUND_HALF_UP)
    except ArithmeticError:
        # Too many digits for the 28-digit context ("1e30", 29 nines): far over the cap.
        raise ValueError(AMOUNT_TOO_HIGH)
    if d <= 0:  # "0.004" rounds to 0.00
        raise ValueError(AMOUNT_TOO_LOW)
    if d > EXPENSE_MAX_AMOUNT:
        raise ValueError(AMOUNT_TOO_HIGH)
    return d


def clean_spent_on(value: date) -> date:
    latest = datetime.now(timezone.utc).date() + timedelta(days=1)
    if value < EXPENSE_MIN_DATE:
        raise ValueError("Date can't be before 1990")
    if value > latest:
        raise ValueError("Date can't be in the future")
    return value


def _strip(value: Any) -> Any:
    return value.strip() if isinstance(value, str) else value


def _clean_notes(value: Any) -> Any:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def _non_finite(value: Any) -> bool:
    return isinstance(value, float) and not math.isfinite(value)


def _json_safe(value: Any) -> Any:
    """Make a non-finite float (bare JSON NaN / Infinity) renderable, WITHOUT
    letting it become a value.

    A 422 echoes the rejected input, and Starlette renders JSON with
    allow_nan=False, so a raw NaN in an error body turns into a 500. Anything
    non-finite is swapped for a two-item LIST, which no field accepts: not a
    str, date, UUID or number, and not the ExpenseSplitIn model (a dict would
    validate as a split with every field defaulted, i.e. mode "none", and a
    PUT would wipe the real split) nor an element of a List[UUID]. It renders
    fine in the 422 body, so a non-finite value is never stored (a plain
    str("nan") would pass a text field)."""
    if _non_finite(value):
        return ["non_finite", str(value)]
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    return value


def _sanitise_body(data: Any) -> Any:
    """`amount` alone turns a non-finite float into its text, so clean_amount
    answers "Amount must be a number"; every other field goes through _json_safe."""
    if not isinstance(data, dict):
        # A bare NaN / [NaN] body would otherwise reach the 422 echo and 500.
        return _json_safe(data)
    out = {}
    for key, val in data.items():
        if key == "amount" and _non_finite(val):
            out[key] = str(val)
        else:
            out[key] = _json_safe(val)
    return out


# ── input ────────────────────────────────────────────────────────────────────

class ExpenseSplitIn(BaseModel):
    mode: str = Field("none", pattern=_MODE_PATTERN)
    # Only read when mode == "animals". TV: invert_ids + colony_ids. HV: animal_ids.
    invert_ids: List[UUID] = Field(default_factory=list, max_length=MAX_EXPENSE_SHARES)
    colony_ids: List[UUID] = Field(default_factory=list, max_length=MAX_EXPENSE_SHARES)
    animal_ids: List[UUID] = Field(default_factory=list, max_length=MAX_EXPENSE_SHARES)
    # Only read when mode == "location".
    location: Optional[str] = Field(None, max_length=100)

    @property
    def has_ids(self) -> bool:
        return bool(self.invert_ids or self.colony_ids or self.animal_ids)


class ExpenseCreate(BaseModel):
    app: str = Field(..., pattern=_APP_PATTERN)
    # Whose collection (owner user id) when a co-keeper logs it; absent = own.
    collection: Optional[UUID] = None
    spent_on: date
    description: str = Field(..., min_length=1, max_length=EXPENSE_DESCRIPTION_MAX)
    category: str = Field(..., pattern=_CATEGORY_PATTERN)
    amount: Decimal
    notes: Optional[str] = Field(None, max_length=EXPENSE_NOTES_MAX)
    split: ExpenseSplitIn = Field(default_factory=ExpenseSplitIn)

    _strip_description = field_validator("description", mode="before")(_strip)
    _clean_notes = field_validator("notes", mode="before")(_clean_notes)

    @model_validator(mode="before")
    @classmethod
    def _no_non_finite_input(cls, data):
        return _sanitise_body(data)

    @field_validator("amount", mode="before")
    @classmethod
    def _amount(cls, v):
        return clean_amount(v)

    @field_validator("spent_on")
    @classmethod
    def _spent_on(cls, v):
        return clean_spent_on(v)


class ExpenseUpdate(BaseModel):
    """Every field optional. `notes: null` clears the notes. `split` null or
    absent = keep the current split; a split object replaces it."""
    spent_on: Optional[date] = None
    description: Optional[str] = Field(None, min_length=1, max_length=EXPENSE_DESCRIPTION_MAX)
    category: Optional[str] = Field(None, pattern=_CATEGORY_PATTERN)
    amount: Optional[Decimal] = None
    notes: Optional[str] = Field(None, max_length=EXPENSE_NOTES_MAX)
    split: Optional[ExpenseSplitIn] = None

    _strip_description = field_validator("description", mode="before")(_strip)
    _clean_notes = field_validator("notes", mode="before")(_clean_notes)

    @model_validator(mode="before")
    @classmethod
    def _no_non_finite_input(cls, data):
        return _sanitise_body(data)

    @field_validator("amount", mode="before")
    @classmethod
    def _amount(cls, v):
        return None if v is None else clean_amount(v)

    @field_validator("spent_on")
    @classmethod
    def _spent_on(cls, v):
        return None if v is None else clean_spent_on(v)

    @model_validator(mode="after")
    def _no_null_required_fields(self):
        for name in ("spent_on", "description", "category", "amount"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} can't be null")
        return self


# ── output ───────────────────────────────────────────────────────────────────

class ExpenseShareOut(BaseModel):
    # "invert" | "colony" | "animal", or None when the target was deleted.
    target_kind: Optional[str] = None
    target_id: Optional[UUID] = None
    name: str
    amount: Decimal


class ExpenseListItem(BaseModel):
    id: UUID
    spent_on: date
    description: str
    category: str
    amount: Decimal
    notes: Optional[str] = None
    split_mode: str
    split_label: Optional[str] = None
    share_count: int
    created_by_name: Optional[str] = None


class ExpenseDetail(ExpenseListItem):
    shares: List[ExpenseShareOut] = Field(default_factory=list)


class ExpenseList(BaseModel):
    items: List[ExpenseListItem]
    total: int
    can_add: bool


# ── summary + per-animal cost ────────────────────────────────────────────────

class ExpenseMonthTotal(BaseModel):
    month: str  # "YYYY-MM"
    total: Decimal


class ExpenseLocationTotal(BaseModel):
    location: str  # "No location" when the target has none
    total: Decimal


class ExpenseTopAnimal(BaseModel):
    target_kind: str  # "invert" | "colony" | "animal"
    target_id: UUID
    name: str
    total: Decimal


class ExpenseSummary(BaseModel):
    total: Decimal
    by_category: Dict[str, Decimal]
    by_month: List[ExpenseMonthTotal]
    by_location: List[ExpenseLocationTotal]
    top_animals: List[ExpenseTopAnimal]
    unallocated_total: Decimal
    can_add: bool


class AnimalCostShare(BaseModel):
    expense_id: UUID
    spent_on: date
    description: str
    category: str
    amount: Decimal  # this animal's cut, not the whole purchase


class AnimalCost(BaseModel):
    can_add: bool
    purchase_price: Optional[Decimal] = None
    shares_total: Decimal
    by_category: Dict[str, Decimal]
    total: Decimal
    shares: List[AnimalCostShare]
