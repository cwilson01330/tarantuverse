"""
Tarantula routes
"""
from typing import List
from uuid import UUID
from datetime import datetime, timezone, timedelta, date
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.models.molt_log import MoltLog
from app.models.feeding_log import FeedingLog
from app.schemas.tarantula import (
    TarantulaCreate,
    TarantulaUpdate,
    TarantulaResponse,
    GrowthAnalytics,
    GrowthDataPoint,
    FeedingStats,
    PreyTypeCount,
    PremoltPrediction,
    PremoltIndicator
)
from app.utils.dependencies import get_current_user
from app.services.activity_service import create_activity

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
    # Check tarantula count limit
    limits = current_user.get_subscription_limits()
    current_count = db.query(Tarantula).filter(Tarantula.user_id == current_user.id).count()

    # -1 means unlimited (premium)
    if limits["max_tarantulas"] != -1 and current_count >= limits["max_tarantulas"]:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "message": f"You've reached the limit of {limits['max_tarantulas']} tarantulas on the free plan. Upgrade to premium for unlimited tracking!",
                "current_count": current_count,
                "limit": limits["max_tarantulas"],
                "is_premium": limits["is_premium"]
            }
        )

    new_tarantula = Tarantula(
        user_id=current_user.id,
        **tarantula_data.model_dump()
    )

    db.add(new_tarantula)
    db.commit()
    db.refresh(new_tarantula)

    # Create activity feed entry
    await create_activity(
        db=db,
        user_id=current_user.id,
        action_type="new_tarantula",
        target_type="tarantula",
        target_id=new_tarantula.id,
        metadata={
            "name": new_tarantula.name,
            "common_name": new_tarantula.common_name,
            "scientific_name": new_tarantula.scientific_name
        }
    )

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


