"""
Egg sac routes for breeding module
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid

from app.database import get_db
from app.models.user import User
from app.models.pairing import Pairing
from app.models.egg_sac import EggSac
from app.schemas.egg_sac import EggSacCreate, EggSacUpdate, EggSacResponse
from app.utils.dependencies import get_current_user
from app.services.activity_service import create_activity

router = APIRouter()


@router.get("/egg-sacs/", response_model=List[EggSacResponse])
async def get_egg_sacs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all egg sacs for the current user"""
    egg_sacs = db.query(EggSac).filter(
        EggSac.user_id == current_user.id
    ).order_by(EggSac.laid_date.desc()).all()

    return egg_sacs


@router.get("/egg-sacs/{egg_sac_id}", response_model=EggSacResponse)
async def get_egg_sac(
    egg_sac_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific egg sac"""
    egg_sac = db.query(EggSac).filter(
        EggSac.id == egg_sac_id,
        EggSac.user_id == current_user.id
    ).first()

    if not egg_sac:
        raise HTTPException(status_code=404, detail="Egg sac not found")

    return egg_sac


@router.post("/egg-sacs/", response_model=EggSacResponse, status_code=status.HTTP_201_CREATED)
async def create_egg_sac(
    egg_sac_data: EggSacCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new egg sac"""
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
        **egg_sac_data.model_dump()
    )

    db.add(new_egg_sac)
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

    return new_egg_sac


@router.put("/egg-sacs/{egg_sac_id}", response_model=EggSacResponse)
async def update_egg_sac(
    egg_sac_id: uuid.UUID,
    egg_sac_data: EggSacUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update an egg sac"""
    # Get egg sac and verify ownership
    egg_sac = db.query(EggSac).filter(
        EggSac.id == egg_sac_id,
        EggSac.user_id == current_user.id
    ).first()

    if not egg_sac:
        raise HTTPException(status_code=404, detail="Egg sac not found")

    # If updating pairing ID, verify ownership
    if egg_sac_data.pairing_id:
        pairing = db.query(Pairing).filter(
            Pairing.id == egg_sac_data.pairing_id,
            Pairing.user_id == current_user.id
        ).first()
        if not pairing:
            raise HTTPException(status_code=404, detail="Pairing not found")

    # Update egg sac
    update_data = egg_sac_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(egg_sac, field, value)

    db.commit()
    db.refresh(egg_sac)

    return egg_sac


@router.delete("/egg-sacs/{egg_sac_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_egg_sac(
    egg_sac_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete an egg sac"""
    # Get egg sac and verify ownership
    egg_sac = db.query(EggSac).filter(
        EggSac.id == egg_sac_id,
        EggSac.user_id == current_user.id
    ).first()

    if not egg_sac:
        raise HTTPException(status_code=404, detail="Egg sac not found")

    db.delete(egg_sac)
    db.commit()

    return None


@router.get("/pairings/{pairing_id}/egg-sacs", response_model=List[EggSacResponse])
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

    return egg_sacs
