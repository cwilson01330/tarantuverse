"""
Analytics routes for collection-wide statistics and insights
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta, date
from collections import Counter
from decimal import Decimal, ROUND_HALF_UP
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, extract
from app.database import get_db
from app.models.user import User
from app.models.invert import Invert
from app.models.molt_log import MoltLog
from app.models.feeding_log import FeedingLog
from app.models.substrate_change import SubstrateChange
from app.models.expense import Expense
from app.schemas.analytics import (
    CollectionAnalytics,
    SpeciesCount,
    ActivityItem,
    AdvancedAnalyticsResponse,
    MoltHeatmapEntry,
    CollectionGrowthEntry,
    SpeciesDistEntry,
    FeedingCostUpdate,
    FeedingCostResponse,
    LongestGap,
    LastMolt,
    MoltRow,
)
from app.services.feeding_status import compute_feeding_status
from app.utils.dependencies import get_current_user
from app.utils.access import policy
from app.utils.limits import active_inverts_query

router = APIRouter()


# ── Shared by /collection and /molts ────────────────────────────────────────

def _display_name(t) -> str:
    return t.name or t.common_name or t.scientific_name or "Unnamed"


def _sex_value(sex) -> Optional[str]:
    """'male' | 'female' | 'unknown' (the enum's lowercase value), or None."""
    if sex is None:
        return None
    return str(getattr(sex, "value", sex)).lower()


def _as_utc(moment: datetime) -> datetime:
    """A stored timestamp as a timezone-aware UTC instant (naive values are UTC)."""
    if moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)


_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def _local_date(moment: datetime, tz_offset_minutes: Optional[int] = None) -> date:
    """The keeper's calendar day for a stored timestamp.

    `tz_offset_minutes` follows the JS getTimezoneOffset() convention used by
    /inverts/feeding-status (`_calendar_day_diff`): positive WEST of UTC
    (EDT = 240, AEST = -600), so local time = UTC - offset. None = UTC.
    """
    utc = _as_utc(moment)
    if tz_offset_minutes is None:
        return utc.date()
    return (utc - timedelta(minutes=tz_offset_minutes)).date()


def _molt_summary(db: Session, animal_ids: list) -> Dict[Any, tuple]:
    """{invert_id: (molt count, first molted_at, last molted_at)} for animals
    with at least one molt. ONE grouped query however many animals there are."""
    if not animal_ids:
        return {}
    rows = (
        db.query(
            MoltLog.invert_id,
            func.count(MoltLog.id),
            func.min(MoltLog.molted_at),
            func.max(MoltLog.molted_at),
        )
        .filter(MoltLog.invert_id.in_(animal_ids))
        .group_by(MoltLog.invert_id)
        .all()
    )
    return {r[0]: (r[1], r[2], r[3]) for r in rows}


def _molt_rows(
    animals: list,
    summary: Dict[Any, tuple],
    tz_offset_minutes: Optional[int] = None,
) -> List[MoltRow]:
    """Every animal (zero-molt ones too) as a MoltRow: most molts first, then
    the most recent molt (by the keeper's local day), then name."""
    rows = []
    for a in animals:
        count, _first, last = summary.get(a.id, (0, None, None))
        rows.append(MoltRow(
            tarantula_id=str(a.id),
            name=_display_name(a),
            sex=_sex_value(a.sex),
            count=count,
            last_date=_local_date(last, tz_offset_minutes) if last else None,
            last_molted_at=_as_utc(last) if last else None,
        ))
    rows.sort(key=lambda r: (
        -r.count,
        r.last_date is None,
        -r.last_date.toordinal() if r.last_date else 0,
        r.name.lower(),
        r.tarantula_id,
    ))
    return rows


