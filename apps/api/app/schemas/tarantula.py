"""
Tarantula schemas
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
from decimal import Decimal
import uuid


class TarantulaBase(BaseModel):
    """Base tarantula schema with common fields"""
    name: Optional[str] = Field(None, max_length=100)
    common_name: Optional[str] = Field(None, max_length=100)
    scientific_name: Optional[str] = Field(None, max_length=255)
    sex: Optional[str] = Field(None, pattern="^(male|female|unknown)$")
    date_acquired: Optional[date] = None
    source: Optional[str] = Field(None, pattern="^(bred|bought|wild_caught)$")
    price_paid: Optional[Decimal] = None
    enclosure_size: Optional[str] = Field(None, max_length=50)
    substrate_type: Optional[str] = Field(None, max_length=100)
    is_public: bool = False
    notes: Optional[str] = None


class TarantulaCreate(TarantulaBase):
    """Schema for creating a new tarantula"""
    species_id: Optional[uuid.UUID] = None


class TarantulaUpdate(TarantulaBase):
    """Schema for updating a tarantula (all fields optional)"""
    species_id: Optional[uuid.UUID] = None


class TarantulaResponse(TarantulaBase):
    """Schema for tarantula response"""
    id: uuid.UUID
    user_id: uuid.UUID
    species_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
