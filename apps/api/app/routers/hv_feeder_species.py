"""HV feeder species catalog — public browse + care sheet (ADR-012).

Mirrors the TV feeder-species catalog but for reptile/aquatic feeders
(rodent | fish | insect | chick | other). Read-only + public, like the TV
feeder + care-sheet catalogs.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.hv_feeder import HvFeederSpecies
from app.schemas.hv_feeder import HvFeederSpeciesResponse

router = APIRouter()


@router.get("/", response_model=List[HvFeederSpeciesResponse])
async def list_hv_feeder_species(
    q: Optional[str] = Query(None, description="Search scientific/common name"),
    category: Optional[str] = Query(
        None, pattern="^(rodent|fish|insect|chick|other)$"
    ),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Public catalog browse — filter by category, search by name."""
    query = db.query(HvFeederSpecies)
    if category:
        query = query.filter(HvFeederSpecies.category == category)
    if q:
        like = f"%{q.strip().lower()}%"
        query = query.filter(HvFeederSpecies.scientific_name_lower.ilike(like))
    return query.order_by(HvFeederSpecies.scientific_name).limit(limit).all()


@router.get("/{species_id}", response_model=HvFeederSpeciesResponse)
async def get_hv_feeder_species(
    species_id: UUID,
    db: Session = Depends(get_db),
):
    """Public care sheet for one HV feeder species."""
    sp = db.query(HvFeederSpecies).filter(HvFeederSpecies.id == species_id).first()
    if sp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feeder species not found")
    return sp
