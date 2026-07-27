"""
Species shortlist — species a keeper is considering but doesn't own yet.

Owner-scoped throughout. Keyed to `invert_species`, the unified catalog, so
one set of endpoints covers all ten taxa.

Deliberately NOT gated behind premium: this is the surface that turns a
browsing visitor into someone who comes back, and the free tier's constraint
is how many animals you can TRACK, not how many you can read about.
"""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.models.species_shortlist import SpeciesShortlist
from app.schemas.species_shortlist import (
    ShortlistCreate,
    ShortlistUpdate,
    ShortlistItem,
    ShortlistIdsResponse,
)
from app.utils.dependencies import get_current_user

router = APIRouter()


def _to_item(row: SpeciesShortlist, owned_species_ids: set) -> ShortlistItem:
    sp = row.species
    return ShortlistItem(
        id=row.id,
        species_id=row.species_id,
        note=row.note,
        created_at=row.created_at,
        taxon=sp.taxon if sp else None,
        scientific_name=sp.scientific_name if sp else None,
        common_names=(sp.common_names or []) if sp else [],
        care_level=sp.care_level if sp else None,
        image_url=sp.image_url if sp else None,
        adult_size=sp.adult_size if sp else None,
        type=sp.type if sp else None,
        venom_severity=sp.venom_severity if sp else None,
        is_verified=bool(sp.is_verified) if sp else False,
        owned=row.species_id in owned_species_ids,
    )


@router.get("/", response_model=List[ShortlistItem])
async def list_shortlist(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(SpeciesShortlist)
        .filter(SpeciesShortlist.user_id == current_user.id)
        .order_by(SpeciesShortlist.created_at.desc())
        .all()
    )
    if not rows:
        return []

    # One query for ownership rather than one per row. Lets the UI show
    # "already in your collection" on entries the keeper has since bought,
    # instead of leaving them looking like open wants.
    owned = {
        sid
        for (sid,) in db.query(Invert.species_id)
        .filter(
            Invert.user_id == current_user.id,
            Invert.species_id.in_([r.species_id for r in rows]),
        )
        .all()
        if sid is not None
    }
    return [_to_item(r, owned) for r in rows]


@router.get("/ids", response_model=ShortlistIdsResponse)
async def list_shortlist_ids(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cheap payload for marking bookmark state across a browser list."""
    ids = [
        sid
        for (sid,) in db.query(SpeciesShortlist.species_id)
        .filter(SpeciesShortlist.user_id == current_user.id)
        .all()
    ]
    return ShortlistIdsResponse(species_ids=ids)


@router.post("/", response_model=ShortlistItem, status_code=status.HTTP_201_CREATED)
async def add_to_shortlist(
    payload: ShortlistCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    species = (
        db.query(InvertSpecies).filter(InvertSpecies.id == payload.species_id).first()
    )
    if not species:
        raise HTTPException(status_code=404, detail="Species not found")

    # Idempotent: re-bookmarking returns the existing row rather than 409ing.
    # A double-tap on a bookmark button is a UI accident, not an error worth
    # surfacing.
    existing = (
        db.query(SpeciesShortlist)
        .filter(
            SpeciesShortlist.user_id == current_user.id,
            SpeciesShortlist.species_id == payload.species_id,
        )
        .first()
    )
    if existing:
        if payload.note is not None:
            existing.note = payload.note
            db.commit()
            db.refresh(existing)
        return _to_item(existing, set())

    row = SpeciesShortlist(
        user_id=current_user.id,
        species_id=payload.species_id,
        note=payload.note,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_item(row, set())


@router.patch("/{species_id}", response_model=ShortlistItem)
async def update_shortlist_note(
    species_id: UUID,
    payload: ShortlistUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(SpeciesShortlist)
        .filter(
            SpeciesShortlist.user_id == current_user.id,
            SpeciesShortlist.species_id == species_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Not on your shortlist")
    row.note = payload.note
    db.commit()
    db.refresh(row)
    return _to_item(row, set())


@router.delete("/{species_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_shortlist(
    species_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(SpeciesShortlist)
        .filter(
            SpeciesShortlist.user_id == current_user.id,
            SpeciesShortlist.species_id == species_id,
        )
        .first()
    )
    # Deleting something already gone is success, not 404 — the caller's
    # desired end state (not on the list) is satisfied either way.
    if row:
        db.delete(row)
        db.commit()
    return None
