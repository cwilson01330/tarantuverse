"""
Offspring routes for breeding module
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid

from app.database import get_db
from app.models.user import User
from app.models.egg_sac import EggSac
from app.models.invert import Invert
from app.models.tarantula import Tarantula
from app.models.offspring import Offspring
from app.schemas.offspring import (
    OffspringCreate, OffspringUpdate, OffspringResponse,
    OffspringBulkCreate, OffspringBulkUpdate, OffspringBulkResult,
)
from app.utils.dependencies import get_current_user
from app.services.activity_service import create_activity

router = APIRouter()


def _require_breeding(current_user: User) -> dict:
    """Shared premium gate for breeding writes."""
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
    return limits


def _resolve_kept_link(
    db: Session,
    current_user: User,
    *,
    invert_id: uuid.UUID | None,
    tarantula_id: uuid.UUID | None,
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """Validate the "this sling became a tracked animal" link.

    Returns `(invert_id, tarantula_id)` to store. Shared by create and update
    so the two can't drift — the previous code validated against `Tarantula` in
    both places, which is what made a jumping spider impossible to link.

    Rules:
      - `invert_id` is the real link and works for any taxon. If the animal
        happens to be a tarantula, `tarantula_id` is written too, because it
        shares the same primary key (ADR-005) and the legacy breeding hub still
        reads that column.
      - `tarantula_id` alone stays supported for existing clients, and mirrors
        onto `invert_id` exactly as before.
      - Both supplied and disagreeing is a client bug, not something to
        silently pick a winner for.
    """
    if invert_id and tarantula_id and invert_id != tarantula_id:
        raise HTTPException(
            status_code=400,
            detail="invert_id and tarantula_id refer to different animals. Send invert_id only.",
        )

    if invert_id:
        animal = db.query(Invert).filter(
            Invert.id == invert_id,
            Invert.user_id == current_user.id,
        ).first()
        if not animal:
            raise HTTPException(status_code=404, detail="Animal not found")
        # Mirror onto the legacy column only for tarantulas; a jumper has no
        # row in `tarantulas` and writing its id there would violate the FK.
        return animal.id, (animal.id if animal.taxon == "tarantula" else None)

    if tarantula_id:
        tarantula = db.query(Tarantula).filter(
            Tarantula.id == tarantula_id,
            Tarantula.user_id == current_user.id,
        ).first()
        if not tarantula:
            raise HTTPException(status_code=404, detail="Tarantula not found")
        return tarantula.id, tarantula.id

    return None, None


@router.get("/offspring/", response_model=List[OffspringResponse])
async def get_offspring(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all offspring records for the current user"""
    offspring = db.query(Offspring).filter(
        Offspring.user_id == current_user.id
    ).order_by(Offspring.created_at.desc()).all()

    return offspring


