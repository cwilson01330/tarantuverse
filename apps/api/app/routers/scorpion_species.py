"""Scorpion species catalog routes.

Mirrors `species.py` but scoped to scorpions. Reads are public so
unauthenticated visitors can browse care sheets; writes require auth
and only the submitter or an admin can update / delete.

  GET  /api/v1/scorpion-species/search?q=...   autocomplete
  GET  /api/v1/scorpion-species/                list (paginated)
  GET  /api/v1/scorpion-species/{id}             detail
  GET  /api/v1/scorpion-species/by-slug/{slug}   detail by slug
  POST /api/v1/scorpion-species/                 community submission
  PUT  /api/v1/scorpion-species/{id}             submitter or admin
  DELETE /api/v1/scorpion-species/{id}           admin only
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.scorpion_species import ScorpionSpecies
from app.models.user import User
from app.schemas.scorpion_species import (
    ScorpionSpeciesCreate, ScorpionSpeciesResponse, ScorpionSpeciesUpdate,
)
from app.utils.dependencies import get_current_user

router = APIRouter()


@router.get("/search", response_model=List[ScorpionSpeciesResponse])
async def search_scorpion_species(
    q: str = Query(..., min_length=1, max_length=120, description="Scientific or common-name fragment"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Autocomplete-style search across scientific name and common
    names. Case-insensitive via the indexed `scientific_name_lower`
    column. Public endpoint."""
    needle = q.strip().lower()
    if not needle:
        return []
    # The ARRAY-cast lower-case match on common_names handles the
    # case-insensitive part for the array elements.
    results = (
        db.query(ScorpionSpecies)
        .filter(
            or_(
                ScorpionSpecies.scientific_name_lower.like(f"%{needle}%"),
                func.array_to_string(
                    ScorpionSpecies.common_names, "|",
                ).ilike(f"%{needle}%"),
            )
        )
        .order_by(ScorpionSpecies.times_kept.desc().nullslast(), ScorpionSpecies.scientific_name)
        .limit(limit)
        .all()
    )
    return results


@router.get("/", response_model=List[ScorpionSpeciesResponse])
async def list_scorpion_species(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    verified_only: bool = Query(False),
    care_level: Optional[str] = Query(
        None, pattern="^(beginner|intermediate|advanced)$",
    ),
    db: Session = Depends(get_db),
):
    """Paginated list. Public — supports filtering by verified status
    and by care_level so the mobile species browser can split beginner
    species into a separate tab."""
    query = db.query(ScorpionSpecies)
    if verified_only:
        query = query.filter(ScorpionSpecies.is_verified.is_(True))
    if care_level:
        query = query.filter(ScorpionSpecies.care_level == care_level)
    return (
        query
        .order_by(ScorpionSpecies.scientific_name)
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/by-slug/{slug}", response_model=ScorpionSpeciesResponse)
async def get_scorpion_species_by_slug(
    slug: str,
    db: Session = Depends(get_db),
):
    """Slug-based fetch for SEO-friendly public care-sheet URLs."""
    species = db.query(ScorpionSpecies).filter(
        ScorpionSpecies.slug == slug,
    ).first()
    if not species:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scorpion species not found",
        )
    return species


@router.get("/{species_id}", response_model=ScorpionSpeciesResponse)
async def get_scorpion_species(
    species_id: UUID,
    db: Session = Depends(get_db),
):
    """Detail page fetch. Public."""
    species = db.query(ScorpionSpecies).filter(
        ScorpionSpecies.id == species_id,
    ).first()
    if not species:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scorpion species not found",
        )
    return species


@router.post(
    "/", response_model=ScorpionSpeciesResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_scorpion_species(
    payload: ScorpionSpeciesCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Community submission. Always created with is_verified=False;
    an admin flips the bit after review."""
    # Reject duplicates up-front for a clean 409 instead of a 500 from
    # the UNIQUE constraint.
    existing = db.query(ScorpionSpecies).filter(
        or_(
            ScorpionSpecies.scientific_name == payload.scientific_name,
            ScorpionSpecies.scientific_name_lower == payload.scientific_name.lower(),
            ScorpionSpecies.slug == payload.slug,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A species with this scientific name or slug already exists",
        )

    new_species = ScorpionSpecies(
        **payload.model_dump(),
        scientific_name_lower=payload.scientific_name.lower(),
        submitted_by=current_user.id,
        is_verified=False,
    )
    db.add(new_species)
    db.commit()
    db.refresh(new_species)
    return new_species


@router.put("/{species_id}", response_model=ScorpionSpeciesResponse)
async def update_scorpion_species(
    species_id: UUID,
    payload: ScorpionSpeciesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submitter or admin can edit. is_verified can ONLY be set by an
    admin — passed through the schema but no-op'd for non-admins (the
    schema doesn't carry it, so this is enforced by omission)."""
    species = db.query(ScorpionSpecies).filter(
        ScorpionSpecies.id == species_id,
    ).first()
    if not species:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scorpion species not found",
        )

    is_admin = bool(getattr(current_user, "is_admin", False))
    if species.submitted_by != current_user.id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the submitter or an admin can edit this species",
        )

    update_data = payload.model_dump(exclude_unset=True)

    # Keep scientific_name_lower in sync if the canonical name moves.
    if update_data.get("scientific_name"):
        update_data["scientific_name_lower"] = (
            update_data["scientific_name"].lower()
        )

    for field, value in update_data.items():
        setattr(species, field, value)

    db.commit()
    db.refresh(species)
    return species


@router.delete(
    "/{species_id}", status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_scorpion_species(
    species_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admin-only. Deletes the catalog row; scorpions referencing it
    have species_id SET NULL by the FK clause from scp_20260522."""
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    species = db.query(ScorpionSpecies).filter(
        ScorpionSpecies.id == species_id,
    ).first()
    if not species:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scorpion species not found",
        )
    db.delete(species)
    db.commit()
    return None
