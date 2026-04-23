"""
Feeding log schemas
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from decimal import Decimal
import uuid


class FeedingLogBase(BaseModel):
    """Base feeding log schema"""
    fed_at: datetime
    food_type: Optional[str] = None
    food_size: Optional[str] = None
    quantity: int = 1  # For group feedings: "fed 8 roaches"
    accepted: bool = True
    # Snake-only: grams of prey. Populating this enables the prey-to-
    # body-weight ratio advisory on the feeding form. Nullable because
    # tarantula feedings never set it and snake keepers may not weigh.
    prey_weight_g: Optional[Decimal] = Field(None, ge=0, le=999999.99)
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
    prey_weight_g: Optional[Decimal] = Field(None, ge=0, le=999999.99)
    notes: Optional[str] = None


class FeedingLogResponse(FeedingLogBase):
    """Schema for feeding log response.

    Polymorphic parent — exactly one of tarantula_id / snake_id /
    lizard_id / enclosure_id is populated. All Optional so Pydantic
    serializes any variant without a 500.
    """
    id: uuid.UUID
    tarantula_id: Optional[uuid.UUID] = None  # Now optional - can be enclosure-level
    enclosure_id: Optional[uuid.UUID] = None  # For enclosure-level feedings
    snake_id: Optional[uuid.UUID] = None  # Herpetoverse v1
    lizard_id: Optional[uuid.UUID] = None  # Herpetoverse v1 — lizard parity
    created_at: datetime

    class Config:
        from_attributes = True
