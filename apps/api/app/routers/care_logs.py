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
from app.utils.access import access_helper, load_colony, load_invert, load_log_parent, policy, require_can_change

router = APIRouter()


@access_helper
def _log_for(log_id: uuid.UUID, db: Session, user: User, need: str):
    """A care log plus the caller's access to its parent animal or colony.

    Resolved through the PARENT (utils/access), not the row's own user_id:
    the row's user_id is always the owner's, and a co-keeper's access comes
    from their membership in the owner's collection. 404 for missing and for
    no access alike.
    """
    log = db.query(CareLog).filter(CareLog.id == log_id).first()
    _parent, access = load_log_parent(db, user, log, need, not_found="Care log not found")
    return log, access


@router.get("/inverts/{invert_id}/care-logs", response_model=List[CareLogResponse])
@policy("viewer")
async def list_care_logs(
    invert_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Newest first, matching every other log list in the app."""
    load_invert(db, current_user, invert_id, "viewer")
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
@policy("logger")
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
    _invert, access = load_invert(db, current_user, invert_id, "logger")
    log = CareLog(
        invert_id=invert_id,
        user_id=access.owner.id,  # the collection's owner, whoever logged it
        logged_by_user_id=access.logged_by_user_id,
        **log_data.model_dump(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("/colonies/{colony_id}/care-logs", response_model=List[CareLogResponse])
@policy("viewer")
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
    load_colony(db, current_user, colony_id, "viewer")
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
@policy("logger")
async def create_colony_care_log(
    colony_id: uuid.UUID,
    log_data: CareLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _colony, access = load_colony(db, current_user, colony_id, "logger")
    log = CareLog(
        colony_id=colony_id,
        user_id=access.owner.id,
        logged_by_user_id=access.logged_by_user_id,
        **log_data.model_dump(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


# Edit and delete resolve access through the log's parent (see _log_for).
@router.put("/care-logs/{log_id}", response_model=CareLogResponse)
@policy("logger")
async def update_care_log(
    log_id: uuid.UUID,
    log_data: CareLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    log, access = _log_for(log_id, db, current_user, "logger")
    require_can_change(access, log)
    for field, value in log_data.model_dump(exclude_unset=True).items():
        setattr(log, field, value)
    db.commit()
    db.refresh(log)
    return log


@router.delete("/care-logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
@policy("logger")
async def delete_care_log(
    log_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    log, access = _log_for(log_id, db, current_user, "logger")
    require_can_change(access, log)
    db.delete(log)
    db.commit()
