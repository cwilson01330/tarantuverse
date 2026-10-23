"""Expense tracking (spec 2026-10-22).

What a keeper spends on the hobby: a purchase (substrate, a vet visit) is
logged once and may be left whole or divided across animals / colonies, a
location, or the whole collection. One ledger per app.

  GET    /api/v1/expenses/        list (newest first) + `can_add`
  POST   /api/v1/expenses/        create (premium)           -> 201
  GET    /api/v1/expenses/{id}    detail with per-target shares
  PUT    /api/v1/expenses/{id}    edit (premium)
  DELETE /api/v1/expenses/{id}    delete                     -> 204

ACCESS: owner and keeper-role co-keepers only (`need="keeper"`): a stranger
gets 404, a logger / viewer / keeper of a lapsed owner (resolved to viewer)
gets 403 — all straight from `utils/access`. Rows always belong to the
collection OWNER (`owner_id`); `created_by` is whoever typed it in.

PREMIUM is the OWNER's plan for the app (`owner.is_premium_for_app`), so a
free co-keeper can log into a premium owner's ledger. Only create and update
need it; reading, deleting and exporting stay open after a lapse.

Expense data is deliberately never read by share cards, sitter passes, care
sheets, public profiles or transfers — nothing here is imported by them.
"""
# NOTE: no `from __future__ import annotations` — slowapi's @limiter.limit
# wraps the endpoint and FastAPI must resolve the annotations (see
# routers/care_sheets.py).
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Dict, List, Optional, Tuple
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.animal import Animal
from app.models.colony import Colony
from app.models.expense import Expense, ExpenseShare
from app.models.invert import Invert
from app.models.user import User
from app.schemas.expense import (
    _APP_PATTERN,
    _CATEGORY_PATTERN,
    AnimalCost,
    AnimalCostShare,
    ExpenseCreate,
    ExpenseDetail,
    ExpenseList,
    ExpenseListItem,
    ExpenseLocationTotal,
    ExpenseMonthTotal,
    ExpenseShareOut,
    ExpenseSplitIn,
    ExpenseSummary,
    ExpenseTopAnimal,
    ExpenseUpdate,
)
from app.services.expense_split import build_shares, divide_amount, resolve_targets
from app.utils.access import (
    Access,
    access_helper,
    load_animal,
    load_colony,
    load_invert,
    policy,
    require,
    scope_collection,
)
from app.utils.dependencies import get_current_user
from app.utils.rate_limit import limiter

router = APIRouter()

PREMIUM_DETAIL = "Expense tracking is a premium feature"
PREMIUM_CODE = "premium_required"
NOT_FOUND = "Expense not found"
IDS_ONLY_FOR_ANIMALS = "Ids are only used when splitting across picked animals"
NOTHING_TO_SPLIT = "No animals to split across"
REMOVED_ANIMAL = "Removed animal"
UNNAMED_ANIMAL = "Unnamed animal"


# ── premium gate ─────────────────────────────────────────────────────────────

class PremiumRequired(HTTPException):
    """403 whose JSON body carries BOTH `detail` and a machine-readable `code`
    (FastAPI would nest a dict under `detail`), so clients can open the upgrade
    sheet. Rendered by `premium_required_handler`, registered in main.py."""

    def __init__(self) -> None:
        super().__init__(status.HTTP_403_FORBIDDEN, detail=PREMIUM_DETAIL)


async def premium_required_handler(request: Request, exc: PremiumRequired) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={"detail": PREMIUM_DETAIL, "code": PREMIUM_CODE},
    )


def premium_or_403(owner: User, app: str) -> None:
    """The collection OWNER's plan decides, never the co-keeper's."""
    if not owner.is_premium_for_app(app):
        raise PremiumRequired()


# ── loading ──────────────────────────────────────────────────────────────────

@access_helper
def _load_expense(db: Session, user: User, expense_id: UUID) -> Tuple[Expense, Access]:
    """The expense plus the caller's access to its owner's ledger (keeper+).
    404 for missing and for no-access alike; 403 below keeper."""
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if expense is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    access = require(db, user, expense.owner_id, expense.app, "keeper", not_found=NOT_FOUND)
    return expense, access


