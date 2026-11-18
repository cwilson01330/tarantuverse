"""Weight log routes — Herpetoverse

Standalone weigh-ins, independent of sheds. ADR-003 collapsed the
per-taxon parent tables, so the snake + lizard route blocks (which were
identical logic) are now one taxon-agnostic surface:

  GET    /animals/{animal_id}/weight-logs            — list, newest first
  GET    /animals/{animal_id}/weight-logs/latest     — single most recent
  GET    /animals/{animal_id}/weight-logs/trend      — series + 30d loss alert
  POST   /animals/{animal_id}/weight-logs            — create, denormalizes current
  GET    /weight-logs/{weight_log_id}                — fetch one
  PUT    /weight-logs/{weight_log_id}                — partial update
  DELETE /weight-logs/{weight_log_id}                — remove

Plus the feeding advisories:

  GET /animals/{animal_id}/prey-suggestion           — species-based prey range
  GET /animals/{animal_id}/feeding-status            — smart reminder indicator

Side-effect on POST: denormalize `animals.current_weight_g` to the new
weight IF the weigh-in is the most recent one for the animal. Older
backfill entries don't regress the denormalized value.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.feeding_log import FeedingLog
from app.models.user import User
from app.models.animal import Animal
from app.models.notification_preferences import NotificationPreferences
from app.models.reptile_species import ReptileSpecies
from app.models.weight_log import WeightLog
from app.services.feeding_reminder_service import parse_frequency_string
from app.routers.animals import refuse_if_closed
from app.schemas.animal import AnimalFeedingStatusItem
from app.services.animal_feeding_status import evaluate_animals
from app.schemas.weight_log import (
    WeightLogCreate,
    WeightLogUpdate,
    WeightLogResponse,
    WeightTrendPoint,
    WeightTrendResponse,
    PreySuggestion,
    FeedingStatus,
)
from app.services.snake_feeding_advisory import (
    cgd_applies,
    compute_life_stage,
    compute_weight_loss_30d,
    suggest_prey_range,
)
from app.utils.dependencies import get_current_user
from app.utils.access import access_helper, load_animal, load_log_parent, policy, require_can_change

router = APIRouter()


# ── Ownership helpers ─────────────────────────────────────────────────

@access_helper
def _weight_log_for(db: Session, weight_log_id: uuid.UUID, user: User, need: str) -> WeightLog:
    """The row plus an access check through its animal (owner or co-keeper).

    404 for missing and for no access alike — the old helper answered 403 for
    someone else's row, confirming it existed. Writes also apply the logger
    rule: a logger may change only entries they logged themselves.
    """
    row = db.query(WeightLog).filter(WeightLog.id == weight_log_id).first()
    _parent, access = load_log_parent(db, user, row, need, not_found="Weight log not found")
    if need != "viewer":
        require_can_change(access, row)
    return row


def _species_for_animal(db: Session, animal: Animal) -> ReptileSpecies | None:
    """Fetch the animal's species sheet if one is linked. None otherwise."""
    if animal.herp_species_id is None:
        return None
    return (
        db.query(ReptileSpecies)
        .filter(ReptileSpecies.id == animal.herp_species_id)
        .first()
    )


