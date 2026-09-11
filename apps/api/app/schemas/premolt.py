"""
Schemas for premolt prediction endpoints
"""
from typing import List, Optional
from datetime import date
from pydantic import BaseModel
import uuid


class PremoltPrediction(BaseModel):
    """Premolt prediction for a single tarantula"""
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

    class Config:
        from_attributes = True


class PremoltSummary(BaseModel):
    """Summary of premolt predictions for user's collection"""
    total_tarantulas: int
    premolt_likely_count: int
    predictions: List[PremoltPrediction]

    class Config:
        from_attributes = True
