"""
Feeding log schemas
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid


class FeedingLogBase(BaseModel):
    """Base feeding log schema"""
    fed_at: datetime
    food_type: Optional[str] = None
    food_size: Optional[str] = None
    accepted: bool = True
    notes: Optional[str] = None


class FeedingLogCreate(FeedingLogBase):
    """Schema for creating a new feeding log"""
    pass


class FeedingLogUpdate(BaseModel):
    """Schema for updating a feeding log (all fields optional)"""
    fed_at: Optional[datetime] = None
    food_type: Optional[str] = None
    food_size: Optional[str] = None
    accepted: Optional[bool] = None
    notes: Optional[str] = None


class FeedingLogResponse(FeedingLogBase):
    """Schema for feeding log response"""
    id: uuid.UUID
    tarantula_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True
