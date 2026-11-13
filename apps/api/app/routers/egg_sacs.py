"""
Egg sac routes for breeding module
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid

from app.database import get_db
from app.models.user import User
from app.models.pairing import Pairing
from app.models.egg_sac import EggSac
from app.models.colony import Colony
from app.schemas.egg_sac import (
    ColonyRef, EggSacCreate, EggSacFailRequest, EggSacHatch, EggSacHatchResponse, EggSacResponse,
    EggSacUpdate, InvertEggSacCreate,
)
from app.schemas.colony import ColonyCreate, ColonyResponse
from app.utils.dependencies import get_current_user
from app.services.activity_service import create_activity
from app.utils.access import policy, load_invert
from app.utils.broods import BROOD_BUCKET, BROOD_TAXA, load_egg_sac
from app.utils.colony_counts import HATCH_NOTE
from app.utils.limits import enforce_collection_limit
from sqlalchemy.exc import IntegrityError
from app.utils.closed_animals import refuse_if_closed_invert
from app.utils.rate_limit import limiter, user_or_ip
from app.utils.storage_urls import is_our_photo_url, photo_bases

router = APIRouter()


def _serialize(db: Session, sacs: List[EggSac]) -> List[EggSacResponse]:
    """Responses with `hatched_colony`, resolved in ONE query for the whole list."""
    ids = [s.id for s in sacs]
    groups = {}
    if ids:
        for cid, cname, sac_id in db.query(Colony.id, Colony.name, Colony.egg_sac_id).filter(
            Colony.egg_sac_id.in_(ids)
        ).all():
            groups[sac_id] = ColonyRef(id=cid, name=cname)
    out = []
    for s in sacs:
        r = EggSacResponse.model_validate(s)
        r.hatched_colony = groups.get(s.id)
        out.append(r)
    return out


def _mother_of(pairing: Pairing) -> Optional[uuid.UUID]:
    return pairing.female_invert_id or pairing.female_id


def _check_photo_url(url: Optional[str]) -> None:
    """photo_url is free text: when our bucket is configured, it must live there."""
    bases = photo_bases()
    if url and bases and not is_our_photo_url(url, bases):
        raise HTTPException(status_code=400, detail="That photo isn't one of ours. Upload it first.")


@router.get("/egg-sacs/", response_model=List[EggSacResponse])
@policy("owner_only")
async def get_egg_sacs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all egg sacs for the current user"""
    egg_sacs = db.query(EggSac).filter(
        EggSac.user_id == current_user.id
    ).order_by(EggSac.laid_date.desc()).all()

    return _serialize(db, egg_sacs)