@router.get("/molts", response_model=List[MoltRow])
@policy("owner_only")
async def get_molts_list(
    tz_offset_minutes: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every active animal with its molt count and last molt date (the Molts
    card's "All n" screen). Animals with no molts are included with count 0.
    Same ordering and names as `molts_per_animal` on /collection, uncapped.
    `tz_offset_minutes` (JS getTimezoneOffset sign, as on feeding-status) makes
    `last_date` the keeper's local day; `last_molted_at` is the UTC instant."""
    animals = active_inverts_query(db, current_user.id).all()
    return _molt_rows(animals, _molt_summary(db, [a.id for a in animals]), tz_offset_minutes)


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
    # Query param (same meaning as /inverts/feeding-status). A plain default,
    # not Query(None), so callers that invoke the handler directly still work.
    tz_offset_minutes: Optional[int] = None,
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
    # table (tarantulas are mirrored there too), ACTIVE only: transferred-out
    # and deceased animals are excluded so the stats match the displayed
    # collection + cap (dead animals used to count in totals, species and the
    # sex split). The variable keeps the name `tarantulas` only to minimize
    # churn below — it now holds all taxa. Polymorphic feeding/molt/substrate
    # logs are matched on invert_id, which dual-write + backfill keep
    # populated for every taxon.
    tarantulas = active_inverts_query(db, current_user.id).all()

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
    # The instant behind each item, so same-day items sort newest-first by time
    # of day (dates alone are the keeper's local day). A substrate change only
    # has a date, so it sorts after anything logged with a time on that day.
    logged_at: Dict[int, datetime] = {}

    # Get recent feedings
    recent_feedings = db.query(FeedingLog).filter(
        FeedingLog.invert_id.in_(tarantula_ids)
    ).order_by(FeedingLog.fed_at.desc()).limit(5).all()

    for feeding in recent_feedings:
        tarantula = tarantula_map.get(feeding.invert_id)
        if tarantula:
            recent_activity.append(ActivityItem(
                type="feeding",
                date=_local_date(feeding.fed_at, tz_offset_minutes) if feeding.fed_at else date.today(),
                tarantula_id=str(tarantula.id),
                tarantula_name=get_display_name(tarantula),
                description=f"Fed {feeding.food_type or 'prey'}" + (" (refused)" if not feeding.accepted else "")
            ))
            logged_at[id(recent_activity[-1])] = _as_utc(feeding.fed_at) if feeding.fed_at else _EPOCH

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
                date=_local_date(molt.molted_at, tz_offset_minutes) if molt.molted_at else date.today(),
                tarantula_id=str(tarantula.id),
                tarantula_name=get_display_name(tarantula),
                description=description
            ))
            logged_at[id(recent_activity[-1])] = _as_utc(molt.molted_at) if molt.molted_at else _EPOCH

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
    recent_activity.sort(key=lambda x: (x.date, logged_at.get(id(x), _EPOCH)), reverse=True)
    recent_activity = recent_activity[:10]

    # ── "Right now" fields (analytics redesign) ──
    # Due/overdue come from the Feeding Day rule itself, never a copy of it.
    status_items = compute_feeding_status(db, tarantulas, tz_offset_minutes)
    feeding_due_today = sum(1 for s in status_items if s.is_overdue)
    # A due animal that was never fed has no last feeding: it has waited since
    # its baseline instead (days_since_baseline). A fed one waits since the meal.
    def _waited(s):
        return s.days_since_last_feeding if s.days_since_last_feeding is not None else s.days_since_baseline

    feeding_overdue = sum(
        1 for s in status_items
        if s.is_overdue and _waited(s) is not None and _waited(s) > s.interval_days
    )

    # Longest gap: only animals Feeding Day could flag (a cadence, fed at least
    # once, not paused). Ties go to the name that sorts first.
    gap_candidates = [
        s for s in status_items
        if s.interval_days is not None and not s.is_feeding_paused and s.days_since_last_feeding is not None
    ]
    # First due: the due animal that has waited longest (names the Due tile's
    # caption). Same shape as longest_gap; same tie rule.
    due_candidates = [
        s for s in status_items
        if s.is_overdue and _waited(s) is not None
    ]
    first_due = None
    if due_candidates:
        due = min(due_candidates, key=lambda s: (-_waited(s), _display_name(s).lower(), str(s.id)))
        first_due = LongestGap(
            tarantula_id=str(due.id),
            name=_display_name(due),
            sex=_sex_value(tarantula_map[due.id].sex),
            days=_waited(due),
            usual_interval_days=due.interval_days,
        )

    longest_gap = None
    if gap_candidates:
        gap = min(gap_candidates, key=lambda s: (-s.days_since_last_feeding, _display_name(s).lower(), str(s.id)))
        longest_gap = LongestGap(
            tarantula_id=str(gap.id),
            name=_display_name(gap),
            sex=_sex_value(tarantula_map[gap.id].sex),
            days=gap.days_since_last_feeding,
            usual_interval_days=gap.interval_days,
        )

    # Molts: one grouped query serves the last molt and the per-animal rows.
    molt_summary = _molt_summary(db, tarantula_ids)
    last_molt = None
    if molt_summary:
        newest_id = max(molt_summary, key=lambda i: (molt_summary[i][2], str(i)))
        count, first_at, last_at = molt_summary[newest_id]
        owner = tarantula_map[newest_id]
        last_molt = LastMolt(
            tarantula_id=str(owner.id),
            name=_display_name(owner),
            sex=_sex_value(owner.sex),
            date=_local_date(last_at, tz_offset_minutes),
            molted_at=_as_utc(last_at),
            molt_number=count,
            # Mean gap between consecutive molts = (last - first) / (n - 1).
            avg_interval_days=(
                int((last_at - first_at).total_seconds() / 86400 / (count - 1) + 0.5) if count >= 2 else None
            ),
        )
    molts_per_animal = _molt_rows(tarantulas, molt_summary, tz_offset_minutes)[:10]
    priced_count = sum(1 for t in tarantulas if t.price_paid is not None)

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
        recent_activity=recent_activity,
        feeding_due_today=feeding_due_today,
        feeding_overdue=feeding_overdue,
        longest_gap=longest_gap,
        first_due=first_due,
        last_molt=last_molt,
        priced_count=priced_count,
        molts_per_animal=molts_per_animal,
        total_animals=total_count,
        average_months_in_collection=round(average_age_months, 1),
    )


