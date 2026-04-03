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
