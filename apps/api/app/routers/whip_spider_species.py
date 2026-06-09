"""Whip spider (Amblypygi) species catalog routes — ADR-006 taxon #1.

  GET  /api/v1/whip-spider-species/search?q=…      autocomplete
  GET  /api/v1/whip-spider-species/                 paginated list
  GET  /api/v1/whip-spider-species/by-slug/{slug}   SEO-friendly fetch
  GET  /api/v1/whip-spider-species/{id}             detail

Per-taxon facade over the unified `invert_species` catalog (same data is
reachable via /invert-species/?taxon=whip_spider). Reads are PUBLIC so
unauthenticated visitors can browse care sheets — matches the existing
per-taxon species routers. Community submissions go through
/invert-species/.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.invert_species import InvertSpecies
from app.schemas.invert_species import InvertSpeciesResponse

router = APIRouter()


TAXON = "whip_spider"


@router.get("/search", response_model=List[InvertSpeciesResponse])
async def search_whip_spider_species(
    q: str = Query(..., min_length=1, max_length=120),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Autocomplete restricted to whip spider species."""
    needle = q.strip().lower()
    if not needle:
        return []
    return (
        db.query(InvertSpecies)
        .filter(
            InvertSpecies.taxon == TAXON,
            or_(
                InvertSpecies.scientific_name_lower.like(f"%{needle}%"),
                func.array_to_string(
                    InvertSpecies.common_names, "|",
                ).ilike(f"%{needle}%"),
            ),
        )
        .order_by(
            InvertSpecies.times_kept.desc().nullslast(),
            InvertSpecies.scientific_name,
        )
        .limit(limit)
        .all()
    )


@router.get("/", response_model=List[InvertSpeciesResponse])
async def list_whip_spider_species(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    verified_only: bool = Query(False),
    care_level: Optional[str] = Query(
        None, pattern="^(beginner|intermediate|advanced)$",
    ),
    db: Session = Depends(get_db),
):
    """Paginated whip spider species list."""
    query = db.query(InvertSpecies).filter(InvertSpecies.taxon == TAXON)
    if verified_only:
        query = query.filter(InvertSpecies.is_verified.is_(True))
    if care_level:
        query = query.filter(InvertSpecies.care_level == care_level)
    return (
        query
        .order_by(InvertSpecies.scientific_name)
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/by-slug/{slug}", response_model=InvertSpeciesResponse)
async def get_whip_spider_species_by_slug(
    slug: str,
    db: Session = Depends(get_db),
):
    """Slug-based fetch for public care-sheet URLs. 404 if not whip_spider."""
    species = db.query(InvertSpecies).filter(
        InvertSpecies.slug == slug,
        InvertSpecies.taxon == TAXON,
    ).first()
    if not species:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Whip spider species not found",
        )
    return species


@router.get("/{species_id}", response_model=InvertSpeciesResponse)
async def get_whip_spider_species(
    species_id: UUID,
    db: Session = Depends(get_db),
):
    """Detail. 404 if the row isn't whip_spider taxon — prevents this
    route from leaking other taxa's species by UUID."""
    species = db.query(InvertSpecies).filter(
        InvertSpecies.id == species_id,
        InvertSpecies.taxon == TAXON,
    ).first()
    if not species:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Whip spider species not found",
        )
    return species
