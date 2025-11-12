"""
Species routes
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import List, Optional
import uuid

from app.database import get_db
from app.models.user import User
from app.models.species import Species
from app.schemas.species import SpeciesCreate, SpeciesUpdate, SpeciesResponse, SpeciesSearchResult
from app.utils.dependencies import get_current_user

router = APIRouter()


@router.get("/search", response_model=List[SpeciesSearchResult])
async def search_species(
    q: str = Query(..., min_length=2, description="Search query (scientific or common name)"),
    limit: int = Query(10, le=50),
    db: Session = Depends(get_db)
):
    """
    Search species by scientific or common name (case-insensitive)
    Returns minimal info for autocomplete
    """
    search_term = q.lower().strip()

    # Search in scientific_name_lower and common_names (case-insensitive)
    results = db.query(Species).filter(
        or_(
            Species.scientific_name_lower.ilike(f"%{search_term}%"),
            func.lower(func.array_to_string(Species.common_names, " ")).ilike(f"%{search_term}%")
        )
    ).limit(limit).all()

    return results


@router.get("/", response_model=List[SpeciesResponse])
async def get_all_species(
    skip: int = 0,
    limit: int = 100,
    verified_only: bool = False,
    db: Session = Depends(get_db)
):
    """Get all species with optional filtering"""
    query = db.query(Species)

    if verified_only:
        query = query.filter(Species.is_verified == True)

    species = query.offset(skip).limit(limit).all()
    return species


@router.get("/{species_id}", response_model=SpeciesResponse)
async def get_species_detail(
    species_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    """Get a single species with full care guide"""
    species = db.query(Species).filter(Species.id == species_id).first()

    if not species:
        raise HTTPException(status_code=404, detail="Species not found")

    return species


@router.get("/by-name/{scientific_name}", response_model=SpeciesResponse)
async def get_species_by_name(
    scientific_name: str,
    db: Session = Depends(get_db)
):
    """Get a species by scientific name (case-insensitive)"""
    species = db.query(Species).filter(
        Species.scientific_name_lower == scientific_name.lower().strip()
    ).first()

    if not species:
        raise HTTPException(status_code=404, detail="Species not found")

    return species


@router.post("/", response_model=SpeciesResponse, status_code=status.HTTP_201_CREATED)
async def create_species(
    species_data: SpeciesCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new species (community submission)"""
    # Check if species already exists (case-insensitive)
    existing = db.query(Species).filter(
        Species.scientific_name_lower == species_data.scientific_name.lower().strip()
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Species already exists"
        )

    # Create new species
    # Admins can create verified species, regular users cannot
    is_verified = species_data.is_verified if current_user.is_superuser else False

    species_dict = species_data.model_dump()
    species_dict.pop('is_verified', None)  # Remove to set explicitly below

    new_species = Species(
        **species_dict,
        scientific_name_lower=species_data.scientific_name.lower().strip(),
        submitted_by=current_user.id,
        is_verified=is_verified
    )

    db.add(new_species)
    db.commit()
    db.refresh(new_species)

    return new_species


@router.post("/bulk-import", status_code=status.HTTP_201_CREATED)
async def bulk_import_species(
    species_list: List[SpeciesCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Bulk import multiple species at once (admin only)
    Returns summary of successful and failed imports
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin access required")

    results = {
        "total": len(species_list),
        "successful": 0,
        "failed": 0,
        "skipped": 0,
        "errors": [],
        "imported_species": []
    }

    for idx, species_data in enumerate(species_list):
        try:
            # Check if species already exists
            existing = db.query(Species).filter(
                Species.scientific_name_lower == species_data.scientific_name.lower().strip()
            ).first()

            if existing:
                results["skipped"] += 1
                results["errors"].append({
                    "index": idx,
                    "scientific_name": species_data.scientific_name,
                    "error": "Species already exists"
                })
                continue

            # Create new species
            is_verified = species_data.is_verified if current_user.is_superuser else False
            species_dict = species_data.model_dump()
            species_dict.pop('is_verified', None)

            new_species = Species(
                **species_dict,
                scientific_name_lower=species_data.scientific_name.lower().strip(),
                submitted_by=current_user.id,
                is_verified=is_verified
            )

            db.add(new_species)
            db.commit()
            db.refresh(new_species)

            results["successful"] += 1
            results["imported_species"].append({
                "scientific_name": new_species.scientific_name,
                "common_names": new_species.common_names
            })

        except Exception as e:
            db.rollback()
            results["failed"] += 1
            results["errors"].append({
                "index": idx,
                "scientific_name": species_data.scientific_name if hasattr(species_data, 'scientific_name') else f"Item {idx}",
                "error": str(e)
            })

    return results


@router.put("/{species_id}", response_model=SpeciesResponse)
async def update_species(
    species_id: uuid.UUID,
    species_data: SpeciesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a species (submitted by user or admin)"""
    species = db.query(Species).filter(Species.id == species_id).first()

    if not species:
        raise HTTPException(status_code=404, detail="Species not found")

    # Only allow updates from original submitter or admin
    if species.submitted_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Update fields
    update_data = species_data.model_dump(exclude_unset=True)

    # If scientific_name is updated, update lowercase version too
    if "scientific_name" in update_data:
        update_data["scientific_name_lower"] = update_data["scientific_name"].lower().strip()

    for field, value in update_data.items():
        setattr(species, field, value)

    db.commit()
    db.refresh(species)

    return species


@router.delete("/{species_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_species(
    species_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a species (admin only)"""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin access required")

    species = db.query(Species).filter(Species.id == species_id).first()

    if not species:
        raise HTTPException(status_code=404, detail="Species not found")

    db.delete(species)
    db.commit()

    return None
