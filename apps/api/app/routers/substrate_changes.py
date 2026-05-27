"""
Substrate change log routes
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import uuid

from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.models.scorpion import Scorpion
from app.models.substrate_change import SubstrateChange
from app.schemas.substrate_change import SubstrateChangeCreate, SubstrateChangeUpdate, SubstrateChangeResponse
from app.utils.dependencies import get_current_user
from app.services.inverts_dualwrite import invert_id_if_exists  # ADR-005 A2

router = APIRouter()


def _substrate_owner_parent(change: SubstrateChange, db: Session, user: User):
    """Return the owned parent for a substrate change (tarantula or
    scorpion), or None if the user doesn't own it.

    Polymorphism mirrors molt_logs — at-least-one of
    (tarantula_id, enclosure_id, scorpion_id) per scp_20260522. No
    enclosure-parented substrate-change route exists yet."""
    if change.tarantula_id:
        return db.query(Tarantula).filter(
            Tarantula.id == change.tarantula_id,
            Tarantula.user_id == user.id,
        ).first()
    if change.scorpion_id:
        return db.query(Scorpion).filter(
            Scorpion.id == change.scorpion_id,
            Scorpion.user_id == user.id,
        ).first()
    return None


@router.get("/tarantulas/{tarantula_id}/substrate-changes", response_model=List[SubstrateChangeResponse])
async def get_substrate_changes(
    tarantula_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all substrate change logs for a tarantula"""
    # Verify tarantula belongs to user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")

    changes = db.query(SubstrateChange).filter(
        SubstrateChange.tarantula_id == tarantula_id
    ).order_by(SubstrateChange.changed_at.desc()).all()

    return changes


@router.post("/tarantulas/{tarantula_id}/substrate-changes", response_model=SubstrateChangeResponse, status_code=status.HTTP_201_CREATED)
async def create_substrate_change(
    tarantula_id: uuid.UUID,
    change_data: SubstrateChangeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new substrate change log"""
    # Verify tarantula belongs to user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")

    new_change = SubstrateChange(
        tarantula_id=tarantula_id,
        invert_id=invert_id_if_exists(db, tarantula_id),  # ADR-005 A2
        **change_data.model_dump()
    )

    db.add(new_change)

    # Update the tarantula's last_substrate_change date
    tarantula.last_substrate_change = change_data.changed_at
    if change_data.substrate_type:
        tarantula.substrate_type = change_data.substrate_type
    if change_data.substrate_depth:
        tarantula.substrate_depth = change_data.substrate_depth

    db.commit()
    db.refresh(new_change)

    return new_change


@router.get(
    "/scorpions/{scorpion_id}/substrate-changes",
    response_model=List[SubstrateChangeResponse],
)
async def get_scorpion_substrate_changes(
    scorpion_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List substrate-change logs for a scorpion, most recent first."""
    scorpion = db.query(Scorpion).filter(
        Scorpion.id == scorpion_id,
        Scorpion.user_id == current_user.id,
    ).first()
    if not scorpion:
        raise HTTPException(status_code=404, detail="Scorpion not found")

    return (
        db.query(SubstrateChange)
        .filter(SubstrateChange.scorpion_id == scorpion_id)
        .order_by(SubstrateChange.changed_at.desc())
        .all()
    )


@router.post(
    "/scorpions/{scorpion_id}/substrate-changes",
    response_model=SubstrateChangeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_scorpion_substrate_change(
    scorpion_id: uuid.UUID,
    change_data: SubstrateChangeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a substrate change for a scorpion. Mirrors the tarantula
    path — denormalizes the change date + type + depth onto the parent
    scorpion so the detail card can show "last refreshed: X days ago"
    without a join."""
    scorpion = db.query(Scorpion).filter(
        Scorpion.id == scorpion_id,
        Scorpion.user_id == current_user.id,
    ).first()
    if not scorpion:
        raise HTTPException(status_code=404, detail="Scorpion not found")

    new_change = SubstrateChange(
        scorpion_id=scorpion_id,
        invert_id=invert_id_if_exists(db, scorpion_id),  # ADR-005 A2
        **change_data.model_dump(),
    )
    db.add(new_change)

    # Forward-only denormalization. Only refresh the parent's columns
    # if this change is more recent than what's currently denormalized.
    if (
        scorpion.last_substrate_change is None
        or change_data.changed_at > scorpion.last_substrate_change
    ):
        scorpion.last_substrate_change = change_data.changed_at
        if change_data.substrate_type:
            scorpion.substrate_type = change_data.substrate_type
        if change_data.substrate_depth:
            scorpion.substrate_depth = change_data.substrate_depth

    db.commit()
    db.refresh(new_change)
    return new_change


@router.put("/substrate-changes/{change_id}", response_model=SubstrateChangeResponse)
async def update_substrate_change(
    change_id: uuid.UUID,
    change_data: SubstrateChangeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a substrate change (polymorphic — tarantula or scorpion parent)."""
    change = db.query(SubstrateChange).filter(SubstrateChange.id == change_id).first()
    if not change:
        raise HTTPException(status_code=404, detail="Substrate change not found")
    if _substrate_owner_parent(change, db, current_user) is None:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = change_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(change, field, value)

    db.commit()
    db.refresh(change)
    return change


@router.delete("/substrate-changes/{change_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_substrate_change(
    change_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a substrate change (polymorphic — tarantula or scorpion parent)."""
    change = db.query(SubstrateChange).filter(SubstrateChange.id == change_id).first()
    if not change:
        raise HTTPException(status_code=404, detail="Substrate change not found")
    if _substrate_owner_parent(change, db, current_user) is None:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.delete(change)
    db.commit()
    return None
