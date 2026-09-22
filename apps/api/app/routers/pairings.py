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


def _load_parent(db: Session, user_id: uuid.UUID, animal_id: uuid.UUID) -> Invert | None:
    """Resolve a parent id to an `Invert`, whichever field named it.

    Tarantulas share their primary key with the inverts mirror (ADR-005), so a
    legacy `male_id` resolves here too and callers don't need to care which
    field an update arrived in. Returns None when the animal doesn't exist or
    isn't this keeper's.
    """
    return db.query(Invert).filter(
        Invert.id == animal_id, Invert.user_id == user_id,
    ).first()


def _validate_pair(male: Invert, female: Invert) -> list[str]:
    """The rules a pairing has to satisfy, whether it's being created or edited.

    Extracted because update used to enforce NONE of this — it validated the
    two legacy ids against `tarantulas` and wrote whatever it was given. That
    let an edit land a pairing in a state the create endpoint would have
    refused outright: two males, mismatched taxa, an animal paired with
    itself. A rule that only one write path honours isn't a rule.

    Raises HTTPException for the hard refusals. Returns advisory warnings.
    """
    if male.id == female.id:
        raise HTTPException(
            status_code=400, detail="An animal can't be paired with itself",
        )
    if male.taxon != female.taxon:
        raise HTTPException(
            status_code=400, detail="Both animals must be the same taxon",
        )

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
    return warnings


def _set_parent(pairing: Pairing, slot: str, animal: Invert) -> None:
    """Point one slot at an animal, keeping BOTH foreign keys consistent.

    Writing only the legacy `male_id` was silently broken: `resolve_parents`
    prefers `male_invert_id`, so an edit that changed the legacy column alone
    returned 200 and then kept rendering the OLD animal. The update looked
    like it worked and didn't.

    The legacy column is mirrored only for tarantulas — it's a FK into
    `tarantulas`, and a mantis has no row there.
    """
    setattr(pairing, f"{slot}_invert_id", animal.id)
    setattr(pairing, f"{slot}_id", animal.id if animal.taxon == "tarantula" else None)


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

    # Shared with update_pairing — see _validate_pair. Raises on the hard
    # refusals, returns advisory warnings.
    warnings = _validate_pair(male, female)

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
    """Update a pairing, for any taxon.

    WHAT THIS USED TO DO
    --------------------
    It validated `male_id`/`female_id` against `tarantulas` and then wrote
    whatever it was handed. Two consequences, both silent:

      1. A non-tarantula pairing could never be corrected. `PairingUpdate` had
         no invert fields at all, and the legacy ones are FKs into a table a
         mantis has no row in — so a jumper pairing with the wrong female was
         permanent.
      2. Even for a tarantula it didn't work. `resolve_parents` prefers
         `male_invert_id`, so changing only the legacy column returned 200 and
         then kept rendering the OLD animal. The edit appeared to succeed.

    It also enforced none of the create endpoint's rules, so an edit could
    land a pairing in a state create would have refused.
    """
    pairing = db.query(Pairing).filter(
        Pairing.id == pairing_id,
        Pairing.user_id == current_user.id
    ).first()

    if not pairing:
        raise HTTPException(status_code=404, detail="Pairing not found")

    update_data = pairing_data.model_dump(exclude_unset=True)

    # Parent columns are handled separately from the scalar fields: they come
    # in pairs, they need cross-checking against each other, and each one
    # writes two columns.
    parent_fields = {"male_invert_id", "female_invert_id", "male_id", "female_id"}
    requested: dict[str, uuid.UUID | None] = {}
    for slot in ("male", "female"):
        # The generic field wins when both are sent — it's the one that works
        # for every taxon, and for a tarantula they carry the same id anyway.
        if f"{slot}_invert_id" in update_data:
            requested[slot] = update_data[f"{slot}_invert_id"]
        elif f"{slot}_id" in update_data:
            requested[slot] = update_data[f"{slot}_id"]

    if requested:
        # Validate the pair this update RESULTS IN, not just the half of it
        # that changed. Swapping only the male still has to be checked against
        # the female already on the record.
        resolved: dict[str, Invert] = {}
        for slot in ("male", "female"):
            if slot in requested:
                animal_id = requested[slot]
                if animal_id is None:
                    raise HTTPException(
                        status_code=400,
                        detail=f"A pairing needs a {slot}; it can't be cleared.",
                    )
                animal = _load_parent(db, current_user.id, animal_id)
                if not animal:
                    raise HTTPException(
                        status_code=404, detail=f"{slot.capitalize()} animal not found",
                    )
            else:
                current_id = (
                    getattr(pairing, f"{slot}_invert_id")
                    or getattr(pairing, f"{slot}_id")
                )
                animal = (
                    _load_parent(db, current_user.id, current_id)
                    if current_id
                    else None
                )
                if not animal:
                    # The unchanged side is gone (deleted since, or a legacy
                    # row with no mirror). Refusing beats writing a pair we
                    # can't check — the keeper can set both sides explicitly.
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"The current {slot} can't be found, so this change "
                            f"can't be checked. Set both animals explicitly."
                        ),
                    )
            resolved[slot] = animal

        _validate_pair(resolved["male"], resolved["female"])
        for slot in ("male", "female"):
            _set_parent(pairing, slot, resolved[slot])

    for field, value in update_data.items():
        if field in parent_fields:
            continue  # already applied, through _set_parent
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
