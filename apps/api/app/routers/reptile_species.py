"""Reptile species routes — Herpetoverse v1.

Parallel to the existing `species` (tarantula) router — same shape, same
access model:

  - Public reads (search, list, detail, by-name)
  - Auth-required community submissions (create)
  - Submitter or admin updates
  - Admin-only delete
  - Admin-only bulk import for the seed pipeline

Search is ILIKE-based rather than TSVECTOR — we don't have a searchable
column on `reptile_species` yet. Sprint 4 is content-heavy, not infra-heavy;
a TSVECTOR migration can land later if search perf becomes a concern.
"""
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.reptile_species import ReptileSpecies
from app.models.user import User
from app.schemas.reptile_species import (
    ReptileSpeciesCreate,
    ReptileSpeciesPaginatedResponse,
    ReptileSpeciesResponse,
    ReptileSpeciesSearchResult,
    ReptileSpeciesUpdate,
)
from app.utils.dependencies import get_current_user


router = APIRouter()


@router.get("/search", response_model=List[ReptileSpeciesSearchResult])
async def search_reptile_species(
    q: str = Query(..., min_length=2, description="Search query (scientific or common name)"),
    limit: int = Query(10, le=50),
    db: Session = Depends(get_db),
):
    """Autocomplete search on reptile species. Public."""
    search_term = f"%{q.lower().strip()}%"
    return (
        db.query(ReptileSpecies)
        .filter(
            or_(
                ReptileSpecies.scientific_name_lower.ilike(search_term),
                func.lower(
                    func.array_to_string(ReptileSpecies.common_names, " ")
                ).ilike(search_term),
            )
        )
        .limit(limit)
        .all()
    )


@router.get("/", response_model=ReptileSpeciesPaginatedResponse)
async def list_reptile_species(
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    verified_only: bool = False,
    care_level: Optional[str] = Query(
        None, pattern="^(beginner|intermediate|advanced)$"
    ),
    enclosure_type: Optional[str] = Query(
        None, pattern="^(terrestrial|arboreal|semi_arboreal|fossorial)$"
    ),
    diet_type: Optional[str] = Query(
        None, pattern="^(strict_carnivore|insectivore|omnivore|herbivore)$"
    ),
    db: Session = Depends(get_db),
):
    """Paginated list of reptile species with optional filters. Public."""
    query = db.query(ReptileSpecies)

    if verified_only:
        query = query.filter(ReptileSpecies.is_verified == True)
    if care_level:
        query = query.filter(ReptileSpecies.care_level == care_level)
    if enclosure_type:
        query = query.filter(ReptileSpecies.enclosure_type == enclosure_type)
    if diet_type:
        query = query.filter(ReptileSpecies.diet_type == diet_type)

    total = query.count()
    items = (
        query.order_by(ReptileSpecies.scientific_name)
        .offset(skip)
        .limit(limit)
        .all()
    )

    return ReptileSpeciesPaginatedResponse(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
        has_more=(skip + limit) < total,
    )


@router.get("/by-name/{scientific_name}", response_model=ReptileSpeciesResponse)
async def get_reptile_species_by_name(
    scientific_name: str,
    db: Session = Depends(get_db),
):
    """Get a reptile species by its Latin name (case-insensitive). Public."""
    species = (
        db.query(ReptileSpecies)
        .filter(
            ReptileSpecies.scientific_name_lower == scientific_name.lower().strip()
        )
        .first()
    )
    if not species:
        raise HTTPException(status_code=404, detail="Reptile species not found")
    return species


