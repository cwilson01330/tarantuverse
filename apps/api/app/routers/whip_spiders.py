"""Whip spider (Amblypygi) routes — ADR-006 taxon #1.

  GET    /api/v1/whip-spiders/                  list current user's whip spiders
  POST   /api/v1/whip-spiders/                   create
  GET    /api/v1/whip-spiders/{whip_spider_id}   fetch one
  PUT    /api/v1/whip-spiders/{whip_spider_id}   partial update
  DELETE /api/v1/whip-spiders/{whip_spider_id}   delete (cascades to logs)

Whip spiders live exclusively on the unified `inverts` table with
`taxon='whip_spider'`. No legacy table, no dual-write — structurally
identical to the centipede router, data plane is `inverts WHERE
taxon='whip_spider'`.

Ownership + taxon are enforced on every query: a tarantula or centipede
ID can't be retrieved or modified through this router (wrong taxon = 404).
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
from app.schemas.whip_spider import (
    WhipSpiderCreate, WhipSpiderResponse, WhipSpiderUpdate,
)
from app.utils.dependencies import get_current_user
from app.utils.limits import enforce_collection_limit

router = APIRouter()


TAXON = "whip_spider"


def _coerce_enums(data: dict) -> dict:
    """Map string sex / source onto the shared DB enums (UPPERCASE names
    in prod). Same pattern as the tarantula + scorpion + centipede routers."""
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
    """Hard error if a non-whip-spider species is attached — prevents a
    keeper from linking a whip spider record to a tarantula care sheet."""
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
            detail=f"Species belongs to taxon '{species.taxon}', not 'whip_spider'",
        )


def _owned_whip_spider(db: Session, whip_spider_id: UUID, user: User) -> Invert:
    """Lookup-or-404 with both ownership AND taxon checks."""
    row = db.query(Invert).filter(
        Invert.id == whip_spider_id,
        Invert.user_id == user.id,
        Invert.taxon == TAXON,
    ).first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Whip spider not found",
        )
    return row


@router.get("/", response_model=List[WhipSpiderResponse])
async def list_whip_spiders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the authenticated user's whip spiders, newest first."""
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
    "/", response_model=WhipSpiderResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_whip_spider(
    payload: WhipSpiderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new whip spider. Taxon is force-set to 'whip_spider'."""
    # Cross-taxon collection cap (counts inverts across every taxon).
    enforce_collection_limit(db, current_user)
    _validate_species(db, payload.species_id)

    data = _coerce_enums(payload.model_dump())

    # Default visibility to the owner's profile preference, matching the
    # tarantula + scorpion + centipede paths.
    if not data.get("visibility"):
        data["visibility"] = (
            "public" if current_user.collection_visibility == "public"
            else "private"
        )

    new_whip_spider = Invert(
        user_id=current_user.id,
        taxon=TAXON,
        **data,
    )
    db.add(new_whip_spider)
    db.commit()
    db.refresh(new_whip_spider)

    if new_whip_spider.species_id:
        species = db.query(InvertSpecies).filter(
            InvertSpecies.id == new_whip_spider.species_id,
        ).first()
        if species:
            species.times_kept = (species.times_kept or 0) + 1
            db.commit()

    return new_whip_spider


@router.get("/{whip_spider_id}", response_model=WhipSpiderResponse)
async def get_whip_spider(
    whip_spider_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch one. 404 if not found OR if the row's taxon isn't 'whip_spider'."""
    return _owned_whip_spider(db, whip_spider_id, current_user)


@router.put("/{whip_spider_id}", response_model=WhipSpiderResponse)
async def update_whip_spider(
    whip_spider_id: UUID,
    payload: WhipSpiderUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Partial update — only fields present in the payload are applied.
    Taxon is omitted from the schema; it can't change."""
    whip_spider = _owned_whip_spider(db, whip_spider_id, current_user)

    data = payload.model_dump(exclude_unset=True)

    if "species_id" in data:
        _validate_species(db, data["species_id"])

    data = _coerce_enums(data)
    for field, value in data.items():
        setattr(whip_spider, field, value)

    db.commit()
    db.refresh(whip_spider)
    return whip_spider


@router.delete("/{whip_spider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_whip_spider(
    whip_spider_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete. Cascades to feeding/molt/substrate logs, photos, and QR
    sessions via the FK ON DELETE CASCADE clauses on `invert_id`."""
    whip_spider = _owned_whip_spider(db, whip_spider_id, current_user)
    db.delete(whip_spider)
    db.commit()
    return None
