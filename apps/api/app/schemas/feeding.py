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
    quantity: int = 1  # For group feedings: "fed 8 roaches"
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
    quantity: Optional[int] = None
    accepted: Optional[bool] = None
    notes: Optional[str] = None


class FeedingLogResponse(FeedingLogBase):
    """Schema for feeding log response"""
    id: uuid.UUID
    tarantula_id: Optional[uuid.UUID] = None  # Now optional - can be enclosure-level
    enclosure_id: Optional[uuid.UUID] = None  # For enclosure-level feedings
    created_at: datetime

    class Config:
        from_attributes = True
