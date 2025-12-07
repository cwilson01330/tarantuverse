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
from app.models.pairing import Pairing
from app.schemas.pairing import PairingCreate, PairingUpdate, PairingResponse
from app.utils.dependencies import get_current_user
from app.services.activity_service import create_activity

router = APIRouter()


@router.get("/pairings/", response_model=List[PairingResponse])
async def get_pairings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all pairings for the current user"""
    pairings = db.query(Pairing).filter(
        Pairing.user_id == current_user.id
    ).order_by(Pairing.paired_date.desc()).all()

    return pairings


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

    return pairing


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

    # Create pairing
    new_pairing = Pairing(
        user_id=current_user.id,
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

    return new_pairing


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

    return pairing


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

    # Get pairings where this tarantula is either male or female
    pairings = db.query(Pairing).filter(
        (Pairing.male_id == tarantula_id) | (Pairing.female_id == tarantula_id)
    ).order_by(Pairing.paired_date.desc()).all()

    return pairings
