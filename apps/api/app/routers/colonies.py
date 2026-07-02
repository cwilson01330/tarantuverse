"""
Colony + colony-event routes (ADR-010).

Population-level tracking for communal/colony keepers. Owner-scoped throughout.
A colony counts as 1 toward the free-tier animal cap (enforced on create via
the shared `enforce_collection_limit`, which counts inverts + colonies).

Events with a `count_delta` mutate the colony's `stage_counts` bucket on write
(same pattern as FeederCareLog -> count). JSONB is reassigned (not mutated in
place) so SQLAlchemy flushes the change.
"""
from typing import List, Optional
from uuid import UUID
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.colony import Colony, ColonyEvent
from app.models.invert_species import InvertSpecies
from app.models.enclosure import Enclosure
from app.schemas.colony import (
    ColonyCreate,
    ColonyUpdate,
    ColonyResponse,
    ColonyListItem,
    ColonyEventCreate,
    ColonyEventUpdate,
    ColonyEventResponse,
)
from app.utils.dependencies import get_current_user
from app.utils.limits import enforce_collection_limit

router = APIRouter()


# ---------- helpers ----------

def _species_names(sp: Optional[InvertSpecies]):
    """(display_name, scientific_name). Display prefers a common name."""
    if sp is None:
        return None, None
    display = sp.common_names[0] if sp.common_names else sp.scientific_name
    return display, sp.scientific_name


def _total_count(colony: Colony) -> int:
    """Sum the buckets. Always an int (0 for an empty colony) so the clients
    can type total_count as a number without a null branch."""
    if not colony.stage_counts:
        return 0
    try:
        return sum(int(v) for v in colony.stage_counts.values() if isinstance(v, int))
    except Exception:
        return 0


def _build_response(colony: Colony, db: Session) -> dict:
    sp: Optional[InvertSpecies] = None
    species_missing = False
    if colony.species_id:
        sp = db.query(InvertSpecies).filter(InvertSpecies.id == colony.species_id).first()
        if sp is None:
            species_missing = True

    display, scientific = _species_names(sp)
    data = {c.name: getattr(colony, c.name) for c in colony.__table__.columns}
    data["total_count"] = _total_count(colony)
    data["species_display_name"] = display
    data["species_scientific_name"] = scientific
    data["species_missing"] = species_missing
    return data


def _verify_enclosure(db: Session, enclosure_id: Optional[UUID], user: User) -> None:
    if enclosure_id is None:
        return
    enc = (
        db.query(Enclosure)
        .filter(Enclosure.id == enclosure_id, Enclosure.user_id == user.id)
        .first()
    )
    if enc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enclosure not found")


def _verify_species(db: Session, species_id: Optional[UUID]) -> None:
    if species_id is None:
        return
    sp = db.query(InvertSpecies).filter(InvertSpecies.id == species_id).first()
    if sp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Species not found")


def _get_owned(db: Session, colony_id: UUID, user: User) -> Colony:
    colony = (
        db.query(Colony)
        .filter(Colony.id == colony_id, Colony.user_id == user.id)
        .first()
    )
    if colony is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Colony not found")
    return colony


def _apply_delta(colony: Colony, stage: Optional[str], delta: Optional[int]) -> None:
    """Adjust a bucket by delta (clamped at 0). Reassigns the JSONB dict so
    SQLAlchemy detects the change. Missing stage defaults to 'mixed'."""
    if delta is None:
        return
    bucket = (stage or "mixed").strip() or "mixed"
    counts = dict(colony.stage_counts or {})
    counts[bucket] = max(0, int(counts.get(bucket, 0)) + int(delta))
    colony.stage_counts = counts


# ---------- colony CRUD ----------

@router.get("/", response_model=List[ColonyListItem])
async def list_colonies(
    include_inactive: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Colony).filter(
        Colony.user_id == current_user.id,
        Colony.transferred_out_at.is_(None),
    )
    if not include_inactive:
        q = q.filter(Colony.is_active.is_(True))
    colonies = q.order_by(Colony.created_at.desc()).all()
    return [ColonyListItem(**_build_response(c, db)) for c in colonies]


@router.post("/", response_model=ColonyResponse, status_code=status.HTTP_201_CREATED)
async def create_colony(
    payload: ColonyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # A colony counts as 1 animal toward the free-tier cap.
    enforce_collection_limit(db, current_user)
    _verify_enclosure(db, payload.enclosure_id, current_user)
    _verify_species(db, payload.species_id)

    colony = Colony(user_id=current_user.id, **payload.model_dump())
    db.add(colony)

    # Bump the species "times_kept" counter (parity with invert create).
    if colony.species_id:
        sp = db.query(InvertSpecies).filter(InvertSpecies.id == colony.species_id).first()
        if sp is not None:
            sp.times_kept = (sp.times_kept or 0) + 1

    db.commit()
    db.refresh(colony)
    return ColonyResponse(**_build_response(colony, db))


@router.get("/{colony_id}", response_model=ColonyResponse)
async def get_colony(
    colony_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    colony = _get_owned(db, colony_id, current_user)
    return ColonyResponse(**_build_response(colony, db))


@router.put("/{colony_id}", response_model=ColonyResponse)
async def update_colony(
    colony_id: UUID,
    payload: ColonyUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    colony = _get_owned(db, colony_id, current_user)
    data = payload.model_dump(exclude_unset=True)

    if "enclosure_id" in data:
        _verify_enclosure(db, data["enclosure_id"], current_user)
    if data.get("species_id"):
        _verify_species(db, data["species_id"])

    for k, v in data.items():
        setattr(colony, k, v)

    db.commit()
    db.refresh(colony)
    return ColonyResponse(**_build_response(colony, db))


@router.delete("/{colony_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_colony(
    colony_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    colony = _get_owned(db, colony_id, current_user)
    db.delete(colony)
    db.commit()
    return None


# ---------- events ----------

@router.get("/{colony_id}/events", response_model=List[ColonyEventResponse])
async def list_events(
    colony_id: UUID,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_owned(db, colony_id, current_user)  # ownership check
    return (
        db.query(ColonyEvent)
        .filter(ColonyEvent.colony_id == colony_id)
        .order_by(ColonyEvent.occurred_at.desc(), ColonyEvent.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.post(
    "/{colony_id}/events",
    response_model=ColonyEventResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_event(
    colony_id: UUID,
    payload: ColonyEventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    colony = _get_owned(db, colony_id, current_user)

    log = ColonyEvent(
        colony_id=colony.id,
        user_id=current_user.id,
        **payload.model_dump(exclude_unset=True),
    )
    db.add(log)

    # Apply the population delta to the bucket.
    _apply_delta(colony, log.stage, log.count_delta)

    db.commit()
    db.refresh(log)
    return log


@router.put("/events/{event_id}", response_model=ColonyEventResponse)
async def update_event(
    event_id: UUID,
    payload: ColonyEventUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = (
        db.query(ColonyEvent)
        .filter(ColonyEvent.id == event_id, ColonyEvent.user_id == current_user.id)
        .first()
    )
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(log, k, v)

    db.commit()
    db.refresh(log)
    return log


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = (
        db.query(ColonyEvent)
        .filter(ColonyEvent.id == event_id, ColonyEvent.user_id == current_user.id)
        .first()
    )
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    db.delete(log)
    db.commit()
    return None
