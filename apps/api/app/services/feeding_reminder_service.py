"""
Feeding reminder service - calculates feeding schedules based on species data
"""
import re
from datetime import datetime, timedelta
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.tarantula import Tarantula
from app.models.species import Species
from app.models.feeding_log import FeedingLog
from app.models.molt_log import MoltLog
from app.schemas.feeding_reminder import FeedingReminderResponse


def parse_frequency_string(frequency_str: Optional[str]) -> Tuple[int, int]:
    """
    Parse a frequency string like "every 3-4 days" or "every 7-14 days" to get day range.
    Returns tuple of (min_days, max_days).

    Examples:
        "every 3-4 days" -> (3, 4)
        "every 5-7 days" -> (5, 7)
        "every 7-14 days" -> (7, 14)
        None or unparseable -> (10, 10)  # default
    """
    if not frequency_str:
        return (10, 10)  # Safe default

    # Try to extract numbers from patterns like "every 3-4 days" or "every 7 days"
    # Match patterns: "X-Y" or just "X"
    match = re.search(r'(\d+)\s*-?\s*(\d*)', frequency_str)
    if match:
        first = int(match.group(1))
        second = int(match.group(2)) if match.group(2) else first
        return (min(first, second), max(first, second))

    return (10, 10)  # Safe default if parsing fails


def get_life_stage(tarantula: Tarantula, db: Session) -> str:
    """
    Determine life stage based on molt history and leg span.
    Returns: "sling", "juvenile", or "adult"
    """
    # Get most recent molt with leg_span_after data
    recent_molt = db.query(MoltLog).filter(
        MoltLog.tarantula_id == tarantula.id,
        MoltLog.leg_span_after.isnot(None)
    ).order_by(MoltLog.molted_at.desc()).first()

    # Heuristic for life stage:
    # Sling: no molts recorded OR leg_span < 2 inches
    # Juvenile: leg_span >= 2 and < 4 inches
    # Adult: leg_span >= 4 inches

    if not recent_molt:
        # No molt history - assume sling
        return "sling"

    leg_span = float(recent_molt.leg_span_after)

    if leg_span < 2:
        return "sling"
    elif leg_span < 4:
        return "juvenile"
    else:
        return "adult"


def get_recommended_interval(tarantula: Tarantula, db: Session) -> int:
    """
    Get recommended feeding interval in days for a tarantula.

    Strategy:
    1. If tarantula has species linked, use species data based on life stage
    2. If no species or no species data, use hardcoded defaults
    3. Return the midpoint of the frequency range
    """
    # Default intervals per life stage
    default_intervals = {
        "sling": 4,
        "juvenile": 7,
        "adult": 10
    }

    # If no species linked, use defaults
    if not tarantula.species_id:
        life_stage = get_life_stage(tarantula, db)
        return default_intervals[life_stage]

    # Get species data
    species = db.query(Species).filter(Species.id == tarantula.species_id).first()
    if not species:
        life_stage = get_life_stage(tarantula, db)
        return default_intervals[life_stage]

    # Determine life stage
    life_stage = get_life_stage(tarantula, db)

    # Get frequency string for this life stage
    frequency_map = {
        "sling": species.feeding_frequency_sling,
        "juvenile": species.feeding_frequency_juvenile,
        "adult": species.feeding_frequency_adult,
    }

    frequency_str = frequency_map.get(life_stage)

    # If species has no data for this life stage, use default
    if not frequency_str:
        return default_intervals[life_stage]

    # Parse frequency string to get day range, then take midpoint
    min_days, max_days = parse_frequency_string(frequency_str)
    midpoint = (min_days + max_days) // 2

    return midpoint


def get_last_feeding(tarantula_id, db: Session) -> Optional[FeedingLog]:
    """Get the most recent accepted feeding log for a tarantula"""
    return db.query(FeedingLog).filter(
        FeedingLog.tarantula_id == tarantula_id,
        FeedingLog.accepted == True  # Only count accepted feedings
    ).order_by(FeedingLog.fed_at.desc()).first()


