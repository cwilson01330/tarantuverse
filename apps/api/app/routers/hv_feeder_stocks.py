"""HV feeder stock + log routes (ADR-012).

A "stock" is a keeper's supply of one feeder — a LIVE colony or FROZEN freezer
inventory. Owner-scoped. The killer path: log a `used`/`restock` with a size +
count_delta and the matching size bucket (or the flat count) is adjusted, with a
low-stock flag so a keeper knows before they run out of adult mice.

PREMIUM: feeder keeping is an HV-premium feature (ADR-012). Enforcement is left
OFF for now (there's no HV purchase path yet — enabling it would make the feature
untestable). When HV subscriptions go live, wrap `create_stock` with
`enforce_hv_premium` (see the marked hook) — it's a one-line add.
"""
from typing import List, Optional
from uuid import UUID
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.hv_feeder import HvFeederStock, HvFeederLog, HvFeederSpecies
from app.schemas.hv_feeder import (
    HvFeederStockCreate, HvFeederStockUpdate, HvFeederStockResponse,
    HvFeederStockListItem, HvFeederLogCreate, HvFeederLogResponse,
)
from app.utils.dependencies import get_current_user
from app.utils.limits import enforce_hv_premium

router = APIRouter()


# ── helpers ───────────────────────────────────────────────────────────────────

def _species_display_name(sp: Optional[HvFeederSpecies]) -> Optional[str]:
    if sp is None:
        return None
    if sp.common_names and len(sp.common_names) > 0:
        return sp.common_names[0]
    return sp.scientific_name


def _total_count(stock: HvFeederStock) -> Optional[int]:
    if stock.inventory_mode == "count":
        return stock.count
    if stock.inventory_mode == "sized" and stock.sized_counts:
        try:
            return sum(int(v) for v in stock.sized_counts.values() if isinstance(v, (int, float)))
        except Exception:
            return None
    return None


def _build_stock(stock: HvFeederStock, db: Session) -> dict:
    sp: Optional[HvFeederSpecies] = None
    if stock.hv_feeder_species_id:
        sp = db.query(HvFeederSpecies).filter(
            HvFeederSpecies.id == stock.hv_feeder_species_id
        ).first()
    total = _total_count(stock)
    is_low = (
        stock.low_threshold is not None
        and total is not None
        and total < stock.low_threshold
    )
    data = {c.name: getattr(stock, c.name) for c in stock.__table__.columns}
    data["total_count"] = total
    data["is_low_stock"] = bool(is_low)
    data["species_display_name"] = _species_display_name(sp)
    return data


def _get_owned(db: Session, stock_id: UUID, user: User) -> HvFeederStock:
    stock = db.query(HvFeederStock).filter(
        HvFeederStock.id == stock_id, HvFeederStock.user_id == user.id
    ).first()
    if stock is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feeder stock not found")
    return stock


def _validate_species(db: Session, species_id: Optional[UUID]) -> None:
    if species_id and not db.query(HvFeederSpecies).filter(HvFeederSpecies.id == species_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feeder species not found")


# ── stock CRUD ──────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[HvFeederStockListItem])
async def list_stocks(
    include_inactive: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(HvFeederStock).filter(HvFeederStock.user_id == current_user.id)
    if not include_inactive:
        q = q.filter(HvFeederStock.is_active.is_(True))
    stocks = q.order_by(HvFeederStock.created_at.desc()).all()
    return [HvFeederStockListItem(**_build_stock(s, db)) for s in stocks]


@router.post("/", response_model=HvFeederStockResponse, status_code=status.HTTP_201_CREATED)
async def create_stock(
    payload: HvFeederStockCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # PREMIUM (ADR-012): feeder tracking is an HV-premium feature. Free keepers
    # get a 402 → UpgradeModal; premium (HV or bundle) keepers pass through.
    enforce_hv_premium(current_user, feature="Feeder tracking")
    _validate_species(db, payload.hv_feeder_species_id)
    stock = HvFeederStock(user_id=current_user.id, **payload.model_dump())
    db.add(stock)
    db.commit()
    db.refresh(stock)
    return HvFeederStockResponse(**_build_stock(stock, db))


@router.get("/{stock_id}", response_model=HvFeederStockResponse)
async def get_stock(
    stock_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stock = _get_owned(db, stock_id, current_user)
    return HvFeederStockResponse(**_build_stock(stock, db))


@router.put("/{stock_id}", response_model=HvFeederStockResponse)
async def update_stock(
    stock_id: UUID,
    payload: HvFeederStockUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stock = _get_owned(db, stock_id, current_user)
    data = payload.model_dump(exclude_unset=True)
    if data.get("hv_feeder_species_id"):
        _validate_species(db, data["hv_feeder_species_id"])
    for k, v in data.items():
        setattr(stock, k, v)
    db.commit()
    db.refresh(stock)
    return HvFeederStockResponse(**_build_stock(stock, db))


@router.delete("/{stock_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stock(
    stock_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stock = _get_owned(db, stock_id, current_user)
    db.delete(stock)
    db.commit()
    return None


# ── logs (used / restock / cleaned / …) with inventory adjustment ───────────────

@router.get("/{stock_id}/logs", response_model=List[HvFeederLogResponse])
async def list_logs(
    stock_id: UUID,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_owned(db, stock_id, current_user)  # ownership check
    return (
        db.query(HvFeederLog)
        .filter(HvFeederLog.hv_feeder_stock_id == stock_id)
        .order_by(HvFeederLog.logged_at.desc(), HvFeederLog.created_at.desc())
        .offset(offset).limit(limit).all()
    )


@router.post("/{stock_id}/logs", response_model=HvFeederLogResponse, status_code=status.HTTP_201_CREATED)
async def create_log(
    stock_id: UUID,
    payload: HvFeederLogCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Log an event and adjust inventory. `count_delta` is SIGNED — send
    negative for `used`, positive for `restock`. For sized stock, `size` picks
    the bucket to adjust; buckets floor at 0."""
    stock = _get_owned(db, stock_id, current_user)

    log = HvFeederLog(
        hv_feeder_stock_id=stock.id,
        user_id=current_user.id,
        **payload.model_dump(exclude_unset=True),
    )
    db.add(log)

    effective_date: date = log.logged_at or date.today()
    if log.log_type == "used":
        stock.last_used = effective_date
    elif log.log_type == "restock":
        stock.last_restocked = effective_date
    elif log.log_type == "cleaned":
        stock.last_cleaned = effective_date

    # Apply the inventory adjustment.
    if log.count_delta is not None:
        if stock.inventory_mode == "count":
            stock.count = max(0, (stock.count or 0) + int(log.count_delta))
        elif stock.inventory_mode == "sized" and log.size:
            buckets = dict(stock.sized_counts or {})
            current = int(buckets.get(log.size, 0) or 0)
            buckets[log.size] = max(0, current + int(log.count_delta))
            stock.sized_counts = buckets  # reassign so SQLAlchemy tracks the JSONB change

    db.commit()
    db.refresh(log)
    return log


@router.delete("/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_log(
    log_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = db.query(HvFeederLog).filter(
        HvFeederLog.id == log_id, HvFeederLog.user_id == current_user.id
    ).first()
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found")
    db.delete(log)
    db.commit()
    return None
