"""Weight log schemas

Pydantic schemas for standalone snake weigh-ins. Paired with the
WeightLog SQLAlchemy model and the wgt_20260422 migration.

Context is validated via regex pattern rather than a DB enum — see the
weight_log model docstring for why (enum-casing hell with shared DB
enum types).
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from decimal import Decimal
import uuid


# Keep in sync with WEIGHT_LOG_CONTEXTS in app.models.weight_log.
# Pydantic's regex pattern is the enforcement mechanism — it reads well
# in /docs and provides the 422 response at the edge.
_WEIGHT_LOG_CONTEXT_PATTERN = (
    r"^(routine|pre_feed|post_shed|pre_breeding|post_lay|other)$"
)


class WeightLogBase(BaseModel):
    """Base weight log schema — fields shared across create/update/response."""
    weighed_at: datetime
    weight_g: Decimal = Field(..., ge=0, le=999999.99)
    context: str = Field("routine", pattern=_WEIGHT_LOG_CONTEXT_PATTERN)
    notes: Optional[str] = None


class WeightLogCreate(WeightLogBase):
    """Schema for creating a weight log. `animal_id` is taken from the
    route, not the payload."""
    pass


class WeightLogUpdate(BaseModel):
    """All fields optional for PATCH-style updates."""
    weighed_at: Optional[datetime] = None
    weight_g: Optional[Decimal] = Field(None, ge=0, le=999999.99)
    context: Optional[str] = Field(None, pattern=_WEIGHT_LOG_CONTEXT_PATTERN)
    notes: Optional[str] = None


class WeightLogResponse(WeightLogBase):
    """Response schema includes server-managed fields.

    ADR-003 collapsed the per-taxon parent FKs into a single
    `animal_id` (NOT NULL).
    """
    id: uuid.UUID
    animal_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class WeightTrendPoint(BaseModel):
    """A single point on the weight chart — (date, grams) pair."""
    weighed_at: datetime
    weight_g: Decimal


class WeightTrendResponse(BaseModel):
    """Series + derived alerts for the snake-detail weight chart.

    `loss_pct_30d` is computed server-side from the two most recent data
    points within a 30-day window — positive = weight loss. `alert` is
    True when loss_pct_30d exceeds the species-level
    weight_loss_concern_pct_30d threshold (and the snake isn't
    brumating, which the server caller suppresses).
    """
    series: list[WeightTrendPoint]
    latest_weight_g: Optional[Decimal] = None
    loss_pct_30d: Optional[Decimal] = None
    alert: bool = False
    alert_threshold_pct: Optional[Decimal] = None


class PreySuggestion(BaseModel):
    """Suggested prey-weight range for the snake's current life stage.

    Returned by GET /snakes/{id}/prey-suggestion. The feeding form shows
    this as advisory text and soft-warns (not blocks) if the keeper
    enters a prey_weight_g outside [suggested_min_g, suggested_max_g]
    or above the power-feeding threshold.
    """
    stage: str  # hatchling | juvenile | subadult | adult | unknown
    snake_weight_g: Optional[Decimal] = None
    suggested_min_g: Optional[Decimal] = None
    suggested_max_g: Optional[Decimal] = None
    interval_days_min: Optional[int] = None
    interval_days_max: Optional[int] = None
    power_feeding_threshold_g: Optional[Decimal] = None
    # Populated when the species sheet lacks feeding-ratio data — UI
    # shows a "we don't have data for this species yet" banner.
    is_data_available: bool = True
    warning: Optional[str] = None


class FeedingStatus(BaseModel):
    """Smart feeding indicator — when does this animal need feeding next?

    Combines the species' interval_days_min/max (from life_stage_feeding
    + current weight) with the most recent ACCEPTED feeding to surface a
    "due / overdue / upcoming" status the mobile and web UIs can render
    as a colored banner.

    `status` semantics:
      - 'no_data'     : species has no interval data OR no weight to pick a stage
      - 'no_feedings' : the animal has no feeding history yet
      - 'paused'      : animal is currently in brumation — reminders silenced
      - 'upcoming'    : elapsed < interval_min  → "next feeding in N days"
      - 'due'         : interval_min <= elapsed <= interval_max → "feeding due"
      - 'overdue'     : elapsed > interval_max → "overdue by N days"

    `days_until_due` is the number of days until elapsed reaches
    interval_min. Negative means the lower bound has passed; large
    negative means we're past interval_max (overdue).

    Refusals do NOT reset the clock. We use the most recent ACCEPTED
    feeding for last_fed_at — same Brooke-on-EST class fix from
    `feedback_last_feeding_means_accepted.md`.
    """
    status: str  # no_data | no_feedings | paused | upcoming | due | overdue
    last_fed_at: Optional[datetime] = None
    interval_days_min: Optional[int] = None
    interval_days_max: Optional[int] = None
    next_feeding_due_at: Optional[datetime] = None
    next_feeding_overdue_at: Optional[datetime] = None
    days_until_due: Optional[int] = None
    is_data_available: bool = True
    note: Optional[str] = None