# ── output builders ──────────────────────────────────────────────────────────

def _creator_names(db: Session, expenses: List[Expense]) -> Dict[UUID, str]:
    ids = {e.created_by for e in expenses if e.created_by}
    if not ids:
        return {}
    rows = db.query(User.id, User.display_name, User.username).filter(User.id.in_(ids)).all()
    return {r.id: ((r.display_name or "").strip() or r.username) for r in rows}


def _share_counts(db: Session, expense_ids: List[UUID]) -> Dict[UUID, int]:
    if not expense_ids:
        return {}
    rows = (
        db.query(ExpenseShare.expense_id, func.count(ExpenseShare.id))
        .filter(ExpenseShare.expense_id.in_(expense_ids))
        .group_by(ExpenseShare.expense_id)
        .all()
    )
    return {expense_id: n for expense_id, n in rows}


def _item(e: Expense, share_count: int, creators: Dict[UUID, str]) -> ExpenseListItem:
    return ExpenseListItem(
        id=e.id,
        spent_on=e.spent_on,
        description=e.description,
        category=e.category,
        amount=e.amount,
        notes=e.notes,
        split_mode=e.split_mode,
        split_label=e.split_label,
        share_count=share_count,
        created_by_name=creators.get(e.created_by) if e.created_by else None,
    )


def _target_names(db: Session, shares: List[ExpenseShare]) -> Dict[Tuple[str, UUID], str]:
    """(kind, id) -> display name, three batched lookups at most."""
    names: Dict[Tuple[str, UUID], str] = {}
    invert_ids = {s.invert_id for s in shares if s.invert_id}
    colony_ids = {s.colony_id for s in shares if s.colony_id}
    animal_ids = {s.animal_id for s in shares if s.animal_id}
    if invert_ids:
        rows = (
            db.query(Invert.id, Invert.name, Invert.common_name, Invert.scientific_name)
            .filter(Invert.id.in_(invert_ids))
            .all()
        )
        for r in rows:
            names[("invert", r.id)] = r.name or r.common_name or r.scientific_name or UNNAMED_ANIMAL
    if colony_ids:
        for r in db.query(Colony.id, Colony.name).filter(Colony.id.in_(colony_ids)).all():
            names[("colony", r.id)] = r.name or UNNAMED_ANIMAL
    if animal_ids:
        for r in db.query(Animal.id, Animal.name, Animal.common_name).filter(Animal.id.in_(animal_ids)).all():
            names[("animal", r.id)] = r.name or r.common_name or UNNAMED_ANIMAL
    return names


def _share_out(s: ExpenseShare, names: Dict[Tuple[str, UUID], str]) -> ExpenseShareOut:
    if s.invert_id:
        kind, target = "invert", s.invert_id
    elif s.colony_id:
        kind, target = "colony", s.colony_id
    elif s.animal_id:
        kind, target = "animal", s.animal_id
    else:  # the animal was deleted; the share (and the purchase total) stays
        return ExpenseShareOut(target_kind=None, target_id=None, name=REMOVED_ANIMAL, amount=s.amount)
    return ExpenseShareOut(
        target_kind=kind,
        target_id=target,
        name=names.get((kind, target), UNNAMED_ANIMAL),
        amount=s.amount,
    )


def _detail(db: Session, e: Expense) -> ExpenseDetail:
    shares = sorted(e.shares, key=lambda s: s.position)
    names = _target_names(db, shares)
    base = _item(e, len(shares), _creator_names(db, [e]))
    return ExpenseDetail(**base.model_dump(), shares=[_share_out(s, names) for s in shares])


# ── split ────────────────────────────────────────────────────────────────────

def _resolve_split(db: Session, owner: User, app: str, split: ExpenseSplitIn):
    """(targets, split_label) for a split request against the owner's CURRENT
    collection. Raises before anything is written."""
    if split.mode != "animals" and split.has_ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=IDS_ONLY_FOR_ANIMALS)
    targets, label = resolve_targets(
        db, owner.id, app, split.mode,
        invert_ids=split.invert_ids, colony_ids=split.colony_ids,
        animal_ids=split.animal_ids, location=split.location,
    )
    if split.mode != "none" and not targets:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=NOTHING_TO_SPLIT)
    return targets, label


