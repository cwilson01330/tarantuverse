"""
Analytics routes for collection-wide statistics and insights
"""
from typing import List, Dict, Any
from datetime import datetime, timezone, timedelta
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.models.molt_log import MoltLog
from app.models.feeding_log import FeedingLog
from app.models.substrate_change import SubstrateChange
from app.schemas.analytics import CollectionAnalytics, SpeciesCount, ActivityItem
from app.utils.dependencies import get_current_user

router = APIRouter()


@router.get("/collection", response_model=CollectionAnalytics)
async def get_collection_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get comprehensive analytics for the user's entire collection
    
    Returns statistics including:
    - Total tarantulas count
    - Species diversity
    - Sex distribution
    - Age distribution
    - Collection value
    - Feeding statistics
    - Molt statistics
    - Recent activity
    """
    
    # Get all user's tarantulas
    tarantulas = db.query(Tarantula).filter(
        Tarantula.user_id == current_user.id
    ).all()
    
    total_count = len(tarantulas)
    
    if total_count == 0:
        # Return empty analytics for users with no tarantulas
        return CollectionAnalytics(
            total_tarantulas=0,
            unique_species=0,
            sex_distribution={"male": 0, "female": 0, "unknown": 0},
            species_counts=[],
            total_value=0.0,
            average_age_months=0.0,
            total_feedings=0,
            total_molts=0,
            total_substrate_changes=0,
            average_days_between_feedings=0.0,
            most_active_molter=None,
            newest_acquisition=None,
            oldest_acquisition=None,
            recent_activity=[]
        )
    
    # Calculate species diversity
    species_list = [t.scientific_name or t.common_name for t in tarantulas if t.scientific_name or t.common_name]
    species_counter = Counter(species_list)
    unique_species = len(species_counter)
    
    species_counts = [
        SpeciesCount(species_name=name, count=count)
        for name, count in species_counter.most_common()
    ]
    
    # Calculate sex distribution
    sex_distribution = {
        "male": sum(1 for t in tarantulas if t.sex == "male"),
        "female": sum(1 for t in tarantulas if t.sex == "female"),
        "unknown": sum(1 for t in tarantulas if t.sex == "unknown" or t.sex is None)
    }
    
    # Calculate total collection value
    total_value = sum(t.price_paid or 0.0 for t in tarantulas)
    
    # Calculate average age (in months since acquisition)
    ages_in_months = []
    for t in tarantulas:
        if t.date_acquired:
            age_days = (datetime.now(timezone.utc).date() - t.date_acquired).days
            age_months = age_days / 30.44  # Average days per month
            ages_in_months.append(age_months)
    
    average_age_months = sum(ages_in_months) / len(ages_in_months) if ages_in_months else 0.0
    
    # Get feeding statistics
    tarantula_ids = [t.id for t in tarantulas]
    total_feedings = db.query(func.count(FeedingLog.id)).filter(
        FeedingLog.tarantula_id.in_(tarantula_ids)
    ).scalar() or 0
    
    # Calculate average days between feedings across collection
    feeding_intervals = []
    for t_id in tarantula_ids:
        feedings = db.query(FeedingLog).filter(
            FeedingLog.tarantula_id == t_id
        ).order_by(FeedingLog.fed_at.asc()).all()
        
        if len(feedings) > 1:
            for i in range(1, len(feedings)):
                days_diff = (feedings[i].fed_at - feedings[i-1].fed_at).days
                if days_diff > 0:  # Only count positive intervals
                    feeding_intervals.append(days_diff)
    
    average_days_between_feedings = sum(feeding_intervals) / len(feeding_intervals) if feeding_intervals else 0.0
    
    # Get molt statistics
    total_molts = db.query(func.count(MoltLog.id)).filter(
        MoltLog.tarantula_id.in_(tarantula_ids)
    ).scalar() or 0
    
    # Find most active molter
    molt_counts = db.query(
        MoltLog.tarantula_id,
        func.count(MoltLog.id).label('molt_count')
    ).filter(
        MoltLog.tarantula_id.in_(tarantula_ids)
    ).group_by(MoltLog.tarantula_id).order_by(func.count(MoltLog.id).desc()).first()
    
    most_active_molter = None
    if molt_counts:
        molter = db.query(Tarantula).filter(Tarantula.id == molt_counts[0]).first()
        if molter:
            most_active_molter = {
                "tarantula_id": str(molter.id),
                "name": molter.common_name,
                "molt_count": molt_counts[1]
            }
    
    # Get substrate change statistics
    total_substrate_changes = db.query(func.count(SubstrateChange.id)).filter(
        SubstrateChange.tarantula_id.in_(tarantula_ids)
    ).scalar() or 0
    
    # Find newest and oldest acquisitions
    newest_acquisition = None
    oldest_acquisition = None
    
    tarantulas_with_dates = [t for t in tarantulas if t.date_acquired]
    if tarantulas_with_dates:
        newest = max(tarantulas_with_dates, key=lambda t: t.date_acquired)
        oldest = min(tarantulas_with_dates, key=lambda t: t.date_acquired)
        
        newest_acquisition = {
            "tarantula_id": str(newest.id),
            "name": newest.common_name,
            "date": newest.date_acquired.isoformat()
        }
        
        oldest_acquisition = {
            "tarantula_id": str(oldest.id),
            "name": oldest.common_name,
            "date": oldest.date_acquired.isoformat()
        }
    
    # Get recent activity (last 10 items across feedings, molts, and substrate changes)
    recent_activity = []
    
    # Get recent feedings
    recent_feedings = db.query(FeedingLog).filter(
        FeedingLog.tarantula_id.in_(tarantula_ids)
    ).order_by(FeedingLog.fed_at.desc()).limit(5).all()
    
    for feeding in recent_feedings:
        tarantula = db.query(Tarantula).filter(Tarantula.id == feeding.tarantula_id).first()
        if tarantula:
            recent_activity.append(ActivityItem(
                type="feeding",
                date=feeding.fed_at,
                tarantula_id=str(tarantula.id),
                tarantula_name=tarantula.common_name,
                description=f"Fed {feeding.food_type}" + (" (refused)" if not feeding.accepted else "")
            ))
    
    # Get recent molts
    recent_molts = db.query(MoltLog).filter(
        MoltLog.tarantula_id.in_(tarantula_ids)
    ).order_by(MoltLog.molted_at.desc()).limit(5).all()
    
    for molt in recent_molts:
        tarantula = db.query(Tarantula).filter(Tarantula.id == molt.tarantula_id).first()
        if tarantula:
            description = "Molted successfully"
            if molt.weight_after or molt.leg_span_after:
                details = []
                if molt.weight_after:
                    details.append(f"{molt.weight_after}g")
                if molt.leg_span_after:
                    details.append(f"{molt.leg_span_after}cm")
                description += f" ({', '.join(details)})"
            
            recent_activity.append(ActivityItem(
                type="molt",
                date=molt.molted_at,
                tarantula_id=str(tarantula.id),
                tarantula_name=tarantula.common_name,
                description=description
            ))
    
    # Get recent substrate changes
    recent_substrate = db.query(SubstrateChange).filter(
        SubstrateChange.tarantula_id.in_(tarantula_ids)
    ).order_by(SubstrateChange.changed_at.desc()).limit(5).all()
    
    for change in recent_substrate:
        tarantula = db.query(Tarantula).filter(Tarantula.id == change.tarantula_id).first()
        if tarantula:
            recent_activity.append(ActivityItem(
                type="substrate_change",
                date=change.changed_at,
                tarantula_id=str(tarantula.id),
                tarantula_name=tarantula.common_name,
                description=f"Substrate changed to {change.substrate_type}"
            ))
    
    # Sort all activity by date and limit to 10 most recent
    recent_activity.sort(key=lambda x: x.date, reverse=True)
    recent_activity = recent_activity[:10]
    
    return CollectionAnalytics(
        total_tarantulas=total_count,
        unique_species=unique_species,
        sex_distribution=sex_distribution,
        species_counts=species_counts,
        total_value=total_value,
        average_age_months=round(average_age_months, 1),
        total_feedings=total_feedings,
        total_molts=total_molts,
        total_substrate_changes=total_substrate_changes,
        average_days_between_feedings=round(average_days_between_feedings, 1),
        most_active_molter=most_active_molter,
        newest_acquisition=newest_acquisition,
        oldest_acquisition=oldest_acquisition,
        recent_activity=recent_activity
    )
