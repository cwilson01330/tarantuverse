"""
Pairing routes for breeding module
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid

from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.models.invert import Invert
from app.models.pairing import Pairing
from app.schemas.pairing import (
    PairingCreate, PairingUpdate, PairingResponse, PairingInvertCreate,
)
from app.utils.dependencies import get_current_user
from app.services.activity_service import create_activity
from app.services.breeding_service import attach_parents

router = APIRouter()


def _sex_of(animal: Invert) -> str | None:
    """Lower-case 'male'/'female', or None when unknown/unset.

    Takes .value off the Sex enum SQLAlchemy hands back. The DB column holds
    the uppercase enum NAME (SQLEnum without values_callable), but nothing at
    this layer ever sees that — the lower() is defensive against the two
    drifting apart, not a fix for a live mismatch.

    'unknown' is a real answer rather than a missing one, so it normalises to
    None: callers must treat it as "no information", never as a third sex.
    """
    raw = getattr(animal.sex, "value", animal.sex)
    if not isinstance(raw, str):
        return None
    lowered = raw.lower()
    return lowered if lowered in ("male", "female") else None


def _invert_display(inv: Invert) -> str:
    return inv.name or inv.common_name or inv.scientific_name or "Unnamed"


@router.get("/pairings/", response_model=List[PairingResponse])
async def get_pairings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all pairings for the current user"""
    pairings = db.query(Pairing).filter(
        Pairing.user_id == current_user.id
    ).order_by(Pairing.paired_date.desc()).all()

    # Resolve parents server-side so a non-tarantula pairing doesn't render
    # blank — male_id/female_id are NULL for inverts. See breeding_service.
    return attach_parents(db, pairings)


