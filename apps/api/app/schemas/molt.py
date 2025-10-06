"""
Molt log schemas
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from decimal import Decimal
import uuid


class MoltLogBase(BaseModel):
    """Base molt log schema"""
    molted_at: datetime
    premolt_started_at: Optional[datetime] = None
    leg_span_before: Optional[Decimal] = Field(None, ge=0, le=999.99)
    leg_span_after: Optional[Decimal] = Field(None, ge=0, le=999.99)
    weight_before: Optional[Decimal] = Field(None, ge=0, le=9999.99)
    weight_after: Optional[Decimal] = Field(None, ge=0, le=9999.99)
    notes: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=500)


class MoltLogCreate(MoltLogBase):
    """Schema for creating a molt log"""
    pass


class MoltLogUpdate(BaseModel):
    """Schema for updating a molt log (all fields optional)"""
    molted_at: Optional[datetime] = None
    premolt_started_at: Optional[datetime] = None
    leg_span_before: Optional[Decimal] = None
    leg_span_after: Optional[Decimal] = None
    weight_before: Optional[Decimal] = None
    weight_after: Optional[Decimal] = None
    notes: Optional[str] = None
    image_url: Optional[str] = None


class MoltLogResponse(MoltLogBase):
    """Schema for molt log response"""
    id: uuid.UUID
    tarantula_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True
