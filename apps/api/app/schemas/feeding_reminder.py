"""
Feeding reminder schemas
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from uuid import UUID


class FeedingReminderResponse(BaseModel):
    """Individual tarantula feeding reminder"""
    tarantula_id: UUID
    tarantula_name: str
    species_name: Optional[str] = None
    last_fed_at: Optional[datetime] = None
    recommended_interval_days: int
    next_feeding_due: Optional[datetime] = None
    is_overdue: bool
    days_difference: int  # positive = days overdue, negative = days until due
    status: str  # "overdue", "due_today", "due_soon", "on_track", "never_fed"

    class Config:
        from_attributes = True


class FeedingReminderSummary(BaseModel):
    """Summary of all feeding reminders for the user"""
    total_tarantulas: int
    overdue_count: int
    due_today_count: int
    due_soon_count: int
    on_track_count: int
    never_fed_count: int
    reminders: list[FeedingReminderResponse]

    class Config:
        from_attributes = True
