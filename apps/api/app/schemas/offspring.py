"""
Offspring schemas
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
from decimal import Decimal
import uuid
from app.models.offspring import OffspringStatus


class OffspringBase(BaseModel):
    """Base offspring schema"""
    egg_sac_id: uuid.UUID
    tarantula_id: Optional[uuid.UUID] = None
    status: OffspringStatus = OffspringStatus.UNKNOWN
    status_date: Optional[date] = None
    buyer_info: Optional[str] = None
    price_sold: Optional[Decimal] = Field(None, ge=0, le=99999999.99)
    notes: Optional[str] = None


class OffspringCreate(OffspringBase):
    """Schema for creating a new offspring record"""
    pass


class OffspringUpdate(BaseModel):
    """Schema for updating an offspring record (all fields optional)"""
    egg_sac_id: Optional[uuid.UUID] = None
    tarantula_id: Optional[uuid.UUID] = None
    status: Optional[OffspringStatus] = None
    status_date: Optional[date] = None
    buyer_info: Optional[str] = None
    price_sold: Optional[Decimal] = None
    notes: Optional[str] = None


class OffspringResponse(OffspringBase):
    """Schema for offspring response"""
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: date

    class Config:
        from_attributes = True
