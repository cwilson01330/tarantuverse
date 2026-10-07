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
from app.models.invert import Invert
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
from app.utils.access import policy

router = APIRouter()


@router.get("/breeding")
@policy("owner_only")
async def breeding_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Breeding analytics for the current user (premium — ADR-010 depth tier).

    Honesty-first: every rate/average is returned as null when there's no
    data to compute it from, rather than a misleading 0.
    """
    from app.models.pairing import Pairing
    from app.models.egg_sac import EggSac
    from app.models.offspring import Offspring

    limits = current_user.get_subscription_limits()
    if not limits.get("can_use_breeding"):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "message": "Breeding analytics is a premium feature.",
                "feature": "breeding",
                "is_premium": limits.get("is_premium", False),
            },
        )

    pairings = db.query(Pairing).filter(Pairing.user_id == current_user.id).all()
    egg_sacs = db.query(EggSac).filter(EggSac.user_id == current_user.id).all()
    offspring = db.query(Offspring).filter(Offspring.user_id == current_user.id).all()

    def pct(n, d):
        return round(100.0 * n / d, 1) if d else None

    def avg(values):
        vals = [v for v in values if v is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    # ── Pairing success: produced at least one egg sac ──
    pairing_ids_with_sac = {s.pairing_id for s in egg_sacs}
    outcomes = Counter(
        (p.outcome.value if hasattr(p.outcome, "value") else p.outcome) for p in pairings
    )

    # ── Egg sac metrics ──
    hatched = [s for s in egg_sacs if s.hatch_date]
    days_to_hatch = [
        (s.hatch_date - s.laid_date).days
        for s in egg_sacs
        if s.hatch_date and s.laid_date and s.hatch_date >= s.laid_date
    ]
    clutch_sizes = [s.spiderling_count for s in egg_sacs if s.spiderling_count]
    survival_rates = [
        100.0 * s.viable_count / s.spiderling_count
        for s in egg_sacs
        if s.spiderling_count and s.viable_count is not None
    ]

    # ── Offspring / revenue ──
    status_breakdown = Counter(
        (o.status.value if hasattr(o.status, "value") else o.status) for o in offspring
    )
    sold = [o for o in offspring if o.price_sold is not None]
    total_revenue = float(sum(o.price_sold for o in sold)) if sold else 0.0

    # ── Top performers (attribute each sac's clutch to its pairing's parents) ──
    pairing_by_id = {p.id: p for p in pairings}
    names = {
        t.id: (t.name or t.common_name or t.scientific_name or "Unnamed")
        # Every taxon's animals can be parents (ADR-021), not just tarantulas.
        for t in db.query(Invert).filter(Invert.user_id == current_user.id).all()
    }

    def perf_map(parent_attr):
        agg: Dict[Any, Dict[str, Any]] = {}
        for s in egg_sacs:
            p = pairing_by_id.get(s.pairing_id)
            if not p:
                continue
            pid = getattr(p, parent_attr)
            row = agg.setdefault(pid, {"egg_sacs": 0, "offspring": 0})
            row["egg_sacs"] += 1
            row["offspring"] += s.spiderling_count or 0
        out = []
        for pid, row in agg.items():
            out.append({
                "id": str(pid),
                "name": names.get(pid, "Unknown"),
                "egg_sacs": row["egg_sacs"],
                "offspring": row["offspring"],
            })
        out.sort(key=lambda r: (r["offspring"], r["egg_sacs"]), reverse=True)
        return out[:5]

    return {
        "totals": {
            "pairings": len(pairings),
            "egg_sacs": len(egg_sacs),
            "offspring": len(offspring),
        },
        "pairing_success_rate": pct(len(pairing_ids_with_sac), len(pairings)),
        "outcomes": dict(outcomes),
        "egg_sacs": {
            "hatched": len(hatched),
            "hatch_rate": pct(len(hatched), len(egg_sacs)),
            "avg_days_to_hatch": avg(days_to_hatch),
            "avg_clutch_size": avg(clutch_sizes),
            "avg_survival_rate": avg(survival_rates),
        },
        "offspring": {
            "status_breakdown": dict(status_breakdown),
            "total_revenue": round(total_revenue, 2),
            "sold_count": len(sold),
            "avg_sale_price": round(total_revenue / len(sold), 2) if sold else None,
            "revenue_per_pairing": round(total_revenue / len(pairings), 2) if pairings else None,
        },
        "top_females": perf_map("female_id"),
        "top_males": perf_map("male_id"),
    }


@router.get("/collection", response_model=CollectionAnalytics)
@policy("owner_only")
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
    
    # Get all the user's animals across EVERY taxon from the unified `inverts`
    # table (tarantulas are mirrored there too), excluding transferred-out
    # animals so the stats match the displayed collection + cap. The variable
    # keeps the name `tarantulas` only to minimize churn below — it now holds
    # all taxa. Polymorphic feeding/molt/substrate logs are matched on
    # invert_id, which dual-write + backfill keep populated for every taxon.
    tarantulas = db.query(Invert).filter(
        Invert.user_id == current_user.id,
        Invert.transferred_out_at.is_(None),
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
        FeedingLog.invert_id.in_(tarantula_ids)
    ).scalar() or 0

    # Calculate average days between feedings across collection
    # Batch-fetch all feedings in one query instead of per-animal
    all_feedings = db.query(FeedingLog).filter(
        FeedingLog.invert_id.in_(tarantula_ids)
    ).order_by(FeedingLog.invert_id, FeedingLog.fed_at.asc()).all()

    # Group feedings by animal
    feedings_by_tarantula: Dict[Any, list] = {}
    for feeding in all_feedings:
        feedings_by_tarantula.setdefault(feeding.invert_id, []).append(feeding)

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
        MoltLog.invert_id.in_(tarantula_ids)
    ).scalar() or 0

    # Find most active molter
    molt_counts = db.query(
        MoltLog.invert_id,
        func.count(MoltLog.id).label('molt_count')
    ).filter(
        MoltLog.invert_id.in_(tarantula_ids)
    ).group_by(MoltLog.invert_id).order_by(func.count(MoltLog.id).desc()).first()

    most_active_molter = None
    if molt_counts:
        molter = db.query(Invert).filter(Invert.id == molt_counts[0]).first()
        if molter:
            most_active_molter = {
                "tarantula_id": str(molter.id),
                "name": get_display_name(molter),
                "molt_count": molt_counts[1]
            }
    
    # Get substrate change statistics
    total_substrate_changes = db.query(func.count(SubstrateChange.id)).filter(
        SubstrateChange.invert_id.in_(tarantula_ids)
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
        FeedingLog.invert_id.in_(tarantula_ids)
    ).order_by(FeedingLog.fed_at.desc()).limit(5).all()

    for feeding in recent_feedings:
        tarantula = tarantula_map.get(feeding.invert_id)
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
        MoltLog.invert_id.in_(tarantula_ids)
    ).order_by(MoltLog.molted_at.desc()).limit(5).all()

    for molt in recent_molts:
        tarantula = tarantula_map.get(molt.invert_id)
        if tarantula:
            description = "Molted successfully"
            if molt.weight_after or molt.leg_span_after:
                details = []
                if molt.weight_after:
                    details.append(f"{molt.weight_after}g")
                if molt.leg_span_after:
                    details.append(f"{molt.leg_span_after} in")
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
        SubstrateChange.invert_id.in_(tarantula_ids)
    ).order_by(SubstrateChange.changed_at.desc()).limit(5).all()

    for change in recent_substrate:
        tarantula = tarantula_map.get(change.invert_id)
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


# Taxa whose keepers don't feed a counted live prey item, so the feeding-cost
# fallback (one item per animal per week) would invent a bill for them.
NO_PREY_TAXA = {"millipede", "isopod", "roach"}


def _sex_value(sex) -> str:
    v = getattr(sex, "value", sex)
    return str(v).lower() if v else "unknown"


def _owned_log_clause(model, ids):
    """This keeper's rows in a log table by EITHER parent column — a
    tarantula's logs carry `invert_id` always and `tarantula_id` only when
    the writer set it (utils/legacy_logs.py)."""
    from sqlalchemy import or_
    return or_(model.invert_id.in_(ids), model.tarantula_id.in_(ids))


@router.get("/advanced/", response_model=AdvancedAnalyticsResponse)
@policy("owner_only")
async def get_advanced_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Premium advanced analytics for the keeper's whole collection — every
    taxon, not just tarantulas (audit A4, 2026-10-07; this read the legacy
    tarantula table until then, so a premium mantis keeper got an empty page).

    Value, species, sex, enclosure and taxon breakdowns describe the CURRENT
    collection (not transferred out, not died). The molt heatmap, growth
    timeline and log totals describe history, so they include every animal
    the keeper still owns a record of.
    """

    # Premium gate. Previously this endpoint was only gated client-side
    # (the teaser screen), so a crafted request returned the full payload
    # for free. Enforce server-side. can_use_analytics currently mirrors
    # can_use_breeding (single premium tier) — see User.get_subscription_limits.
    limits = current_user.get_subscription_limits()
    if not limits.get("can_use_analytics"):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "message": "Advanced analytics is a premium feature.",
                "feature": "analytics",
                "is_premium": limits.get("is_premium", False),
            },
        )

    owned = db.query(Invert).filter(Invert.user_id == current_user.id).all()
    animals = [a for a in owned if a.transferred_out_at is None and a.died_at is None]
    ids = [a.id for a in owned]
    total_count = len(animals)

    if not owned:
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
            taxon_distribution={},
            unique_species=0,
            total_animals=0,
            total_feedings_logged=0,
            total_molts_logged=0,
            estimated_monthly_feeding_cost=0.0,
        )

    def display_name(a):
        return a.name or a.common_name or a.scientific_name or "Unnamed"

    # ===== COLLECTION VALUE =====
    collection_value_total = float(sum(float(a.price_paid or 0) for a in animals))
    collection_value_average = collection_value_total / total_count if total_count else 0.0
    most_expensive = None
    most_expensive_price = None
    for a in animals:
        if a.price_paid and (most_expensive_price is None or float(a.price_paid) > most_expensive_price):
            most_expensive_price = float(a.price_paid)
            most_expensive = display_name(a)

    # ===== MOLT HEATMAP (last 12 months) =====
    now = datetime.now(timezone.utc)
    twelve_months_ago = now - timedelta(days=365)
    molt_data = (
        db.query(
            extract("year", MoltLog.molted_at).label("year"),
            extract("month", MoltLog.molted_at).label("month"),
            func.count(MoltLog.id).label("count"),
        )
        .filter(_owned_log_clause(MoltLog, ids), MoltLog.molted_at >= twelve_months_ago)
        .group_by(extract("year", MoltLog.molted_at), extract("month", MoltLog.molted_at))
        .order_by(extract("year", MoltLog.molted_at), extract("month", MoltLog.molted_at))
        .all()
    )
    molt_heatmap = [
        MoltHeatmapEntry(month=f"{int(m.year)}-{int(m.month):02d}", count=int(m.count))
        for m in molt_data
    ]

    # ===== COLLECTION GROWTH (animals acquired per month, last 12 months) =====
    cutoff = twelve_months_ago.date()
    growth_counts = Counter(
        f"{a.date_acquired.year}-{a.date_acquired.month:02d}"
        for a in owned if a.date_acquired and a.date_acquired >= cutoff
    )
    collection_growth = [
        CollectionGrowthEntry(month=month, count=count)
        for month, count in sorted(growth_counts.items())
    ]

    # ===== DISTRIBUTIONS (current collection) =====
    species_counts = Counter(
        (a.scientific_name or a.common_name or a.name or "Unknown") for a in animals
    )
    species_distribution = [
        SpeciesDistEntry(species_name=name, count=count)
        for name, count in species_counts.most_common(10)
    ]
    sexes = Counter(_sex_value(a.sex) for a in animals)
    sex_distribution = {
        "male": sexes.get("male", 0),
        "female": sexes.get("female", 0),
        "unknown": total_count - sexes.get("male", 0) - sexes.get("female", 0),
    }
    enclosure_type_distribution = dict(Counter((a.enclosure_type or "unknown") for a in animals))
    taxon_distribution = dict(Counter((a.taxon or "other") for a in animals))

    # ===== FEEDINGS =====
    total_feedings = (
        db.query(func.count(FeedingLog.id)).filter(_owned_log_clause(FeedingLog, ids)).scalar() or 0
    )
    thirty_days_ago = now - timedelta(days=30)
    recent_feedings = (
        db.query(func.count(FeedingLog.id))
        .filter(_owned_log_clause(FeedingLog, ids), FeedingLog.fed_at >= thirty_days_ago)
        .scalar()
        or 0
    )
    # Estimate: $0.50 per feeding in the last 30 days; with no recent
    # feedings, one prey item per predator per week.
    if recent_feedings > 0:
        estimated_monthly_feeding_cost = float(recent_feedings * 0.50)
    else:
        predators = sum(1 for a in animals if a.taxon not in NO_PREY_TAXA)
        estimated_monthly_feeding_cost = float(predators * 4 * 0.50)

    total_molts = (
        db.query(func.count(MoltLog.id)).filter(_owned_log_clause(MoltLog, ids)).scalar() or 0
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
        taxon_distribution=taxon_distribution,
        unique_species=len(species_counts),
        total_animals=total_count,
        total_feedings_logged=total_feedings,
        total_molts_logged=total_molts,
        estimated_monthly_feeding_cost=round(estimated_monthly_feeding_cost, 2),
    )
