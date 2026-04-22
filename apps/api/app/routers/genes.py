"""Genes router — morph catalog CRUD.

Public reads (list, detail) so the morph calculator and species pages can
show gene data without auth. Writes require auth; admin-only flag
verification and delete, matching the Species router pattern.

Content rubric is enforced at the content-review stage, not the API. The
API accepts any shape the schema validates; the rubric doc
(docs/content/care-sheet-rubric.md) is the gate for publishing.
"""
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.gene import Gene
from app.models.user import User
from app.schemas.gene import (
    GeneCreate,
    GenePaginatedResponse,
    GeneResponse,
    GeneUpdate,
)
from app.utils.dependencies import get_current_user


router = APIRouter()


@router.get("/", response_model=GenePaginatedResponse)
async def list_genes(
    species: Optional[str] = Query(
        None,
        description="Filter by species scientific name (case-insensitive exact match)",
    ),
    q: Optional[str] = Query(
        None,
        min_length=2,
        description="Search on common name or symbol (partial match)",
    ),
    welfare_flagged: Optional[bool] = Query(
        None,
        description="True = only welfare-flagged genes; False = only unflagged",
    ),
    verified_only: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """List genes with optional filters. Public — no auth required."""
    query = db.query(Gene)

    if species:
        # Case-insensitive exact match on the Latin name
        query = query.filter(
            func.lower(Gene.species_scientific_name) == species.lower().strip()
        )

    if q:
        search_term = f"%{q.lower().strip()}%"
        query = query.filter(
            or_(
                func.lower(Gene.common_name).ilike(search_term),
                func.lower(Gene.symbol).ilike(search_term),
            )
        )

    if welfare_flagged is True:
        query = query.filter(Gene.welfare_flag.isnot(None))
    elif welfare_flagged is False:
        query = query.filter(Gene.welfare_flag.is_(None))

    if verified_only:
        query = query.filter(Gene.is_verified == True)

    total = query.count()
    items = (
        query.order_by(Gene.species_scientific_name, Gene.common_name)
        .offset(skip)
        .limit(limit)
        .all()
    )

    return GenePaginatedResponse(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
        has_more=(skip + limit) < total,
    )


@router.get("/{gene_id}", response_model=GeneResponse)
async def get_gene(
    gene_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Get a single gene by ID. Public."""
    gene = db.query(Gene).filter(Gene.id == gene_id).first()
    if not gene:
        raise HTTPException(status_code=404, detail="Gene not found")
    return gene


@router.post("/", response_model=GeneResponse, status_code=status.HTTP_201_CREATED)
async def create_gene(
    gene_data: GeneCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new gene. Auth required.

    Admin can pre-verify by setting `is_verified=True` in the payload;
    regular users always get is_verified=False regardless of what they send.
    """
    species_name = gene_data.species_scientific_name.strip()
    common_name = gene_data.common_name.strip()

    # Uniqueness check — matches the DB constraint
    existing = (
        db.query(Gene)
        .filter(
            func.lower(Gene.species_scientific_name) == species_name.lower(),
            func.lower(Gene.common_name) == common_name.lower(),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Gene '{common_name}' already exists for {species_name}",
        )

    is_verified = bool(gene_data.is_verified) if current_user.is_superuser else False

    payload = gene_data.model_dump()
    payload.pop("is_verified", None)

    new_gene = Gene(
        **payload,
        submitted_by=current_user.id,
        is_verified=is_verified,
    )
    if is_verified:
        new_gene.verified_by = current_user.id
        new_gene.verified_at = func.now()

    db.add(new_gene)
    db.commit()
    db.refresh(new_gene)

    return new_gene


@router.put("/{gene_id}", response_model=GeneResponse)
async def update_gene(
    gene_id: uuid.UUID,
    gene_data: GeneUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a gene. Submitter or admin only."""
    gene = db.query(Gene).filter(Gene.id == gene_id).first()
    if not gene:
        raise HTTPException(status_code=404, detail="Gene not found")

    if gene.submitted_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = gene_data.model_dump(exclude_unset=True)

    # Only admins can flip the verified bit; strip it for everyone else so a
    # non-admin can't sneak it through a PATCH.
    if "is_verified" in update_data and not current_user.is_superuser:
        update_data.pop("is_verified")

    # If admin is verifying, stamp the verifier metadata
    if update_data.get("is_verified") is True and not gene.is_verified:
        gene.verified_by = current_user.id
        gene.verified_at = func.now()

    for field, value in update_data.items():
        setattr(gene, field, value)

    db.commit()
    db.refresh(gene)
    return gene


@router.delete("/{gene_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_gene(
    gene_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a gene. Admin only.

    CASCADE on animal_genotypes.gene_id will remove any keeper-recorded
    genotypes referencing it — destructive, so admin-gated.
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin access required")

    gene = db.query(Gene).filter(Gene.id == gene_id).first()
    if not gene:
        raise HTTPException(status_code=404, detail="Gene not found")

    db.delete(gene)
    db.commit()
    return None
