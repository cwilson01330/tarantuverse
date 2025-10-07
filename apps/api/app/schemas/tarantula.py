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

    # Husbandry
    enclosure_type: Optional[str] = Field(None, pattern="^(terrestrial|arboreal|fossorial)$")
    enclosure_size: Optional[str] = Field(None, max_length=50)
    substrate_type: Optional[str] = Field(None, max_length=100)
    substrate_depth: Optional[str] = Field(None, max_length=50)
    last_substrate_change: Optional[date] = None
    target_temp_min: Optional[Decimal] = None
    target_temp_max: Optional[Decimal] = None
    target_humidity_min: Optional[Decimal] = None
    target_humidity_max: Optional[Decimal] = None
    water_dish: Optional[bool] = True
    misting_schedule: Optional[str] = Field(None, max_length=100)
    last_enclosure_cleaning: Optional[date] = None
    enclosure_notes: Optional[str] = None

    photo_url: Optional[str] = Field(None, max_length=500)
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


class GrowthDataPoint(BaseModel):
    """Single growth measurement point"""
    date: datetime
    weight: Optional[Decimal] = None
    leg_span: Optional[Decimal] = None
    days_since_previous: Optional[int] = None
    weight_change: Optional[Decimal] = None
    leg_span_change: Optional[Decimal] = None
    
    class Config:
        from_attributes = True


class GrowthAnalytics(BaseModel):
    """Growth analytics for a tarantula"""
    tarantula_id: uuid.UUID
    data_points: list[GrowthDataPoint]
    total_molts: int
    average_days_between_molts: Optional[float] = None
    total_weight_gain: Optional[Decimal] = None
    total_leg_span_gain: Optional[Decimal] = None
    growth_rate_weight: Optional[Decimal] = None  # grams per month
    growth_rate_leg_span: Optional[Decimal] = None  # cm per month
    last_molt_date: Optional[datetime] = None
    days_since_last_molt: Optional[int] = None
    
    class Config:
        from_attributes = True