@router.get("/{species_id}", response_model=ReptileSpeciesResponse)
async def get_reptile_species(
    species_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Get a single reptile species with full care guide. Public."""
    species = (
        db.query(ReptileSpecies).filter(ReptileSpecies.id == species_id).first()
    )
    if not species:
        raise HTTPException(status_code=404, detail="Reptile species not found")
    return species


@router.post(
    "/", response_model=ReptileSpeciesResponse, status_code=status.HTTP_201_CREATED
)
async def create_reptile_species(
    species_data: ReptileSpeciesCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a reptile species (community submission). Auth required.

    Community submissions land as unverified. Admins can bulk-verify via the
    PUT endpoint once content has passed the care-sheet rubric.
    """
    scientific_name = species_data.scientific_name.strip()
    scientific_name_lower = scientific_name.lower()

    existing = (
        db.query(ReptileSpecies)
        .filter(ReptileSpecies.scientific_name_lower == scientific_name_lower)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400, detail="Reptile species already exists"
        )

    species_dict = species_data.model_dump()
    species_dict["scientific_name"] = scientific_name

    new_species = ReptileSpecies(
        **species_dict,
        scientific_name_lower=scientific_name_lower,
        submitted_by=current_user.id,
        is_verified=False,
    )
    db.add(new_species)
    db.commit()
    db.refresh(new_species)
    return new_species


@router.post("/bulk-import", status_code=status.HTTP_201_CREATED)
async def bulk_import_reptile_species(
    species_list: List[ReptileSpeciesCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin-only bulk import. Mirrors species.py bulk-import semantics.

    Dupes are skipped rather than aborting the batch. Flushes per row so one
    bad payload doesn't kill the rest, then commits all successful inserts in
    a single transaction at the end.
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin access required")

    results = {
        "total": len(species_list),
        "successful": 0,
        "failed": 0,
        "skipped": 0,
        "errors": [],
        "imported": [],
    }

    for idx, payload in enumerate(species_list):
        try:
            scientific_name = payload.scientific_name.strip()
            scientific_name_lower = scientific_name.lower()

            existing = (
                db.query(ReptileSpecies)
                .filter(ReptileSpecies.scientific_name_lower == scientific_name_lower)
                .first()
            )
            if existing:
                results["skipped"] += 1
                results["errors"].append(
                    {
                        "index": idx,
                        "scientific_name": scientific_name,
                        "error": "Already exists",
                    }
                )
                continue

            data = payload.model_dump()
            data["scientific_name"] = scientific_name

            new_species = ReptileSpecies(
                **data,
                scientific_name_lower=scientific_name_lower,
                submitted_by=current_user.id,
                is_verified=True,  # admin-imported → trusted at import time
                verified_by=current_user.id,
            )
            db.add(new_species)
            db.flush()

            results["successful"] += 1
            results["imported"].append(
                {
                    "scientific_name": new_species.scientific_name,
                    "common_names": list(new_species.common_names or []),
                }
            )
        except Exception as e:  # noqa: BLE001
            db.rollback()
            results["failed"] += 1
            results["errors"].append(
                {
                    "index": idx,
                    "scientific_name": getattr(payload, "scientific_name", f"Item {idx}"),
                    "error": str(e),
                }
            )

    if results["successful"] > 0:
        try:
            db.commit()
        except Exception as e:  # noqa: BLE001
            db.rollback()
            results["failed"] += results["successful"]
            results["successful"] = 0
            results["errors"].append({"error": f"Batch commit failed: {e}"})

    return results


@router.put("/{species_id}", response_model=ReptileSpeciesResponse)
async def update_reptile_species(
    species_id: uuid.UUID,
    species_data: ReptileSpeciesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a reptile species. Submitter or admin only."""
    species = (
        db.query(ReptileSpecies).filter(ReptileSpecies.id == species_id).first()
    )
    if not species:
        raise HTTPException(status_code=404, detail="Reptile species not found")

    if species.submitted_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = species_data.model_dump(exclude_unset=True)

    # Only admins can toggle verification
    if "is_verified" in update_data and not current_user.is_superuser:
        update_data.pop("is_verified")
    if update_data.get("is_verified") is True and not species.is_verified:
        species.verified_by = current_user.id
        species.verified_at = func.now()

    for field, value in update_data.items():
        setattr(species, field, value)

    db.commit()
    db.refresh(species)
    return species


@router.delete("/{species_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reptile_species(
    species_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a reptile species. Admin only."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin access required")

    species = (
        db.query(ReptileSpecies).filter(ReptileSpecies.id == species_id).first()
    )
    if not species:
        raise HTTPException(status_code=404, detail="Reptile species not found")

    db.delete(species)
    db.commit()
    return None


@router.post("/{species_id}/rate", response_model=ReptileSpeciesResponse)
async def rate_reptile_species(
    species_id: uuid.UUID,
    rating: float = Query(..., ge=0.0, le=5.0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Community rating. Running average weighted by times_kept (matches tarantula pattern)."""
    species = (
        db.query(ReptileSpecies).filter(ReptileSpecies.id == species_id).first()
    )
    if not species:
        raise HTTPException(status_code=404, detail="Reptile species not found")

    current_rating = species.community_rating or 0.0
    current_count = max(species.times_kept or 0, 1)
    new_rating = ((current_rating * (current_count - 1)) + rating) / current_count
    species.community_rating = round(new_rating, 2)

    db.commit()
    db.refresh(species)
    return species
