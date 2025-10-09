"""
Molt log routes
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import uuid

from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.models.molt_log import MoltLog
from app.schemas.molt import MoltLogCreate, MoltLogUpdate, MoltLogResponse
from app.utils.dependencies import get_current_user
from app.services.activity_service import create_activity

router = APIRouter()


@router.get("/tarantulas/{tarantula_id}/molts", response_model=List[MoltLogResponse])
async def get_molt_logs(
    tarantula_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all molt logs for a tarantula"""
    # Verify tarantula belongs to user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")

    molt_logs = db.query(MoltLog).filter(
        MoltLog.tarantula_id == tarantula_id
    ).order_by(MoltLog.molted_at.desc()).all()

    return molt_logs


@router.post("/tarantulas/{tarantula_id}/molts", response_model=MoltLogResponse, status_code=status.HTTP_201_CREATED)
async def create_molt_log(
    tarantula_id: uuid.UUID,
    molt_data: MoltLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new molt log"""
    # Verify tarantula belongs to user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")

    new_molt = MoltLog(
        tarantula_id=tarantula_id,
        **molt_data.model_dump()
    )

    db.add(new_molt)
    db.commit()
    db.refresh(new_molt)
    
    # Create activity feed entry
    await create_activity(
        db=db,
        user_id=current_user.id,
        action_type="molt",
        target_type="tarantula",
        target_id=tarantula_id,
        metadata={
            "tarantula_name": tarantula.name,
            "molt_id": str(new_molt.id)
        }
    )

    return new_molt


@router.put("/molts/{molt_id}", response_model=MoltLogResponse)
async def update_molt_log(
    molt_id: uuid.UUID,
    molt_data: MoltLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a molt log"""
    # Get the molt log
    molt = db.query(MoltLog).filter(MoltLog.id == molt_id).first()

    if not molt:
        raise HTTPException(status_code=404, detail="Molt log not found")

    # Verify ownership through tarantula
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == molt.tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Not authorized")

    # Update fields
    update_data = molt_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(molt, field, value)

    db.commit()
    db.refresh(molt)

    return molt


@router.delete("/molts/{molt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_molt_log(
    molt_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a molt log"""
    # Get the molt log
    molt = db.query(MoltLog).filter(MoltLog.id == molt_id).first()

    if not molt:
        raise HTTPException(status_code=404, detail="Molt log not found")

    # Verify ownership through tarantula
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == molt.tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Not authorized")

    db.delete(molt)
    db.commit()

    return None
