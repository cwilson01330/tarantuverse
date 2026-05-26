"""
Scorpion schemas.

Mirrors `app.schemas.tarantula` so the per-animal CRUD surface looks
identical to the keeper between taxa. Scorpion-specific deltas:
* `current_instar` and `current_length_mm` for growth tracking.
* `colony_id` for communal grouping (nullable).
* No `life_stage` enum — scorpion cadence isn't sling/juvenile/adult.

The `sex` field uses the lowercase form that's wire-compatible with the
tarantula schema (the router translates to the UPPERCASE PG enum value
via `Sex(value.upper())`-style coercion).
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field


# Allowed enclosure-type values for scorpions. Same vocabulary as
# tarantulas — the migration stores this as VARCHAR(30) to avoid a new
# PG ENUM, so the schema enforces the value set.
SCORPION_ENCLOSURE_TYPE_PATTERN = "^(terrestrial|arboreal|fossorial)$"


class ScorpionBase(BaseModel):
    """Common editable fields on a Scorpion row."""
    name: Optional[str] = Field(None, max_length=100)
    common_name: Optional[str] = Field(None, max_length=100)
    scientific_name: Optional[str] = Field(None, max_length=255)
    sex: Optional[str] = Field(None, pattern="^(male|female|unknown)$")

    date_acquired: Optional[date] = None
    source: Optional[str] = Field(None, pattern="^(bred|bought|wild_caught)$")
    price_paid: Optional[Decimal] = None

    current_instar: Optional[int] = Field(None, ge=1, le=10)
    current_length_mm: Optional[Decimal] = None

    enclosure_type: Optional[str] = Field(
        None, pattern=SCORPION_ENCLOSURE_TYPE_PATTERN,
    )
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

    # Mirror tarantula's pause mechanism.
    feeding_paused_reason: Optional[str] = Field(None, max_length=40)
    feeding_paused_until: Optional[date] = None

    photo_url: Optional[str] = Field(None, max_length=500)
    is_public: bool = False
    visibility: Optional[str] = Field(None, pattern="^(public|private)$")
    notes: Optional[str] = None


class ScorpionCreate(ScorpionBase):
    """Create payload."""
    species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None
    colony_id: Optional[uuid.UUID] = None


class ScorpionUpdate(ScorpionBase):
    """Update payload — all fields optional. Same shape as Base, kept
    separate for clarity and to match the tarantula pattern."""
    species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None
    colony_id: Optional[uuid.UUID] = None


class ScorpionResponse(ScorpionBase):
    """Response with resolved IDs + timestamps."""
    id: uuid.UUID
    user_id: uuid.UUID
    species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None
    colony_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
