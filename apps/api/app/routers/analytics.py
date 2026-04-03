"""
Analytics routes for collection-wide statistics and insights
"""
from typing import List, Dict, Any
from datetime import datetime, timezone, timedelta, date
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, extract
from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.models.molt_log import MoltLog
from app.models.feeding_log import FeedingLog
from app.models.substrate_change import SubstrateChange
from app.schemas.analytics import (
    CollectionAnalytics,
    SpeciesCount,
    ActivityItem,
    AdvancedAnalyticsResponse,
    MoltHeatmapEntry,
    CollectionGrowthEntry,
    SpeciesDistEntry,
)
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

    def get_display_name(t):
        """Get a display name for a tarantula, with fallbacks"""
        return t.name or t.common_name or t.scientific_name or "Unnamed"
    
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
    species_list = [t.scientific_name or t.common_name or t.name or "Unknown" for t in tarantulas]
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
    total_value = float(sum(float(t.price_paid or 0) for t in tarantulas))
    
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
    # Batch-fetch all feedings in one query instead of per-tarantula
    all_feedings = db.query(FeedingLog).filter(
        FeedingLog.tarantula_id.in_(tarantula_ids)
    ).order_by(FeedingLog.tarantula_id, FeedingLog.fed_at.asc()).all()

    # Group feedings by tarantula
    feedings_by_tarantula: Dict[Any, list] = {}
    for feeding in all_feedings:
        feedings_by_tarantula.setdefault(feeding.tarantula_id, []).append(feeding)

    feeding_intervals = []
    for t_id, feedings in feedings_by_tarantula.items():
        if len(feedings) > 1:
            for i in range(1, len(feedings)):
                days_diff = (feedings[i].fed_at - feedings[i-1].fed_at).days
                if days_diff > 0:
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
                "name": get_display_name(molter),
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
            "name": get_display_name(newest),
            "date": newest.date_acquired.isoformat()
        }

        oldest_acquisition = {
            "tarantula_id": str(oldest.id),
            "name": get_display_name(oldest),
            "date": oldest.date_acquired.isoformat()
        }
    
    # Get recent activity (last 10 items across feedings, molts, and substrate changes)
    # Build a lookup map to avoid N+1 queries for tarantula names
    tarantula_map = {t.id: t for t in tarantulas}

    recent_activity = []

    # Get recent feedings
    recent_feedings = db.query(FeedingLog).filter(
        FeedingLog.tarantula_id.in_(tarantula_ids)
    ).order_by(FeedingLog.fed_at.desc()).limit(5).all()

    for feeding in recent_feedings:
        tarantula = tarantula_map.get(feeding.tarantula_id)
        if tarantula:
            recent_activity.append(ActivityItem(
                type="feeding",
                date=feeding.fed_at.date() if feeding.fed_at else date.today(),
                tarantula_id=str(tarantula.id),
                tarantula_name=get_display_name(tarantula),
                description=f"Fed {feeding.food_type or 'prey'}" + (" (refused)" if not feeding.accepted else "")
            ))

    # Get recent molts
    recent_molts = db.query(MoltLog).filter(
        MoltLog.tarantula_id.in_(tarantula_ids)
    ).order_by(MoltLog.molted_at.desc()).limit(5).all()

    for molt in recent_molts:
        tarantula = tarantula_map.get(molt.tarantula_id)
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
                date=molt.molted_at.date() if molt.molted_at else date.today(),
                tarantula_id=str(tarantula.id),
                tarantula_name=get_display_name(tarantula),
                description=description
            ))

    # Get recent substrate changes
    recent_substrate = db.query(SubstrateChange).filter(
        SubstrateChange.tarantula_id.in_(tarantula_ids)
    ).order_by(SubstrateChange.changed_at.desc()).limit(5).all()

    for change in recent_substrate:
        tarantula = tarantula_map.get(change.tarantula_id)
        if tarantula:
            recent_activity.append(ActivityItem(
                type="substrate_change",
                date=change.changed_at,
                tarantula_id=str(tarantula.id),
                tarantula_name=get_display_name(tarantula),
                description=f"Substrate changed to {change.substrate_type or 'new substrate'}"
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


@router.get("/advanced/", response_model=AdvancedAnalyticsResponse)
async def get_advanced_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get premium advanced analytics for the user's collection.

    Returns:
    - Collection value statistics (total, average, most expensive)
    - Molt heatmap (molts per month for last 12 months)
    - Collection growth timeline (tarantulas added per month)
    - Species distribution (top 10)
    - Sex distribution
    - Enclosure type distribution
    - Estimated monthly feeding cost
    - Total activity counts
    """

    # Get all user's tarantulas
    tarantulas = db.query(Tarantula).filter(
        Tarantula.user_id == current_user.id
    ).all()

    total_count = len(tarantulas)
    tarantula_ids = [t.id for t in tarantulas]

    # Empty response if no tarantulas
    if total_count == 0:
        return AdvancedAnalyticsResponse(
            collection_value_total=0.0,
            collection_value_average=0.0,
            most_expensive_name=None,
            most_expensive_price=None,
            molt_heatmap=[],
            collection_growth=[],
            species_distribution=[],
            sex_distribution={"male": 0, "female": 0, "unknown": 0},
            enclosure_type_distribution={},
            total_feedings_logged=0,
            total_molts_logged=0,
            estimated_monthly_feeding_cost=0.0,
        )

    # ===== COLLECTION VALUE =====
    collection_value_total = float(sum(float(t.price_paid or 0) for t in tarantulas))
    collection_value_average = (
        collection_value_total / total_count if total_count > 0 else 0.0
    )

    # Find most expensive tarantula
    most_expensive = None
    most_expensive_price = None
    for t in tarantulas:
        if t.price_paid:
            if most_expensive_price is None or float(t.price_paid) > most_expensive_price:
                most_expensive_price = float(t.price_paid)
                most_expensive = t.name or t.common_name or t.scientific_name or "Unnamed"

    # ===== MOLT HEATMAP (last 12 months) =====
    now = datetime.now(timezone.utc)
    twelve_months_ago = now - timedelta(days=365)

    molt_data = (
        db.query(
            extract("year", MoltLog.molted_at).label("year"),
            extract("month", MoltLog.molted_at).label("month"),
            func.count(MoltLog.id).label("count"),
        )
        .filter(
            MoltLog.tarantula_id.in_(tarantula_ids),
            MoltLog.molted_at >= twelve_months_ago,
        )
        .group_by(
            extract("year", MoltLog.molted_at),
            extract("month", MoltLog.molted_at),
        )
        .order_by(
            extract("year", MoltLog.molted_at),
            extract("month", MoltLog.molted_at),
        )
        .all()
    )

    molt_heatmap = [
        MoltHeatmapEntry(
            month=f"{int(m.year)}-{int(m.month):02d}",
            count=int(m.count),
        )
        for m in molt_data
    ]

    # ===== COLLECTION GROWTH (last 12 months) =====
    growth_data = (
        db.query(
            extract("year", Tarantula.date_acquired).label("year"),
            extract("month", Tarantula.date_acquired).label("month"),
            func.count(Tarantula.id).label("count"),
        )
        .filter(
            Tarantula.user_id == current_user.id,
            Tarantula.date_acquired >= twelve_months_ago.date(),
        )
        .group_by(
            extract("year", Tarantula.date_acquired),
            extract("month", Tarantula.date_acquired),
        )
        .order_by(
            extract("year", Tarantula.date_acquired),
            extract("month", Tarantula.date_acquired),
        )
        .all()
    )

    collection_growth = [
        CollectionGrowthEntry(
            month=f"{int(g.year)}-{int(g.month):02d}",
            count=int(g.count),
        )
        for g in growth_data
    ]

    # ===== SPECIES DISTRIBUTION =====
    species_counts = Counter()
    for t in tarantulas:
        species_name = t.scientific_name or t.common_name or t.name or "Unknown"
        species_counts[species_name] += 1

    species_distribution = [
        SpeciesDistEntry(species_name=name, count=count)
        for name, count in species_counts.most_common(10)
    ]

    # ===== SEX DISTRIBUTION =====
    sex_distribution = {
        "male": sum(1 for t in tarantulas if t.sex == "male"),
        "female": sum(1 for t in tarantulas if t.sex == "female"),
        "unknown": sum(1 for t in tarantulas if t.sex == "unknown" or t.sex is None),
    }

    # ===== ENCLOSURE TYPE DISTRIBUTION =====
    enclosure_type_counts = Counter()
    for t in tarantulas:
        enclosure_type = t.enclosure_type or "unknown"
        enclosure_type_counts[enclosure_type] += 1

    enclosure_type_distribution = dict(enclosure_type_counts)

    # ===== FEEDING COSTS =====
    total_feedings = (
        db.query(func.count(FeedingLog.id))
        .filter(FeedingLog.tarantula_id.in_(tarantula_ids))
        .scalar()
        or 0
    )

    # Estimate monthly feeding cost: count feedings in last 30 days * $0.50 per feeding
    thirty_days_ago = now - timedelta(days=30)
    recent_feedings = (
        db.query(func.count(FeedingLog.id))
        .filter(
            FeedingLog.tarantula_id.in_(tarantula_ids),
            FeedingLog.fed_at >= thirty_days_ago,
        )
        .scalar()
        or 0
    )

    # Project to monthly average if we have data
    if recent_feedings > 0:
        estimated_monthly_feeding_cost = float(recent_feedings * 0.50)
    else:
        # Fallback: estimate based on collection size (average 1 feeding per tarantula per week)
        estimated_monthly_feeding_cost = float(total_count * 4 * 0.50) if total_count > 0 else 0.0

    # ===== TOTAL MOLT LOGS =====
    total_molts = (
        db.query(func.count(MoltLog.id))
        .filter(MoltLog.tarantula_id.in_(tarantula_ids))
        .scalar()
        or 0
    )

    return AdvancedAnalyticsResponse(
        collection_value_total=round(collection_value_total, 2),
        collection_value_average=round(collection_value_average, 2),
        most_expensive_name=most_expensive,
        most_expensive_price=round(most_expensive_price, 2) if most_expensive_price else None,
        molt_heatmap=molt_heatmap,
        collection_growth=collection_growth,
        species_distribution=species_distribution,
        sex_distribution=sex_distribution,
        enclosure_type_distribution=enclosure_type_distribution,
        total_feedings_logged=total_feedings,
        total_molts_logged=total_molts,
        estimated_monthly_feeding_cost=round(estimated_monthly_feeding_cost, 2),
    )
