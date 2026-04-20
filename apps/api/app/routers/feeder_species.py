"""
Feeder species reference data.

Read endpoints are public (no auth) to match the tarantula species pattern.
Write endpoints require is_superuser.
"""
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, cast, String as SAString

from app.database import get_db
from app.models.user import User
from app.models.feeder_species import FeederSpecies
from app.schemas.feeder_species import (
    FeederSpeciesCreate,
    FeederSpeciesUpdate,
    FeederSpeciesResponse,
    FeederSpeciesListItem,
)
from app.utils.dependencies import get_current_user

router = APIRouter()


@router.get("/", response_model=List[FeederSpeciesListItem])
async def list_feeder_species(
    q: Optional[str] = Query(None, max_length=100, description="Search scientific or common name"),
    category: Optional[str] = Query(None, pattern=r"^(cricket|roach|larvae|other)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Public: list feeder species. Supports text search + category filter."""
    query = db.query(FeederSpecies)

    if category:
        query = query.filter(FeederSpecies.category == category)

    if q:
        needle = f"%{q.lower().strip()}%"
        query = query.filter(
            or_(
                FeederSpecies.scientific_name_lower.ilike(needle),
                # common_names is Postgres ARRAY(String) — cast to text for substring match
                cast(FeederSpecies.common_names, SAString).ilike(needle),
            )
        )

    return (
        query.order_by(FeederSpecies.scientific_name.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/{species_id}", response_model=FeederSpeciesResponse)
async def get_feeder_species(
    species_id: UUID,
    db: Session = Depends(get_db),
):
    """Public: get a single feeder species by id."""
    sp = db.query(FeederSpecies).filter(FeederSpecies.id == species_id).first()
    if not sp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feeder species not found")
    return sp


@router.post("/", response_model=FeederSpeciesResponse, status_code=status.HTTP_201_CREATED)
async def create_feeder_species(
    payload: FeederSpeciesCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin: create a feeder species."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    scientific_lower = payload.scientific_name.strip().lower()
    existing = (
        db.query(FeederSpecies)
        .filter(FeederSpecies.scientific_name_lower == scientific_lower)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Feeder species with this scientific name already exists",
        )

    data = payload.model_dump()
    sp = FeederSpecies(
        scientific_name=payload.scientific_name.strip(),
        scientific_name_lower=scientific_lower,
        is_verified=True,  # admin-created entries are auto-verified
        **{k: v for k, v in data.items() if k != "scientific_name"},
    )
    db.add(sp)
    db.commit()
    db.refresh(sp)
    return sp


@router.put("/{species_id}", response_model=FeederSpeciesResponse)
async def update_feeder_species(
    species_id: UUID,
    payload: FeederSpeciesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin: update a feeder species."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    sp = db.query(FeederSpecies).filter(FeederSpecies.id == species_id).first()
    if not sp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feeder species not found")

    data = payload.model_dump(exclude_unset=True)
    if "scientific_name" in data and data["scientific_name"]:
        new_name = data["scientific_name"].strip()
        new_lower = new_name.lower()
        if new_lower != sp.scientific_name_lower:
            conflict = (
                db.query(FeederSpecies)
                .filter(FeederSpecies.scientific_name_lower == new_lower)
                .first()
            )
            if conflict:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Another feeder species already uses this scientific name",
                )
        sp.scientific_name = new_name
        sp.scientific_name_lower = new_lower
        data.pop("scientific_name")

    for k, v in data.items():
        setattr(sp, k, v)

    db.commit()
    db.refresh(sp)
    return sp


@router.delete("/{species_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_feeder_species(
    species_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin: delete a feeder species. Colonies referencing this species keep
    their row; feeder_species_id is SET NULL (handled by FK ondelete)."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    sp = db.query(FeederSpecies).filter(FeederSpecies.id == species_id).first()
    if not sp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feeder species not found")

    db.delete(sp)
    db.commit()
    return None
