"""
Schemas for premolt prediction endpoints
"""
from typing import List, Literal, Optional
from datetime import date
from pydantic import BaseModel
import uuid


class PremoltPrediction(BaseModel):
    """Premolt prediction for one animal (any taxon since premolt v2).

    `tarantula_id` / `tarantula_name` keep their names for app versions that
    predate premolt v2; they carry the invert's id and display name."""
    tarantula_id: str
    tarantula_name: str
    is_premolt_likely: bool
    confidence: str  # "high", "medium", or "low"
    days_since_last_molt: Optional[int] = None
    average_molt_interval: Optional[float] = None
    molt_interval_progress: Optional[float] = None  # Percentage (0-100+)
    recent_refusal_streak: int
    refusal_rate_last_30_days: Optional[float] = None  # Percentage
    estimated_molt_window_days: Optional[float] = None
    data_quality: str  # "good", "fair", or "insufficient"
    # Maturity (ult_20260911). `has_matured` means an ultimate molt is on
    # record — the animal will not molt again, and is_premolt_likely is forced
    # False regardless of refusals or elapsed time.
    #
    # ELAPSED ONLY. There is deliberately no "days remaining" here and there
    # should never be one: species.lifespan_male is populated on 3 of 197
    # rows, so any countdown would be fabricated for almost the whole catalog.
    has_matured: bool = False
    matured_at: Optional[str] = None  # ISO date
    days_since_matured: Optional[int] = None
    last_molt_date: Optional[str] = None  # ISO format date string
    last_feeding_date: Optional[str] = None  # ISO format date string
    feeding_count: int
    molt_count: int

    # Premolt v2 (spec 2026-11-17 §4). Server-built; clients only render.
    invert_id: Optional[str] = None
    taxon: Optional[str] = None
    eligible: bool = False
    ineligible_reason: Optional[str] = None  # "closed" | "grazer" | "matured"
    branch: str = "none"  # refusals | refusals_interval | overdue | fasting | none
    # Local days since the fasting clock started: the later of the last
    # accepted meal and the newest molt + its post-molt window.
    days_fasting: Optional[int] = None
    usual_gap_days: Optional[float] = None
    reason: Optional[str] = None  # one plain sentence for the card
    keeper_answer: Optional[str] = None  # open episode's answer: "yes" | "not_yet"
    premolt_snoozed_until: Optional[str] = None  # ISO date
    paused_for_premolt: bool = False
    # Feeding-paused for a reason other than premolt (rehoused, ...): fasting
    # can't fire and the answer buttons are hidden (the route refuses), so
    # "Yes" can't overwrite the keeper's reason.
    paused_other: bool = False
    # eligible AND likely AND not paused for premolt AND not snoozed.
    show_alert: bool = False

    class Config:
        from_attributes = True


class PremoltSummary(BaseModel):
    """Summary of premolt predictions for a collection.

    `total_tarantulas` is kept for old app versions; it equals
    `total_animals` (the number of animals in `predictions`).
    `premolt_likely_count` counts animals whose alert shows."""
    total_tarantulas: int
    total_animals: int = 0
    premolt_likely_count: int
    predictions: List[PremoltPrediction]

    class Config:
        from_attributes = True


class PremoltAnswerIn(BaseModel):
    """The keeper's answer from the premolt card (premolt v2 §5).

    "yes" = "Yes, pause feeding" (an open-ended premolt feeding pause);
    "not_yet" = "Not yet" (hides the alert for 14 days)."""
    answer: Literal["yes", "not_yet"]