# ── routes ───────────────────────────────────────────────────────────────────

@router.get("/", response_model=ExpenseList)
@policy("keeper")
async def list_expenses(
    app: str = Query(..., pattern=_APP_PATTERN),
    collection: Optional[UUID] = None,
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = None,
    category: Optional[str] = Query(None, pattern=_CATEGORY_PATTERN),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    access = scope_collection(db, current_user, app, collection, need="keeper")
    query = db.query(Expense).filter(Expense.owner_id == access.owner.id, Expense.app == app)
    if from_ is not None:
        query = query.filter(Expense.spent_on >= from_)
    if to is not None:
        query = query.filter(Expense.spent_on <= to)
    if category is not None:
        query = query.filter(Expense.category == category)
    total = query.count()
    rows = (
        query.order_by(Expense.spent_on.desc(), Expense.created_at.desc(), Expense.id)
        .offset(offset)
        .limit(limit)
        .all()
    )
    counts = _share_counts(db, [e.id for e in rows])
    creators = _creator_names(db, rows)
    return ExpenseList(
        items=[_item(e, counts.get(e.id, 0), creators) for e in rows],
        total=total,
        can_add=bool(access.owner.is_premium_for_app(app)),
    )


@router.post("/", response_model=ExpenseDetail, status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
@policy("keeper")
async def create_expense(
    request: Request,
    body: ExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    access = scope_collection(db, current_user, body.app, body.collection, need="keeper")
    owner = access.owner
    premium_or_403(owner, body.app)
    targets, label = _resolve_split(db, owner, body.app, body.split)

    expense = Expense(
        owner_id=owner.id,
        created_by=current_user.id,
        app=body.app,
        spent_on=body.spent_on,
        description=body.description,
        category=body.category,
        amount=body.amount,
        notes=body.notes,
        split_mode=body.split.mode,
        split_label=label,
    )
    expense.shares = build_shares(body.amount, targets)
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return _detail(db, expense)


# `/summary` and `/animal-cost` MUST stay above the `/{expense_id}` routes —
# otherwise "summary" is parsed as an expense id. Both aggregate in SQL
# (sum / group by) rather than loading ledger rows: the API runs on 512 MB.

ZERO = Decimal("0.00")
NO_LOCATION = "No location"
ONE_ID_ONLY = "Pass exactly one of invert_id, colony_id or animal_id"
TOP_ANIMALS = 10
SUMMARY_MONTHS = 12


def _money(value) -> Decimal:
    return ZERO if value is None else Decimal(value)


def _default_window_start() -> date:
    """First day of the month 11 months before today (UTC): 12 calendar months
    including the current one."""
    t = datetime.now(timezone.utc).date()
    index = t.year * 12 + (t.month - 1) - (SUMMARY_MONTHS - 1)
    return date(index // 12, index % 12 + 1, 1)


def _target_name_sql():
    """Display name of a share's target, mirroring `_target_names` (blank = unset)."""
    return func.coalesce(
        func.nullif(func.trim(Invert.name), ""), func.nullif(func.trim(Invert.common_name), ""),
        func.nullif(func.trim(Invert.scientific_name), ""),
        func.nullif(func.trim(Colony.name), ""),
        func.nullif(func.trim(Animal.name), ""), func.nullif(func.trim(Animal.common_name), ""),
        UNNAMED_ANIMAL,
    )


def _share_targets(query):
    """Left-join the three possible share targets onto a query over shares."""
    return (
        query.outerjoin(Invert, Invert.id == ExpenseShare.invert_id)
        .outerjoin(Colony, Colony.id == ExpenseShare.colony_id)
        .outerjoin(Animal, Animal.id == ExpenseShare.animal_id)
    )


def _has_target():
    return (
        ExpenseShare.invert_id.isnot(None)
        | ExpenseShare.colony_id.isnot(None)
        | ExpenseShare.animal_id.isnot(None)
    )


@router.get("/summary", response_model=ExpenseSummary)
@policy("keeper")
async def expense_summary(
    app: str = Query(..., pattern=_APP_PATTERN),
    collection: Optional[UUID] = None,
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    access = scope_collection(db, current_user, app, collection, need="keeper")
    start = from_ if from_ is not None else _default_window_start()
    # Default end = the newest date the API accepts (UTC today + 1, so a keeper east of UTC
    # who logs "today" locally still sees it in the summary).
    end = to if to is not None else datetime.now(timezone.utc).date() + timedelta(days=1)

    def in_window(query):
        return query.filter(
            Expense.owner_id == access.owner.id, Expense.app == app,
            Expense.spent_on >= start, Expense.spent_on <= end,
        )

    # Expense-level figures: total, by category, by month, unsplit purchases.
    total = _money(in_window(db.query(func.sum(Expense.amount))).scalar())
    by_category = {
        category: _money(amount)
        for category, amount in in_window(db.query(Expense.category, func.sum(Expense.amount)))
        .group_by(Expense.category)
        .order_by(func.sum(Expense.amount).desc(), Expense.category)
        .all()
    }
    month_expr = func.to_char(Expense.spent_on, "YYYY-MM")
    by_month = [
        ExpenseMonthTotal(month=month, total=_money(amount))
        for month, amount in in_window(db.query(month_expr, func.sum(Expense.amount)))
        .group_by(month_expr)
        .order_by(month_expr)
        .all()
    ]
    unsplit = _money(
        in_window(db.query(func.sum(Expense.amount))).filter(Expense.split_mode == "none").scalar()
    )

    # Share-level figures. A share whose animal was deleted is "unallocated".
    def share_query(*columns):
        return in_window(
            _share_targets(db.query(*columns).select_from(ExpenseShare).join(
                Expense, Expense.id == ExpenseShare.expense_id))
        )

    orphaned = _money(
        share_query(func.sum(ExpenseShare.amount)).filter(~_has_target()).scalar()
    )

    raw_location = func.coalesce(Invert.location, Colony.location, Animal.location)
    location_expr = func.coalesce(func.nullif(func.trim(raw_location), ""), NO_LOCATION)
    by_location = [
        ExpenseLocationTotal(location=location, total=_money(amount))
        for location, amount in share_query(location_expr, func.sum(ExpenseShare.amount))
        .filter(_has_target())
        .group_by(location_expr)
        .order_by(func.sum(ExpenseShare.amount).desc(), location_expr)
        .all()
    ]

    name_expr = _target_name_sql()
    top_rows = (
        share_query(
            ExpenseShare.invert_id, ExpenseShare.colony_id, ExpenseShare.animal_id,
            func.max(name_expr), func.sum(ExpenseShare.amount),
        )
        .filter(_has_target())
        .group_by(ExpenseShare.invert_id, ExpenseShare.colony_id, ExpenseShare.animal_id)
        .order_by(func.sum(ExpenseShare.amount).desc(), func.max(name_expr),
                  ExpenseShare.invert_id, ExpenseShare.colony_id, ExpenseShare.animal_id)
        .limit(TOP_ANIMALS)
        .all()
    )
    top_animals = []
    for invert_id, colony_id, animal_id, name, amount in top_rows:
        if invert_id:
            kind, target = "invert", invert_id
        elif colony_id:
            kind, target = "colony", colony_id
        else:
            kind, target = "animal", animal_id
        top_animals.append(ExpenseTopAnimal(
            target_kind=kind, target_id=target, name=name, total=_money(amount)))

    return ExpenseSummary(
        total=total,
        by_category=by_category,
        by_month=by_month,
        by_location=by_location,
        top_animals=top_animals,
        unallocated_total=unsplit + orphaned,
        can_add=bool(access.owner.is_premium_for_app(app)),
    )


@router.get("/animal-cost", response_model=AnimalCost)
@policy("keeper")
async def animal_cost(
    invert_id: Optional[UUID] = None,
    colony_id: Optional[UUID] = None,
    animal_id: Optional[UUID] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """What one animal / colony has cost, all time: its purchase price plus its
    shares of every expense. The id kind implies the app."""
    if sum(x is not None for x in (invert_id, colony_id, animal_id)) != 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=ONE_ID_ONLY)

    if invert_id is not None:
        row, access = load_invert(db, current_user, invert_id, need="keeper")
        app, column, target = "tarantuverse", ExpenseShare.invert_id, invert_id
        purchase = row.price_paid
    elif colony_id is not None:
        row, access = load_colony(db, current_user, colony_id, need="keeper")
        app, column, target = "tarantuverse", ExpenseShare.colony_id, colony_id
        purchase = None  # colonies have no purchase price
    else:
        row, access = load_animal(db, current_user, animal_id, need="keeper")
        app, column, target = "herpetoverse", ExpenseShare.animal_id, animal_id
        purchase = row.price_paid

    # Pin every figure to the animal's OWNER and the app its id kind implies, so
    # a stray share row (another user's ledger, the other app's) can never leak in.
    owner_id = access.owner.id
    pinned = (column == target, Expense.owner_id == owner_id, Expense.app == app)

    shares_total = _money(
        db.query(func.sum(ExpenseShare.amount))
        .join(Expense, Expense.id == ExpenseShare.expense_id)
        .filter(*pinned)
        .scalar()
    )
    by_category = {
        category: _money(amount)
        for category, amount in db.query(Expense.category, func.sum(ExpenseShare.amount))
        .select_from(ExpenseShare)
        .join(Expense, Expense.id == ExpenseShare.expense_id)
        .filter(*pinned)
        .group_by(Expense.category)
        .order_by(func.sum(ExpenseShare.amount).desc(), Expense.category)
        .all()
    }
    rows = (
        db.query(
            Expense.id, Expense.spent_on, Expense.description, Expense.category, ExpenseShare.amount,
        )
        .join(ExpenseShare, ExpenseShare.expense_id == Expense.id)
        .filter(*pinned)
        .order_by(Expense.spent_on.desc(), Expense.created_at.desc(), Expense.id)
        .all()
    )
    return AnimalCost(
        can_add=bool(access.owner.is_premium_for_app(app)),
        purchase_price=purchase,
        shares_total=shares_total,
        by_category=by_category,
        total=shares_total + _money(purchase),
        shares=[
            AnimalCostShare(expense_id=r.id, spent_on=r.spent_on, description=r.description,
                            category=r.category, amount=r.amount)
            for r in rows
        ],
    )


@router.get("/{expense_id}", response_model=ExpenseDetail)
@policy("keeper")
async def get_expense(
    expense_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    expense, _access = _load_expense(db, current_user, expense_id)
    return _detail(db, expense)


@router.put("/{expense_id}", response_model=ExpenseDetail)
@limiter.limit("60/minute")
@policy("keeper")
async def update_expense(
    request: Request,
    expense_id: UUID,
    body: ExpenseUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    expense, access = _load_expense(db, current_user, expense_id)
    premium_or_403(access.owner, expense.app)

    fields = body.model_fields_set
    # Resolve first: a bad split must leave the expense untouched.
    replacement = None
    if "split" in fields and body.split is not None:
        replacement = _resolve_split(db, access.owner, expense.app, body.split)

    for name in ("spent_on", "description", "category", "amount"):
        if name in fields:
            setattr(expense, name, getattr(body, name))
    if "notes" in fields:
        expense.notes = body.notes

    if replacement is not None:
        targets, label = replacement
        expense.shares = build_shares(expense.amount, targets)
        expense.split_mode = body.split.mode
        expense.split_label = label
    elif "amount" in fields and expense.shares:
        # Same targets (a null target keeps its slot), same order, new cents.
        ordered = sorted(expense.shares, key=lambda s: s.position)
        for share, part in zip(ordered, divide_amount(expense.amount, len(ordered))):
            share.amount = part

    expense.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(expense)
    return _detail(db, expense)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
@policy("keeper")
async def delete_expense(
    request: Request,
    expense_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    expense, _access = _load_expense(db, current_user, expense_id)
    db.delete(expense)  # shares go with it (cascade)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
