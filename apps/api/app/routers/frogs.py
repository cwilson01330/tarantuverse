"""Frog routes — Herpetoverse v1 CRUD

Skinny v1 — mirrors apps/api/app/routers/lizards.py exactly. Every HV
taxon gets the same CRUD surface so the front-end pattern stays
one-to-one per animal type.

Ownership model: every query filters by `Frog.user_id == current_user.id`.
Anonymous / public reads go through `/t/{id}` (qr router) once frog-aware.
"""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.frog import Frog
from app.models.shed_log import ShedLog
from app.models.weight_log import WeightLog
from app.models.animal_genotype import AnimalGenotype
from app.models.photo import Photo
from app.models.tarantula import Sex, Source  # shared DB enums
from app.schemas.frog import FrogCreate, FrogUpdate, FrogResponse
from app.utils.dependencies import get_current_user

router = APIRouter()


def _coerce_enums(data: dict) -> dict:
    """Map string sex/source values to the shared SQLAlchemy enum members.

    Same UPPERCASE-name convention as tarantulas / snakes / lizards.
    Passing the Python enum member makes SQLAlchemy store the name
    rather than the value string, matching the shared `sex` / `source`
    PG enum types.
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


@router.get("/", response_model=List[FrogResponse])
async def get_frogs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all frogs owned by the authenticated user, newest first."""
    return (
        db.query(Frog)
        .filter(Frog.user_id == current_user.id)
        .order_by(Frog.created_at.desc())
        .all()
    )


@router.post("/", response_model=FrogResponse, status_code=status.HTTP_201_CREATED)
async def create_frog(
    frog_data: FrogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new frog for the authenticated user."""
    frog_dict = _coerce_enums(frog_data.model_dump())

    new_frog = Frog(user_id=current_user.id, **frog_dict)
    db.add(new_frog)
    db.commit()
    db.refresh(new_frog)

    # TODO: bump reptile_species.times_kept once that column exists
    # TODO: emit `new_frog` activity feed entry when feed has amphibian icons

    return new_frog


@router.get("/{frog_id}", response_model=FrogResponse)
async def get_frog(
    frog_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch one frog by id. Owner-only."""
    frog = (
        db.query(Frog)
        .filter(Frog.id == frog_id, Frog.user_id == current_user.id)
        .first()
    )
    if not frog:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Frog not found"
        )
    return frog


@router.put("/{frog_id}", response_model=FrogResponse)
async def update_frog(
    frog_id: UUID,
    frog_data: FrogUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Partial update. Only provided fields are written."""
    frog = (
        db.query(Frog)
        .filter(Frog.id == frog_id, Frog.user_id == current_user.id)
        .first()
    )
    if not frog:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Frog not found"
        )

    update_data = _coerce_enums(frog_data.model_dump(exclude_unset=True))
    for field, value in update_data.items():
        setattr(frog, field, value)

    db.commit()
    db.refresh(frog)
    return frog


@router.delete("/{frog_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_frog(
    frog_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Hard-delete a frog and its dependent rows.

    Manual cascade of the polymorphic children — same belt-and-
    suspenders pattern snakes.py / lizards.py use.
    """
    frog = (
        db.query(Frog)
        .filter(Frog.id == frog_id, Frog.user_id == current_user.id)
        .first()
    )
    if not frog:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Frog not found"
        )

    db.query(ShedLog).filter(ShedLog.frog_id == frog_id).delete()
    db.query(WeightLog).filter(WeightLog.frog_id == frog_id).delete()
    db.query(AnimalGenotype).filter(AnimalGenotype.frog_id == frog_id).delete()
    db.query(Photo).filter(Photo.frog_id == frog_id).delete()
    # QRUploadSession has ON DELETE CASCADE in its FK definition.

    db.delete(frog)
    db.commit()
    return None
