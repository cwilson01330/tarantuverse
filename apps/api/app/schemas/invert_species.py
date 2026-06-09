"""
InvertSpecies schemas — unified catalog (Phase A1 of ADR-005).

Mirrors `app.schemas.scorpion_species` shape but covers all three taxa.
Taxon-specific fields are nullable; the API and UI hide unset fields
per taxon. Pattern strings mirror the migration's CHECK constraints
so bad input is rejected client-side before it can hit Postgres.
"""
from datetime import datetime
from decimal import Decimal
from typing import List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field


TAXON_PATTERN = "^(tarantula|scorpion|centipede)$"
CARE_LEVEL_PATTERN = "^(beginner|intermediate|advanced)$"
VENOM_SEVERITY_PATTERN = "^(mild|moderate|medically_significant)$"
SPECIES_TYPE_PATTERN = "^(terrestrial|arboreal|fossorial|scansorial|psammophile)$"
BURROWING_PATTERN = "^(none|light|heavy)$"
DEVELOPMENTAL_CLASS_PATTERN = "^(anamorphic|epimorphic)$"


class InvertSpeciesBase(BaseModel):
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
    type: Optional[str] = Field(None, pattern=SPECIES_TYPE_PATTERN)

    temperature_min: Optional[int] = None
    temperature_max: Optional[int] = None
    humidity_min: Optional[int] = None
    humidity_max: Optional[int] = None

    enclosure_size_sling: Optional[str] = Field(None, max_length=100)
    enclosure_size_juvenile: Optional[str] = Field(None, max_length=100)
    enclosure_size_adult: Optional[str] = Field(None, max_length=100)
    substrate_depth: Optional[str] = Field(None, max_length=100)
    substrate_type: Optional[str] = Field(None, max_length=200)

    feeding_mode: Optional[str] = Field('predator', pattern="^(predator|detritivore|omnivore)$")
    prey_size: Optional[str] = Field(None, max_length=200)
    feeding_frequency_sling: Optional[str] = Field(None, max_length=100)
    feeding_frequency_juvenile: Optional[str] = Field(None, max_length=100)
    feeding_frequency_adult: Optional[str] = Field(None, max_length=100)

    water_dish_required: bool = False
    webbing_amount: Optional[str] = Field(None, max_length=50)
    burrowing: Optional[str] = Field(None, pattern=BURROWING_PATTERN)
    communal_suitable: bool = False

    # Tarantula safety fields
    urticating_hairs: bool = False
    medically_significant_venom: bool = False
    # Scorpion + centipede safety fields
    venom_severity: Optional[str] = Field(None, pattern=VENOM_SEVERITY_PATTERN)
    venom_notes: Optional[str] = None

    # Centipede-specific
    developmental_class: Optional[str] = Field(
        None, pattern=DEVELOPMENTAL_CLASS_PATTERN,
    )
    typical_segment_count: Optional[int] = Field(None, ge=1)
    typical_leg_pair_count: Optional[int] = Field(None, ge=1)

    care_guide: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=500)
    image_attribution: Optional[str] = None
    source_url: Optional[str] = Field(None, max_length=500)


class InvertSpeciesCreate(InvertSpeciesBase):
    """Create payload — taxon + identifiers required."""
    taxon: str = Field(..., pattern=TAXON_PATTERN)
    scientific_name: str = Field(..., max_length=255)
    slug: str = Field(..., max_length=160)


class InvertSpeciesUpdate(BaseModel):
    """Partial-update payload. Taxon is INTENTIONALLY OMITTED — a
    species cannot change taxon once created."""
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
    type: Optional[str] = Field(None, pattern=SPECIES_TYPE_PATTERN)
    temperature_min: Optional[int] = None
    temperature_max: Optional[int] = None
    humidity_min: Optional[int] = None
    humidity_max: Optional[int] = None
    enclosure_size_sling: Optional[str] = Field(None, max_length=100)
    enclosure_size_juvenile: Optional[str] = Field(None, max_length=100)
    enclosure_size_adult: Optional[str] = Field(None, max_length=100)
    substrate_depth: Optional[str] = Field(None, max_length=100)
    substrate_type: Optional[str] = Field(None, max_length=200)
    feeding_mode: Optional[str] = Field('predator', pattern="^(predator|detritivore|omnivore)$")
    prey_size: Optional[str] = Field(None, max_length=200)
    feeding_frequency_sling: Optional[str] = Field(None, max_length=100)
    feeding_frequency_juvenile: Optional[str] = Field(None, max_length=100)
    feeding_frequency_adult: Optional[str] = Field(None, max_length=100)
    water_dish_required: Optional[bool] = None
    webbing_amount: Optional[str] = Field(None, max_length=50)
    burrowing: Optional[str] = Field(None, pattern=BURROWING_PATTERN)
    communal_suitable: Optional[bool] = None
    urticating_hairs: Optional[bool] = None
    medically_significant_venom: Optional[bool] = None
    venom_severity: Optional[str] = Field(None, pattern=VENOM_SEVERITY_PATTERN)
    venom_notes: Optional[str] = None
    developmental_class: Optional[str] = Field(
        None, pattern=DEVELOPMENTAL_CLASS_PATTERN,
    )
    typical_segment_count: Optional[int] = Field(None, ge=1)
    typical_leg_pair_count: Optional[int] = Field(None, ge=1)
    care_guide: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=500)
    image_attribution: Optional[str] = None
    source_url: Optional[str] = Field(None, max_length=500)


class InvertSpeciesResponse(InvertSpeciesBase):
    id: uuid.UUID
    taxon: str
    scientific_name: str
    scientific_name_lower: str
    slug: str
    is_verified: bool
    submitted_by: Optional[uuid.UUID] = None
    community_rating: Optional[Decimal] = None
    times_kept: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
