"""
Feeding log routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid

from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.models.feeding_log import FeedingLog
from app.schemas.feeding import FeedingLogCreate, FeedingLogUpdate, FeedingLogResponse
from app.utils.dependencies import get_current_user
from app.services.activity_service import create_activity

router = APIRouter()


@router.get("/tarantulas/{tarantula_id}/feedings", response_model=List[FeedingLogResponse])
async def get_feeding_logs(
    tarantula_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all feeding logs for a tarantula"""
    # Verify tarantula belongs to user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")

    # Get feeding logs ordered by date (most recent first)
    feedings = db.query(FeedingLog).filter(
        FeedingLog.tarantula_id == tarantula_id
    ).order_by(FeedingLog.fed_at.desc()).all()

    return feedings


@router.post("/tarantulas/{tarantula_id}/feedings", response_model=FeedingLogResponse, status_code=status.HTTP_201_CREATED)
async def create_feeding_log(
    tarantula_id: uuid.UUID,
    feeding_data: FeedingLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new feeding log"""
    # Verify tarantula belongs to user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")

    # Create feeding log
    new_feeding = FeedingLog(
        tarantula_id=tarantula_id,
        **feeding_data.model_dump()
    )

    db.add(new_feeding)
    db.commit()
    db.refresh(new_feeding)
    
    # Create activity feed entry
    await create_activity(
        db=db,
        user_id=current_user.id,
        action_type="feeding",
        target_type="tarantula",
        target_id=tarantula_id,
        metadata={
            "tarantula_name": tarantula.name,
            "food_type": feeding_data.food_type,
            "accepted": feeding_data.accepted
        }
    )

    return new_feeding


@router.put("/feedings/{feeding_id}", response_model=FeedingLogResponse)
async def update_feeding_log(
    feeding_id: uuid.UUID,
    feeding_data: FeedingLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a feeding log"""
    # Get feeding log and verify ownership through tarantula
    feeding = db.query(FeedingLog).filter(FeedingLog.id == feeding_id).first()

    if not feeding:
        raise HTTPException(status_code=404, detail="Feeding log not found")

    # Verify ownership
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == feeding.tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Update feeding log
    update_data = feeding_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(feeding, field, value)

    db.commit()
    db.refresh(feeding)

    return feeding


@router.delete("/feedings/{feeding_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_feeding_log(
    feeding_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a feeding log"""
    # Get feeding log and verify ownership through tarantula
    feeding = db.query(FeedingLog).filter(FeedingLog.id == feeding_id).first()

    if not feeding:
        raise HTTPException(status_code=404, detail="Feeding log not found")

    # Verify ownership
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == feeding.tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.delete(feeding)
    db.commit()

    return None
