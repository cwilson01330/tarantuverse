"""
Tarantula routes
"""
from typing import List
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.models.molt_log import MoltLog
from app.schemas.tarantula import (
    TarantulaCreate,
    TarantulaUpdate,
    TarantulaResponse,
    GrowthAnalytics,
    GrowthDataPoint
)
from app.utils.dependencies import get_current_user

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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new tarantula

    - **common_name**: Common name
    - **scientific_name**: Scientific name
    - **species_id**: Link to species database (optional)
    - **sex**: male, female, or unknown
    - **date_acquired**: When you got this tarantula
    - All other fields are optional
    """
    print(f"[DEBUG] Creating tarantula for user {current_user.id}")
    print(f"[DEBUG] Tarantula data: {tarantula_data.model_dump()}")

    new_tarantula = Tarantula(
        user_id=current_user.id,
        **tarantula_data.model_dump()
    )

    db.add(new_tarantula)
    db.commit()
    db.refresh(new_tarantula)

    print(f"[DEBUG] Tarantula created successfully: {new_tarantula.id}")

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
    update_data = tarantula_data.model_dump(exclude_unset=True)
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


@router.get("/{tarantula_id}/growth", response_model=GrowthAnalytics)
async def get_tarantula_growth(
    tarantula_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get growth analytics for a tarantula
    
    Returns historical molt data with calculated growth rates,
    time between molts, and overall growth trends.
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

    # Get all molt logs ordered by date
    molt_logs = db.query(MoltLog).filter(
        MoltLog.tarantula_id == tarantula_id
    ).order_by(MoltLog.molted_at).all()

    if not molt_logs:
        # Return empty analytics if no molts recorded
        return GrowthAnalytics(
            tarantula_id=tarantula_id,
            data_points=[],
            total_molts=0
        )

    # Build data points with growth calculations
    data_points = []
    previous_molt = None
    
    for molt in molt_logs:
        days_since_previous = None
        weight_change = None
        leg_span_change = None
        
        if previous_molt:
            # Calculate time since previous molt
            time_diff = molt.molted_at - previous_molt.molted_at
            days_since_previous = time_diff.days
            
            # Calculate weight change
            if molt.weight_after and previous_molt.weight_after:
                weight_change = molt.weight_after - previous_molt.weight_after
            
            # Calculate leg span change
            if molt.leg_span_after and previous_molt.leg_span_after:
                leg_span_change = molt.leg_span_after - previous_molt.leg_span_after
        
        data_point = GrowthDataPoint(
            date=molt.molted_at,
            weight=molt.weight_after,
            leg_span=molt.leg_span_after,
            days_since_previous=days_since_previous,
            weight_change=weight_change,
            leg_span_change=leg_span_change
        )
        data_points.append(data_point)
        previous_molt = molt

    # Calculate summary statistics
    total_molts = len(molt_logs)
    
    # Average days between molts
    days_between = [dp.days_since_previous for dp in data_points if dp.days_since_previous]
    average_days_between_molts = sum(days_between) / len(days_between) if days_between else None
    
    # Total growth
    first_molt = molt_logs[0]
    last_molt = molt_logs[-1]
    
    total_weight_gain = None
    if first_molt.weight_after and last_molt.weight_after:
        total_weight_gain = last_molt.weight_after - first_molt.weight_after
    
    total_leg_span_gain = None
    if first_molt.leg_span_after and last_molt.leg_span_after:
        total_leg_span_gain = last_molt.leg_span_after - first_molt.leg_span_after
    
    # Growth rate (per month)
    growth_rate_weight = None
    growth_rate_leg_span = None
    
    if len(molt_logs) > 1:
        time_span = (last_molt.molted_at - first_molt.molted_at).days
        months = time_span / 30.44  # Average days per month
        
        if months > 0:
            if total_weight_gain:
                growth_rate_weight = total_weight_gain / months
            if total_leg_span_gain:
                growth_rate_leg_span = total_leg_span_gain / months
    
    # Days since last molt
    last_molt_date = last_molt.molted_at
    days_since_last_molt = (datetime.now(timezone.utc) - last_molt_date).days

    return GrowthAnalytics(
        tarantula_id=tarantula_id,
        data_points=data_points,
        total_molts=total_molts,
        average_days_between_molts=average_days_between_molts,
        total_weight_gain=total_weight_gain,
        total_leg_span_gain=total_leg_span_gain,
        growth_rate_weight=growth_rate_weight,
        growth_rate_leg_span=growth_rate_leg_span,
        last_molt_date=last_molt_date,
        days_since_last_molt=days_since_last_molt
    )
