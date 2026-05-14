"""Animal genotype routes — per-animal genetic records.

Per PRD §5.4. Data substrate for the morph calculator. Each row is one
gene on one animal at one zygosity; an animal's full genotype is the
set of its rows.

Ownership model: every read and write is gated by "this animal is
yours". Unlike `genes` (a public catalog), genotype records are
private — they describe the animal the keeper actually owns.

ADR-003 collapsed the per-taxon parent tables, so the route surface is
now taxon-agnostic: `/animals/{animal_id}/genotype`.
"""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.animal import Animal
from app.models.animal_genotype import AnimalGenotype
from app.models.gene import Gene
from app.models.user import User
from app.schemas.animal_genotype import (
    AnimalGenotypeCreate,
    AnimalGenotypeResponse,
    AnimalGenotypeUpdate,
)
from app.utils.dependencies import get_current_user


router = APIRouter()


def _get_owned_animal(db: Session, animal_id: UUID, user: User) -> Animal:
    """Fetch an animal owned by the current user, or 404."""
    animal = (
        db.query(Animal)
        .filter(Animal.id == animal_id, Animal.user_id == user.id)
        .first()
    )
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found")
    return animal


def _validate_gene_exists(db: Session, gene_id: UUID) -> Gene:
    """Ensure the gene being referenced exists — avoid orphaning the row
    if a client passes a stale ID. The FK constraint also guards, but a
    404 here produces a cleaner error message than a DB integrity error."""
    gene = db.query(Gene).filter(Gene.id == gene_id).first()
    if not gene:
        raise HTTPException(status_code=404, detail="Gene not found")
    return gene


def _validate_poss_het_consistency(zygosity: str, poss_het_percentage):
    """poss_het_percentage is only meaningful for zygosity='poss_het'.

    Schema layer bounds the integer 1..99 but doesn't cross-validate
    against zygosity. Enforce here so we never ship a "66% het" with
    visible phenotype or a visual morph that claims a probability.
    """
    if poss_het_percentage is not None and zygosity != "poss_het":
        raise HTTPException(
            status_code=400,
            detail="poss_het_percentage is only valid when zygosity='poss_het'",
        )


@router.get(
    "/animals/{animal_id}/genotype",
    response_model=List[AnimalGenotypeResponse],
)
async def list_genotype(
    animal_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List every gene record on an owned animal. Auth + ownership."""
    _get_owned_animal(db, animal_id, current_user)

    return (
        db.query(AnimalGenotype)
        .filter(AnimalGenotype.animal_id == animal_id)
        .order_by(AnimalGenotype.created_at.asc())
        .all()
    )


@router.post(
    "/animals/{animal_id}/genotype",
    response_model=AnimalGenotypeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_genotype(
    animal_id: UUID,
    payload: AnimalGenotypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Attach a gene to an owned animal. Auth + ownership.

    The same gene can appear more than once on the same animal (e.g.,
    het for one phenotype, visual for another combined morph), so we
    don't enforce uniqueness on (animal_id, gene_id).
    """
    _get_owned_animal(db, animal_id, current_user)
    _validate_gene_exists(db, payload.gene_id)
    _validate_poss_het_consistency(payload.zygosity, payload.poss_het_percentage)

    row = AnimalGenotype(animal_id=animal_id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put(
    "/animals/{animal_id}/genotype/{genotype_id}",
    response_model=AnimalGenotypeResponse,
)
async def update_genotype(
    animal_id: UUID,
    genotype_id: UUID,
    payload: AnimalGenotypeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a genotype row. Auth + ownership (on the parent animal)."""
    _get_owned_animal(db, animal_id, current_user)

    row = (
        db.query(AnimalGenotype)
        .filter(
            AnimalGenotype.id == genotype_id,
            AnimalGenotype.animal_id == animal_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Genotype record not found")

    update_data = payload.model_dump(exclude_unset=True)

    # If gene_id is changing, verify the new target exists
    if "gene_id" in update_data:
        _validate_gene_exists(db, update_data["gene_id"])

    # Zygosity / poss_het_percentage consistency — evaluate against the
    # merged post-update view, not just what was sent
    new_zygosity = update_data.get("zygosity", row.zygosity)
    new_poss_het = update_data.get("poss_het_percentage", row.poss_het_percentage)
    _validate_poss_het_consistency(new_zygosity, new_poss_het)

    for field, value in update_data.items():
        setattr(row, field, value)

    db.commit()
    db.refresh(row)
    return row


@router.delete(
    "/animals/{animal_id}/genotype/{genotype_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_genotype(
    animal_id: UUID,
    genotype_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a gene record from an owned animal. Auth + ownership."""
    _get_owned_animal(db, animal_id, current_user)

    row = (
        db.query(AnimalGenotype)
        .filter(
            AnimalGenotype.id == genotype_id,
            AnimalGenotype.animal_id == animal_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Genotype record not found")

    db.delete(row)
    db.commit()
    return None