# Taxa whose keepers don't feed a counted live prey item, so the feeding-cost
# fallback (one item per animal per week) would invent a bill for them.
NO_PREY_TAXA = {"millipede", "isopod", "roach"}

# Used when a keeper hasn't set their own cost per feeding (users.
# feeding_cost_per_meal). It was the only figure until 2026-10-22.
DEFAULT_COST_PER_FEEDING = 0.50


def keeper_cost_per_feeding(user) -> tuple:
    """(cost per feeding, is_default) for this keeper."""
    raw = getattr(user, "feeding_cost_per_meal", None)
    if raw is None:
        return DEFAULT_COST_PER_FEEDING, True
    return round(float(raw), 2), False


def month_spend(db: Session, user_id, today: date) -> tuple:
    """(everything, feeders only) the keeper spent in `today`'s month, from
    their own Tarantuverse expenses (`owner_id`, so a co-keeper's logged
    expenses count for the collection owner). Floats rounded to cents. No
    `tz_offset_minutes` on the advanced route, so `today` is the server's UTC
    date."""
    first = today.replace(day=1)
    following = (first + timedelta(days=32)).replace(day=1)
    in_month = [
        Expense.owner_id == user_id,
        Expense.app == "tarantuverse",
        Expense.spent_on >= first,
        Expense.spent_on < following,
    ]
    total = db.query(func.coalesce(func.sum(Expense.amount), 0)).filter(*in_month).scalar()
    feeders = (
        db.query(func.coalesce(func.sum(Expense.amount), 0))
        .filter(*in_month, Expense.category == "feeders")
        .scalar()
    )
    return round(float(total or 0), 2), round(float(feeders or 0), 2)


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

    spent_this_month, feeders_spent_this_month = month_spend(
        db, current_user.id, datetime.now(timezone.utc).date()
    )

    if not owned:
        empty_cost, empty_is_default = keeper_cost_per_feeding(current_user)
        return AdvancedAnalyticsResponse(
            cost_per_feeding=empty_cost,
            cost_per_feeding_is_default=empty_is_default,
            spent_this_month=spent_this_month,
            feeders_spent_this_month=feeders_spent_this_month,
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
    # Estimate: the keeper's cost per feeding (default 0.50) times the
    # feedings in the last 30 days; with no recent feedings, one prey item
    # per predator per week.
    cost_per_feeding, cost_is_default = keeper_cost_per_feeding(current_user)
    if recent_feedings > 0:
        estimated_monthly_feeding_cost = float(recent_feedings * cost_per_feeding)
    else:
        predators = sum(1 for a in animals if a.taxon not in NO_PREY_TAXA)
        estimated_monthly_feeding_cost = float(predators * 4 * cost_per_feeding)

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
        cost_per_feeding=cost_per_feeding,
        cost_per_feeding_is_default=cost_is_default,
        spent_this_month=spent_this_month,
        feeders_spent_this_month=feeders_spent_this_month,
    )


@router.put("/feeding-cost/", response_model=FeedingCostResponse)
@policy("owner_only")
async def set_feeding_cost(
    payload: FeedingCostUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Set what one feeding costs this keeper (2026-10-22).

    Drives the advanced-analytics "Est. Monthly Feeding Cost". A plain number
    in the keeper's own currency, 0–1000, rounded to cents. `null` goes back
    to the default. Not premium-gated: it only stores a preference, and the
    card that reads it is.
    """
    value = payload.cost_per_feeding
    current_user.feeding_cost_per_meal = (
        None if value is None else Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    )
    db.commit()
    db.refresh(current_user)
    cost, is_default = keeper_cost_per_feeding(current_user)
    return FeedingCostResponse(cost_per_feeding=cost, is_default=is_default)
