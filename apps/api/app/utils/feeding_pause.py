"""Feeding-pause rules, in one place.

A keeper pauses feeding when an animal is deliberately off food — premolt, post
rehouse, recovering, breeding season. While paused, the animal is exempt from
overdue nagging, which is the whole point: a premolt tarantula that hasn't eaten
in five weeks isn't neglected.

TWO THINGS WERE WRONG BEFORE THIS MODULE EXISTED
------------------------------------------------
1. The "is it paused right now" comparison was reimplemented inline in six
   places (both feeding-status endpoints, two feeding-stats endpoints, and the
   digest service twice). Six copies of a date comparison is six chances for one
   to drift, and the clients trust whichever one answered.

2. Nothing ever CLEARED a pause. Not one feeding endpoint — single, bulk,
   quick-feed, any taxon, either product — touched the columns. So an animal you
   successfully fed kept its "Paused" badge on Feeding Day and stayed exempt
   from overdue detection indefinitely. The pause outlived the condition that
   justified it, which is the failure mode that quietly turns a safety feature
   into a blind spot: the one animal genuinely being forgotten is the one the
   app has stopped mentioning.

WHY ONLY AN ACCEPTED FEEDING RESUMES
------------------------------------
Taking food is evidence the animal is back on food. A REFUSAL is not — it's
evidence the pause was correct. An animal in premolt or on a hunger strike
refusing a cricket confirms the reason it was paused, so clearing the pause
there would fight the keeper's own judgment and re-flag the animal as overdue
the moment it did exactly what was expected.

So: accepted resumes, refused leaves it alone.
"""
from datetime import date, timedelta
from typing import Any, Optional


def today_for_offset(tz_offset_minutes: Optional[int]) -> date:
    """Today in the caller's local timezone.

    Pause windows are expressed in calendar days ("paused until the 14th"), so
    comparing against a UTC date flips the pause on and off at UTC midnight
    rather than the keeper's. Matches the calendar-day handling used elsewhere
    for days-since metrics.
    """
    if tz_offset_minutes is None:
        return date.today()
    # JS getTimezoneOffset() convention: minutes to ADD to local to reach UTC,
    # so UTC-5 sends +300. Subtract to move from UTC back to local.
    from datetime import datetime, timezone

    return (datetime.now(timezone.utc) - timedelta(minutes=tz_offset_minutes)).date()


def is_feeding_paused(
    reason: Optional[str],
    until: Optional[date],
    today: Optional[date] = None,
) -> bool:
    """Is this animal paused as of `today`?

    A pause needs a reason — `until` alone is not a pause. `until=None` means
    an open-ended pause that only a person ends. An `until` in the past has
    lapsed on its own and is no longer a pause, which is why callers must not
    test `reason` by itself.
    """
    if not reason:
        return False
    if until is None:
        return True
    return until >= (today or date.today())


def resume_if_accepted(animal: Any, accepted: bool, db: Any = None) -> bool:
    """Clear a pause because the animal ate. Returns True if it cleared one.

    Deliberately checks `feeding_paused_reason` rather than `is_feeding_paused`:
    an expired pause should also be tidied away once the animal eats, so the
    columns don't linger and resurrect confusing UI later. Safe to call on any
    model — inverts, tarantulas, scorpions, animals — and on models that don't
    carry the columns at all, which keeps callers free of taxon branching.

    Pass `db` for TV animals so the consolidation twin is cleared too. A
    tarantula exists as BOTH a legacy `tarantulas` row and an `inverts` mirror
    (ADR-005, still dual-written since the read cutover hasn't happened).
    Feeding-status reads from `inverts` while the legacy detail screen reads
    from `tarantulas`, so clearing only the row you happen to hold resumes the
    animal on one screen and leaves it paused on the other. HV animals have no
    twin and are unaffected.
    """
    if not accepted:
        return False
    if not getattr(animal, "feeding_paused_reason", None):
        return False
    animal.feeding_paused_reason = None
    animal.feeding_paused_until = None
    if db is not None:
        _clear_twin(db, animal)
    return True


def _clear_twin(db: Any, animal: Any) -> None:
    """Clear the pause on the consolidation twin, matched on the shared PK.

    Invert and its legacy per-taxon row deliberately share a primary key, which
    is what makes this a lookup rather than a join. Best-effort: a missing twin
    is the normal case for invert-native taxa (centipedes and everything added
    after the per-taxon tables stopped being written), not an error.
    """
    from app.models.invert import Invert
    from app.models.scorpion import Scorpion
    from app.models.tarantula import Tarantula

    if isinstance(animal, Invert):
        twins = (Tarantula, Scorpion)
    elif isinstance(animal, (Tarantula, Scorpion)):
        twins = (Invert,)
    else:
        return  # HV Animal, or anything with no mirrored surface

    for model in twins:
        row = db.query(model).filter(model.id == animal.id).first()
        if row is not None and getattr(row, "feeding_paused_reason", None):
            row.feeding_paused_reason = None
            row.feeding_paused_until = None
