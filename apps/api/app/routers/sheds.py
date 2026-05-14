"""Shed log routes — Herpetoverse

Parallel to the molt_logs router — reptiles + amphibians shed,
tarantulas molt. ADR-003 collapsed the per-taxon parent tables, so the
route surface is now taxon-agnostic:

  GET    /animals/{animal_id}/sheds
  POST   /animals/{animal_id}/sheds
  GET    /sheds/{shed_id}
  PUT    /sheds/{shed_id}
  DELETE /sheds/{shed_id}

Ownership is enforced by walking `shed.animal.user_id == current_user.id`
on every write; reads do the same via the owning animal.

Side-effect on POST: denormalize `animals.last_shed_at` to the new
shed date so dashboards don't scan the full shed history for the
"last shed X days ago" badge.
"""
from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.animal import Animal
from app.models.shed_log import ShedLog
from app.schemas.shed_log import ShedLogCreate, ShedLogUpdate, ShedLogResponse
from app.utils.dependencies import get_current_user

router = APIRouter()


def _get_owned_animal(db: Session, animal_id: uuid.UUID, user: User) -> Animal:
    animal = (
        db.query(Animal)
        .filter(Animal.id == animal_id, Animal.user_id == user.id)
        .first()
    )
    if not animal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Animal not found"
        )
    return animal


def _get_owned_shed(db: Session, shed_id: uuid.UUID, user: User) -> ShedLog:
    """Fetch a shed log and verify the owning animal belongs to the
    caller. Raises 404 for missing shed, 403 for not-your-shed."""
    shed = db.query(ShedLog).filter(ShedLog.id == shed_id).first()
    if not shed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Shed log not found"
        )

    owner = (
        db.query(Animal)
        .filter(Animal.id == shed.animal_id, Animal.user_id == user.id)
        .first()
    )
    if not owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized"
        )
    return shed


@router.get("/animals/{animal_id}/sheds", response_model=List[ShedLogResponse])
async def list_sheds(
    animal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List shed logs for an animal, most recent first."""
    _get_owned_animal(db, animal_id, current_user)
    return (
        db.query(ShedLog)
        .filter(ShedLog.animal_id == animal_id)
        .order_by(ShedLog.shed_at.desc())
        .all()
    )


@router.post(
    "/animals/{animal_id}/sheds",
    response_model=ShedLogResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_shed(
    animal_id: uuid.UUID,
    shed_data: ShedLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a shed. Denormalizes `animals.last_shed_at` so the dashboard
    "X days since shed" badge doesn't re-scan the shed history."""
    animal = _get_owned_animal(db, animal_id, current_user)

    new_shed = ShedLog(animal_id=animal_id, **shed_data.model_dump())
    db.add(new_shed)

    # Denormalize last_shed_at — only move it forward, never backward
    # (so backfilling an old shed doesn't regress the dashboard badge).
    shed_date = new_shed.shed_at.date() if new_shed.shed_at else None
    if shed_date and (
        animal.last_shed_at is None or shed_date > animal.last_shed_at
    ):
        animal.last_shed_at = shed_date

    db.commit()
    db.refresh(new_shed)
    return new_shed


@router.get("/sheds/{shed_id}", response_model=ShedLogResponse)
async def get_shed(
    shed_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch a single shed log by id — used by the edit forms to
    pre-fill fields."""
    return _get_owned_shed(db, shed_id, current_user)


@router.put("/sheds/{shed_id}", response_model=ShedLogResponse)
async def update_shed(
    shed_id: uuid.UUID,
    shed_data: ShedLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Partial update of a shed log."""
    shed = _get_owned_shed(db, shed_id, current_user)

    update_data = shed_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(shed, field, value)

    db.commit()
    db.refresh(shed)
    return shed


@router.delete("/sheds/{shed_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shed(
    shed_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a shed log. Does NOT recompute last_shed_at — that would
    need a full history scan; acceptable since last_shed_at is a hint,
    not authoritative."""
    shed = _get_owned_shed(db, shed_id, current_user)
    db.delete(shed)
    db.commit()
    return None