def _resolve_interval_window(
    animal: Animal,
    species: ReptileSpecies | None,
    suggestion: dict,
) -> tuple[Optional[int], Optional[int]]:
    """Resolve the (min, max) feeding interval for the per-animal status.

    This endpoint previously read ONLY `suggestion`, which comes from
    `suggest_prey_range()` and is derived purely from the weight-bracketed
    `life_stage_feeding` JSON. That produced two wrong answers:

      1. An animal with NO logged weight got interval=None and rendered
         "No species feeding cadence on file. Link this animal to a species
         with a care sheet" — even when the linked sheet had explicit
         per-stage frequencies. Reported from a Python regius whose sheet
         carries "Every 10-14 days" for adults; the animal was correctly
         linked, so the message was both false and un-actionable.
      2. The keeper's OWN cadence (ADR-017 `feeding_interval_days`) was
         ignored entirely here, so a keeper who had explicitly stated a
         number still saw "cadence not on file" on the detail screen while
         /animals/feeding-status (collection-wide) honoured it. Two
         surfaces disagreeing about the same animal.

    Priority matches `routers.animals._animal_feeding_interval` so the two
    surfaces can't drift again:
      keeper's number → plant-eater (None) → CGD → weight bracket →
      species frequency → None.
    """
    # 1. ADR-017 — a number the keeper stated is the only cadence the app
    #    can be certain of, so it outranks every inference. Exact, so the
    #    window collapses to a single value.
    keeper = getattr(animal, "feeding_interval_days", None)
    if keeper:
        return int(keeper), int(keeper)

    # 1b. Plant-eaters (species diet_type "herbivore") have no schedule
    #     unless the keeper set one above — same step as
    #     _animal_feeding_interval.
    if species is not None and getattr(species, "diet_type", None) == "herbivore":
        return None, None

    # 2. Complete gecko diet — refreshed every few days, so a hard 4.
    #    Guarded by `cgd_applies` because CGD is a GECKO diet: a keeper
    #    who flips the toggle on a snake would otherwise put a colubrid
    #    on a 4-day cadence. Omitting this branch entirely (as this
    #    function first did) was also wrong — it made the detail screen
    #    disagree with the collection screen for real gecko keepers.
    if cgd_applies(animal):
        return 4, 4

    # 3. Weight-bracketed schedule — the most precise inference we have,
    #    but only available once the animal has a weight on file.
    lo, hi = suggestion.get("interval_days_min"), suggestion.get("interval_days_max")
    if lo is not None and hi is not None:
        return lo, hi

    # 4. The species sheet's free-text per-stage frequency. Adult-first
    #    ordering mirrors _animal_feeding_interval; without a weight we
    #    can't compute a life stage, so there is no better basis to choose.
    if species is not None:
        for freq in (
            species.feeding_frequency_adult,
            species.feeding_frequency_juvenile,
            species.feeding_frequency_hatchling,
        ):
            parsed = parse_frequency_string(freq)
            if parsed:
                return parsed[0], parsed[1]

    return None, None


# ── Weight log CRUD ───────────────────────────────────────────────────

