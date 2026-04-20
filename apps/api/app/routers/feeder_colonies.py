"""
Feeder colony + care log routes.

All endpoints are owner-scoped. Enclosure linkage is strictly filtered:
only enclosures with purpose='feeder' owned by the same user may be linked.
Mode switches (count <-> life_stage) always preserve the other mode's data
on the row (PRD §6 decision).
"""
from typing import List, Optional
from uuid import UUID
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.feeder_colony import FeederColony
from app.models.feeder_care_log import FeederCareLog
from app.models.feeder_species import FeederSpecies
from app.models.enclosure import Enclosure
from app.schemas.feeder_colony import (
    FeederColonyCreate,
    FeederColonyUpdate,
    FeederColonyResponse,
    FeederColonyListItem,
)
from app.schemas.feeder_care_log import (
    FeederCareLogCreate,
    FeederCareLogUpdate,
    FeederCareLogResponse,
)
from app.utils.dependencies import get_current_user

router = APIRouter()


# ---------- helpers ----------

def _species_display_name(sp: Optional[FeederSpecies]) -> Optional[str]:
    if sp is None:
        return None
    if sp.common_names and len(sp.common_names) > 0:
        return sp.common_names[0]
    return sp.scientific_name


def _compute_total_count(colony: FeederColony) -> Optional[int]:
    if colony.inventory_mode == "count":
        return colony.count
    if colony.inventory_mode == "life_stage" and colony.life_stage_counts:
        try:
            return sum(int(v) for v in colony.life_stage_counts.values() if isinstance(v, int))
        except Exception:
            return None
    return None


def _build_colony_response(colony: FeederColony, db: Session) -> dict:
    sp: Optional[FeederSpecies] = None
    species_missing = False
    if colony.feeder_species_id:
        sp = db.query(FeederSpecies).filter(FeederSpecies.id == colony.feeder_species_id).first()
        if sp is None:
            species_missing = True

    total = _compute_total_count(colony)
    is_low = False
    if colony.low_threshold is not None and total is not None and total < colony.low_threshold:
        is_low = True

    data = {c.name: getattr(colony, c.name) for c in colony.__table__.columns}
    data["total_count"] = total
    data["is_low_stock"] = is_low
    data["species_display_name"] = _species_display_name(sp)
    data["species_missing"] = species_missing
    return data


def _verify_enclosure(
    db: Session, enclosure_id: Optional[UUID], current_user: User
) -> None:
    """Strict filter: if set, enclosure must be owned by the user AND
    purpose must be 'feeder'."""
    if enclosure_id is None:
        return
    enc = (
        db.query(Enclosure)
        .filter(Enclosure.id == enclosure_id, Enclosure.user_id == current_user.id)
        .first()
    )
    if enc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enclosure not found",
        )
    if (enc.purpose or "tarantula") != "feeder":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enclosure purpose must be 'feeder' to link a feeder colony",
        )


def _get_colony_owned(db: Session, colony_id: UUID, current_user: User) -> FeederColony:
    colony = (
        db.query(FeederColony)
        .filter(FeederColony.id == colony_id, FeederColony.user_id == current_user.id)
        .first()
    )
    if colony is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feeder colony not found")
    return colony


# ---------- colony CRUD ----------

