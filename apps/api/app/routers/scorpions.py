"""Scorpion routes — per-animal CRUD.

Mirrors `tarantulas.py` shape. The Phase 1 surface is intentionally a
straight CRUD; analytics / breeding endpoints land in later phases.

  GET    /api/v1/scorpions/                  list user's scorpions
  POST   /api/v1/scorpions/                  create
  GET    /api/v1/scorpions/{scorpion_id}     fetch one
  PUT    /api/v1/scorpions/{scorpion_id}     partial update
  DELETE /api/v1/scorpions/{scorpion_id}     delete (cascades to logs)
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.scorpion import Scorpion
from app.models.scorpion_colony import ScorpionColony
from app.models.scorpion_species import ScorpionSpecies
from app.models.tarantula import Sex, Source  # shared DB enums (UPPERCASE)
from app.schemas.scorpion import (
    ScorpionCreate, ScorpionResponse, ScorpionUpdate,
)
from app.utils.dependencies import get_current_user
from app.utils.limits import enforce_collection_limit
# ADR-005 Phase A2 dual-write into `inverts`.
from app.services.inverts_dualwrite import (
    mirror_scorpion_create,
    mirror_scorpion_delete,
    mirror_scorpion_update,
)

router = APIRouter()


def _coerce_enums(data: dict) -> dict:
    """Map string sex/source onto the shared DB enums. SQLAlchemy stores
    the enum's NAME (UPPERCASE), so we need the Python enum member."""
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


def _validate_colony(
    db: Session, user: User, colony_id: Optional[UUID],
) -> None:
    """Reject colony_ids that don't belong to the current user.
    SET-NULL on delete protects from a stale pointer, but here we want
    a hard 404 so the keeper notices they're attaching a scorpion to
    something they can't see."""
    if colony_id is None:
        return
    colony = db.query(ScorpionColony).filter(
        ScorpionColony.id == colony_id,
        ScorpionColony.user_id == user.id,
    ).first()
    if not colony:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Colony not found or not yours",
        )


def _validate_species(
    db: Session, species_id: Optional[UUID],
) -> None:
    """Species catalog is public — only check it exists if provided."""
    if species_id is None:
        return
    exists = db.query(ScorpionSpecies.id).filter(
        ScorpionSpecies.id == species_id,
    ).first()
    if not exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scorpion species not found",
        )


@router.get("/", response_model=List[ScorpionResponse])
async def list_scorpions(
    colony_id: Optional[UUID] = Query(
        None, description="Filter to members of one colony.",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the authenticated user's scorpions, newest first."""
    query = db.query(Scorpion).filter(Scorpion.user_id == current_user.id)
    if colony_id is not None:
        query = query.filter(Scorpion.colony_id == colony_id)
    return query.order_by(Scorpion.created_at.desc()).all()


@router.post(
    "/", response_model=ScorpionResponse, status_code=status.HTTP_201_CREATED,
)
async def create_scorpion(
    scorpion_data: ScorpionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new scorpion for the authenticated user."""
    # Cross-taxon collection cap (counts inverts: tarantulas + scorpions + centipedes).
    enforce_collection_limit(db, current_user)
    _validate_species(db, scorpion_data.species_id)
    _validate_colony(db, current_user, scorpion_data.colony_id)

    payload = _coerce_enums(scorpion_data.model_dump())

    # Default visibility to the owner's profile visibility, matching
    # the tarantula router.
    if not payload.get("visibility"):
        payload["visibility"] = (
            "public" if current_user.collection_visibility == "public"
            else "private"
        )

    new_scorpion = Scorpion(user_id=current_user.id, **payload)
    db.add(new_scorpion)
    # ADR-005 A2 mirror — flush so the new id is materialized, then
    # insert the matching `inverts` row in the same transaction.
    db.flush()
    mirror_scorpion_create(db, new_scorpion)
    db.commit()
    db.refresh(new_scorpion)

    # Bump times_kept on the species catalog row when linked.
    if new_scorpion.species_id:
        species = db.query(ScorpionSpecies).filter(
            ScorpionSpecies.id == new_scorpion.species_id,
        ).first()
        if species:
            species.times_kept = (species.times_kept or 0) + 1
            db.commit()

    return new_scorpion


@router.get("/{scorpion_id}", response_model=ScorpionResponse)
async def get_scorpion(
    scorpion_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch a single scorpion the current user owns."""
    scorpion = db.query(Scorpion).filter(
        Scorpion.id == scorpion_id,
        Scorpion.user_id == current_user.id,
    ).first()
    if not scorpion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scorpion not found",
        )
    return scorpion


@router.put("/{scorpion_id}", response_model=ScorpionResponse)
async def update_scorpion(
    scorpion_id: UUID,
    scorpion_data: ScorpionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Partial update — only fields present in the payload are applied."""
    scorpion = db.query(Scorpion).filter(
        Scorpion.id == scorpion_id,
        Scorpion.user_id == current_user.id,
    ).first()
    if not scorpion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scorpion not found",
        )

    update_data = scorpion_data.model_dump(exclude_unset=True)

    if "species_id" in update_data:
        _validate_species(db, update_data["species_id"])
    if "colony_id" in update_data:
        _validate_colony(db, current_user, update_data["colony_id"])

    update_data = _coerce_enums(update_data)
    for field, value in update_data.items():
        setattr(scorpion, field, value)

    # ADR-005 A2 mirror — keep the unified `inverts` row in sync.
    mirror_scorpion_update(db, scorpion)
    db.commit()
    db.refresh(scorpion)
    return scorpion


@router.delete(
    "/{scorpion_id}", status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_scorpion(
    scorpion_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a scorpion. Cascades to feeding/molt/substrate logs and
    photos via the FK ON DELETE CASCADE clauses set in scp_20260522."""
    scorpion = db.query(Scorpion).filter(
        Scorpion.id == scorpion_id,
        Scorpion.user_id == current_user.id,
    ).first()
    if not scorpion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scorpion not found",
        )
    db.delete(scorpion)
    # ADR-005 A2 mirror — drop the unified row too.
    mirror_scorpion_delete(db, scorpion_id)
    db.commit()
    return None