@router.get(
    "/animals/{animal_id}/weight-logs",
    response_model=List[WeightLogResponse],
)
@policy("viewer")
async def list_weight_logs(
    animal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List weigh-ins for an animal, most recent first."""
    load_animal(db, current_user, animal_id, "viewer")
    return (
        db.query(WeightLog)
        .filter(WeightLog.animal_id == animal_id)
        .order_by(WeightLog.weighed_at.desc())
        .all()
    )


@router.get(
    "/animals/{animal_id}/weight-logs/latest",
    response_model=WeightLogResponse | None,
)
@policy("viewer")
async def latest_weight_log(
    animal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the most recent weigh-in, or null if the animal has none."""
    load_animal(db, current_user, animal_id, "viewer")
    return (
        db.query(WeightLog)
        .filter(WeightLog.animal_id == animal_id)
        .order_by(WeightLog.weighed_at.desc())
        .first()
    )


@router.get(
    "/animals/{animal_id}/weight-logs/trend",
    response_model=WeightTrendResponse,
)
@policy("viewer")
async def weight_trend(
    animal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the full weight series + a 30-day loss alert.

    Alert suppression: if the animal is currently brumating (or
    aestivating — same flag for frogs), don't flag weight loss; it's
    expected behavior.
    """
    animal, access = load_animal(db, current_user, animal_id, "viewer")
    species = _species_for_animal(db, animal)

    logs = (
        db.query(WeightLog)
        .filter(WeightLog.animal_id == animal_id)
        .order_by(WeightLog.weighed_at.asc())
        .all()
    )

    series = [
        WeightTrendPoint(weighed_at=l.weighed_at, weight_g=l.weight_g)
        for l in logs
    ]
    latest_weight = logs[-1].weight_g if logs else None

    loss_pct = compute_weight_loss_30d((l.weighed_at, l.weight_g) for l in logs)

    alert_threshold = species.weight_loss_concern_pct_30d if species else None
    alert = False
    if (
        loss_pct is not None
        and loss_pct > 0  # positive = lost weight
        and alert_threshold is not None
        and loss_pct >= alert_threshold
        and not animal.brumation_active
    ):
        alert = True

    return WeightTrendResponse(
        series=series,
        latest_weight_g=latest_weight,
        loss_pct_30d=loss_pct,
        alert=alert,
        alert_threshold_pct=alert_threshold,
    )


@router.post(
    "/animals/{animal_id}/weight-logs",
    response_model=WeightLogResponse,
    status_code=status.HTTP_201_CREATED,
)
@policy("logger")
async def create_weight_log(
    animal_id: uuid.UUID,
    payload: WeightLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a weigh-in. Denormalizes `animals.current_weight_g` when the
    new entry is the most recent one — backfilling older weights leaves
    the current-weight hint untouched."""
    animal, access = load_animal(db, current_user, animal_id, "logger")
    refuse_if_closed(animal)  # no new logs on a died / transferred animal

    new_log = WeightLog(animal_id=animal_id, logged_by_user_id=access.logged_by_user_id, **payload.model_dump())
    db.add(new_log)
    db.flush()  # so new_log.weighed_at is populated before comparison

    latest_existing = (
        db.query(func.max(WeightLog.weighed_at))
        .filter(
            WeightLog.animal_id == animal_id,
            WeightLog.id != new_log.id,
        )
        .scalar()
    )
    if latest_existing is None or new_log.weighed_at >= latest_existing:
        animal.current_weight_g = new_log.weight_g

    db.commit()
    db.refresh(new_log)
    return new_log


@router.get(
    "/weight-logs/{weight_log_id}",
    response_model=WeightLogResponse,
)
@policy("viewer")
async def get_weight_log(
    weight_log_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch a single weight log by id — used by the edit forms to
    pre-fill fields."""
    return _weight_log_for(db, weight_log_id, current_user, "viewer")


@router.put(
    "/weight-logs/{weight_log_id}",
    response_model=WeightLogResponse,
)
@policy("logger")
async def update_weight_log(
    weight_log_id: uuid.UUID,
    payload: WeightLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Partial update. Does NOT recompute `animals.current_weight_g` —
    editing a historical weight is rare and the denormalized hint
    resyncs on the next POST."""
    log = _weight_log_for(db, weight_log_id, current_user, "logger")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(log, field, value)

    db.commit()
    db.refresh(log)
    return log


@router.delete(
    "/weight-logs/{weight_log_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@policy("logger")
async def delete_weight_log(
    weight_log_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a weigh-in. Does NOT recompute current_weight_g — same
    rationale as update. The next POST resyncs."""
    log = _weight_log_for(db, weight_log_id, current_user, "logger")
    db.delete(log)
    db.commit()
    return None


# ── Feeding advisory ──────────────────────────────────────────────────

@router.get(
    "/animals/{animal_id}/prey-suggestion",
    response_model=PreySuggestion,
)
@policy("viewer")
async def prey_suggestion(
    animal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the suggested prey weight range for this animal.

    Uses the most-recent weigh-in if available, falling back to the
    denormalized `animals.current_weight_g`. If neither exists OR the
    species has no life_stage_feeding data, returns
    `is_data_available=false` and the UI shows an explanation.
    """
    animal, access = load_animal(db, current_user, animal_id, "viewer")
    species = _species_for_animal(db, animal)

    latest_log = (
        db.query(WeightLog)
        .filter(WeightLog.animal_id == animal_id)
        .order_by(WeightLog.weighed_at.desc())
        .first()
    )
    animal_weight = (
        latest_log.weight_g if latest_log is not None else animal.current_weight_g
    )

    life_stage_feeding = species.life_stage_feeding if species else None
    suggestion = suggest_prey_range(animal_weight, life_stage_feeding)

    power_threshold_g = None
    if (
        species is not None
        and species.power_feeding_threshold_pct is not None
        and animal_weight is not None
    ):
        from decimal import Decimal as _Dec
        power_threshold_g = (
            animal_weight * species.power_feeding_threshold_pct / _Dec("100")
        ).quantize(_Dec("0.01"))

    warning = None
    if not suggestion["is_data_available"]:
        if animal_weight is None:
            warning = (
                "Log a weigh-in for this animal to see species-specific "
                "prey recommendations."
            )
        elif species is None:
            warning = (
                "Link this animal to a species from the care sheet "
                "database to see feeding recommendations."
            )
        else:
            warning = (
                "Feeding ratio data for this species hasn't been "
                "published yet. We'll add it as we verify sources."
            )

    return PreySuggestion(
        stage=suggestion["stage"],
        # schema field name is snake-legacy; value is this animal's weight
        snake_weight_g=animal_weight,
        suggested_min_g=suggestion["suggested_min_g"],
        suggested_max_g=suggestion["suggested_max_g"],
        interval_days_min=suggestion["interval_days_min"],
        interval_days_max=suggestion["interval_days_max"],
        power_feeding_threshold_g=power_threshold_g,
        is_data_available=suggestion["is_data_available"],
        warning=warning,
    )


# ── Feeding status (smart reminder indicator) ─────────────────────────
#
# Computes "when does this animal need feeding next?" by combining the
# species' interval_days_min/max (from life_stage_feeding + current
# weight) with the most recent ACCEPTED feeding.

def _last_accepted_feeding(
    db: Session,
    animal_id: uuid.UUID,
) -> Optional[FeedingLog]:
    """Return the most recent ACCEPTED feeding for the given animal.

    Refusals don't reset the clock — surfacing "fed today" after a
    refused feeding read as broken to keepers (memory:
    feedback_last_feeding_means_accepted.md).
    """
    return (
        db.query(FeedingLog)
        .filter(
            FeedingLog.accepted == True,  # noqa: E712
            FeedingLog.animal_id == animal_id,
        )
        .order_by(FeedingLog.fed_at.desc())
        .first()
    )


_REASON_LABELS = {
    "hunger_strike": "Hunger strike",
    "post_rehouse": "Post-rehouse fasting",
    "recovering": "Recovering",
    "breeding_season": "Breeding season",
    "other": "Paused",
}


def _render_pause_note(reason: str, until: Optional[date]) -> str:
    """Build the user-facing detail line for a paused state.

    Translates the canonical reason values from the mobile picker into
    human prose. Free-form reasons (anything not in _REASON_LABELS)
    pass through verbatim.
    """
    label = _REASON_LABELS.get(reason, reason)
    if until is None:
        return f"{label}. Reminders paused until you resume."
    return f"{label}. Reminders paused until {until.isoformat()}."


_PLANT_EATER_NOTE = (
    "Plant-eaters graze on fresh food offered every day, so there's no feeding "
    "schedule to fall behind on. Set your own cadence to get reminders."
)


def _compute_feeding_status(
    *,
    last_fed_at: Optional[datetime],
    interval_days_min: Optional[int],
    interval_days_max: Optional[int],
    brumation_active: bool = False,
    feeding_paused_reason: Optional[str] = None,
    feeding_paused_until: Optional[date] = None,
    is_species_linked: bool = False,
    verdict: Optional[AnimalFeedingStatusItem] = None,
    wait_days: Optional[int] = None,
) -> FeedingStatus:
    """Pure function — combines inputs into the canonical FeedingStatus.

    `verdict` is the animal's row from the one HV rule
    (services/animal_feeding_status.py, the same row Feeding Day and the
    digest use) and `wait_days` the days its current wait has run, counted
    by the core (from the last meal, or a later refusal with the owner's
    switch on; from the baseline for a never-fed animal). When given they are
    authoritative, so this screen can never disagree with the board (spec §5
    call 7):

      - paused     = the verdict's keeper pause, else its brumation;
      - no_data    = also for a plant-eater with no keeper cadence
                     (`verdict.no_schedule`), with its own note;
      - the window = (interval, interval) from the verdict when the window
                     resolver found none OR its window doesn't hold the
                     verdict's interval (e.g. the keeper's free-text schedule
                     says 5 days, the species sheet 10-14);
      - status     = "due" or "overdue" exactly when the board says overdue:
                     "due" (HV mobile: "Feed today") while the wait is within
                     the window's max (the interval day itself for an exact
                     cadence, so a daily feeder fed yesterday is "due", not
                     "1 day overdue"), "overdue" once past it. When the board
                     says not overdue it is "upcoming" (or "no_feedings" for a
                     never-fed animal), whatever the window says;
      - days_until_due = window min - wait_days, and the next due / overdue
                     dates move with a refusal that restarted the wait.

    The window fields stay a display of "eat again in X-Y days".

    Without a verdict (old callers) the rule is the original window rule:

    Pause precedence (top → bottom):
      1. Manual feeding_paused_reason set + (until is null OR in future)
         → status='paused' with the keeper's reason
      2. brumation_active=True → status='paused' with brumation note
    Anything else falls through to the standard cadence math.
    """
    if verdict is not None:
        keeper_paused = verdict.is_feeding_paused
        brumation_active = verdict.is_brumating
    else:
        today = datetime.now(timezone.utc).date()
        keeper_paused = bool(feeding_paused_reason) and (
            feeding_paused_until is None or feeding_paused_until >= today
        )

    if keeper_paused and feeding_paused_reason:
        note = _render_pause_note(feeding_paused_reason, feeding_paused_until)
        return FeedingStatus(
            status="paused",
            last_fed_at=last_fed_at,
            interval_days_min=interval_days_min,
            interval_days_max=interval_days_max,
            is_data_available=True,
            note=note,
        )

    if brumation_active:
        return FeedingStatus(
            status="paused",
            last_fed_at=last_fed_at,
            interval_days_min=interval_days_min,
            interval_days_max=interval_days_max,
            is_data_available=True,
            note="Feeding paused for brumation.",
        )

    if verdict is not None and verdict.no_schedule:
        return FeedingStatus(
            status="no_data",
            last_fed_at=last_fed_at,
            is_data_available=False,
            note=_PLANT_EATER_NOTE,
        )

    if verdict is not None and verdict.interval_days is not None and (
        interval_days_min is None
        or interval_days_max is None
        or not (interval_days_min <= verdict.interval_days <= interval_days_max)
    ):
        # The window must hold the interval the verdict was decided on, or
        # "eat again in 10-14 days" would sit next to an overdue badge.
        interval_days_min = interval_days_max = verdict.interval_days

    if interval_days_min is None or interval_days_max is None:
        # The old copy always told the keeper to link a species. When the
        # animal was already linked — the common case — that was both
        # false and un-actionable: it named a step they had done and hid
        # the one that would actually help. Two states, two answers.
        note = (
            "This species sheet has no feeding cadence yet. "
            "Set your own cadence to get reminders."
            if is_species_linked
            else "No feeding cadence on file. Link this animal to a species, "
            "or set your own cadence, to see reminders."
        )
        return FeedingStatus(
            status="no_data",
            last_fed_at=last_fed_at,
            is_data_available=False,
            note=note,
        )

    if last_fed_at is None:
        if verdict is not None and verdict.is_overdue:
            # Never fed, created after the HV cutoff, at or past its first
            # wait (from the baseline, or a later refusal with the switch on).
            waited = wait_days if wait_days is not None else (verdict.days_since_baseline or 0)
            return FeedingStatus(
                status="overdue" if waited > interval_days_max else "due",
                interval_days_min=interval_days_min,
                interval_days_max=interval_days_max,
                days_until_due=interval_days_min - waited,
                is_data_available=True,
                note="No meal logged yet.",
            )
        return FeedingStatus(
            status="no_feedings",
            interval_days_min=interval_days_min,
            interval_days_max=interval_days_max,
            is_data_available=True,
            note="Log a feeding to start the reminder clock.",
        )

    now = datetime.now(timezone.utc)
    fed_at = (
        last_fed_at if last_fed_at.tzinfo else last_fed_at.replace(tzinfo=timezone.utc)
    )
    elapsed_days = int((now - fed_at).total_seconds() // 86400)

    next_due = fed_at + timedelta(days=interval_days_min)
    next_overdue = fed_at + timedelta(days=interval_days_max)
    days_until_due = interval_days_min - elapsed_days

    if elapsed_days < interval_days_min:
        status_str = "upcoming"
    elif elapsed_days <= interval_days_max:
        status_str = "due"
    else:
        status_str = "overdue"

    if verdict is not None:
        waited = wait_days if wait_days is not None else elapsed_days
        if verdict.is_overdue:
            status_str = "overdue" if waited > interval_days_max else "due"
        else:
            status_str = "upcoming"
        days_until_due = interval_days_min - waited
        # A refusal that restarted the wait moves the window with it.
        since_meal = verdict.days_since_last_feeding
        shift = max(0, since_meal - waited) if since_meal is not None else 0
        if shift:
            next_due = fed_at + timedelta(days=interval_days_min + shift)
            next_overdue = fed_at + timedelta(days=interval_days_max + shift)

    return FeedingStatus(
        status=status_str,
        last_fed_at=last_fed_at,
        interval_days_min=interval_days_min,
        interval_days_max=interval_days_max,
        next_feeding_due_at=next_due,
        next_feeding_overdue_at=next_overdue,
        days_until_due=days_until_due,
        is_data_available=True,
    )


def _owner_tz_offset(db: Session, owner_id) -> Optional[int]:
    """The owner's saved time zone (what the daily digest counts in), for
    callers that don't send one."""
    row = (
        db.query(NotificationPreferences.tz_offset_minutes)
        .filter(NotificationPreferences.user_id == owner_id)
        .first()
    )
    return row[0] if row else None


@router.get(
    "/animals/{animal_id}/feeding-status",
    response_model=FeedingStatus,
)
@policy("viewer")
async def animal_feeding_status(
    animal_id: uuid.UUID,
    tz_offset_minutes: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return when this animal needs feeding next.

    Combines the species feeding cadence with the most recent ACCEPTED
    feeding. Brumating/aestivating animals get status='paused' so the
    dashboard doesn't nag. Paused / overdue come from the one HV rule
    (animal_feeding_status.evaluate_animals), so this agrees with Feeding Day and the
    digest; days are counted in `tz_offset_minutes`, else the owner's saved
    zone (the digest's), else UTC.
    """
    animal, access = load_animal(db, current_user, animal_id, "viewer")
    species = _species_for_animal(db, animal)

    latest_log = (
        db.query(WeightLog)
        .filter(WeightLog.animal_id == animal_id)
        .order_by(WeightLog.weighed_at.desc())
        .first()
    )
    animal_weight = (
        latest_log.weight_g if latest_log is not None else animal.current_weight_g
    )
    life_stage_feeding = species.life_stage_feeding if species else None
    suggestion = suggest_prey_range(animal_weight, life_stage_feeding)

    last_fed = _last_accepted_feeding(db, animal_id)

    # Full resolution chain, not just the weight bracket — see
    # _resolve_interval_window for the two bugs this fixes.
    interval_min, interval_max = _resolve_interval_window(animal, species, suggestion)

    if tz_offset_minutes is None:
        tz_offset_minutes = _owner_tz_offset(db, animal.user_id)
    evaluated = evaluate_animals(db, [animal], tz_offset_minutes)[0]

    return _compute_feeding_status(
        last_fed_at=last_fed.fed_at if last_fed else None,
        interval_days_min=interval_min,
        interval_days_max=interval_max,
        is_species_linked=species is not None,
        brumation_active=bool(getattr(animal, "brumation_active", False)),
        feeding_paused_reason=getattr(animal, "feeding_paused_reason", None),
        feeding_paused_until=getattr(animal, "feeding_paused_until", None),
        verdict=evaluated.item,
        wait_days=evaluated.wait_days,
    )
