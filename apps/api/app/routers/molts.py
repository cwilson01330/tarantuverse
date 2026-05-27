"""
Molt log routes
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import uuid

from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.models.scorpion import Scorpion
from app.models.molt_log import MoltLog
from app.schemas.molt import MoltLogCreate, MoltLogUpdate, MoltLogResponse
from app.utils.dependencies import get_current_user
from app.services.activity_service import create_activity
from app.services.inverts_dualwrite import invert_id_if_exists  # ADR-005 A2

router = APIRouter()


def _molt_owner_parent(molt: MoltLog, db: Session, user: User):
    """Return the owned parent row for a molt log (tarantula or scorpion),
    or None if the user isn't the owner.

    Centralized polymorphism check — molt_logs are at-least-one-of
    (tarantula_id, enclosure_id, scorpion_id) per the CHECK from
    scp_20260522. Enclosure-parented molts aren't reachable here yet
    (no /enclosures/{id}/molts route), so we only branch the two
    per-animal parents.
    """
    if molt.tarantula_id:
        return db.query(Tarantula).filter(
            Tarantula.id == molt.tarantula_id,
            Tarantula.user_id == user.id,
        ).first()
    if molt.scorpion_id:
        return db.query(Scorpion).filter(
            Scorpion.id == molt.scorpion_id,
            Scorpion.user_id == user.id,
        ).first()
    return None


@router.get("/tarantulas/{tarantula_id}/molts", response_model=List[MoltLogResponse])
async def get_molt_logs(
    tarantula_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all molt logs for a tarantula"""
    # Verify tarantula belongs to user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")

    molt_logs = db.query(MoltLog).filter(
        MoltLog.tarantula_id == tarantula_id
    ).order_by(MoltLog.molted_at.desc()).all()

    return molt_logs


@router.post("/tarantulas/{tarantula_id}/molts", response_model=MoltLogResponse, status_code=status.HTTP_201_CREATED)
async def create_molt_log(
    tarantula_id: uuid.UUID,
    molt_data: MoltLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new molt log"""
    # Verify tarantula belongs to user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")

    new_molt = MoltLog(
        tarantula_id=tarantula_id,
        invert_id=invert_id_if_exists(db, tarantula_id),  # ADR-005 A2
        **molt_data.model_dump()
    )

    db.add(new_molt)
    db.commit()
    db.refresh(new_molt)
    
    # Create activity feed entry
    await create_activity(
        db=db,
        user_id=current_user.id,
        action_type="molt",
        target_type="tarantula",
        target_id=tarantula_id,
        metadata={
            "tarantula_name": tarantula.name,
            "species_name": tarantula.common_name or tarantula.scientific_name,
            "thumbnail_url": tarantula.photo_url,
            "tarantula_id": str(tarantula.id),
            "molt_id": str(new_molt.id),
            "leg_span_after": str(molt_data.leg_span_after) if getattr(molt_data, 'leg_span_after', None) else None,
        }
    )

    return new_molt


@router.get("/scorpions/{scorpion_id}/molts", response_model=List[MoltLogResponse])
async def get_scorpion_molt_logs(
    scorpion_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List molt logs for a scorpion, most recent first.

    Molting is the headline event for scorpions (along with feeding).
    The instar tracking lives on `scorpions.current_instar`; the molt
    log itself just records the date and any measurements the keeper
    captured."""
    scorpion = db.query(Scorpion).filter(
        Scorpion.id == scorpion_id,
        Scorpion.user_id == current_user.id,
    ).first()
    if not scorpion:
        raise HTTPException(status_code=404, detail="Scorpion not found")

    return (
        db.query(MoltLog)
        .filter(MoltLog.scorpion_id == scorpion_id)
        .order_by(MoltLog.molted_at.desc())
        .all()
    )


@router.post(
    "/scorpions/{scorpion_id}/molts",
    response_model=MoltLogResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_scorpion_molt_log(
    scorpion_id: uuid.UUID,
    molt_data: MoltLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a molt for a scorpion."""
    scorpion = db.query(Scorpion).filter(
        Scorpion.id == scorpion_id,
        Scorpion.user_id == current_user.id,
    ).first()
    if not scorpion:
        raise HTTPException(status_code=404, detail="Scorpion not found")

    new_molt = MoltLog(
        scorpion_id=scorpion_id,
        invert_id=invert_id_if_exists(db, scorpion_id),  # ADR-005 A2
        **molt_data.model_dump(),
    )
    db.add(new_molt)
    db.commit()
    db.refresh(new_molt)
    return new_molt


@router.get("/molts/{molt_id}", response_model=MoltLogResponse)
async def get_molt_log(
    molt_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Read a single molt log (polymorphic — tarantula or scorpion parent).

    Powers edit forms — without it the edit screen would have to scan
    the parent's whole molt history to find the row by id."""
    molt = db.query(MoltLog).filter(MoltLog.id == molt_id).first()
    if not molt:
        raise HTTPException(status_code=404, detail="Molt log not found")
    if _molt_owner_parent(molt, db, current_user) is None:
        raise HTTPException(status_code=403, detail="Not authorized")
    return molt


@router.put("/molts/{molt_id}", response_model=MoltLogResponse)
async def update_molt_log(
    molt_id: uuid.UUID,
    molt_data: MoltLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a molt log (polymorphic — tarantula or scorpion parent)."""
    molt = db.query(MoltLog).filter(MoltLog.id == molt_id).first()
    if not molt:
        raise HTTPException(status_code=404, detail="Molt log not found")
    if _molt_owner_parent(molt, db, current_user) is None:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = molt_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(molt, field, value)

    db.commit()
    db.refresh(molt)
    return molt


@router.delete("/molts/{molt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_molt_log(
    molt_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a molt log (polymorphic — tarantula or scorpion parent)."""
    molt = db.query(MoltLog).filter(MoltLog.id == molt_id).first()
    if not molt:
        raise HTTPException(status_code=404, detail="Molt log not found")
    if _molt_owner_parent(molt, db, current_user) is None:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.delete(molt)
    db.commit()
    return None
