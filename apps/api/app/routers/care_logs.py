"""
Care log routes — water dish, overflow, misting.

ONE endpoint pair, parented on `inverts`. Tarantulas and scorpions resolve here
without a facade because legacy rows share primary keys with `inverts`
(ADR-005). substrate_changes grew a GET/POST pair per taxon — tarantulas,
scorpions, centipedes, whip spiders, inverts, colonies — and every new taxon
since has meant editing that file. This one doesn't.
"""
from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.care_log import CareLog
from app.models.colony import Colony
from app.models.invert import Invert
from app.models.user import User
from app.schemas.care_log import CareLogCreate, CareLogResponse, CareLogUpdate
from app.utils.dependencies import get_current_user

router = APIRouter()


def _owned_invert(invert_id: uuid.UUID, db: Session, user: User) -> Invert:
    invert = (
        db.query(Invert)
        .filter(Invert.id == invert_id, Invert.user_id == user.id)
        .first()
    )
    if not invert:
        # 404 rather than 403 — a stranger's animal id shouldn't be
        # distinguishable from one that doesn't exist.
        raise HTTPException(status_code=404, detail="Animal not found")
    return invert


def _owned_colony(colony_id: uuid.UUID, db: Session, user: User) -> Colony:
    colony = (
        db.query(Colony)
        .filter(Colony.id == colony_id, Colony.user_id == user.id)
        .first()
    )
    if not colony:
        raise HTTPException(status_code=404, detail="Colony not found")
    return colony


def _owned_log(log_id: uuid.UUID, db: Session, user: User) -> CareLog:
    log = (
        db.query(CareLog)
        .filter(CareLog.id == log_id, CareLog.user_id == user.id)
        .first()
    )
    if not log:
        raise HTTPException(status_code=404, detail="Care log not found")
    return log


@router.get("/inverts/{invert_id}/care-logs", response_model=List[CareLogResponse])
async def list_care_logs(
    invert_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Newest first, matching every other log list in the app."""
    _owned_invert(invert_id, db, current_user)
    return (
        db.query(CareLog)
        .filter(CareLog.invert_id == invert_id)
        .order_by(CareLog.logged_at.desc())
        .all()
    )


@router.post(
    "/inverts/{invert_id}/care-logs",
    response_model=CareLogResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_care_log(
    invert_id: uuid.UUID,
    log_data: CareLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record a hydration event.

    Nothing is denormalised onto the parent animal, unlike substrate changes
    which forward-write `last_substrate_change`. There is no `last_watered`
    column and there should not be one: a denormalised "last" invites a
    "days since", which invites an overdue threshold, which is the schedule
    this feature deliberately doesn't have.
    """
    _owned_invert(invert_id, db, current_user)
    log = CareLog(
        invert_id=invert_id,
        user_id=current_user.id,
        **log_data.model_dump(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("/colonies/{colony_id}/care-logs", response_model=List[CareLogResponse])
async def list_colony_care_logs(
    colony_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Hydration history for a colony.

    For a detritivore culture this is the main husbandry record, not a
    secondary one — isopods and springtails are watered constantly and fed
    almost incidentally.
    """
    _owned_colony(colony_id, db, current_user)
    return (
        db.query(CareLog)
        .filter(CareLog.colony_id == colony_id)
        .order_by(CareLog.logged_at.desc())
        .all()
    )


@router.post(
    "/colonies/{colony_id}/care-logs",
    response_model=CareLogResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_colony_care_log(
    colony_id: uuid.UUID,
    log_data: CareLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _owned_colony(colony_id, db, current_user)
    log = CareLog(
        colony_id=colony_id,
        user_id=current_user.id,
        **log_data.model_dump(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


# Edit and delete resolve ownership through `user_id` on the log itself, so
# they need no per-parent branch — a colony log and an animal log are both
# just the caller's row.
@router.put("/care-logs/{log_id}", response_model=CareLogResponse)
async def update_care_log(
    log_id: uuid.UUID,
    log_data: CareLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    log = _owned_log(log_id, db, current_user)
    for field, value in log_data.model_dump(exclude_unset=True).items():
        setattr(log, field, value)
    db.commit()
    db.refresh(log)
    return log


@router.delete("/care-logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_care_log(
    log_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    log = _owned_log(log_id, db, current_user)
    db.delete(log)
    db.commit()