def calculate_reminder_status(
    last_fed_at: Optional[datetime],
    next_due: Optional[datetime]
) -> str:
    """
    Calculate reminder status based on timing.

    Returns:
        "never_fed" - No feeding logs exist
        "overdue" - Past due date by 1+ days
        "due_today" - Due today (0 days difference)
        "due_soon" - Due within 1 day (tomorrow)
        "on_track" - Not due for 2+ days
    """
    if not last_fed_at or not next_due:
        return "never_fed"

    now = datetime.now(next_due.tzinfo)
    days_difference = (next_due - now).days

    if days_difference < 0:
        return "overdue"
    elif days_difference == 0:
        return "due_today"
    elif days_difference == 1:
        return "due_soon"
    else:
        return "on_track"


def get_days_difference(last_fed_at: Optional[datetime], next_due: Optional[datetime]) -> int:
    """
    Calculate days difference for display.

    Returns:
        Positive number = days overdue
        Zero = due today
        Negative number = days until due
    """
    if not last_fed_at or not next_due:
        return 0

    now = datetime.now(next_due.tzinfo)
    return (now - next_due).days


def build_feeding_reminder(
    tarantula: Tarantula,
    db: Session
) -> FeedingReminderResponse:
    """
    Build a feeding reminder for a single tarantula.
    """
    # Get recommended interval
    recommended_interval = get_recommended_interval(tarantula, db)

    # Get last feeding
    last_feeding = get_last_feeding(tarantula.id, db)
    last_fed_at = last_feeding.fed_at if last_feeding else None

    # Calculate next feeding due date
    if last_fed_at:
        next_feeding_due = last_fed_at + timedelta(days=recommended_interval)
    else:
        next_feeding_due = None

    # Get species name
    species_name = None
    if tarantula.species_id:
        species = db.query(Species).filter(Species.id == tarantula.species_id).first()
        if species:
            species_name = species.common_names[0] if species.common_names else species.scientific_name

    # Calculate status and days difference
    status = calculate_reminder_status(last_fed_at, next_feeding_due)
    days_difference = get_days_difference(last_fed_at, next_feeding_due)
    is_overdue = status == "overdue"

    return FeedingReminderResponse(
        tarantula_id=tarantula.id,
        tarantula_name=tarantula.name or tarantula.scientific_name or "Unknown",
        species_name=species_name,
        last_fed_at=last_fed_at,
        recommended_interval_days=recommended_interval,
        next_feeding_due=next_feeding_due,
        is_overdue=is_overdue,
        days_difference=days_difference,
        status=status
    )


def get_user_feeding_reminders(user_id, db: Session):
    """
    Get all feeding reminders for a user's tarantulas.
    Returns summary with list of reminders.
    """
    # Get all tarantulas for the user
    tarantulas = db.query(Tarantula).filter(
        Tarantula.user_id == user_id
    ).all()

    # Build reminders for each tarantula
    reminders = []
    for tarantula in tarantulas:
        reminder = build_feeding_reminder(tarantula, db)
        reminders.append(reminder)

    # Count status breakdown
    status_counts = {
        "overdue": 0,
        "due_today": 0,
        "due_soon": 0,
        "on_track": 0,
        "never_fed": 0
    }

    for reminder in reminders:
        status_counts[reminder.status] += 1

    # Build summary
    from app.schemas.feeding_reminder import FeedingReminderSummary

    return FeedingReminderSummary(
        total_tarantulas=len(tarantulas),
        overdue_count=status_counts["overdue"],
        due_today_count=status_counts["due_today"],
        due_soon_count=status_counts["due_soon"],
        on_track_count=status_counts["on_track"],
        never_fed_count=status_counts["never_fed"],
        reminders=reminders
    )