@router.get("/", response_model=List[FeederColonyListItem])
async def list_colonies(
    include_inactive: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(FeederColony).filter(FeederColony.user_id == current_user.id)
    if not include_inactive:
        q = q.filter(FeederColony.is_active.is_(True))
    colonies = q.order_by(FeederColony.created_at.desc()).all()

    result: List[FeederColonyListItem] = []
    for c in colonies:
        data = _build_colony_response(c, db)
        result.append(FeederColonyListItem(**data))
    return result


@router.post("/", response_model=FeederColonyResponse, status_code=status.HTTP_201_CREATED)
async def create_colony(
    payload: FeederColonyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verify_enclosure(db, payload.enclosure_id, current_user)

    # validate feeder_species_id exists (if provided)
    if payload.feeder_species_id:
        sp = db.query(FeederSpecies).filter(FeederSpecies.id == payload.feeder_species_id).first()
        if sp is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Feeder species not found",
            )

    colony = FeederColony(
        user_id=current_user.id,
        **payload.model_dump(),
    )
    db.add(colony)
    db.commit()
    db.refresh(colony)
    return FeederColonyResponse(**_build_colony_response(colony, db))


@router.get("/{colony_id}", response_model=FeederColonyResponse)
async def get_colony(
    colony_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    colony = _get_colony_owned(db, colony_id, current_user)
    return FeederColonyResponse(**_build_colony_response(colony, db))


@router.put("/{colony_id}", response_model=FeederColonyResponse)
async def update_colony(
    colony_id: UUID,
    payload: FeederColonyUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    colony = _get_colony_owned(db, colony_id, current_user)
    data = payload.model_dump(exclude_unset=True)

    # Strict enclosure filter on update
    if "enclosure_id" in data:
        _verify_enclosure(db, data["enclosure_id"], current_user)

    # Validate feeder_species_id if changed
    if data.get("feeder_species_id"):
        sp = (
            db.query(FeederSpecies)
            .filter(FeederSpecies.id == data["feeder_species_id"])
            .first()
        )
        if sp is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Feeder species not found",
            )

    # Mode-switch: always preserve the other mode's data. When user switches
    # 'count' -> 'life_stage', keep existing count on the row (stays as-is
    # because we only touch keys present in `data`). When switching
    # 'life_stage' -> 'count', we likewise leave life_stage_counts intact.
    # We only skip writing fields the user didn't send.
    for k, v in data.items():
        setattr(colony, k, v)

    db.commit()
    db.refresh(colony)
    return FeederColonyResponse(**_build_colony_response(colony, db))


@router.delete("/{colony_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_colony(
    colony_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    colony = _get_colony_owned(db, colony_id, current_user)
    db.delete(colony)
    db.commit()
    return None


# ---------- care logs ----------

@router.get("/{colony_id}/care-logs", response_model=List[FeederCareLogResponse])
async def list_care_logs(
    colony_id: UUID,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_colony_owned(db, colony_id, current_user)  # ownership check
    return (
        db.query(FeederCareLog)
        .filter(FeederCareLog.feeder_colony_id == colony_id)
        .order_by(FeederCareLog.logged_at.desc(), FeederCareLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.post(
    "/{colony_id}/care-logs",
    response_model=FeederCareLogResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_care_log(
    colony_id: UUID,
    payload: FeederCareLogCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    colony = _get_colony_owned(db, colony_id, current_user)

    log = FeederCareLog(
        feeder_colony_id=colony.id,
        user_id=current_user.id,
        **payload.model_dump(exclude_unset=True),
    )
    db.add(log)

    # Side effects on colony: update denormalized "last X" dates + apply
    # count_delta if present. Mirrors substrate-change auto-update pattern.
    effective_date: date = log.logged_at or date.today()
    if log.log_type == "fed_feeders":
        colony.last_fed_date = effective_date
    elif log.log_type == "cleaning":
        colony.last_cleaned = effective_date
    elif log.log_type == "restock":
        colony.last_restocked = effective_date
    # (water_change / count_update / note don't own a dedicated column)

    if log.count_delta is not None:
        if colony.inventory_mode == "count":
            current = colony.count or 0
            colony.count = max(0, current + int(log.count_delta))
        # For life_stage mode we do NOT distribute the delta automatically —
        # the user updates the bucket explicitly (honesty principle: no
        # made-up per-stage attribution).

    db.commit()
    db.refresh(log)
    return log


@router.put("/care-logs/{log_id}", response_model=FeederCareLogResponse)
async def update_care_log(
    log_id: UUID,
    payload: FeederCareLogUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = (
        db.query(FeederCareLog)
        .filter(FeederCareLog.id == log_id, FeederCareLog.user_id == current_user.id)
        .first()
    )
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Care log not found")

    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(log, k, v)

    db.commit()
    db.refresh(log)
    return log


@router.delete("/care-logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_care_log(
    log_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = (
        db.query(FeederCareLog)
        .filter(FeederCareLog.id == log_id, FeederCareLog.user_id == current_user.id)
        .first()
    )
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Care log not found")

    db.delete(log)
    db.commit()
    return None
