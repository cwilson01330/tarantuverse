"""
Scorpion species schemas.

Mirrors `app.schemas.species` for tarantulas in style: a single Base with
all editable fields, Create that requires the identifiers, Update with
everything optional, and Response that adds id/timestamps/community
metadata. Pattern strings enforce the CHECK constraint values from
scp_20260522 so the API rejects bad input before Postgres has to.
"""
from datetime import datetime
from decimal import Decimal
from typing import List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field


# Pattern strings shared between Base and the router-side filter params.
CARE_LEVEL_PATTERN = "^(beginner|intermediate|advanced)$"
VENOM_SEVERITY_PATTERN = "^(mild|moderate|medically_significant)$"
SCORPION_TYPE_PATTERN = "^(terrestrial|scansorial|fossorial|psammophile)$"
BURROWING_PATTERN = "^(none|light|heavy)$"


class ScorpionSpeciesBase(BaseModel):
    """Common editable fields on a scorpion species catalog row."""
    common_names: List[str] = Field(default_factory=list)
    genus: Optional[str] = Field(None, max_length=100)
    family: Optional[str] = Field(None, max_length=100)
    order_name: Optional[str] = Field(None, max_length=100)

    care_level: Optional[str] = Field(None, pattern=CARE_LEVEL_PATTERN)
    temperament: Optional[str] = Field(None, max_length=100)
    native_region: Optional[str] = Field(None, max_length=200)
    adult_size: Optional[str] = Field(None, max_length=50)
    adult_length_min_mm: Optional[Decimal] = None
    adult_length_max_mm: Optional[Decimal] = None
    growth_rate: Optional[str] = Field(None, max_length=50)
    type: Optional[str] = Field(None, pattern=SCORPION_TYPE_PATTERN)

    temperature_min: Optional[int] = None
    temperature_max: Optional[int] = None
    humidity_min: Optional[int] = None
    humidity_max: Optional[int] = None

    enclosure_size_juvenile: Optional[str] = Field(None, max_length=100)
    enclosure_size_adult: Optional[str] = Field(None, max_length=100)
    substrate_depth: Optional[str] = Field(None, max_length=100)
    substrate_type: Optional[str] = Field(None, max_length=200)

    prey_size: Optional[str] = Field(None, max_length=200)
    feeding_frequency_juvenile: Optional[str] = Field(None, max_length=100)
    feeding_frequency_adult: Optional[str] = Field(None, max_length=100)

    water_dish_required: bool = False
    burrowing: Optional[str] = Field(None, pattern=BURROWING_PATTERN)
    communal_suitable: bool = False

    venom_severity: str = Field("mild", pattern=VENOM_SEVERITY_PATTERN)
    venom_notes: Optional[str] = None

    care_guide: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=500)


class ScorpionSpeciesCreate(ScorpionSpeciesBase):
    """Create payload — identifiers are required."""
    scientific_name: str = Field(..., max_length=255)
    slug: str = Field(..., max_length=160)


class ScorpionSpeciesUpdate(BaseModel):
    """Update payload — every field optional. Stays separate from
    Base so PATCH semantics don't accidentally reset booleans / venom
    severity to their Base defaults."""
    scientific_name: Optional[str] = Field(None, max_length=255)
    slug: Optional[str] = Field(None, max_length=160)
    common_names: Optional[List[str]] = None
    genus: Optional[str] = Field(None, max_length=100)
    family: Optional[str] = Field(None, max_length=100)
    order_name: Optional[str] = Field(None, max_length=100)
    care_level: Optional[str] = Field(None, pattern=CARE_LEVEL_PATTERN)
    temperament: Optional[str] = Field(None, max_length=100)
    native_region: Optional[str] = Field(None, max_length=200)
    adult_size: Optional[str] = Field(None, max_length=50)
    adult_length_min_mm: Optional[Decimal] = None
    adult_length_max_mm: Optional[Decimal] = None
    growth_rate: Optional[str] = Field(None, max_length=50)
    type: Optional[str] = Field(None, pattern=SCORPION_TYPE_PATTERN)
    temperature_min: Optional[int] = None
    temperature_max: Optional[int] = None
    humidity_min: Optional[int] = None
    humidity_max: Optional[int] = None
    enclosure_size_juvenile: Optional[str] = Field(None, max_length=100)
    enclosure_size_adult: Optional[str] = Field(None, max_length=100)
    substrate_depth: Optional[str] = Field(None, max_length=100)
    substrate_type: Optional[str] = Field(None, max_length=200)
    prey_size: Optional[str] = Field(None, max_length=200)
    feeding_frequency_juvenile: Optional[str] = Field(None, max_length=100)
    feeding_frequency_adult: Optional[str] = Field(None, max_length=100)
    water_dish_required: Optional[bool] = None
    burrowing: Optional[str] = Field(None, pattern=BURROWING_PATTERN)
    communal_suitable: Optional[bool] = None
    venom_severity: Optional[str] = Field(None, pattern=VENOM_SEVERITY_PATTERN)
    venom_notes: Optional[str] = None
    care_guide: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=500)


class ScorpionSpeciesResponse(ScorpionSpeciesBase):
    """Response — adds id, identifiers, community fields, timestamps."""
    id: uuid.UUID
    scientific_name: str
    scientific_name_lower: str
    slug: str
    is_verified: bool
    submitted_by: Optional[uuid.UUID] = None
    community_rating: Optional[Decimal] = None
    times_kept: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Pattern-free output overrides — a response model must serialize whatever
    # is stored (plain VARCHAR cols). A regex on the inherited Base fields 500s
    # the WHOLE list via ResponseValidationError if one row diverges (the trap
    # that took down /invert-species/). Input validation stays strict on Base.
    care_level: Optional[str] = None
    type: Optional[str] = None
    burrowing: Optional[str] = None
    venom_severity: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
