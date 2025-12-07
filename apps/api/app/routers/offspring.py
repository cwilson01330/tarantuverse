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
from app.models.tarantula import Tarantula
from app.models.offspring import Offspring
from app.schemas.offspring import OffspringCreate, OffspringUpdate, OffspringResponse
from app.utils.dependencies import get_current_user
from app.services.activity_service import create_activity

router = APIRouter()


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

    # If tarantula_id provided, verify it belongs to user
    if offspring_data.tarantula_id:
        tarantula = db.query(Tarantula).filter(
            Tarantula.id == offspring_data.tarantula_id,
            Tarantula.user_id == current_user.id
        ).first()
        if not tarantula:
            raise HTTPException(status_code=404, detail="Tarantula not found")

    # Create offspring record
    new_offspring = Offspring(
        user_id=current_user.id,
        **offspring_data.model_dump()
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

    # If updating tarantula_id, verify ownership
    if offspring_data.tarantula_id:
        tarantula = db.query(Tarantula).filter(
            Tarantula.id == offspring_data.tarantula_id,
            Tarantula.user_id == current_user.id
        ).first()
        if not tarantula:
            raise HTTPException(status_code=404, detail="Tarantula not found")

    # Update offspring record
    update_data = offspring_data.model_dump(exclude_unset=True)
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
