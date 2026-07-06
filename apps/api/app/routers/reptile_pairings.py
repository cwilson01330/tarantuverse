"""Reptile pairings — list / create / read / update / delete.

Visibility model:
  • Owner always sees their own pairings (private or public).
  • Other users (or anonymous) only see pairings where:
      – is_private is FALSE  AND
      – the owner's collection_visibility is 'public'
  • is_private defaults TRUE, so a fresh pairing is invisible to
    everyone but the owner until they explicitly publish.

Per ADR-003 the per-taxon parent FKs were collapsed: both parents are
now rows in the unified `animals` table (`male_animal_id` /
`female_animal_id`), with the shared `taxon` denormalized onto the
pairing. Same-taxon match is enforced here in `_resolve_parents` (the
DB-level CHECK is gone — a cross-row constraint would need a trigger).
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.animal import Animal
from app.models.clutch import Clutch
from app.models.reptile_pairing import (
    ReptilePairing,
    ReptilePairingOutcome,
    ReptilePairingType,
)
from app.models.user import User
from app.schemas.reptile_breeding import (
    ReptilePairingCreate,
    ReptilePairingResponse,
    ReptilePairingUpdate,
)
from app.utils.dependencies import get_current_user

router = APIRouter()


# ─── Helpers ───────────────────────────────────────────────────────────


def _animal_display(a: Animal) -> str:
    return a.name or a.common_name or a.scientific_name or f"Unnamed {a.taxon.value}"


def _enrich_response(
    pairing: ReptilePairing,
    db: Session,
) -> ReptilePairingResponse:
    """Build a response with display names + clutch count without
    forcing the caller to round-trip back to the parent records."""
    m = db.query(Animal).filter(Animal.id == pairing.male_animal_id).first()
    f = db.query(Animal).filter(Animal.id == pairing.female_animal_id).first()
    male_name = _animal_display(m) if m else None
    female_name = _animal_display(f) if f else None

    clutch_count = (
        db.query(Clutch).filter(Clutch.pairing_id == pairing.id).count()
    )

    # `taxon` is a plain VARCHAR now (ADR-011) — emit it directly.
    taxon_str = pairing.taxon

    return ReptilePairingResponse(
        id=pairing.id,
        user_id=pairing.user_id,
        taxon=taxon_str,
        male_animal_id=pairing.male_animal_id,
        female_animal_id=pairing.female_animal_id,
        paired_date=pairing.paired_date,
        separated_date=pairing.separated_date,
        pairing_type=pairing.pairing_type.value,
        outcome=pairing.outcome.value,
        is_private=pairing.is_private,
        notes=pairing.notes,
        created_at=pairing.created_at,
        updated_at=pairing.updated_at,
        male_display_name=male_name,
        female_display_name=female_name,
        clutch_count=clutch_count,
    )


def _resolve_parents(
    payload: ReptilePairingCreate,
    user_id: UUID,
    db: Session,
) -> dict:
    """Validate the parent IDs, that the keeper owns both, that both
    are the declared taxon, and that the sex slots line up. Returns the
    column kwargs for the new pairing row."""
    taxon = payload.taxon  # plain string now (ADR-011); compared to Animal.taxon (also str)

    male = db.query(Animal).filter(
        Animal.id == payload.male_id,
        Animal.user_id == user_id,
    ).first()
    female = db.query(Animal).filter(
        Animal.id == payload.female_id,
        Animal.user_id == user_id,
    ).first()
    if not male or not female:
        raise HTTPException(
            status_code=404,
            detail="One or both animals not found in your collection.",
        )
    # Both parents must be the declared taxon — cross-taxon pairings
    # aren't biologically meaningful and the DB CHECK no longer guards
    # this (ADR-003), so the API is the enforcement point.
    if male.taxon != taxon or female.taxon != taxon:
        raise HTTPException(
            status_code=400,
            detail=f"Both parents must be {payload.taxon}s.",
        )
    if male.sex and male.sex.value not in ("male", "unknown"):
        raise HTTPException(
            status_code=400,
            detail=f"Male slot must be a male (or unknown-sex) {payload.taxon}.",
        )
    if female.sex and female.sex.value not in ("female", "unknown"):
        raise HTTPException(
            status_code=400,
            detail=f"Female slot must be a female (or unknown-sex) {payload.taxon}.",
        )
    return {
        "male_animal_id": male.id,
        "female_animal_id": female.id,
        "taxon": taxon,
    }


# ─── Routes ────────────────────────────────────────────────────────────


@router.get("/", response_model=List[ReptilePairingResponse])
async def list_pairings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the keeper's own pairings — private + public."""
    pairings = (
        db.query(ReptilePairing)
        .filter(ReptilePairing.user_id == current_user.id)
        .order_by(ReptilePairing.paired_date.desc())
        .all()
    )
    return [_enrich_response(p, db) for p in pairings]


