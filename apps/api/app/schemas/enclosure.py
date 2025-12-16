"""
Enclosure schemas for communal and solo tarantula setups
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
from decimal import Decimal
import uuid


class EnclosureBase(BaseModel):
    """Base enclosure schema with common fields"""
    name: str = Field(..., max_length=100)
    is_communal: bool = False
    population_count: Optional[int] = None

    # Enclosure properties
    enclosure_type: Optional[str] = Field(None, pattern="^(terrestrial|arboreal|fossorial)$")
    enclosure_size: Optional[str] = Field(None, max_length=50)
    substrate_type: Optional[str] = Field(None, max_length=100)
    substrate_depth: Optional[str] = Field(None, max_length=50)
    target_temp_min: Optional[Decimal] = None
    target_temp_max: Optional[Decimal] = None
    target_humidity_min: Optional[Decimal] = None
    target_humidity_max: Optional[Decimal] = None
    water_dish: bool = True
    misting_schedule: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    photo_url: Optional[str] = Field(None, max_length=500)


class EnclosureCreate(EnclosureBase):
    """Schema for creating a new enclosure"""
    species_id: Optional[uuid.UUID] = None


class EnclosureUpdate(BaseModel):
    """Schema for updating an enclosure (all fields optional)"""
    name: Optional[str] = Field(None, max_length=100)
    is_communal: Optional[bool] = None
    species_id: Optional[uuid.UUID] = None
    population_count: Optional[int] = None
    enclosure_type: Optional[str] = Field(None, pattern="^(terrestrial|arboreal|fossorial)$")
    enclosure_size: Optional[str] = Field(None, max_length=50)
    substrate_type: Optional[str] = Field(None, max_length=100)
    substrate_depth: Optional[str] = Field(None, max_length=50)
    target_temp_min: Optional[Decimal] = None
    target_temp_max: Optional[Decimal] = None
    target_humidity_min: Optional[Decimal] = None
    target_humidity_max: Optional[Decimal] = None
    water_dish: Optional[bool] = None
    misting_schedule: Optional[str] = Field(None, max_length=100)
    last_enclosure_cleaning: Optional[date] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = Field(None, max_length=500)


class EnclosureResponse(EnclosureBase):
    """Schema for enclosure response"""
    id: uuid.UUID
    user_id: uuid.UUID
    species_id: Optional[uuid.UUID] = None
    last_substrate_change: Optional[date] = None
    last_enclosure_cleaning: Optional[date] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Computed fields (added in router)
    inhabitant_count: int = 0
    species_name: Optional[str] = None
    days_since_last_feeding: Optional[int] = None

    class Config:
        from_attributes = True


class EnclosureListResponse(BaseModel):
    """Schema for enclosure list item (lighter weight)"""
    id: uuid.UUID
    name: str
    is_communal: bool
    population_count: Optional[int] = None
    species_name: Optional[str] = None
    inhabitant_count: int = 0
    days_since_last_feeding: Optional[int] = None
    photo_url: Optional[str] = None
    enclosure_type: Optional[str] = None

    class Config:
        from_attributes = True


class InhabitantInfo(BaseModel):
    """Basic info about a tarantula in an enclosure"""
    id: uuid.UUID
    name: Optional[str] = None
    scientific_name: Optional[str] = None
    sex: Optional[str] = None
    photo_url: Optional[str] = None

    class Config:
        from_attributes = True
