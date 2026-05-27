"""Centipede species catalog routes — Phase C2 of ADR-005.

  GET  /api/v1/centipede-species/search?q=…   autocomplete
  GET  /api/v1/centipede-species/              paginated list
  GET  /api/v1/centipede-species/by-slug/{slug}  SEO-friendly fetch
  GET  /api/v1/centipede-species/{id}          detail

Per-taxon facade over the unified `invert_species` catalog. The same
data is reachable via `/invert-species/?taxon=centipede` — this router
exists for keeper-UX consistency with `/species/` (tarantulas) and
`/scorpion-species/` (scorpions).

Reads are PUBLIC (no auth) so unauthenticated visitors can browse care
sheets — matches the existing per-taxon species router behavior.

Community submissions (POST/PUT/DELETE) go through `/invert-species/`
rather than this router. Reason: the centipede catalog is small and
admin-curated for v1; cross-taxon submission flow is centralized at
the unified surface.
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


TAXON = "centipede"


@router.get("/search", response_model=List[InvertSpeciesResponse])
async def search_centipede_species(
    q: str = Query(..., min_length=1, max_length=120),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Autocomplete restricted to centipede species. Case-insensitive
    via scientific_name_lower + common_names array search."""
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
async def list_centipede_species(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    verified_only: bool = Query(False),
    care_level: Optional[str] = Query(
        None, pattern="^(beginner|intermediate|advanced)$",
    ),
    db: Session = Depends(get_db),
):
    """Paginated centipede species list."""
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
async def get_centipede_species_by_slug(
    slug: str,
    db: Session = Depends(get_db),
):
    """Slug-based fetch for public care-sheet URLs. 404 if not centipede."""
    species = db.query(InvertSpecies).filter(
        InvertSpecies.slug == slug,
        InvertSpecies.taxon == TAXON,
    ).first()
    if not species:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Centipede species not found",
        )
    return species


@router.get("/{species_id}", response_model=InvertSpeciesResponse)
async def get_centipede_species(
    species_id: UUID,
    db: Session = Depends(get_db),
):
    """Detail. 404 if the row isn't centipede taxon — prevents this
    route from leaking tarantula or scorpion species by UUID."""
    species = db.query(InvertSpecies).filter(
        InvertSpecies.id == species_id,
        InvertSpecies.taxon == TAXON,
    ).first()
    if not species:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Centipede species not found",
        )
    return species
