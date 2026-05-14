"""Animal schemas — unified Herpetoverse taxon record.

Implements ADR-003. Replaces the per-taxon Snake / Lizard / Frog
schemas. `taxon` is set once on create and is immutable thereafter
(it's not in AnimalUpdate) — an animal doesn't change taxon.

The species FK field is `herp_species_id` (table renamed from
reptile_species in anh_20260514). The catalog *route* stays
`/api/v1/reptile-species/` because appalachiantarantulas.com reads it
— only the table + this FK field were renamed.
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
from decimal import Decimal
import uuid


class AnimalBase(BaseModel):
    """Fields a keeper can set when creating/updating an animal."""
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

    # Husbandry reference. brumation_* doubles as aestivation for frogs.
    feeding_schedule: Optional[str] = Field(None, max_length=200)
    brumation_active: bool = False
    brumation_started_at: Optional[date] = None
    feeding_paused_reason: Optional[str] = Field(None, max_length=40)
    feeding_paused_until: Optional[date] = None

    # Media
    photo_url: Optional[str] = Field(None, max_length=500)

    # Privacy
    is_public: bool = False
    visibility: Optional[str] = Field(None, pattern="^(private|public)$")

    # Notes
    notes: Optional[str] = None


class AnimalCreate(AnimalBase):
    """Schema for creating a new animal. `taxon` is required and
    immutable — it never appears in AnimalUpdate."""
    taxon: str = Field(..., pattern="^(snake|lizard|frog)$")
    herp_species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None


class AnimalUpdate(AnimalBase):
    """Schema for updating an animal. Inherits all-optional from
    AnimalBase. `taxon` is intentionally absent — immutable."""
    herp_species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None
    # Denormalized timestamps are usually updated by the app from
    # feeding / shed log inserts, but allow admin / bulk-import overrides:
    last_fed_at: Optional[datetime] = None
    last_shed_at: Optional[date] = None


class AnimalResponse(AnimalBase):
    """Schema for animal response."""
    id: uuid.UUID
    user_id: uuid.UUID
    taxon: str
    herp_species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None
    last_fed_at: Optional[datetime] = None
    last_shed_at: Optional[date] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
