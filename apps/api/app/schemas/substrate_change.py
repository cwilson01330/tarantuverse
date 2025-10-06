"""
Substrate change schemas
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
import uuid


class SubstrateChangeBase(BaseModel):
    """Base substrate change schema"""
    changed_at: date
    substrate_type: Optional[str] = Field(None, max_length=100)
    substrate_depth: Optional[str] = Field(None, max_length=50)
    reason: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None


class SubstrateChangeCreate(SubstrateChangeBase):
    """Schema for creating a substrate change log"""
    pass


class SubstrateChangeUpdate(BaseModel):
    """Schema for updating a substrate change log (all fields optional)"""
    changed_at: Optional[date] = None
    substrate_type: Optional[str] = None
    substrate_depth: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None


class SubstrateChangeResponse(SubstrateChangeBase):
    """Schema for substrate change response"""
    id: uuid.UUID
    tarantula_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True