@router.get("/{tarantula_id}/feeding-stats", response_model=FeedingStats)
async def get_feeding_stats(
    tarantula_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get feeding statistics and analytics for a tarantula
    
    Returns feeding patterns, acceptance rates, prey distribution,
    and predictions for next feeding.
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

    # Get all feeding logs ordered by date
    feeding_logs = db.query(FeedingLog).filter(
        FeedingLog.tarantula_id == tarantula_id
    ).order_by(FeedingLog.fed_at).all()

    if not feeding_logs:
        # Return empty stats if no feedings recorded
        return FeedingStats(
            tarantula_id=tarantula_id,
            total_feedings=0,
            total_accepted=0,
            total_refused=0,
            acceptance_rate=0.0,
            current_streak_accepted=0,
            prey_type_distribution=[]
        )

    # Calculate basic stats
    total_feedings = len(feeding_logs)
    total_accepted = sum(1 for log in feeding_logs if log.accepted)
    total_refused = total_feedings - total_accepted
    acceptance_rate = (total_accepted / total_feedings * 100) if total_feedings > 0 else 0.0

    # Calculate days between feedings
    days_between = []
    for i in range(1, len(feeding_logs)):
        previous_feeding = feeding_logs[i - 1]
        current_feeding = feeding_logs[i]
        gap = (current_feeding.fed_at - previous_feeding.fed_at).days
        days_between.append(gap)

    average_days_between = sum(days_between) / len(days_between) if days_between else None
    longest_gap = max(days_between) if days_between else None

    # Last feeding info
    last_feeding = feeding_logs[-1]
    last_feeding_date = last_feeding.fed_at
    days_since_last_feeding = (datetime.now(timezone.utc) - last_feeding_date).days

    # Predict next feeding
    next_feeding_prediction = None
    if average_days_between:
        predicted_days = int(average_days_between)
        next_feeding_prediction = (last_feeding_date + timedelta(days=predicted_days)).date()

    # Calculate current acceptance streak
    current_streak = 0
    for log in reversed(feeding_logs):
        if log.accepted:
            current_streak += 1
        else:
            break

    # Prey type distribution
    prey_types = [log.food_type for log in feeding_logs if log.food_type]
    prey_counter = Counter(prey_types)
    prey_distribution = []
    
    for food_type, count in prey_counter.most_common():
        percentage = (count / len(prey_types) * 100) if prey_types else 0
        prey_distribution.append(PreyTypeCount(
            food_type=food_type,
            count=count,
            percentage=round(percentage, 1)
        ))

    return FeedingStats(
        tarantula_id=tarantula_id,
        total_feedings=total_feedings,
        total_accepted=total_accepted,
        total_refused=total_refused,
        acceptance_rate=round(acceptance_rate, 1),
        average_days_between_feedings=average_days_between,
        last_feeding_date=last_feeding_date,
        days_since_last_feeding=days_since_last_feeding,
        next_feeding_prediction=next_feeding_prediction,
        longest_gap_days=longest_gap,
        current_streak_accepted=current_streak,
        prey_type_distribution=prey_distribution
    )


@router.get("/{tarantula_id}/premolt-prediction", response_model=PremoltPrediction)
async def get_premolt_prediction(
    tarantula_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Predict if a tarantula is approaching a molt

    Analyzes feeding patterns, molt history, and species characteristics
    to calculate the probability of an imminent molt.

    Returns:
    - probability: 0-100 score
    - confidence_level: low, medium, high, very_high
    - indicators: breakdown of contributing factors
    - helpful context about molt patterns
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

    # Get feeding logs (last 30 days and all refusals)
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    feeding_logs = db.query(FeedingLog).filter(
        FeedingLog.tarantula_id == tarantula_id,
        FeedingLog.fed_at >= thirty_days_ago
    ).order_by(FeedingLog.fed_at.desc()).all()

    # Get molt history
    molt_logs = db.query(MoltLog).filter(
        MoltLog.tarantula_id == tarantula_id
    ).order_by(MoltLog.molted_at.desc()).all()

    # Initialize prediction variables
    probability_score = 0
    indicators = []
    days_since_last_molt = None
    expected_molt_window = None

    # 1. CALCULATE CONSECUTIVE REFUSALS
    consecutive_refusals = 0
    for log in feeding_logs:
        if not log.accepted:
            consecutive_refusals += 1
        else:
            break

    if consecutive_refusals >= 3:
        score = 50
        indicators.append(PremoltIndicator(
            name="Multiple Feeding Refusals",
            description=f"{consecutive_refusals} consecutive refusals",
            score_contribution=score,
            confidence="high"
        ))
        probability_score += score
    elif consecutive_refusals == 2:
        score = 30
        indicators.append(PremoltIndicator(
            name="Recent Feeding Refusals",
            description=f"{consecutive_refusals} consecutive refusals",
            score_contribution=score,
            confidence="medium"
        ))
        probability_score += score
    elif consecutive_refusals == 1:
        score = 15
        indicators.append(PremoltIndicator(
            name="Single Feeding Refusal",
            description="Latest feeding was refused",
            score_contribution=score,
            confidence="low"
        ))
        probability_score += score

    # 2. ANALYZE RECENT REFUSAL RATE (last 14 days)
    fourteen_days_ago = datetime.now(timezone.utc) - timedelta(days=14)
    recent_feedings = [log for log in feeding_logs if log.fed_at >= fourteen_days_ago]

    recent_refusal_rate = 0.0
    if recent_feedings:
        recent_refused = sum(1 for log in recent_feedings if not log.accepted)
        recent_refusal_rate = (recent_refused / len(recent_feedings)) * 100

        if recent_refusal_rate > 50:
            score = 20
            indicators.append(PremoltIndicator(
                name="High Recent Refusal Rate",
                description=f"{recent_refusal_rate:.0f}% of recent feedings refused",
                score_contribution=score,
                confidence="medium"
            ))
            probability_score += score

    # 3. DAYS SINCE LAST MOLT
    if molt_logs:
        last_molt = molt_logs[0]
        days_since_last_molt = (datetime.now(timezone.utc) - last_molt.molted_at).days

        # Calculate average molt interval if we have multiple molts
        if len(molt_logs) > 1:
            intervals = []
            for i in range(len(molt_logs) - 1):
                interval = (molt_logs[i].molted_at - molt_logs[i+1].molted_at).days
                intervals.append(interval)
            average_interval = sum(intervals) / len(intervals)

            # Set expected molt window based on average
            expected_molt_window = f"{int(average_interval * 0.8)}-{int(average_interval * 1.2)} days"

            # Check if we're in the expected window
            if days_since_last_molt >= average_interval * 0.8:
                if days_since_last_molt >= average_interval * 1.2:
                    # Overdue for molt
                    score = 40
                    indicators.append(PremoltIndicator(
                        name="Overdue for Molt",
                        description=f"{days_since_last_molt} days since last molt (expected ~{int(average_interval)} days)",
                        score_contribution=score,
                        confidence="high"
                    ))
                    probability_score += score
                else:
                    # Within expected window
                    score = 20
                    indicators.append(PremoltIndicator(
                        name="In Expected Molt Window",
                        description=f"{days_since_last_molt} days since last molt",
                        score_contribution=score,
                        confidence="medium"
                    ))
                    probability_score += score
        else:
            # Only one molt recorded - use general heuristics
            if days_since_last_molt > 180:
                expected_molt_window = "120-240 days (estimated)"
                score = 15
                indicators.append(PremoltIndicator(
                    name="Extended Time Since Molt",
                    description=f"{days_since_last_molt} days since last molt",
                    score_contribution=score,
                    confidence="low"
                ))
                probability_score += score

    # 4. NO DATA AVAILABLE
    if not feeding_logs and not molt_logs:
        indicators.append(PremoltIndicator(
            name="Insufficient Data",
            description="No feeding or molt logs available for analysis",
            score_contribution=0,
            confidence="low"
        ))

    # 5. CAP PROBABILITY AT 100
    probability_score = min(probability_score, 100)

    # 6. DETERMINE CONFIDENCE LEVEL AND STATUS TEXT
    if probability_score >= 76:
        confidence_level = "very_high"
        status_text = "Premolt Imminent - Monitor closely"
    elif probability_score >= 51:
        confidence_level = "high"
        status_text = "Likely in Premolt"
    elif probability_score >= 26:
        confidence_level = "medium"
        status_text = "Possible Premolt Signs"
    else:
        confidence_level = "low"
        status_text = "Not Showing Premolt Signs"

    return PremoltPrediction(
        tarantula_id=tarantula_id,
        probability=probability_score,
        confidence_level=confidence_level,
        status_text=status_text,
        indicators=indicators,
        days_since_last_molt=days_since_last_molt,
        consecutive_refusals=consecutive_refusals,
        recent_refusal_rate=round(recent_refusal_rate, 1),
        expected_molt_window=expected_molt_window
    )