@router.get("/egg-sacs/{egg_sac_id}", response_model=EggSacResponse)
@policy("viewer")
async def get_egg_sac(
    egg_sac_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific egg sac"""
    egg_sac, _access = load_egg_sac(db, current_user, egg_sac_id, "viewer")
    return _serialize(db, [egg_sac])[0]


@router.get("/inverts/{invert_id}/egg-sacs", response_model=List[EggSacResponse])
@policy("viewer")
async def list_invert_egg_sacs(
    invert_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """This mother's sacs, newest first, pairing-based ones included."""
    mother, _access = load_invert(db, current_user, invert_id, "viewer")
    sacs = db.query(EggSac).filter(
        EggSac.mother_invert_id == mother.id
    ).order_by(EggSac.laid_date.desc(), EggSac.created_at.desc()).all()
    return _serialize(db, sacs)


@router.post("/inverts/{invert_id}/egg-sacs", response_model=EggSacResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("60/hour", key_func=user_or_ip)
@policy("keeper")
async def create_invert_egg_sac(
    request: Request,
    invert_id: uuid.UUID,
    data: InvertEggSacCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a sac on the mother, no pairing needed. Free."""
    mother, access = load_invert(db, current_user, invert_id, "keeper")
    if mother.taxon not in BROOD_TAXA:
        raise HTTPException(status_code=400, detail="Egg sacs aren't tracked for this animal")
    sex = getattr(mother.sex, "value", mother.sex)
    if str(sex or "").lower() == "male":
        raise HTTPException(status_code=400, detail="Egg sacs aren't tracked for this animal")
    refuse_if_closed_invert(mother)
    _check_photo_url(data.photo_url)

    sac = EggSac(user_id=access.owner.id, mother_invert_id=mother.id, **data.model_dump())
    db.add(sac)
    db.commit()
    db.refresh(sac)
    return _serialize(db, [sac])[0]


@router.post("/egg-sacs/", response_model=EggSacResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("60/hour", key_func=user_or_ip)
@policy("owner_only")
async def create_egg_sac(
    request: Request,
    egg_sac_data: EggSacCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a pairing-based egg sac. Free: the pairing itself is the Premium part."""
    # Verify pairing belongs to the user
    pairing = db.query(Pairing).filter(
        Pairing.id == egg_sac_data.pairing_id,
        Pairing.user_id == current_user.id
    ).first()

    if not pairing:
        raise HTTPException(status_code=404, detail="Pairing not found")

    # Create egg sac
    new_egg_sac = EggSac(
        user_id=current_user.id,
        mother_invert_id=_mother_of(pairing),
        **egg_sac_data.model_dump()
    )

    db.add(new_egg_sac)

    # Streamline: a pairing that produced a sac has done its job — auto-advance
    # it to "successful" so it drops out of the *active* pairings view. The
    # pairing is kept (history + lineage stay traceable from the sac), not
    # deleted. Only auto-advance from in_progress so we never override an
    # outcome the keeper set deliberately. Multiple sacs from one pairing are
    # fine — this is idempotent.
    from app.models.pairing import PairingOutcome
    if pairing.outcome == PairingOutcome.IN_PROGRESS:
        pairing.outcome = PairingOutcome.SUCCESSFUL

    db.commit()
    db.refresh(new_egg_sac)

    # Create activity feed entry
    await create_activity(
        db=db,
        user_id=current_user.id,
        action_type="egg_sac",
        target_type="egg_sac",
        target_id=new_egg_sac.id,
        metadata={
            "pairing_id": str(pairing.id),
            "laid_date": egg_sac_data.laid_date.isoformat()
        }
    )

    return _serialize(db, [new_egg_sac])[0]


@router.put("/egg-sacs/{egg_sac_id}", response_model=EggSacResponse)
@policy("keeper")
async def update_egg_sac(
    egg_sac_id: uuid.UUID,
    egg_sac_data: EggSacUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update an egg sac (allowed on a closed mother: editing history stays open)"""
    egg_sac, access = load_egg_sac(db, current_user, egg_sac_id, "keeper")

    update_data = egg_sac_data.model_dump(exclude_unset=True)
    if "pairing_id" in update_data:
        if update_data["pairing_id"] is None:
            if egg_sac.mother_invert_id is None:
                raise HTTPException(status_code=400, detail="This egg sac needs a pairing or a mother")
        else:
            pairing = db.query(Pairing).filter(
                Pairing.id == update_data["pairing_id"],
                Pairing.user_id == access.owner.id
            ).first()
            if not pairing:
                raise HTTPException(status_code=404, detail="Pairing not found")
            egg_sac.mother_invert_id = _mother_of(pairing) or egg_sac.mother_invert_id
    if "photo_url" in update_data and update_data["photo_url"] != egg_sac.photo_url:
        _check_photo_url(update_data["photo_url"])

    for field, value in update_data.items():
        setattr(egg_sac, field, value)

    db.commit()
    db.refresh(egg_sac)

    return _serialize(db, [egg_sac])[0]


@router.post("/egg-sacs/{egg_sac_id}/fail", response_model=EggSacResponse)
@limiter.limit("60/hour", key_func=user_or_ip)
@policy("keeper")
async def fail_egg_sac(
    request: Request,
    egg_sac_id: uuid.UUID,
    data: EggSacFailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark a sac as one that didn't hatch. A failed sac can still be hatched later."""
    egg_sac, _access = load_egg_sac(db, current_user, egg_sac_id, "keeper")
    egg_sac.outcome = "failed"
    note = (data.notes or "").strip()
    if note:
        egg_sac.notes = f"{egg_sac.notes}\n{note}" if egg_sac.notes else note
    db.commit()
    db.refresh(egg_sac)
    return _serialize(db, [egg_sac])[0]


_ALREADY_HATCHED = "This egg sac has already hatched."


@router.post("/egg-sacs/{egg_sac_id}/hatch", response_model=EggSacHatchResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("60/hour", key_func=user_or_ip)
@policy("keeper")
async def hatch_egg_sac(
    request: Request,
    egg_sac_id: uuid.UUID,
    data: EggSacHatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The sac hatched (or the brood was born): start a group for it.

    One new colony (the mother's taxon, species and location; "{mother}
    {bucket}"; bred; founded on hatched_on; one bucket) and the sac's outcome,
    hatch date and count, in ONE commit. Works on a died/transferred mother
    (only NEW sacs are refused). A failed sac can still hatch. Counts as one
    new entry toward the free cap. Free (not Premium-gated).
    """
    from app.routers.colonies import _build_response, create_colony_row

    egg_sac, access = load_egg_sac(db, current_user, egg_sac_id, "keeper")
    # Lock the row so two taps / two phones can't both pass the check below;
    # the UNIQUE index on colonies.egg_sac_id backs it up.
    # populate_existing: a request that waited on the lock must see the
    # outcome the first one committed, not the copy it loaded before.
    egg_sac = (
        db.query(EggSac).filter(EggSac.id == egg_sac.id)
        .with_for_update().populate_existing().one()
    )
    if egg_sac.outcome == "hatched":
        raise HTTPException(status_code=409, detail=_ALREADY_HATCHED)
    mother = egg_sac.mother
    if mother is None:
        raise HTTPException(status_code=400, detail="Link a mother first")
    bucket = BROOD_BUCKET.get(mother.taxon)
    if bucket is None:
        raise HTTPException(status_code=400, detail="Egg sacs aren't tracked for this animal")
    owner = access.owner
    # Before any change on the session: a 402 must leave the sac untouched.
    enforce_collection_limit(db, owner)

    mother_name = mother.name or mother.common_name or mother.scientific_name or "Brood"
    name = data.name or f"{mother_name} {bucket}"[:100].rstrip()

    egg_sac.outcome = "hatched"
    egg_sac.hatch_date = data.hatched_on
    egg_sac.spiderling_count = data.count
    try:
        colony = create_colony_row(
            db,
            owner,
            ColonyCreate(
                name=name,
                taxon=mother.taxon,
                species_id=mother.species_id,
                location=mother.location,
                source="bred",
                founded_date=data.hatched_on,
                stage_counts={bucket: data.count},
                count_is_estimated=data.count_is_estimated,
            ),
            enforce_limit=False,
            logged_by_user_id=access.logged_by_user_id,
            starting_note=HATCH_NOTE,
            egg_sac_id=egg_sac.id,
            started_on=data.hatched_on,
        )
    except IntegrityError as exc:
        db.rollback()
        if "uq_colonies_egg_sac_id" in str(getattr(exc, "orig", exc)):
            raise HTTPException(status_code=409, detail=_ALREADY_HATCHED)
        raise
    except Exception:
        db.rollback()
        raise

    db.refresh(egg_sac)
    return EggSacHatchResponse(
        egg_sac=_serialize(db, [egg_sac])[0],
        colony=ColonyResponse(**_build_response(colony, db)),
    )


@router.delete("/egg-sacs/{egg_sac_id}", status_code=status.HTTP_204_NO_CONTENT)
@policy("keeper")
async def delete_egg_sac(
    egg_sac_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete an egg sac"""
    egg_sac, _access = load_egg_sac(db, current_user, egg_sac_id, "keeper")

    db.delete(egg_sac)
    db.commit()

    return None


@router.get("/pairings/{pairing_id}/egg-sacs", response_model=List[EggSacResponse])
@policy("owner_only")
async def get_pairing_egg_sacs(
    pairing_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all egg sacs for a specific pairing"""
    # Verify pairing belongs to user
    pairing = db.query(Pairing).filter(
        Pairing.id == pairing_id,
        Pairing.user_id == current_user.id
    ).first()

    if not pairing:
        raise HTTPException(status_code=404, detail="Pairing not found")

    # Get egg sacs for this pairing
    egg_sacs = db.query(EggSac).filter(
        EggSac.pairing_id == pairing_id
    ).order_by(EggSac.laid_date.desc()).all()

    return _serialize(db, egg_sacs)
