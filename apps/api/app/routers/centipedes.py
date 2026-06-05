"""Centipede routes — Phase C2 of ADR-005.

  GET    /api/v1/centipedes/                 list current user's centipedes
  POST   /api/v1/centipedes/                  create
  GET    /api/v1/centipedes/{centipede_id}    fetch one
  PUT    /api/v1/centipedes/{centipede_id}    partial update
  DELETE /api/v1/centipedes/{centipede_id}    delete (cascades to logs)

Centipedes live exclusively on the unified `inverts` table with
`taxon='centipede'`. There is NO legacy `centipedes` table — they
launched directly on the consolidated surface, so there's no
dual-write to maintain.

This router is structurally identical to the scorpion + tarantula
routers (keeper-UX consistency), but its data plane is `inverts WHERE
taxon='centipede'`. After Phase D ships and the legacy tarantula +
scorpion tables drop, all three per-taxon routers will share this
shape.

Ownership: every query filters by Invert.user_id == current_user.id
AND Invert.taxon == 'centipede'. A tarantula ID can't be retrieved or
modified via this router — wrong taxon = 404.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.models.tarantula import Sex, Source  # shared DB enums (UPPERCASE)
from app.models.user import User
from app.schemas.centipede import (
    CentipedeCreate, CentipedeResponse, CentipedeUpdate,
)
from app.utils.dependencies import get_current_user
from app.utils.limits import enforce_collection_limit

router = APIRouter()


TAXON = "centipede"


def _coerce_enums(data: dict) -> dict:
    """Map string sex / source onto the shared DB enums (UPPERCASE
    names in prod). Same pattern as tarantula + scorpion + invert routers."""
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


def _validate_species(db: Session, species_id: Optional[UUID]) -> None:
    """Hard 400 if a non-centipede species is attached. Prevents a
    keeper from linking a centipede record to a tarantula or scorpion
    care sheet."""
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
    if species.taxon != TAXON:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Species belongs to taxon '{species.taxon}', not 'centipede'",
        )


def _owned_centipede(
    db: Session, centipede_id: UUID, user: User,
) -> Invert:
    """Lookup-or-404 with both ownership AND taxon checks. Returning the
    row from one helper means every CRUD handler shares the same gate."""
    row = db.query(Invert).filter(
        Invert.id == centipede_id,
        Invert.user_id == user.id,
        Invert.taxon == TAXON,
    ).first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Centipede not found",
        )
    return row


@router.get("/", response_model=List[CentipedeResponse])
async def list_centipedes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the authenticated user's centipedes, newest first."""
    return (
        db.query(Invert)
        .filter(
            Invert.user_id == current_user.id,
            Invert.taxon == TAXON,
        )
        .order_by(Invert.created_at.desc())
        .all()
    )


@router.post(
    "/", response_model=CentipedeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_centipede(
    payload: CentipedeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new centipede. Taxon is force-set to 'centipede'."""
    # Cross-taxon collection cap (counts inverts: tarantulas + scorpions + centipedes).
    enforce_collection_limit(db, current_user)
    _validate_species(db, payload.species_id)

    data = _coerce_enums(payload.model_dump())

    # Default visibility to the owner's profile preference, matching
    # the tarantula + scorpion path.
    if not data.get("visibility"):
        data["visibility"] = (
            "public" if current_user.collection_visibility == "public"
            else "private"
        )

    new_centipede = Invert(
        user_id=current_user.id,
        taxon=TAXON,
        **data,
    )
    db.add(new_centipede)
    db.commit()
    db.refresh(new_centipede)

    if new_centipede.species_id:
        species = db.query(InvertSpecies).filter(
            InvertSpecies.id == new_centipede.species_id,
        ).first()
        if species:
            species.times_kept = (species.times_kept or 0) + 1
            db.commit()

    return new_centipede


@router.get(
    "/{centipede_id}", response_model=CentipedeResponse,
)
async def get_centipede(
    centipede_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch one. 404 if not found OR if the row's taxon isn't 'centipede'."""
    return _owned_centipede(db, centipede_id, current_user)


@router.put(
    "/{centipede_id}", response_model=CentipedeResponse,
)
async def update_centipede(
    centipede_id: UUID,
    payload: CentipedeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Partial update — only fields present in the payload are applied.
    Taxon is omitted from the schema; it can't change."""
    centipede = _owned_centipede(db, centipede_id, current_user)

    data = payload.model_dump(exclude_unset=True)

    if "species_id" in data:
        _validate_species(db, data["species_id"])

    data = _coerce_enums(data)
    for field, value in data.items():
        setattr(centipede, field, value)

    db.commit()
    db.refresh(centipede)
    return centipede


@router.delete(
    "/{centipede_id}", status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_centipede(
    centipede_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete. Cascades to feeding/molt/substrate logs, photos, and QR
    sessions via the FK ON DELETE CASCADE clauses on `invert_id`."""
    centipede = _owned_centipede(db, centipede_id, current_user)
    db.delete(centipede)
    db.commit()
    return None
