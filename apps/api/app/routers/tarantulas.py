"""
Tarantula routes
"""
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone, timedelta, date
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula, Sex, Source
from app.models.molt_log import MoltLog
from app.models.feeding_log import FeedingLog
from app.models.substrate_change import SubstrateChange
from app.models.photo import Photo
from app.models.pairing import Pairing
from app.models.offspring import Offspring
from app.models.pricing_submission import PricingSubmission
from app.models.species import Species
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

    tarantula_dict = tarantula_data.model_dump()
    # sex/source DB enums were created with uppercase names (MALE, FEMALE, BRED, etc.)
    # so we must pass the Python enum member so SQLAlchemy stores the name, not the value string.
    if tarantula_dict.get('sex'):
        try:
            tarantula_dict['sex'] = Sex(tarantula_dict['sex'])
        except ValueError:
            pass
    if tarantula_dict.get('source'):
        try:
            tarantula_dict['source'] = Source(tarantula_dict['source'])
        except ValueError:
            pass

    # Default visibility to the owner's profile visibility. A public-
    # profile keeper adding a new tarantula gets it visible on their
    # profile by default; a private-profile keeper's tarantula is only
    # visible to themselves regardless. If the client explicitly passed
    # a `visibility` value, respect it — this lets keepers opt a new
    # tarantula into being hidden at creation time.
    if 'visibility' not in tarantula_dict or tarantula_dict.get('visibility') is None:
        tarantula_dict['visibility'] = (
            'public' if current_user.collection_visibility == 'public' else 'private'
        )

    new_tarantula = Tarantula(
        user_id=current_user.id,
        **tarantula_dict
    )

    db.add(new_tarantula)
    db.commit()
    db.refresh(new_tarantula)

    # Increment times_kept on the linked species
    if new_tarantula.species_id:
        linked_species = db.query(Species).filter(Species.id == new_tarantula.species_id).first()
        if linked_species:
            linked_species.times_kept = (linked_species.times_kept or 0) + 1
            db.commit()

    # Create activity feed entry
    await create_activity(
        db=db,
        user_id=current_user.id,
        action_type="new_tarantula",
        target_type="tarantula",
        target_id=new_tarantula.id,
        metadata={
            "tarantula_name": new_tarantula.name,
            "species_name": new_tarantula.common_name or new_tarantula.scientific_name,
            "thumbnail_url": new_tarantula.photo_url,
            "tarantula_id": str(new_tarantula.id),
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
    if update_data.get('sex'):
        try:
            update_data['sex'] = Sex(update_data['sex'])
        except ValueError:
            pass
    if update_data.get('source'):
        try:
            update_data['source'] = Source(update_data['source'])
        except ValueError:
            pass
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

    # Manually delete related records to avoid FK constraint errors
    # (database may lack ON DELETE CASCADE if constraints were added after table creation)
    db.query(FeedingLog).filter(FeedingLog.tarantula_id == tarantula_id).delete()
    db.query(MoltLog).filter(MoltLog.tarantula_id == tarantula_id).delete()
    db.query(SubstrateChange).filter(SubstrateChange.tarantula_id == tarantula_id).delete()
    db.query(Photo).filter(Photo.tarantula_id == tarantula_id).delete()
    db.query(PricingSubmission).filter(PricingSubmission.tarantula_id == tarantula_id).update(
        {PricingSubmission.tarantula_id: None}
    )
    db.query(Offspring).filter(Offspring.tarantula_id == tarantula_id).update(
        {Offspring.tarantula_id: None}
    )
    # Delete pairings where this tarantula is male or female
    db.query(Pairing).filter(
        (Pairing.male_id == tarantula_id) | (Pairing.female_id == tarantula_id)
    ).delete(synchronize_session='fetch')

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


def _calendar_day_diff(later: datetime, earlier: datetime, tz_offset_minutes: Optional[int]) -> int:
    """Calendar-day difference between two timezone-aware datetimes,
    expressed in the user's local timezone.

    The previous implementation used `(later - earlier).days`, which is a
    floored UTC time delta. For a user in EDT (UTC-4) who fed their
    tarantula at 8 PM yesterday, the feeding's UTC timestamp is 00:00
    today; if "now" is 5 PM EDT (21:00 UTC), the delta is 21 hours and
    `.days` floors to 0 — so the dashboard says "fed today" even though
    the user perceives it as yesterday. That's the Brooke-on-EST bug
    reported 2026-04-24.

    Fix: convert both timestamps to the user's local time, take the date
    portion of each, and subtract calendar days. Falls back to UTC when
    the client doesn't pass an offset (preserving old behavior for legacy
    clients during rollout).

    Args:
        later: A timezone-aware datetime later in time (typically `now`).
        earlier: A timezone-aware datetime earlier in time (the event).
        tz_offset_minutes: The user's local offset from UTC in minutes,
            as produced by JS's `new Date().getTimezoneOffset()` — note
            that JS returns the inverse sign vs the IANA convention,
            i.e. EDT (UTC-4) returns 240 (positive). Pass it through
            unchanged from the client; we negate internally below.
    """
    if tz_offset_minutes is None:
        return (later - earlier).days

    # JS's getTimezoneOffset returns offset_to_get_to_utc, so for EDT
    # it's +240. We need the offset_from_utc (which is -240 for EDT) to
    # shift UTC into local time, hence the negation.
    local_delta = timedelta(minutes=-tz_offset_minutes)
    later_local_date = (later + local_delta).date()
    earlier_local_date = (earlier + local_delta).date()
    return (later_local_date - earlier_local_date).days


@router.get("/{tarantula_id}/feeding-stats", response_model=FeedingStats)
async def get_feeding_stats(
    tarantula_id: UUID,
    tz_offset_minutes: Optional[int] = Query(
        None,
        description=(
            "User's local timezone offset in minutes, as produced by "
            "JS Date.getTimezoneOffset() (positive for zones west of UTC: "
            "EDT=240, PST=480). When provided, days_since_last_feeding "
            "and inter-feeding gaps are computed in calendar days in the "
            "user's zone instead of UTC. Optional for backwards compat."
        ),
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
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

    # Calculate days between feedings (in the user's local timezone so
    # back-to-back evening feedings across midnight don't collapse to "0
    # days apart" — same calendar-day reasoning as below).
    days_between = []
    for i in range(1, len(feeding_logs)):
        previous_feeding = feeding_logs[i - 1]
        current_feeding = feeding_logs[i]
        gap = _calendar_day_diff(
            current_feeding.fed_at,
            previous_feeding.fed_at,
            tz_offset_minutes,
        )
        days_between.append(gap)

    average_days_between = sum(days_between) / len(days_between) if days_between else None
    longest_gap = max(days_between) if days_between else None

    # Last feeding info — refers to the last ACCEPTED feeding, not the
    # last attempt. A refused feeding is still a tracked event (it
    # contributes to refusal streak / premolt detection) but from a
    # husbandry perspective the spider hasn't actually been fed since
    # its last successful meal. The "Brooke fed her spider, it refused,
    # but the badge says 'fed today'" bug (2026-04-24) was caused by
    # using the most recent attempt regardless of acceptance.
    #
    # When every feeding has been refused (e.g. a brand-new specimen
    # that hasn't eaten in our care yet), last_feeding_date is None and
    # days_since_last_feeding stays None — UI surfaces this as "—" or
    # "Not fed yet" rather than misleading the keeper.
    accepted_logs = [log for log in feeding_logs if log.accepted]
    if accepted_logs:
        last_feeding = accepted_logs[-1]
        last_feeding_date = last_feeding.fed_at
        days_since_last_feeding = _calendar_day_diff(
            datetime.now(timezone.utc),
            last_feeding_date,
            tz_offset_minutes,
        )
    else:
        last_feeding = None
        last_feeding_date = None
        days_since_last_feeding = None

    # Predict next feeding — only meaningful when we have a real anchor
    # (an accepted feeding) AND a known cadence.
    next_feeding_prediction = None
    if average_days_between and last_feeding_date is not None:
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


@router.get("/{tarantula_id}/public-link")
async def get_public_link(
    tarantula_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the shareable public link for a tarantula

    Only the owner can get the link. The tarantula must be public.
    Returns the URL path to share.
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

    # visibility is the source of truth for per-tarantula public/private
    # (see vis_20260424 migration + routers/auth.py cascade). The legacy
    # is_public boolean was never migrated alongside and is effectively
    # dead for tarantulas — always check `visibility == 'public'`.
    if tarantula.visibility != 'public':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This tarantula is not public. Make it public first."
        )

    user = current_user
    tarantula_slug = (tarantula.name or tarantula.common_name or "tarantula").lower().replace(" ", "-")
    public_url = f"/keeper/{user.username}/{tarantula_slug}"

    return {
        "public_url": public_url,
        "full_url": f"https://tarantuverse.com{public_url}"  # Update domain as needed
    }


@router.get("/public/{username}/{tarantula_slug}")
async def get_public_tarantula(
    username: str,
    tarantula_slug: str,
    db: Session = Depends(get_db)
):
    """
    Get a public tarantula profile (no authentication required)

    Returns tarantula details, owner info, feeding history, molt timeline, and photos.
    The tarantula must be public to be viewable.
    """
    # Get user by username
    user = db.query(User).filter(
        User.username == username
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Keeper not found"
        )

    # Find matching public tarantula by name slug.
    #
    # - Filter by `visibility == 'public'` (not the legacy is_public
    #   boolean) so this matches the rest of the visibility plumbing.
    # - Normalize the incoming slug the same way as the stored slug
    #   (lowercase + spaces → dashes) so clients that pass the raw
    #   pet name ("Rampart") match tarantulas whose slug is "rampart".
    # - Also accept a direct UUID match so the mobile/web activity
    #   feed can deep-link with either pet name OR the tarantula id
    #   without the client having to decide.
    normalized_slug = tarantula_slug.lower().replace(" ", "-")

    user_tarantulas = db.query(Tarantula).filter(
        Tarantula.user_id == user.id,
        Tarantula.visibility == 'public',
    ).all()

    matching_tarantula = None
    for t in user_tarantulas:
        t_slug = (t.name or t.common_name or "tarantula").lower().replace(" ", "-")
        if t_slug == normalized_slug or str(t.id) == tarantula_slug:
            matching_tarantula = t
            break

    if not matching_tarantula:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tarantula not found or is not public"
        )

    tarantula = matching_tarantula

    # Get feeding logs
    feeding_logs = db.query(FeedingLog).filter(
        FeedingLog.tarantula_id == tarantula.id
    ).order_by(FeedingLog.fed_at.desc()).all()

    total_feedings = len(feeding_logs)
    total_accepted = sum(1 for log in feeding_logs if log.accepted)
    acceptance_rate = (total_accepted / total_feedings * 100) if total_feedings > 0 else 0.0
    last_fed_date = feeding_logs[0].fed_at if feeding_logs else None

    # Get molt logs
    molt_logs = db.query(MoltLog).filter(
        MoltLog.tarantula_id == tarantula.id
    ).order_by(MoltLog.molted_at.desc()).all()

    molt_timeline = []
    for molt in molt_logs:
        molt_timeline.append({
            "id": str(molt.id),
            "molted_at": molt.molted_at.isoformat(),
            "leg_span_before": float(molt.leg_span_before) if molt.leg_span_before else None,
            "leg_span_after": float(molt.leg_span_after) if molt.leg_span_after else None,
            "weight_before": float(molt.weight_before) if molt.weight_before else None,
            "weight_after": float(molt.weight_after) if molt.weight_after else None,
            "notes": molt.notes
        })

    # Get photos (limit to 10)
    photos = db.query(Photo).filter(
        Photo.tarantula_id == tarantula.id
    ).order_by(Photo.created_at.desc()).limit(10).all()

    photos_data = []
    for photo in photos:
        photos_data.append({
            "id": str(photo.id),
            "url": photo.url,
            "thumbnail_url": photo.thumbnail_url,
            "caption": photo.caption,
            "taken_at": photo.taken_at.isoformat() if photo.taken_at else None
        })

    # Get species info if linked
    species_info = None
    if tarantula.species_id:
        species = db.query(Species).filter(Species.id == tarantula.species_id).first()
        if species:
            species_info = {
                "id": str(species.id),
                "scientific_name": species.scientific_name,
                "common_names": species.common_names,
                "care_level": species.care_level,
                "type": species.type,
                "native_region": species.native_region,
                "adult_size": species.adult_size,
                "image_url": species.image_url
            }

    return {
        "tarantula": {
            "id": str(tarantula.id),
            "name": tarantula.name,
            "common_name": tarantula.common_name,
            "scientific_name": tarantula.scientific_name,
            "sex": tarantula.sex,
            "date_acquired": tarantula.date_acquired.isoformat() if tarantula.date_acquired else None,
            "photo_url": tarantula.photo_url,
            "notes": tarantula.notes
        },
        "owner": {
            "username": user.username,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url
        },
        "species": species_info,
        "feeding_summary": {
            "total_feedings": total_feedings,
            "acceptance_rate": round(acceptance_rate, 1),
            "last_fed_date": last_fed_date.isoformat() if last_fed_date else None
        },
        "molt_timeline": molt_timeline,
        "photos": photos_data
    }


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
