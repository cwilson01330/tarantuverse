"""Weight log routes — Herpetoverse Sprint 5

Standalone snake weigh-ins, independent of sheds. Shape mirrors the
sheds / molts router pattern:

  GET    /snakes/{snake_id}/weight-logs            — list, newest first
  GET    /snakes/{snake_id}/weight-logs/latest     — single most recent
  GET    /snakes/{snake_id}/weight-logs/trend      — series + 30d loss alert
  POST   /snakes/{snake_id}/weight-logs            — create, denormalizes current
  PUT    /weight-logs/{weight_log_id}              — partial update
  DELETE /weight-logs/{weight_log_id}              — remove

Plus the feeding-advisory endpoint for the snake feeding form:

  GET /snakes/{snake_id}/prey-suggestion          — species-based prey range

Side-effects on POST:
  - Denormalize `snakes.current_weight_g` to the new weight IF the
    weigh-in is the most recent one for the snake. This keeps the
    dashboard / species advisory reading a single column instead of
    scanning the full weight history every time. Older backfill
    entries don't regress the denormalized value.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.feeding_log import FeedingLog
from app.models.user import User
from app.models.snake import Snake
from app.models.lizard import Lizard
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

def _get_owned_snake(db: Session, snake_id: uuid.UUID, user: User) -> Snake:
    snake = (
        db.query(Snake)
        .filter(Snake.id == snake_id, Snake.user_id == user.id)
        .first()
    )
    if not snake:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Snake not found"
        )
    return snake


def _get_owned_lizard(db: Session, lizard_id: uuid.UUID, user: User) -> Lizard:
    lizard = (
        db.query(Lizard)
        .filter(Lizard.id == lizard_id, Lizard.user_id == user.id)
        .first()
    )
    if not lizard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lizard not found"
        )
    return lizard


def _get_owned_weight_log(
    db: Session, weight_log_id: uuid.UUID, user: User
) -> WeightLog:
    """Fetch a weight log and verify the owning animal belongs to the caller.

    Dispatches on snake_id vs lizard_id — weight_logs is polymorphic since
    Sprint 6c (Herpetoverse v1). Raises 404 for missing log, 403 for not-yours.
    """
    log = db.query(WeightLog).filter(WeightLog.id == weight_log_id).first()
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Weight log not found"
        )

    if log.snake_id:
        owner = (
            db.query(Snake)
            .filter(Snake.id == log.snake_id, Snake.user_id == user.id)
            .first()
        )
    else:
        owner = (
            db.query(Lizard)
            .filter(Lizard.id == log.lizard_id, Lizard.user_id == user.id)
            .first()
        )

    if not owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized"
        )
    return log


def _species_for_snake(db: Session, snake: Snake) -> ReptileSpecies | None:
    """Fetch the snake's species sheet if one is linked. None otherwise."""
    if snake.reptile_species_id is None:
        return None
    return (
        db.query(ReptileSpecies)
        .filter(ReptileSpecies.id == snake.reptile_species_id)
        .first()
    )


def _species_for_lizard(db: Session, lizard: Lizard) -> ReptileSpecies | None:
    """Fetch the lizard's species sheet if one is linked. None otherwise."""
    if lizard.reptile_species_id is None:
        return None
    return (
        db.query(ReptileSpecies)
        .filter(ReptileSpecies.id == lizard.reptile_species_id)
        .first()
    )


# ── Weight log CRUD ───────────────────────────────────────────────────