@router.get("/pairings/{pairing_id}", response_model=PairingResponse)
async def get_pairing(
    pairing_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific pairing"""
    pairing = db.query(Pairing).filter(
        Pairing.id == pairing_id,
        Pairing.user_id == current_user.id
    ).first()

    if not pairing:
        raise HTTPException(status_code=404, detail="Pairing not found")

    return attach_parents(db, [pairing])[0]


@router.get("/inverts/{invert_id}/pairings", response_model=List[PairingResponse])
async def get_invert_pairings(
    invert_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List pairings where this invert is a parent (male or female).

    Powers the breeding panel on the generic invert detail screen. Matches
    on the invert FKs, so it works for tarantulas (shared PK) and pure
    inverts alike.
    """
    invert = db.query(Invert).filter(
        Invert.id == invert_id, Invert.user_id == current_user.id,
    ).first()
    if not invert:
        raise HTTPException(status_code=404, detail="Animal not found")
    pairings = db.query(Pairing).filter(
        Pairing.user_id == current_user.id,
        (Pairing.male_invert_id == invert_id) | (Pairing.female_invert_id == invert_id),
    ).order_by(Pairing.paired_date.desc()).all()
    return attach_parents(db, pairings)


@router.post("/inverts/pairings", response_model=PairingResponse, status_code=status.HTTP_201_CREATED)
async def create_invert_pairing(
    payload: PairingInvertCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a pairing between two inverts (Premium). Taxon-agnostic — the
    payoff of ADR-010: scorpion/mantis/etc. breeding through one engine."""
    limits = current_user.get_subscription_limits()
    if not limits["can_use_breeding"]:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "message": "Breeding tracking is a premium feature. Upgrade to unlock pairings, egg sacs, and offspring management!",
                "feature": "breeding",
                "is_premium": limits["is_premium"],
            },
        )

    male = db.query(Invert).filter(
        Invert.id == payload.male_invert_id, Invert.user_id == current_user.id,
    ).first()
    female = db.query(Invert).filter(
        Invert.id == payload.female_invert_id, Invert.user_id == current_user.id,
    ).first()
    if not male:
        raise HTTPException(status_code=404, detail="Male animal not found")
    if not female:
        raise HTTPException(status_code=404, detail="Female animal not found")
    if male.id == female.id:
        raise HTTPException(status_code=400, detail="An animal can't be paired with itself")
    if male.taxon != female.taxon:
        raise HTTPException(status_code=400, detail="Both animals must be the same taxon")

    # --- sex slots ---------------------------------------------------------
    # Refuse only when we KNOW both animals are the same sex. `unknown` is the
    # default and stays common until maturity, so treating it as a mismatch
    # would block the majority of legitimate pairings — the same evidence-first
    # rule the rest of the app follows: don't assert what the data doesn't say.
    male_sex = _sex_of(male)
    female_sex = _sex_of(female)
    if male_sex and female_sex and male_sex == female_sex:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Both animals are recorded as {male_sex}. Check the sexes, or "
                "set one to unknown if you're not sure."
            ),
        )
    if male_sex == "female" or female_sex == "male":
        raise HTTPException(
            status_code=400,
            detail="The male and female look swapped — check which animal is in which slot.",
        )

    # --- species ------------------------------------------------------------
    # NOT a refusal. Hybridising is widely frowned on, but this app records what
    # happened rather than licensing it, and a keeper logging a cross after the
    # fact needs to be able to write it down. Blocking would also punish the
    # common case of an unlinked species. So it's surfaced as a warning and the
    # client decides how loudly to say it.
    warnings: list[str] = []
    if (
        male.species_id is not None
        and female.species_id is not None
        and male.species_id != female.species_id
    ):
        warnings.append(
            "These animals are linked to different species. Cross-species "
            "pairings rarely produce viable young and are discouraged."
        )

    # Tarantulas share their PK with the inverts mirror, so set the legacy
    # FKs too for back-compat with tarantula-side reads/lineage. Pure inverts
    # leave them null.
    is_t = male.taxon == "tarantula"
    new_pairing = Pairing(
        user_id=current_user.id,
        male_invert_id=payload.male_invert_id,
        female_invert_id=payload.female_invert_id,
        male_id=payload.male_invert_id if is_t else None,
        female_id=payload.female_invert_id if is_t else None,
        paired_date=payload.paired_date,
        separated_date=payload.separated_date,
        pairing_type=payload.pairing_type,
        outcome=payload.outcome,
        notes=payload.notes,
    )
    db.add(new_pairing)
    db.commit()
    db.refresh(new_pairing)

    await create_activity(
        db=db,
        user_id=current_user.id,
        action_type="pairing",
        target_type="pairing",
        target_id=new_pairing.id,
        metadata={
            "male_name": _invert_display(male),
            "female_name": _invert_display(female),
            "taxon": male.taxon,
            "pairing_type": payload.pairing_type.value,
        },
    )
    saved = attach_parents(db, [new_pairing])[0]
    # Advisory only — see the species note above. Set as an unmapped attribute
    # so Pydantic picks it up via from_attributes.
    setattr(saved, "warnings", warnings)
    return saved


@router.post("/pairings/", response_model=PairingResponse, status_code=status.HTTP_201_CREATED)
async def create_pairing(
    pairing_data: PairingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new pairing (Premium feature)"""
    # Check if user has access to breeding features
    limits = current_user.get_subscription_limits()
    if not limits["can_use_breeding"]:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "message": "Breeding tracking is a premium feature. Upgrade to unlock pairings, egg sacs, and offspring management!",
                "feature": "breeding",
                "is_premium": limits["is_premium"]
            }
        )

    # Verify both tarantulas belong to the user
    male = db.query(Tarantula).filter(
        Tarantula.id == pairing_data.male_id,
        Tarantula.user_id == current_user.id
    ).first()

    female = db.query(Tarantula).filter(
        Tarantula.id == pairing_data.female_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not male:
        raise HTTPException(status_code=404, detail="Male tarantula not found")

    if not female:
        raise HTTPException(status_code=404, detail="Female tarantula not found")

    # Create pairing. ADR-010 dual-write: also populate the generic invert
    # parent refs. The tarantula's mirrored Invert shares its primary key
    # (Invert.id == Tarantula.id), so the ids are identical.
    new_pairing = Pairing(
        user_id=current_user.id,
        male_invert_id=pairing_data.male_id,
        female_invert_id=pairing_data.female_id,
        **pairing_data.model_dump()
    )

    db.add(new_pairing)
    db.commit()
    db.refresh(new_pairing)

    # Create activity feed entry
    await create_activity(
        db=db,
        user_id=current_user.id,
        action_type="pairing",
        target_type="pairing",
        target_id=new_pairing.id,
        metadata={
            "male_name": male.name or male.scientific_name,
            "female_name": female.name or female.scientific_name,
            "pairing_type": pairing_data.pairing_type.value
        }
    )

    return attach_parents(db, [new_pairing])[0]


@router.put("/pairings/{pairing_id}", response_model=PairingResponse)
async def update_pairing(
    pairing_id: uuid.UUID,
    pairing_data: PairingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a pairing"""
    # Get pairing and verify ownership
    pairing = db.query(Pairing).filter(
        Pairing.id == pairing_id,
        Pairing.user_id == current_user.id
    ).first()

    if not pairing:
        raise HTTPException(status_code=404, detail="Pairing not found")

    # If updating tarantula IDs, verify ownership
    if pairing_data.male_id:
        male = db.query(Tarantula).filter(
            Tarantula.id == pairing_data.male_id,
            Tarantula.user_id == current_user.id
        ).first()
        if not male:
            raise HTTPException(status_code=404, detail="Male tarantula not found")

    if pairing_data.female_id:
        female = db.query(Tarantula).filter(
            Tarantula.id == pairing_data.female_id,
            Tarantula.user_id == current_user.id
        ).first()
        if not female:
            raise HTTPException(status_code=404, detail="Female tarantula not found")

    # Update pairing
    update_data = pairing_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(pairing, field, value)

    db.commit()
    db.refresh(pairing)

    return attach_parents(db, [pairing])[0]


@router.delete("/pairings/{pairing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pairing(
    pairing_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a pairing"""
    # Get pairing and verify ownership
    pairing = db.query(Pairing).filter(
        Pairing.id == pairing_id,
        Pairing.user_id == current_user.id
    ).first()

    if not pairing:
        raise HTTPException(status_code=404, detail="Pairing not found")

    db.delete(pairing)
    db.commit()

    return None


@router.get("/tarantulas/{tarantula_id}/pairings", response_model=List[PairingResponse])
async def get_tarantula_pairings(
    tarantula_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all pairings for a specific tarantula (as male or female)"""
    # Verify tarantula belongs to user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")

    # Get pairings where this tarantula is either male or female.
    #
    # The user_id filter is not redundant with the ownership check above: it was
    # the only query in this router without one, and defence-in-depth is cheap
    # here. If the tarantula lookup above is ever refactored or relaxed, this
    # stays safe on its own.
    pairings = db.query(Pairing).filter(
        Pairing.user_id == current_user.id,
        (Pairing.male_id == tarantula_id) | (Pairing.female_id == tarantula_id),
    ).order_by(Pairing.paired_date.desc()).all()

    return attach_parents(db, pairings)
