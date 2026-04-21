"""Shed log schemas

Mirrors MoltLog pydantic structure. Snake-specific fields: `in_blue_started_at`
(pre-shed opaque phase), `is_complete_shed` / `has_retained_shed` (husbandry
quality signals), weight/length in real units instead of leg span.
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from decimal import Decimal
import uuid


class ShedLogBase(BaseModel):
    """Base shed log schema — fields shared across create/update/response."""
    shed_at: datetime
    in_blue_started_at: Optional[datetime] = None

    weight_before_g: Optional[Decimal] = Field(None, ge=0, le=999999.99)
    weight_after_g: Optional[Decimal] = Field(None, ge=0, le=999999.99)
    length_before_in: Optional[Decimal] = Field(None, ge=0, le=9999.99)
    length_after_in: Optional[Decimal] = Field(None, ge=0, le=9999.99)

    is_complete_shed: bool = True
    has_retained_shed: bool = False
    retained_shed_notes: Optional[str] = None

    notes: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=500)


class ShedLogCreate(ShedLogBase):
    """Schema for creating a shed log. `snake_id` is taken from the route,
    not the payload."""
    pass


class ShedLogUpdate(BaseModel):
    """All fields optional for PATCH-style updates."""
    shed_at: Optional[datetime] = None
    in_blue_started_at: Optional[datetime] = None
    weight_before_g: Optional[Decimal] = None
    weight_after_g: Optional[Decimal] = None
    length_before_in: Optional[Decimal] = None
    length_after_in: Optional[Decimal] = None
    is_complete_shed: Optional[bool] = None
    has_retained_shed: Optional[bool] = None
    retained_shed_notes: Optional[str] = None
    notes: Optional[str] = None
    image_url: Optional[str] = None


class ShedLogResponse(ShedLogBase):
    """Response schema includes server-managed fields."""
    id: uuid.UUID
    snake_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True