@router.post(
    "/",
    response_model=ReptilePairingResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_pairing(
    payload: ReptilePairingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new pairing. Parents must be in the keeper's collection
    and match the declared taxon; sex is checked against male/female
    slots (unknown-sex is allowed for both, since not every animal is
    sexed before pairing decisions are made)."""
    if payload.male_id == payload.female_id:
        raise HTTPException(
            status_code=400,
            detail="Male and female must be different animals.",
        )

    parent_kwargs = _resolve_parents(payload, current_user.id, db)

    pairing = ReptilePairing(
        user_id=current_user.id,
        paired_date=payload.paired_date,
        separated_date=payload.separated_date,
        pairing_type=ReptilePairingType(payload.pairing_type),
        outcome=ReptilePairingOutcome(payload.outcome),
        is_private=payload.is_private,
        notes=payload.notes,
        **parent_kwargs,
    )
    db.add(pairing)
    db.commit()
    db.refresh(pairing)
    return _enrich_response(pairing, db)


@router.get("/{pairing_id}", response_model=ReptilePairingResponse)
async def get_pairing(
    pairing_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pairing = (
        db.query(ReptilePairing)
        .filter(ReptilePairing.id == pairing_id)
        .first()
    )
    if not pairing:
        raise HTTPException(status_code=404, detail="Pairing not found")

    is_owner = pairing.user_id == current_user.id
    if not is_owner:
        # Visibility gate — combine per-pairing flag with owner's
        # collection_visibility default.
        owner = db.query(User).filter(User.id == pairing.user_id).first()
        owner_public = owner and owner.collection_visibility == "public"
        if pairing.is_private or not owner_public:
            raise HTTPException(
                status_code=403,
                detail="This pairing is private.",
            )

    return _enrich_response(pairing, db)


@router.put("/{pairing_id}", response_model=ReptilePairingResponse)
async def update_pairing(
    pairing_id: UUID,
    payload: ReptilePairingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pairing = (
        db.query(ReptilePairing)
        .filter(
            ReptilePairing.id == pairing_id,
            ReptilePairing.user_id == current_user.id,
        )
        .first()
    )
    if not pairing:
        raise HTTPException(status_code=404, detail="Pairing not found")

    update = payload.model_dump(exclude_unset=True)
    if "pairing_type" in update:
        update["pairing_type"] = ReptilePairingType(update["pairing_type"])
    if "outcome" in update:
        update["outcome"] = ReptilePairingOutcome(update["outcome"])

    for k, v in update.items():
        setattr(pairing, k, v)

    db.commit()
    db.refresh(pairing)
    return _enrich_response(pairing, db)


@router.delete(
    "/{pairing_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_pairing(
    pairing_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a pairing — CASCADEs to its clutches and offspring.

    No soft-delete: keepers occasionally clean up false-positive
    pairings (e.g. assumed mating that didn't actually happen) and
    expect them gone. If they want lineage history preserved, they
    should keep the pairing and just mark its outcome as 'unsuccessful'.
    """
    pairing = (
        db.query(ReptilePairing)
        .filter(
            ReptilePairing.id == pairing_id,
            ReptilePairing.user_id == current_user.id,
        )
        .first()
    )
    if not pairing:
        raise HTTPException(status_code=404, detail="Pairing not found")
    db.delete(pairing)
    db.commit()
