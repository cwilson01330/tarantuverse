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

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.feeding_log import FeedingLog
from app.models.user import User
from app.models.animal import Animal
from app.models.reptile_species import ReptileSpecies
from app.models.weight_log import WeightLog
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
    compute_life_stage,
    compute_weight_loss_30d,
    suggest_prey_range,
)
from app.utils.dependencies import get_current_user

router = APIRouter()


# ── Ownership helpers ─────────────────────────────────────────────────

def _get_owned_animal(db: Session, animal_id: uuid.UUID, user: User) -> Animal:
    animal = (
        db.query(Animal)
        .filter(Animal.id == animal_id, Animal.user_id == user.id)
        .first()
    )
    if not animal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Animal not found"
        )
    return animal


def _get_owned_weight_log(
    db: Session, weight_log_id: uuid.UUID, user: User
) -> WeightLog:
    """Fetch a weight log and verify the owning animal belongs to the
    caller. Raises 404 for missing log, 403 for not-yours."""
    log = db.query(WeightLog).filter(WeightLog.id == weight_log_id).first()
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Weight log not found"
        )
    owner = (
        db.query(Animal)
        .filter(Animal.id == log.animal_id, Animal.user_id == user.id)
        .first()
    )
    if not owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized"
        )
    return log


def _species_for_animal(db: Session, animal: Animal) -> ReptileSpecies | None:
    """Fetch the animal's species sheet if one is linked. None otherwise."""
    if animal.herp_species_id is None:
        return None
    return (
        db.query(ReptileSpecies)
        .filter(ReptileSpecies.id == animal.herp_species_id)
        .first()
    )


# ── Weight log CRUD ───────────────────────────────────────────────────

@router.get(
    "/animals/{animal_id}/weight-logs",
    response_model=List[WeightLogResponse],
)
async def list_weight_logs(
    animal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List weigh-ins for an animal, most recent first."""
    _get_owned_animal(db, animal_id, current_user)
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
async def latest_weight_log(
    animal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the most recent weigh-in, or null if the animal has none."""
    _get_owned_animal(db, animal_id, current_user)
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
    animal = _get_owned_animal(db, animal_id, current_user)
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
async def create_weight_log(
    animal_id: uuid.UUID,
    payload: WeightLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a weigh-in. Denormalizes `animals.current_weight_g` when the
    new entry is the most recent one — backfilling older weights leaves
    the current-weight hint untouched."""
    animal = _get_owned_animal(db, animal_id, current_user)

    new_log = WeightLog(animal_id=animal_id, **payload.model_dump())
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
async def get_weight_log(
    weight_log_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch a single weight log by id — used by the edit forms to
    pre-fill fields."""
    return _get_owned_weight_log(db, weight_log_id, current_user)


@router.put(
    "/weight-logs/{weight_log_id}",
    response_model=WeightLogResponse,
)
async def update_weight_log(
    weight_log_id: uuid.UUID,
    payload: WeightLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Partial update. Does NOT recompute `animals.current_weight_g` —
    editing a historical weight is rare and the denormalized hint
    resyncs on the next POST."""
    log = _get_owned_weight_log(db, weight_log_id, current_user)

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
async def delete_weight_log(
    weight_log_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a weigh-in. Does NOT recompute current_weight_g — same
    rationale as update. The next POST resyncs."""
    log = _get_owned_weight_log(db, weight_log_id, current_user)
    db.delete(log)
    db.commit()
    return None


# ── Feeding advisory ──────────────────────────────────────────────────

@router.get(
    "/animals/{animal_id}/prey-suggestion",
    response_model=PreySuggestion,
)
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
    animal = _get_owned_animal(db, animal_id, current_user)
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


def _compute_feeding_status(
    *,
    last_fed_at: Optional[datetime],
    interval_days_min: Optional[int],
    interval_days_max: Optional[int],
    brumation_active: bool = False,
    feeding_paused_reason: Optional[str] = None,
    feeding_paused_until: Optional[date] = None,
) -> FeedingStatus:
    """Pure function — combines inputs into the canonical FeedingStatus.

    Pause precedence (top → bottom):
      1. Manual feeding_paused_reason set + (until is null OR in future)
         → status='paused' with the keeper's reason
      2. brumation_active=True → status='paused' with brumation note
    Anything else falls through to the standard cadence math.
    """
    today = datetime.now(timezone.utc).date()
    if feeding_paused_reason and (
        feeding_paused_until is None or feeding_paused_until >= today
    ):
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

    if interval_days_min is None or interval_days_max is None:
        return FeedingStatus(
            status="no_data",
            last_fed_at=last_fed_at,
            is_data_available=False,
            note="No species feeding cadence on file. Link this animal "
            "to a species with a care sheet to see reminders.",
        )

    if last_fed_at is None:
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


@router.get(
    "/animals/{animal_id}/feeding-status",
    response_model=FeedingStatus,
)
async def animal_feeding_status(
    animal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return when this animal needs feeding next.

    Combines the species feeding cadence with the most recent ACCEPTED
    feeding. Brumating/aestivating animals get status='paused' so the
    dashboard doesn't nag.
    """
    animal = _get_owned_animal(db, animal_id, current_user)
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

    return _compute_feeding_status(
        last_fed_at=last_fed.fed_at if last_fed else None,
        interval_days_min=suggestion["interval_days_min"],
        interval_days_max=suggestion["interval_days_max"],
        brumation_active=bool(getattr(animal, "brumation_active", False)),
        feeding_paused_reason=getattr(animal, "feeding_paused_reason", None),
        feeding_paused_until=getattr(animal, "feeding_paused_until", None),
    )
