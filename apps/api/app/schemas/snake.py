"""Snake schemas

Parallel to TarantulaBase/Create/Update/Response but with snake-appropriate
fields. Note what's NOT here that IS in tarantula: no substrate_depth,
substrate_type, misting_schedule, webbing, urticating hairs. Those are
tarantula concepts.
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
from decimal import Decimal
import uuid


class SnakeBase(BaseModel):
    """Fields a keeper can set when creating/updating a snake."""
    name: Optional[str] = Field(None, max_length=100)
    common_name: Optional[str] = Field(None, max_length=100)
    scientific_name: Optional[str] = Field(None, max_length=255)
    sex: Optional[str] = Field(None, pattern="^(male|female|unknown)$")

    # Acquisition
    date_acquired: Optional[date] = None
    hatch_date: Optional[date] = None
    source: Optional[str] = Field(None, pattern="^(bred|bought|wild_caught)$")
    source_breeder: Optional[str] = Field(None, max_length=255)
    price_paid: Optional[Decimal] = None

    # Current state
    current_weight_g: Optional[Decimal] = None
    current_length_in: Optional[Decimal] = None

    # Husbandry reference
    feeding_schedule: Optional[str] = Field(None, max_length=200)
    brumation_active: bool = False
    brumation_started_at: Optional[date] = None

    # Media
    photo_url: Optional[str] = Field(None, max_length=500)

    # Privacy
    is_public: bool = False
    visibility: Optional[str] = Field(None, pattern="^(private|public)$")

    # Notes
    notes: Optional[str] = None


class SnakeCreate(SnakeBase):
    """Schema for creating a new snake."""
    reptile_species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None


class SnakeUpdate(SnakeBase):
    """Schema for updating a snake. Inherits all-optional from SnakeBase."""
    # All fields optional — override required scientific_name? It was already Optional.
    reptile_species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None
    # Denormalized timestamps are typically updated by the app from feeding /
    # shed log inserts, but allow admin / bulk-import overrides:
    last_fed_at: Optional[datetime] = None
    last_shed_at: Optional[date] = None


class SnakeResponse(SnakeBase):
    """Schema for snake response."""
    id: uuid.UUID
    user_id: uuid.UUID
    reptile_species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None
    last_fed_at: Optional[datetime] = None
    last_shed_at: Optional[date] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
