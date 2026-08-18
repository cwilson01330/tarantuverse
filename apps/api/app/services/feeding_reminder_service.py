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


# Words keepers use instead of digits.
_WORD_COUNTS = {"once": 1, "twice": 2, "thrice": 3, "one": 1, "two": 2, "three": 3}
_UNIT_DAYS = {"day": 1, "week": 7, "month": 30}

# INTERVAL phrasing — the number(s) are immediately followed by a time unit.
#   "every 10-18 days", "Every 1-2 weeks", "Every 3 days"
_INTERVAL_RE = re.compile(
    r"(\d+)\s*(?:[-–—]|\bto\b)\s*(\d+)\s*(day|week|month)s?"
    r"|(\d+)\s*(day|week|month)s?",
    re.IGNORECASE,
)

# FREQUENCY phrasing — a COUNT of feedings within a period.
#   "1 prey per week", "1-2 prey per week", "2x per week", "Twice per week", "weekly"
_FREQUENCY_RE = re.compile(
    r"(?:(once|twice|thrice|one|two|three)|(\d+)(?:\s*[-–—]\s*(\d+))?)"
    r"\s*(?:x\b|times?\b)?"          # "2x", "2 times"
    r"(?:[^,;.]*?)"                  # "prey", "small prey", "feeders" …
    r"\bper\s*(day|week|month)\b",
    re.IGNORECASE,
)
_BARE_PERIOD_RE = re.compile(r"\b(daily|weekly|monthly)\b", re.IGNORECASE)
_BARE_PERIOD_DAYS = {"daily": 1, "weekly": 7, "monthly": 30}


def parse_frequency_string(frequency_str: Optional[str]) -> Optional[Tuple[int, int]]:
    """Parse a care-sheet feeding frequency into a (min_days, max_days) interval.

    Returns None when the string can't be read as a cadence — callers MUST treat
    that as "no cadence on file" rather than substituting a number.

    Two distinct phrasings appear in the catalog and they mean opposite things:

      INTERVAL  "1 prey every 10-18 days"  -> feed every 10-18 days
      FREQUENCY "1-2 prey per week"        -> 1-2 feedings per week, i.e. every 3-7 days

    The previous implementation ran `re.search(r'(\\d+)\\s*-?\\s*(\\d*)')` and took
    the first number in the string regardless of what followed it. That made
    "1 prey every 10-18 days" parse to (1, 1) — a keeper with an adult
    Aphonopelma moderatum was told to feed it DAILY instead of every 18 days.
    Reported by a user 2026-07-28.

    It failed in one direction only — always toward feeding more often — because
    the leading number is a prey count, and prey counts are small. Roughly 245 of
    655 catalog strings were affected: everything phrased in weeks, and
    everything with a prey count in front. Only the "every X-Y days" form
    survived, which is why this went unnoticed.
    """
    if not frequency_str:
        return None

    s = frequency_str.strip()
    if not s:
        return None

    # Frequency first: "1 prey per week" contains no unit directly after the
    # number, but "per week" is decisive. Checking interval first would let the
    # bare-number branch below swallow it.
    m = _FREQUENCY_RE.search(s)
    if m:
        word, lo_digits, hi_digits, unit = m.group(1), m.group(2), m.group(3), m.group(4)
        if word:
            lo_count = hi_count = _WORD_COUNTS[word.lower()]
        else:
            lo_count = int(lo_digits)
            hi_count = int(hi_digits) if hi_digits else lo_count
        lo_count, hi_count = max(1, min(lo_count, hi_count)), max(1, max(lo_count, hi_count))
        period = _UNIT_DAYS[unit.lower()]
        # MORE feedings per period = SHORTER interval, so the counts invert.
        #
        # The UPPER bound rounds UP, not down. Callers use it as the "should
        # have fed by now" threshold, and flooring it flags early on every
        # cycle: "twice per week" is every 3.5 days, and 7 // 2 = 3 declared a
        # juvenile overdue half a day before it was. That phrasing is on
        # Avicularia avicularia, Poecilotheria metallica, P. murinus,
        # P. irminia, M. balfouri and a dozen more, so the early nag was
        # systematic rather than occasional — reported by a keeper 2026-08-09
        # as "some of my tarantulas still show feed every 3 days".
        #
        # The lower bound keeps flooring: it's the earliest reasonable feed,
        # where erring short is the safe direction.
        return (
            max(1, period // hi_count),
            max(1, -(-period // lo_count)),  # ceil
        )

    m = _INTERVAL_RE.search(s)
    if m:
        if m.group(1):  # ranged: "10-18 days"
            lo, hi, unit = int(m.group(1)), int(m.group(2)), m.group(3)
        else:           # single: "3 days"
            lo = hi = int(m.group(4))
            unit = m.group(5)
        mult = _UNIT_DAYS[unit.lower()]
        lo, hi = lo * mult, hi * mult
        return (max(1, min(lo, hi)), max(1, max(lo, hi)))

    m = _BARE_PERIOD_RE.search(s)
    if m:
        days = _BARE_PERIOD_DAYS[m.group(1).lower()]
        return (days, days)

    # Unreadable — e.g. "continuous — leaf litter, decaying hardwood". Detritivore
    # grazing has no live-prey cadence and must not be given one.
    return None


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

    # Parse frequency string to get day range, then take midpoint. Unreadable
    # strings fall back to the life-stage default rather than fabricating one.
    parsed = parse_frequency_string(frequency_str)
    if not parsed:
        return default_intervals[life_stage]
    min_days, max_days = parsed
    return (min_days + max_days) // 2


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
