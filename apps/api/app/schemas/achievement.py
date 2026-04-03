"""
Achievement/Badge schemas
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import uuid


class AchievementResponse(BaseModel):
    """Single achievement (earned or unearned)"""
    id: uuid.UUID
    key: str
    name: str
    description: str
    icon: str
    category: str
    tier: str
    requirement_count: int
    earned_at: Optional[datetime] = None  # null means not yet earned

    class Config:
        from_attributes = True


class AchievementSummary(BaseModel):
    """User's achievement summary with recently earned badges"""
    total_available: int
    total_earned: int
    achievements: List[AchievementResponse]
    recently_earned: List[AchievementResponse]
