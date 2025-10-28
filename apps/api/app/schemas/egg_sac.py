"""
Egg sac schemas
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
import uuid


class EggSacBase(BaseModel):
    """Base egg sac schema"""
    pairing_id: uuid.UUID
    laid_date: date
    pulled_date: Optional[date] = None
    hatch_date: Optional[date] = None
    incubation_temp_min: Optional[int] = Field(None, ge=0, le=200)
    incubation_temp_max: Optional[int] = Field(None, ge=0, le=200)
    incubation_humidity_min: Optional[int] = Field(None, ge=0, le=100)
    incubation_humidity_max: Optional[int] = Field(None, ge=0, le=100)
    spiderling_count: Optional[int] = Field(None, ge=0)
    viable_count: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = None
    photo_url: Optional[str] = Field(None, max_length=500)


class EggSacCreate(EggSacBase):
    """Schema for creating a new egg sac"""
    pass


class EggSacUpdate(BaseModel):
    """Schema for updating an egg sac (all fields optional)"""
    pairing_id: Optional[uuid.UUID] = None
    laid_date: Optional[date] = None
    pulled_date: Optional[date] = None
    hatch_date: Optional[date] = None
    incubation_temp_min: Optional[int] = None
    incubation_temp_max: Optional[int] = None
    incubation_humidity_min: Optional[int] = None
    incubation_humidity_max: Optional[int] = None
    spiderling_count: Optional[int] = None
    viable_count: Optional[int] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = None


class EggSacResponse(EggSacBase):
    """Schema for egg sac response"""
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: date

    class Config:
        from_attributes = True
