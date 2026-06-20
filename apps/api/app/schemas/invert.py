"""
Invert schemas — unified per-animal API contract (Phase A1 of ADR-005).

Wide schema covering tarantula + scorpion + centipede fields. The
client decides which subset to present based on `taxon`.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field


# Full ADR-006 taxon set — kept in sync with the inverts_taxon_check
# CHECK constraint and INVERT_TAXON_VALUES.
TAXON_PATTERN = "^(tarantula|scorpion|centipede|whip_spider|vinegaroon|true_spider|millipede|mantis|roach|other)$"
LIFE_STAGE_PATTERN = "^(sling|juvenile|adult)$"
ENCLOSURE_TYPE_PATTERN = "^(terrestrial|arboreal|fossorial)$"


class InvertBase(BaseModel):
    """Common editable fields. Mirrors the existing tarantula + scorpion
    schemas; taxon-specific fields are nullable."""
    name: Optional[str] = Field(None, max_length=100)
    common_name: Optional[str] = Field(None, max_length=100)
    scientific_name: Optional[str] = Field(None, max_length=255)
    sex: Optional[str] = Field(None, pattern="^(male|female|unknown)$")

    date_acquired: Optional[date] = None
    source: Optional[str] = Field(None, pattern="^(bred|bought|wild_caught)$")
    price_paid: Optional[Decimal] = None

    # Tarantula-only — nullable. Server-side validation could reject
    # non-tarantula taxa setting this, but staying lenient for now.
    life_stage: Optional[str] = Field(None, pattern=LIFE_STAGE_PATTERN)

    # Scorpion + centipede growth tracking
    current_instar: Optional[int] = Field(None, ge=1, le=15)
    current_length_mm: Optional[Decimal] = None

    # Centipede-only growth tracking
    current_segment_count: Optional[int] = Field(None, ge=1)
    current_leg_pair_count: Optional[int] = Field(None, ge=1)

    # Husbandry
    enclosure_type: Optional[str] = Field(None, pattern=ENCLOSURE_TYPE_PATTERN)
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

    # Feeding pause
    feeding_paused_reason: Optional[str] = Field(None, max_length=40)
    feeding_paused_until: Optional[date] = None

    # Media / privacy / notes
    photo_url: Optional[str] = Field(None, max_length=500)
    is_public: bool = False
    visibility: Optional[str] = Field(None, pattern="^(public|private)$")
    notes: Optional[str] = None


class InvertCreate(InvertBase):
    """Create — taxon is required and immutable thereafter."""
    taxon: str = Field(..., pattern=TAXON_PATTERN)
    species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None
    colony_id: Optional[uuid.UUID] = None


class InvertUpdate(InvertBase):
    """Partial update. `taxon` is INTENTIONALLY OMITTED — an animal
    cannot change taxon once created (would invalidate logs / photos /
    care sheet linkage)."""
    species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None
    colony_id: Optional[uuid.UUID] = None


class InvertResponse(InvertBase):
    id: uuid.UUID
    user_id: uuid.UUID
    taxon: str
    species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None
    colony_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Provenance / transfer (BRIEF-animal-transfer-provenance)
    bred_by_user_id: Optional[uuid.UUID] = None
    origin_keeper_name: Optional[str] = None
    source_transfer_id: Optional[uuid.UUID] = None
    provenance: Optional[dict] = None
    transferred_out_at: Optional[datetime] = None

    # Pattern-free overrides for serialization. These columns are plain VARCHAR and
    # store UPPERCASE enum casing (the shared DB convention: sex/source are
    # MALE/FEMALE/UNKNOWN, BOUGHT/BRED/WILD_CAUGHT). The strict lowercase patterns on
    # InvertBase/Create/Update are correct for INPUT, but on the response they make a
    # single stored row raise ResponseValidationError and 500 the WHOLE list/detail —
    # which is why collections weren't showing. The response must reflect whatever is
    # stored; input validation stays strict on Base/Create/Update.
    sex: Optional[str] = None
    source: Optional[str] = None
    life_stage: Optional[str] = None
    enclosure_type: Optional[str] = None
    visibility: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class InvertGrowthAnalytics(BaseModel):
    """Growth analytics for any invert, computed from its molt history.

    Same shape as the tarantula GrowthAnalytics but keyed on invert_id.
    `leg_span` fields hold whatever length measurement the taxon uses —
    leg span for spiders, body length for scorpions/centipedes; the
    client labels them via the taxon registry.
    """
    invert_id: uuid.UUID
    data_points: list["GrowthDataPoint"]
    total_molts: int
    average_days_between_molts: Optional[float] = None
    total_weight_gain: Optional[Decimal] = None
    total_leg_span_gain: Optional[Decimal] = None
    growth_rate_weight: Optional[Decimal] = None
    growth_rate_leg_span: Optional[Decimal] = None
    last_molt_date: Optional[datetime] = None
    days_since_last_molt: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# Late import to reuse the existing data-point schema without a cycle
from app.schemas.tarantula import GrowthDataPoint  # noqa: E402

InvertGrowthAnalytics.model_rebuild()