@router.get(
    "/snakes/{snake_id}/weight-logs",
    response_model=List[WeightLogResponse],
)
async def list_weight_logs(
    snake_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List weigh-ins for a snake, most recent first."""
    _get_owned_snake(db, snake_id, current_user)
    return (
        db.query(WeightLog)
        .filter(WeightLog.snake_id == snake_id)
        .order_by(WeightLog.weighed_at.desc())
        .all()
    )


@router.get(
    "/snakes/{snake_id}/weight-logs/latest",
    response_model=WeightLogResponse | None,
)
async def latest_weight_log(
    snake_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the most recent weigh-in, or null if the snake has none."""
    _get_owned_snake(db, snake_id, current_user)
    return (
        db.query(WeightLog)
        .filter(WeightLog.snake_id == snake_id)
        .order_by(WeightLog.weighed_at.desc())
        .first()
    )


@router.get(
    "/snakes/{snake_id}/weight-logs/trend",
    response_model=WeightTrendResponse,
)
async def weight_trend(
    snake_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the full weight series + a 30-day loss alert.

    Alert suppression: if the snake is currently brumating, don't flag
    weight loss — it's expected behavior. (Breeding weight loss is
    also expected but we don't model a breeding flag yet.)
    """
    snake = _get_owned_snake(db, snake_id, current_user)
    species = _species_for_snake(db, snake)

    logs = (
        db.query(WeightLog)
        .filter(WeightLog.snake_id == snake_id)
        .order_by(WeightLog.weighed_at.asc())
        .all()
    )

    series = [
        WeightTrendPoint(weighed_at=l.weighed_at, weight_g=l.weight_g)
        for l in logs
    ]
    latest_weight = logs[-1].weight_g if logs else None

    loss_pct = compute_weight_loss_30d((l.weighed_at, l.weight_g) for l in logs)

    # Decide whether to surface an alert. Need all three: a computed
    # loss, a species threshold, and no brumation-suppression reason.
    alert_threshold = species.weight_loss_concern_pct_30d if species else None
    alert = False
    if (
        loss_pct is not None
        and loss_pct > 0  # positive = lost weight
        and alert_threshold is not None
        and loss_pct >= alert_threshold
        and not snake.brumation_active
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
    "/snakes/{snake_id}/weight-logs",
    response_model=WeightLogResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_weight_log(
    snake_id: uuid.UUID,
    payload: WeightLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a weigh-in for a snake.

    Denormalizes `snakes.current_weight_g` when the new entry is the
    most recent one for the snake. Backfilling older weights leaves
    the current-weight hint untouched.
    """
    snake = _get_owned_snake(db, snake_id, current_user)

    new_log = WeightLog(snake_id=snake_id, **payload.model_dump())
    db.add(new_log)
    db.flush()  # so new_log.weighed_at is populated before comparison

    # Denormalize current_weight_g only if this is the newest entry.
    # Compare against the max weighed_at we know about (including the
    # one we just inserted).
    latest_existing = (
        db.query(func.max(WeightLog.weighed_at))
        .filter(
            WeightLog.snake_id == snake_id,
            WeightLog.id != new_log.id,
        )
        .scalar()
    )
    if latest_existing is None or new_log.weighed_at >= latest_existing:
        snake.current_weight_g = new_log.weight_g

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
    """Fetch a single weight log by id. Used by the mobile + web edit forms
    to pre-fill fields. Ownership checked via owning snake or lizard.
    """
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
    """Partial update. Ownership checked via owning snake.

    Does NOT recompute `snakes.current_weight_g` — editing a historical
    weight is rare and the denormalized hint can be resynced by the
    next POST. Keeps this endpoint fast and predictable.
    """
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
    """Delete a weigh-in. Does NOT recompute snake.current_weight_g —
    same rationale as update_weight_log. The next POST will resync.
    """
    log = _get_owned_weight_log(db, weight_log_id, current_user)
    db.delete(log)
    db.commit()
    return None


# ── Feeding advisory ──────────────────────────────────────────────────

@router.get(
    "/snakes/{snake_id}/prey-suggestion",
    response_model=PreySuggestion,
)
async def prey_suggestion(
    snake_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the suggested prey weight range for this snake.

    Uses the most-recent weigh-in from weight_logs if available,
    falling back to the denormalized `snakes.current_weight_g`. If
    neither exists OR the species has no life_stage_feeding data,
    returns `is_data_available=false` and the UI shows an explanation.
    """
    snake = _get_owned_snake(db, snake_id, current_user)
    species = _species_for_snake(db, snake)

    # Latest weigh-in > denormalized snake.current_weight_g > None
    latest_log = (
        db.query(WeightLog)
        .filter(WeightLog.snake_id == snake_id)
        .order_by(WeightLog.weighed_at.desc())
        .first()
    )
    snake_weight = (
        latest_log.weight_g if latest_log is not None else snake.current_weight_g
    )

    life_stage_feeding = species.life_stage_feeding if species else None
    suggestion = suggest_prey_range(snake_weight, life_stage_feeding)

    # Power-feeding threshold as a concrete gram value for the UI to
    # display alongside the range. Null-safe.
    power_threshold_g = None
    if (
        species is not None
        and species.power_feeding_threshold_pct is not None
        and snake_weight is not None
    ):
        from decimal import Decimal as _Dec
        power_threshold_g = (
            snake_weight * species.power_feeding_threshold_pct / _Dec("100")
        ).quantize(_Dec("0.01"))

    warning = None
    if not suggestion["is_data_available"]:
        if snake_weight is None:
            warning = (
                "Log a weigh-in for this snake to see species-specific "
                "prey recommendations."
            )
        elif species is None:
            warning = (
                "Link this snake to a species from the care sheet "
                "database to see feeding recommendations."
            )
        else:
            warning = (
                "Feeding ratio data for this species hasn't been "
                "published yet. We'll add it as we verify sources."
            )

    return PreySuggestion(
        stage=suggestion["stage"],
        snake_weight_g=snake_weight,
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
# weight) with the most recent ACCEPTED feeding. Mobile renders this as
# a colored pill on the detail screen; web will follow.

def _last_accepted_feeding(
    db: Session,
    *,
    snake_id: Optional[uuid.UUID] = None,
    lizard_id: Optional[uuid.UUID] = None,
) -> Optional[FeedingLog]:
    """Return the most recent ACCEPTED feeding for the given animal.

    Refusals don't reset the clock — surfacing "fed today" after a
    refused feeding read as broken to keepers (memory:
    feedback_last_feeding_means_accepted.md).
    """
    q = db.query(FeedingLog).filter(FeedingLog.accepted == True)  # noqa: E712
    if snake_id is not None:
        q = q.filter(FeedingLog.snake_id == snake_id)
    elif lizard_id is not None:
        q = q.filter(FeedingLog.lizard_id == lizard_id)
    else:
        return None
    return q.order_by(FeedingLog.fed_at.desc()).first()


def _compute_feeding_status(
    *,
    last_fed_at: Optional[datetime],
    interval_days_min: Optional[int],
    interval_days_max: Optional[int],
    brumation_active: bool = False,
) -> FeedingStatus:
    """Pure function — combines inputs into the canonical FeedingStatus.

    Kept off ORM session so it's easy to unit-test later. UTC math is
    fine for "due in N days" precision; we don't need TZ correctness
    here the way we do for "last fed N days ago" since this number is
    advisory, not a stat the keeper reports as "off by a day."
    """
    # Brumation overrides everything — the keeper has decided not to
    # feed. Show a neutral "paused" state instead of escalating to
    # overdue.
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
    # Normalize naive datetimes coming back from SQLAlchemy as UTC.
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
    "/snakes/{snake_id}/feeding-status",
    response_model=FeedingStatus,
)
async def snake_feeding_status(
    snake_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return when this snake needs feeding next.

    Combines the species feeding cadence (from prey-suggestion math)
    with the most recent ACCEPTED feeding. Brumation-active snakes
    get status='paused' so the dashboard doesn't nag.
    """
    snake = _get_owned_snake(db, snake_id, current_user)
    species = _species_for_snake(db, snake)

    latest_log = (
        db.query(WeightLog)
        .filter(WeightLog.snake_id == snake_id)
        .order_by(WeightLog.weighed_at.desc())
        .first()
    )
    snake_weight = (
        latest_log.weight_g if latest_log is not None else snake.current_weight_g
    )
    life_stage_feeding = species.life_stage_feeding if species else None
    suggestion = suggest_prey_range(snake_weight, life_stage_feeding)

    last_fed = _last_accepted_feeding(db, snake_id=snake_id)

    return _compute_feeding_status(
        last_fed_at=last_fed.fed_at if last_fed else None,
        interval_days_min=suggestion["interval_days_min"],
        interval_days_max=suggestion["interval_days_max"],
        brumation_active=bool(getattr(snake, "brumation_active", False)),
    )


# ─────────────────────────── Lizard parents ───────────────────────────
#
# Mirror of the snake block. Shape identical — the weight series, trend,
# and prey-suggestion logic are species-agnostic and reuse the same
# services in app.services.snake_feeding_advisory. The module name says
# "snake" for historical reasons but the math is just grams + stage
# ratios; it applies just as well to lizards.

@router.get(
    "/lizards/{lizard_id}/weight-logs",
    response_model=List[WeightLogResponse],
)
async def list_lizard_weight_logs(
    lizard_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List weigh-ins for a lizard, most recent first."""
    _get_owned_lizard(db, lizard_id, current_user)
    return (
        db.query(WeightLog)
        .filter(WeightLog.lizard_id == lizard_id)
        .order_by(WeightLog.weighed_at.desc())
        .all()
    )


@router.get(
    "/lizards/{lizard_id}/weight-logs/latest",
    response_model=WeightLogResponse | None,
)
async def latest_lizard_weight_log(
    lizard_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the most recent weigh-in, or null if the lizard has none."""
    _get_owned_lizard(db, lizard_id, current_user)
    return (
        db.query(WeightLog)
        .filter(WeightLog.lizard_id == lizard_id)
        .order_by(WeightLog.weighed_at.desc())
        .first()
    )


@router.get(
    "/lizards/{lizard_id}/weight-logs/trend",
    response_model=WeightTrendResponse,
)
async def lizard_weight_trend(
    lizard_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the full weight series + a 30-day loss alert for a lizard.

    Brumation suppression applies here too — e.g., bearded dragons and
    temperate geckos genuinely drop weight during brumation and that's
    not a health concern.
    """
    lizard = _get_owned_lizard(db, lizard_id, current_user)
    species = _species_for_lizard(db, lizard)

    logs = (
        db.query(WeightLog)
        .filter(WeightLog.lizard_id == lizard_id)
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
        and loss_pct > 0
        and alert_threshold is not None
        and loss_pct >= alert_threshold
        and not lizard.brumation_active
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
    "/lizards/{lizard_id}/weight-logs",
    response_model=WeightLogResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_lizard_weight_log(
    lizard_id: uuid.UUID,
    payload: WeightLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a weigh-in for a lizard.

    Same denormalization rule as the snake route: only move
    `lizards.current_weight_g` forward when this weigh-in is the newest,
    so backfilling history doesn't stomp the dashboard hint.
    """
    lizard = _get_owned_lizard(db, lizard_id, current_user)

    new_log = WeightLog(lizard_id=lizard_id, **payload.model_dump())
    db.add(new_log)
    db.flush()

    latest_existing = (
        db.query(func.max(WeightLog.weighed_at))
        .filter(
            WeightLog.lizard_id == lizard_id,
            WeightLog.id != new_log.id,
        )
        .scalar()
    )
    if latest_existing is None or new_log.weighed_at >= latest_existing:
        lizard.current_weight_g = new_log.weight_g

    db.commit()
    db.refresh(new_log)
    return new_log


@router.get(
    "/lizards/{lizard_id}/prey-suggestion",
    response_model=PreySuggestion,
)
async def lizard_prey_suggestion(
    lizard_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the suggested prey weight range for a lizard.

    Mirrors the snake advisory. Lizards that are obligate insectivores
    (crested geckos, leopard geckos) will get species sheets whose
    life_stage_feeding describes prey count rather than prey grams —
    the UI is expected to adapt its presentation based on the species'
    feeding_unit hint. The backend math here is unit-neutral: it just
    passes the numbers the species sheet provides.
    """
    lizard = _get_owned_lizard(db, lizard_id, current_user)
    species = _species_for_lizard(db, lizard)

    latest_log = (
        db.query(WeightLog)
        .filter(WeightLog.lizard_id == lizard_id)
        .order_by(WeightLog.weighed_at.desc())
        .first()
    )
    lizard_weight = (
        latest_log.weight_g if latest_log is not None else lizard.current_weight_g
    )

    life_stage_feeding = species.life_stage_feeding if species else None
    suggestion = suggest_prey_range(lizard_weight, life_stage_feeding)

    power_threshold_g = None
    if (
        species is not None
        and species.power_feeding_threshold_pct is not None
        and lizard_weight is not None
    ):
        from decimal import Decimal as _Dec
        power_threshold_g = (
            lizard_weight * species.power_feeding_threshold_pct / _Dec("100")
        ).quantize(_Dec("0.01"))

    warning = None
    if not suggestion["is_data_available"]:
        if lizard_weight is None:
            warning = (
                "Log a weigh-in for this lizard to see species-specific "
                "feeding recommendations."
            )
        elif species is None:
            warning = (
                "Link this lizard to a species from the care sheet "
                "database to see feeding recommendations."
            )
        else:
            warning = (
                "Feeding ratio data for this species hasn't been "
                "published yet. We'll add it as we verify sources."
            )

    return PreySuggestion(
        stage=suggestion["stage"],
        snake_weight_g=lizard_weight,  # schema field name is snake-legacy; value is the lizard's weight
        suggested_min_g=suggestion["suggested_min_g"],
        suggested_max_g=suggestion["suggested_max_g"],
        interval_days_min=suggestion["interval_days_min"],
        interval_days_max=suggestion["interval_days_max"],
        power_feeding_threshold_g=power_threshold_g,
        is_data_available=suggestion["is_data_available"],
        warning=warning,
    )


@router.get(
    "/lizards/{lizard_id}/feeding-status",
    response_model=FeedingStatus,
)
async def lizard_feeding_status(
    lizard_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return when this lizard needs feeding next.

    Mirror of /snakes/{id}/feeding-status. Lizards typically feed more
    often than snakes (every 1-3 days for most insectivorous geckos),
    so the species cadence carries the difference; the math here is
    species-agnostic.
    """
    lizard = _get_owned_lizard(db, lizard_id, current_user)
    species = _species_for_lizard(db, lizard)

    latest_log = (
        db.query(WeightLog)
        .filter(WeightLog.lizard_id == lizard_id)
        .order_by(WeightLog.weighed_at.desc())
        .first()
    )
    lizard_weight = (
        latest_log.weight_g if latest_log is not None else lizard.current_weight_g
    )
    life_stage_feeding = species.life_stage_feeding if species else None
    suggestion = suggest_prey_range(lizard_weight, life_stage_feeding)

    last_fed = _last_accepted_feeding(db, lizard_id=lizard_id)

    return _compute_feeding_status(
        last_fed_at=last_fed.fed_at if last_fed else None,
        interval_days_min=suggestion["interval_days_min"],
        interval_days_max=suggestion["interval_days_max"],
        brumation_active=bool(getattr(lizard, "brumation_active", False)),
    )
