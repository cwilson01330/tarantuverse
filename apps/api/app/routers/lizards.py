"""Lizard routes — Herpetoverse v1 CRUD

Skinny v1 — mirrors apps/api/app/routers/snakes.py exactly. Every new
Herpetoverse taxon gets the same CRUD surface so the front-end pattern
stays one-to-one per animal type.

Ownership model: every query filters by `Lizard.user_id == current_user.id`.
Anonymous / public reads go through `/t/{id}` (qr router) once lizard-aware.
"""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.lizard import Lizard
from app.models.shed_log import ShedLog
from app.models.weight_log import WeightLog
from app.models.animal_genotype import AnimalGenotype
from app.models.photo import Photo
from app.models.tarantula import Sex, Source  # shared DB enums
from app.schemas.lizard import LizardCreate, LizardUpdate, LizardResponse
from app.utils.dependencies import get_current_user

router = APIRouter()


def _coerce_enums(data: dict) -> dict:
    """Map string sex/source values to the shared SQLAlchemy enum members.

    The DB enum types were created with uppercase member names (MALE, BRED, ...)
    but the API accepts lowercase values. Passing the Python enum member makes
    SQLAlchemy store the name rather than the value string, which matches the
    tarantulas + snakes tables.
    """
    if data.get("sex"):
        try:
            data["sex"] = Sex(data["sex"])
        except ValueError:
            pass
    if data.get("source"):
        try:
            data["source"] = Source(data["source"])
        except ValueError:
            pass
    return data


@router.get("/", response_model=List[LizardResponse])
async def get_lizards(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all lizards owned by the authenticated user, newest first."""
    return (
        db.query(Lizard)
        .filter(Lizard.user_id == current_user.id)
        .order_by(Lizard.created_at.desc())
        .all()
    )


@router.post("/", response_model=LizardResponse, status_code=status.HTTP_201_CREATED)
async def create_lizard(
    lizard_data: LizardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new lizard for the authenticated user."""
    lizard_dict = _coerce_enums(lizard_data.model_dump())

    new_lizard = Lizard(user_id=current_user.id, **lizard_dict)
    db.add(new_lizard)
    db.commit()
    db.refresh(new_lizard)

    # TODO: bump reptile_species.times_kept once that column exists
    # TODO: emit `new_lizard` activity feed entry when feed has reptile icons

    return new_lizard


@router.get("/{lizard_id}", response_model=LizardResponse)
async def get_lizard(
    lizard_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch one lizard by id. Owner-only."""
    lizard = (
        db.query(Lizard)
        .filter(Lizard.id == lizard_id, Lizard.user_id == current_user.id)
        .first()
    )
    if not lizard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lizard not found"
        )
    return lizard


@router.put("/{lizard_id}", response_model=LizardResponse)
async def update_lizard(
    lizard_id: UUID,
    lizard_data: LizardUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Partial update. Only provided fields are written."""
    lizard = (
        db.query(Lizard)
        .filter(Lizard.id == lizard_id, Lizard.user_id == current_user.id)
        .first()
    )
    if not lizard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lizard not found"
        )

    update_data = _coerce_enums(lizard_data.model_dump(exclude_unset=True))
    for field, value in update_data.items():
        setattr(lizard, field, value)

    db.commit()
    db.refresh(lizard)
    return lizard


@router.delete("/{lizard_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lizard(
    lizard_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Hard-delete a lizard and its dependent rows.

    Manual cascade of the polymorphic children for the same belt-and-
    suspenders reason snakes.py does it — not every environment may
    have the CASCADE FKs backfilled by the time this runs.
    """
    lizard = (
        db.query(Lizard)
        .filter(Lizard.id == lizard_id, Lizard.user_id == current_user.id)
        .first()
    )
    if not lizard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lizard not found"
        )

    db.query(ShedLog).filter(ShedLog.lizard_id == lizard_id).delete()
    db.query(WeightLog).filter(WeightLog.lizard_id == lizard_id).delete()
    db.query(AnimalGenotype).filter(AnimalGenotype.lizard_id == lizard_id).delete()
    db.query(Photo).filter(Photo.lizard_id == lizard_id).delete()
    # QRUploadSession has ON DELETE CASCADE in its FK definition, so we skip it.

    db.delete(lizard)
    db.commit()
    return None
