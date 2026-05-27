"""Invert species catalog routes (ADR-005 Phase A1).

  GET  /api/v1/invert-species/search?q=…&taxon=…   autocomplete
  GET  /api/v1/invert-species/?taxon=…              paginated list
  GET  /api/v1/invert-species/by-slug/{slug}        SEO-friendly fetch
  GET  /api/v1/invert-species/{id}                  detail
  POST /api/v1/invert-species/                       community submit
  PUT  /api/v1/invert-species/{id}                   submitter or admin
  DELETE /api/v1/invert-species/{id}                 admin only

Reads are PUBLIC (no auth) so unauthenticated visitors can browse care
sheets. Writes are auth + submitter/admin gated.

Phase A1 serves only the (empty) `invert_species` table. Centipede
species seed lands in C2; tarantula + scorpion species get backfilled
in Phase B.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.invert_species import InvertSpecies
from app.models.user import User
from app.schemas.invert_species import (
    InvertSpeciesCreate, InvertSpeciesResponse, InvertSpeciesUpdate,
)
from app.utils.dependencies import get_current_user

router = APIRouter()


@router.get("/search", response_model=List[InvertSpeciesResponse])
async def search_invert_species(
    q: str = Query(..., min_length=1, max_length=120),
    taxon: Optional[str] = Query(
        None, pattern="^(tarantula|scorpion|centipede)$",
        description="Restrict search to a single taxon.",
    ),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Autocomplete search. Case-insensitive via scientific_name_lower."""
    needle = q.strip().lower()
    if not needle:
        return []
    query = (
        db.query(InvertSpecies)
        .filter(
            or_(
                InvertSpecies.scientific_name_lower.like(f"%{needle}%"),
                func.array_to_string(
                    InvertSpecies.common_names, "|",
                ).ilike(f"%{needle}%"),
            )
        )
    )
    if taxon:
        query = query.filter(InvertSpecies.taxon == taxon)
    return (
        query
        .order_by(
            InvertSpecies.times_kept.desc().nullslast(),
            InvertSpecies.scientific_name,
        )
        .limit(limit)
        .all()
    )


@router.get("/", response_model=List[InvertSpeciesResponse])
async def list_invert_species(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    taxon: Optional[str] = Query(
        None, pattern="^(tarantula|scorpion|centipede)$",
    ),
    verified_only: bool = Query(False),
    care_level: Optional[str] = Query(
        None, pattern="^(beginner|intermediate|advanced)$",
    ),
    db: Session = Depends(get_db),
):
    """Paginated list. Supports per-taxon filtering for the unified
    species browser on mobile + web."""
    query = db.query(InvertSpecies)
    if taxon:
        query = query.filter(InvertSpecies.taxon == taxon)
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
async def get_invert_species_by_slug(
    slug: str,
    db: Session = Depends(get_db),
):
    """Slug-based fetch for SEO-friendly public care-sheet URLs."""
    species = db.query(InvertSpecies).filter(
        InvertSpecies.slug == slug,
    ).first()
    if not species:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Species not found",
        )
    return species


@router.get("/{species_id}", response_model=InvertSpeciesResponse)
async def get_invert_species(
    species_id: UUID,
    db: Session = Depends(get_db),
):
    species = db.query(InvertSpecies).filter(
        InvertSpecies.id == species_id,
    ).first()
    if not species:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Species not found",
        )
    return species


@router.post(
    "/", response_model=InvertSpeciesResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_invert_species(
    payload: InvertSpeciesCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Community submission. Always created with is_verified=False;
    admin flips the bit after review."""
    existing = db.query(InvertSpecies).filter(
        or_(
            InvertSpecies.scientific_name == payload.scientific_name,
            InvertSpecies.scientific_name_lower
                == payload.scientific_name.lower(),
            InvertSpecies.slug == payload.slug,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A species with this scientific name or slug already exists",
        )

    new_species = InvertSpecies(
        **payload.model_dump(),
        scientific_name_lower=payload.scientific_name.lower(),
        submitted_by=current_user.id,
        is_verified=False,
    )
    db.add(new_species)
    db.commit()
    db.refresh(new_species)
    return new_species


@router.put("/{species_id}", response_model=InvertSpeciesResponse)
async def update_invert_species(
    species_id: UUID,
    payload: InvertSpeciesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submitter or admin can edit. Taxon is omitted from the update
    schema — a species's taxon is immutable."""
    species = db.query(InvertSpecies).filter(
        InvertSpecies.id == species_id,
    ).first()
    if not species:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Species not found",
        )

    is_admin = bool(getattr(current_user, "is_admin", False))
    if species.submitted_by != current_user.id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the submitter or an admin can edit this species",
        )

    data = payload.model_dump(exclude_unset=True)
    if data.get("scientific_name"):
        data["scientific_name_lower"] = data["scientific_name"].lower()

    for field, value in data.items():
        setattr(species, field, value)

    db.commit()
    db.refresh(species)
    return species


@router.delete(
    "/{species_id}", status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_invert_species(
    species_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admin only. Deletes the catalog row; inverts referencing it
    have species_id SET NULL by the FK clause in inv_20260527."""
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    species = db.query(InvertSpecies).filter(
        InvertSpecies.id == species_id,
    ).first()
    if not species:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Species not found",
        )
    db.delete(species)
    db.commit()
    return None