@router.get("/offspring/{offspring_id}", response_model=OffspringResponse)
async def get_offspring_record(
    offspring_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific offspring record"""
    offspring = db.query(Offspring).filter(
        Offspring.id == offspring_id,
        Offspring.user_id == current_user.id
    ).first()

    if not offspring:
        raise HTTPException(status_code=404, detail="Offspring record not found")

    return offspring


@router.post("/offspring/", response_model=OffspringResponse, status_code=status.HTTP_201_CREATED)
async def create_offspring_record(
    offspring_data: OffspringCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new offspring record (Premium feature)"""
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

    # Verify egg sac belongs to the user
    egg_sac = db.query(EggSac).filter(
        EggSac.id == offspring_data.egg_sac_id,
        EggSac.user_id == current_user.id
    ).first()

    if not egg_sac:
        raise HTTPException(status_code=404, detail="Egg sac not found")

    # Validate the kept-link against whichever surface it names. Handles every
    # taxon — see _resolve_kept_link.
    invert_id, tarantula_id = _resolve_kept_link(
        db, current_user,
        invert_id=offspring_data.invert_id,
        tarantula_id=offspring_data.tarantula_id,
    )

    payload = offspring_data.model_dump()
    # Both FK fields come from the resolver, not from the request, so a
    # non-tarantula never gets an id written into the legacy column.
    payload.pop("invert_id", None)
    payload.pop("tarantula_id", None)

    new_offspring = Offspring(
        user_id=current_user.id,
        invert_id=invert_id,
        tarantula_id=tarantula_id,
        **payload
    )

    db.add(new_offspring)
    db.commit()
    db.refresh(new_offspring)

    # Create activity feed entry
    await create_activity(
        db=db,
        user_id=current_user.id,
        action_type="offspring",
        target_type="offspring",
        target_id=new_offspring.id,
        metadata={
            "egg_sac_id": str(egg_sac.id),
            "status": offspring_data.status.value
        }
    )

    return new_offspring


@router.put("/offspring/{offspring_id}", response_model=OffspringResponse)
async def update_offspring_record(
    offspring_id: uuid.UUID,
    offspring_data: OffspringUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update an offspring record"""
    # Get offspring record and verify ownership
    offspring = db.query(Offspring).filter(
        Offspring.id == offspring_id,
        Offspring.user_id == current_user.id
    ).first()

    if not offspring:
        raise HTTPException(status_code=404, detail="Offspring record not found")

    # If updating egg_sac_id, verify ownership
    if offspring_data.egg_sac_id:
        egg_sac = db.query(EggSac).filter(
            EggSac.id == offspring_data.egg_sac_id,
            EggSac.user_id == current_user.id
        ).first()
        if not egg_sac:
            raise HTTPException(status_code=404, detail="Egg sac not found")

    # Update offspring record
    update_data = offspring_data.model_dump(exclude_unset=True)

    # Re-resolve the kept-link whenever either id was sent, so an update can't
    # write a legacy tarantula_id for a non-tarantula.
    if "invert_id" in update_data or "tarantula_id" in update_data:
        invert_id, tarantula_id = _resolve_kept_link(
            db, current_user,
            invert_id=update_data.get("invert_id"),
            tarantula_id=update_data.get("tarantula_id"),
        )
        update_data["invert_id"] = invert_id
        update_data["tarantula_id"] = tarantula_id

    for field, value in update_data.items():
        setattr(offspring, field, value)

    db.commit()
    db.refresh(offspring)

    return offspring


@router.delete("/offspring/{offspring_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_offspring_record(
    offspring_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete an offspring record"""
    # Get offspring record and verify ownership
    offspring = db.query(Offspring).filter(
        Offspring.id == offspring_id,
        Offspring.user_id == current_user.id
    ).first()

    if not offspring:
        raise HTTPException(status_code=404, detail="Offspring record not found")

    db.delete(offspring)
    db.commit()

    return None


@router.post("/offspring/bulk", response_model=OffspringBulkResult, status_code=status.HTTP_201_CREATED)
async def bulk_create_offspring(
    payload: OffspringBulkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create N offspring at once from one egg sac (Premium).

    The high-volume add: a keeper with 50 slings creates 50 records in one
    call instead of 50 form submissions.
    """
    _require_breeding(current_user)

    egg_sac = db.query(EggSac).filter(
        EggSac.id == payload.egg_sac_id,
        EggSac.user_id == current_user.id,
    ).first()
    if not egg_sac:
        raise HTTPException(status_code=404, detail="Egg sac not found")

    shared = {
        "status": payload.status,
        "status_date": payload.status_date,
        "price_sold": payload.price_sold,
        "buyer_info": payload.buyer_info,
        "notes": payload.notes,
    }
    db.add_all([
        Offspring(user_id=current_user.id, egg_sac_id=payload.egg_sac_id, **shared)
        for _ in range(payload.count)
    ])
    db.commit()

    await create_activity(
        db=db,
        user_id=current_user.id,
        action_type="offspring",
        target_type="egg_sac",
        target_id=egg_sac.id,
        metadata={"bulk_count": payload.count, "status": payload.status.value},
    )
    return OffspringBulkResult(affected=payload.count)


@router.post("/offspring/bulk-update", response_model=OffspringBulkResult)
async def bulk_update_offspring(
    payload: OffspringBulkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply shared field changes to many offspring at once (Premium).

    e.g. select 30 slings and mark them sold with one price/date. Only rows
    owned by the caller are touched; only set fields are applied.
    """
    _require_breeding(current_user)

    rows = db.query(Offspring).filter(
        Offspring.id.in_(payload.ids),
        Offspring.user_id == current_user.id,
    ).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No matching offspring found")

    changes = payload.model_dump(exclude_unset=True, exclude={"ids"})
    for row in rows:
        for field, value in changes.items():
            setattr(row, field, value)
    db.commit()

    return OffspringBulkResult(affected=len(rows))


@router.get("/egg-sacs/{egg_sac_id}/offspring", response_model=List[OffspringResponse])
async def get_egg_sac_offspring(
    egg_sac_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all offspring for a specific egg sac"""
    # Verify egg sac belongs to user
    egg_sac = db.query(EggSac).filter(
        EggSac.id == egg_sac_id,
        EggSac.user_id == current_user.id
    ).first()

    if not egg_sac:
        raise HTTPException(status_code=404, detail="Egg sac not found")

    # Get offspring for this egg sac
    offspring = db.query(Offspring).filter(
        Offspring.egg_sac_id == egg_sac_id
    ).all()

    return offspring
