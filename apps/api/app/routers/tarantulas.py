"""
Tarantula routes
"""
from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.schemas.tarantula import TarantulaCreate, TarantulaUpdate, TarantulaResponse
from app.routers.auth import get_current_user

router = APIRouter()


@router.get("/", response_model=List[TarantulaResponse])
async def get_tarantulas(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all tarantulas for authenticated user

    Returns a list of all tarantulas owned by the current user.
    """
    tarantulas = db.query(Tarantula).filter(
        Tarantula.user_id == current_user.id
    ).order_by(Tarantula.created_at.desc()).all()

    return tarantulas


@router.post("/", response_model=TarantulaResponse, status_code=status.HTTP_201_CREATED)
async def create_tarantula(
    tarantula_data: TarantulaCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new tarantula

    - **name**: Pet name (optional)
    - **scientific_name**: Scientific name (optional)
    - **species_id**: Link to species database (optional)
    - **sex**: male, female, or unknown
    - **date_acquired**: When you got this tarantula
    - All other fields are optional
    """
    new_tarantula = Tarantula(
        user_id=current_user.id,
        **tarantula_data.dict()
    )

    db.add(new_tarantula)
    db.commit()
    db.refresh(new_tarantula)

    return new_tarantula


@router.get("/{tarantula_id}", response_model=TarantulaResponse)
async def get_tarantula(
    tarantula_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get a single tarantula by ID

    Only returns tarantulas owned by the current user.
    """
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tarantula not found"
        )

    return tarantula


@router.put("/{tarantula_id}", response_model=TarantulaResponse)
async def update_tarantula(
    tarantula_id: UUID,
    tarantula_data: TarantulaUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update a tarantula

    All fields are optional. Only provided fields will be updated.
    """
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tarantula not found"
        )

    # Update only provided fields
    update_data = tarantula_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(tarantula, field, value)

    db.commit()
    db.refresh(tarantula)

    return tarantula


@router.delete("/{tarantula_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tarantula(
    tarantula_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a tarantula

    Permanently deletes the tarantula and all associated records.
    """
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tarantula not found"
        )

    db.delete(tarantula)
    db.commit()

    return None


@router.get("/{tarantula_id}/stats")
async def get_tarantula_stats(
    tarantula_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get analytics and stats for a tarantula

    TODO: Implement growth charts, feeding patterns, etc.
    """
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tarantula not found"
        )

    return {
        "tarantula_id": tarantula_id,
        "message": "Stats endpoint - coming soon with feeding/molt analytics"
    }
