"""Invert routes — unified per-animal CRUD (ADR-005 Phase A1).

  GET    /api/v1/inverts/?taxon=…       list current user's inverts
  POST   /api/v1/inverts/                create (taxon required in body)
  GET    /api/v1/inverts/{invert_id}     fetch one
  PUT    /api/v1/inverts/{invert_id}     partial update
  DELETE /api/v1/inverts/{invert_id}     delete (cascades to logs, photos)

Ownership: every query filters by Invert.user_id == current_user.id.
Anonymous / public reads will land on a future /i/{id} public-profile
route, mirroring the existing /t/{id} surface — not in this bundle.

In Phase A1 this router operates on the (currently empty) `inverts`
table. The legacy /tarantulas/ and /scorpions/ routes continue to read
from their own tables; dual-write lands in A2 and the read cutover in
C1.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.models.scorpion_colony import ScorpionColony
from app.models.tarantula import Sex, Source  # shared DB enums (UPPERCASE)
from app.schemas.invert import InvertCreate, InvertResponse, InvertUpdate
from app.utils.dependencies import get_current_user
from app.utils.limits import enforce_collection_limit

router = APIRouter()


def _coerce_enums(data: dict) -> dict:
    """Map string sex / source onto the shared DB enums (UPPERCASE
    names in prod). Same pattern as the tarantula + scorpion routers."""
    if data.get("sex"):
        try:
            data["sex"] = Sex(data["sex"])
        except ValueError:
            pass
    if data.get("source"):
        try:
            data["source"] = Source(data["source"])
        except ValueError:
            pass
    return data


def _validate_species(db: Session, species_id: Optional[UUID], taxon: str) -> None:
    """Reject a species_id that doesn't match the row's taxon — would
    otherwise let a keeper link a scorpion to a tarantula care sheet."""
    if species_id is None:
        return
    species = db.query(InvertSpecies).filter(
        InvertSpecies.id == species_id,
    ).first()
    if species is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Species not found",
        )
    if species.taxon != taxon:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Species belongs to taxon '{species.taxon}', not '{taxon}'",
        )


def _validate_colony(db: Session, user: User, colony_id: Optional[UUID]) -> None:
    """Hard 404 if the colony_id doesn't belong to this user."""
    if colony_id is None:
        return
    exists = db.query(ScorpionColony.id).filter(
        ScorpionColony.id == colony_id,
        ScorpionColony.user_id == user.id,
    ).first()
    if not exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Colony not found or not yours",
        )


@router.get("/", response_model=List[InvertResponse])
async def list_inverts(
    taxon: Optional[str] = Query(
        None, pattern="^(tarantula|scorpion|centipede)$",
        description="Filter to a single taxon. Omit for the whole collection.",
    ),
    colony_id: Optional[UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the authenticated user's inverts, newest first.

    Phase A1 returns rows from the new `inverts` table only — empty
    until backfill in Phase B. Existing keepers continue to see their
    collection via the legacy /tarantulas/ and /scorpions/ routes
    until C1 cuts those over.
    """
    query = db.query(Invert).filter(Invert.user_id == current_user.id)
    if taxon:
        query = query.filter(Invert.taxon == taxon)
    if colony_id is not None:
        query = query.filter(Invert.colony_id == colony_id)
    return query.order_by(Invert.created_at.desc()).all()


@router.post(
    "/", response_model=InvertResponse, status_code=status.HTTP_201_CREATED,
)
async def create_invert(
    payload: InvertCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new invert. `taxon` is required and immutable."""
    # Cross-taxon collection cap (counts inverts: tarantulas + scorpions + centipedes).
    enforce_collection_limit(db, current_user)
    _validate_species(db, payload.species_id, payload.taxon)
    _validate_colony(db, current_user, payload.colony_id)

    data = _coerce_enums(payload.model_dump())

    # Default visibility to the owner's profile visibility — matches
    # the tarantula + scorpion router behavior so the consolidated
    # surface doesn't surprise keepers.
    if not data.get("visibility"):
        data["visibility"] = (
            "public" if current_user.collection_visibility == "public"
            else "private"
        )

    new_invert = Invert(user_id=current_user.id, **data)
    db.add(new_invert)
    db.commit()
    db.refresh(new_invert)

    if new_invert.species_id:
        species = db.query(InvertSpecies).filter(
            InvertSpecies.id == new_invert.species_id,
        ).first()
        if species:
            species.times_kept = (species.times_kept or 0) + 1
            db.commit()

    return new_invert


@router.get("/{invert_id}", response_model=InvertResponse)
async def get_invert(
    invert_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch a single invert the current user owns."""
    invert = db.query(Invert).filter(
        Invert.id == invert_id,
        Invert.user_id == current_user.id,
    ).first()
    if not invert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invert not found",
        )
    return invert


@router.put("/{invert_id}", response_model=InvertResponse)
async def update_invert(
    invert_id: UUID,
    payload: InvertUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Partial update — only fields in the payload are applied. Taxon
    cannot be changed (intentionally omitted from InvertUpdate)."""
    invert = db.query(Invert).filter(
        Invert.id == invert_id,
        Invert.user_id == current_user.id,
    ).first()
    if not invert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invert not found",
        )

    data = payload.model_dump(exclude_unset=True)

    if "species_id" in data:
        _validate_species(db, data["species_id"], invert.taxon)
    if "colony_id" in data:
        _validate_colony(db, current_user, data["colony_id"])

    data = _coerce_enums(data)
    for field, value in data.items():
        setattr(invert, field, value)

    db.commit()
    db.refresh(invert)
    return invert


@router.delete("/{invert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invert(
    invert_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an invert. Cascades to feeding/molt/substrate logs and
    photos via the FK ON DELETE CASCADE clauses set in inv_20260527."""
    invert = db.query(Invert).filter(
        Invert.id == invert_id,
        Invert.user_id == current_user.id,
    ).first()
    if not invert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invert not found",
        )
    db.delete(invert)
    db.commit()
    return None
