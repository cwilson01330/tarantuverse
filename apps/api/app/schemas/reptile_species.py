"""ReptileSpecies schemas

Pydantic schemas for the reptile_species table. Parallel to `species` schemas
but reptile-specific — multiple temp zones, UVB fields, CITES/IUCN, brumation.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Any, Dict
from datetime import date, datetime
from decimal import Decimal
import uuid


# Accepted life-stage values — kept in sync with seed data and snake
# advisory logic. Open set intentionally: if a species later needs e.g.
# 'neonate' or 'subadult-large', extend this tuple.
_ALLOWED_LIFE_STAGES = ("hatchling", "juvenile", "subadult", "adult")


def _validate_life_stage_feeding(value: Any) -> Any:
    """Shape validator for ReptileSpecies.life_stage_feeding JSONB array.

    Enforces the shape documented in the wgt_20260422 migration module:
      [{
          'stage': str,
          'weight_g_max': Number | null,
          'ratio_pct_min': Number,
          'ratio_pct_max': Number,
          'interval_days_min': Number,
          'interval_days_max': Number,
      }, …]

    Nullable at the DB level — `None` passes through unchanged.
    """
    if value is None:
        return None
    if not isinstance(value, list):
        raise ValueError("life_stage_feeding must be a list of stage brackets")

    required_keys = (
        "stage",
        "ratio_pct_min",
        "ratio_pct_max",
        "interval_days_min",
        "interval_days_max",
    )
    for i, bracket in enumerate(value):
        if not isinstance(bracket, dict):
            raise ValueError(f"life_stage_feeding[{i}] must be an object")
        for k in required_keys:
            if k not in bracket:
                raise ValueError(f"life_stage_feeding[{i}] missing required key '{k}'")
        stage = bracket["stage"]
        if stage not in _ALLOWED_LIFE_STAGES:
            raise ValueError(
                f"life_stage_feeding[{i}].stage must be one of "
                f"{_ALLOWED_LIFE_STAGES}, got {stage!r}"
            )
        # weight_g_max can be null (open-ended top bracket) but must be
        # present in the dict for explicit intent.
        if "weight_g_max" not in bracket:
            raise ValueError(
                f"life_stage_feeding[{i}] missing 'weight_g_max' "
                f"(use null for the open-ended adult bracket)"
            )
        if bracket["ratio_pct_min"] > bracket["ratio_pct_max"]:
            raise ValueError(
                f"life_stage_feeding[{i}].ratio_pct_min > ratio_pct_max"
            )
        if bracket["interval_days_min"] > bracket["interval_days_max"]:
            raise ValueError(
                f"life_stage_feeding[{i}].interval_days_min > interval_days_max"
            )
    return value


class ReptileSpeciesBase(BaseModel):
    # Taxonomy
    scientific_name: str = Field(..., max_length=255)
    common_names: List[str] = []
    genus: Optional[str] = Field(None, max_length=100)
    family: Optional[str] = Field(None, max_length=100)
    order_name: Optional[str] = Field(None, max_length=100)

    # Care classification
    care_level: Optional[str] = Field(None, pattern="^(beginner|intermediate|advanced)$")
    handleability: Optional[str] = Field(
        None, pattern="^(docile|defensive|nippy|hands_off)$"
    )
    activity_period: Optional[str] = Field(
        None, pattern="^(diurnal|nocturnal|crepuscular)$"
    )

    # Geography / size
    native_region: Optional[str] = Field(None, max_length=200)
    adult_length_min_in: Optional[Decimal] = None
    adult_length_max_in: Optional[Decimal] = None
    adult_weight_min_g: Optional[Decimal] = None
    adult_weight_max_g: Optional[Decimal] = None

    # Climate
    temp_cool_min: Optional[Decimal] = None
    temp_cool_max: Optional[Decimal] = None
    temp_warm_min: Optional[Decimal] = None
    temp_warm_max: Optional[Decimal] = None
    temp_basking_min: Optional[Decimal] = None
    temp_basking_max: Optional[Decimal] = None
    temp_night_min: Optional[Decimal] = None
    temp_night_max: Optional[Decimal] = None
    humidity_min: Optional[int] = None
    humidity_max: Optional[int] = None
    humidity_shed_boost_min: Optional[int] = None
    humidity_shed_boost_max: Optional[int] = None

    # UVB
    uvb_required: bool = False
    uvb_type: Optional[str] = Field(None, pattern="^(T5_HO|T8|not_required)$")
    uvb_distance_min_in: Optional[Decimal] = None
    uvb_distance_max_in: Optional[Decimal] = None
    uvb_replacement_months: Optional[int] = None

    # Enclosure
    enclosure_type: Optional[str] = Field(
        None, pattern="^(terrestrial|arboreal|semi_arboreal|fossorial)$"
    )
    enclosure_min_hatchling: Optional[str] = Field(None, max_length=100)
    enclosure_min_juvenile: Optional[str] = Field(None, max_length=100)
    enclosure_min_adult: Optional[str] = Field(None, max_length=100)
    bioactive_suitable: bool = False

    # Substrate
    substrate_safe_list: List[str] = []
    substrate_avoid_list: List[str] = []
    substrate_depth_min_in: Optional[Decimal] = None
    substrate_depth_max_in: Optional[Decimal] = None

    # Diet
    diet_type: Optional[str] = Field(
        None, pattern="^(strict_carnivore|insectivore|omnivore|herbivore)$"
    )
    prey_size_hatchling: Optional[str] = Field(None, max_length=100)
    prey_size_juvenile: Optional[str] = Field(None, max_length=100)
    prey_size_adult: Optional[str] = Field(None, max_length=100)
    feeding_frequency_hatchling: Optional[str] = Field(None, max_length=100)
    feeding_frequency_juvenile: Optional[str] = Field(None, max_length=100)
    feeding_frequency_adult: Optional[str] = Field(None, max_length=100)
    supplementation_notes: Optional[str] = None

    # Feeding intelligence (Sprint 5 / wgt_20260422)
    hatchling_weight_min_g: Optional[Decimal] = None
    hatchling_weight_max_g: Optional[Decimal] = None
    power_feeding_threshold_pct: Optional[Decimal] = Field(None, ge=0, le=99.9)
    weight_loss_concern_pct_30d: Optional[Decimal] = Field(None, ge=0, le=99.9)
    life_stage_feeding: Optional[List[Dict[str, Any]]] = None

    @field_validator("life_stage_feeding")
    @classmethod
    def _check_life_stage_feeding(cls, v: Any) -> Any:
        return _validate_life_stage_feeding(v)

    # Water & behavior
    water_bowl_description: Optional[str] = Field(None, max_length=200)
    soaking_behavior: Optional[str] = None
    brumation_required: bool = False
    brumation_notes: Optional[str] = None
    defensive_displays: List[str] = []

    # Lifespan
    lifespan_captivity_min_yrs: Optional[int] = None
    lifespan_captivity_max_yrs: Optional[int] = None

    # Conservation / legal
    cites_appendix: Optional[str] = Field(None, pattern="^(I|II|III)$")
    iucn_status: Optional[str] = Field(None, pattern="^(LC|NT|VU|EN|CR|EW|EX|DD)$")
    wild_population_notes: Optional[str] = None

    # Morphs
    has_morph_market: bool = False
    morph_complexity: Optional[str] = Field(
        None, pattern="^(none|simple|moderate|complex)$"
    )

    # Documentation
    care_guide: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=500)
    source_url: Optional[str] = Field(None, max_length=500)
    sources: Optional[List[Any]] = None


class ReptileSpeciesCreate(ReptileSpeciesBase):
    """Schema for creating a new reptile species (community submission)"""
    pass


class ReptileSpeciesUpdate(BaseModel):
    """Schema for updating a reptile species (all fields optional)"""
    common_names: Optional[List[str]] = None
    genus: Optional[str] = None
    family: Optional[str] = None
    order_name: Optional[str] = None
    care_level: Optional[str] = Field(None, pattern="^(beginner|intermediate|advanced)$")
    handleability: Optional[str] = None
    activity_period: Optional[str] = None
    native_region: Optional[str] = None
    adult_length_min_in: Optional[Decimal] = None
    adult_length_max_in: Optional[Decimal] = None
    adult_weight_min_g: Optional[Decimal] = None
    adult_weight_max_g: Optional[Decimal] = None
    temp_cool_min: Optional[Decimal] = None
    temp_cool_max: Optional[Decimal] = None
    temp_warm_min: Optional[Decimal] = None
    temp_warm_max: Optional[Decimal] = None
    temp_basking_min: Optional[Decimal] = None
    temp_basking_max: Optional[Decimal] = None
    temp_night_min: Optional[Decimal] = None
    temp_night_max: Optional[Decimal] = None
    humidity_min: Optional[int] = None
    humidity_max: Optional[int] = None
    humidity_shed_boost_min: Optional[int] = None
    humidity_shed_boost_max: Optional[int] = None
    uvb_required: Optional[bool] = None
    uvb_type: Optional[str] = None
    uvb_distance_min_in: Optional[Decimal] = None
    uvb_distance_max_in: Optional[Decimal] = None
    uvb_replacement_months: Optional[int] = None
    enclosure_type: Optional[str] = None
    enclosure_min_hatchling: Optional[str] = None
    enclosure_min_juvenile: Optional[str] = None
    enclosure_min_adult: Optional[str] = None
    bioactive_suitable: Optional[bool] = None
    substrate_safe_list: Optional[List[str]] = None
    substrate_avoid_list: Optional[List[str]] = None
    substrate_depth_min_in: Optional[Decimal] = None
    substrate_depth_max_in: Optional[Decimal] = None
    diet_type: Optional[str] = None
    prey_size_hatchling: Optional[str] = None
    prey_size_juvenile: Optional[str] = None
    prey_size_adult: Optional[str] = None
    feeding_frequency_hatchling: Optional[str] = None
    feeding_frequency_juvenile: Optional[str] = None
    feeding_frequency_adult: Optional[str] = None
    supplementation_notes: Optional[str] = None
    hatchling_weight_min_g: Optional[Decimal] = None
    hatchling_weight_max_g: Optional[Decimal] = None
    power_feeding_threshold_pct: Optional[Decimal] = Field(None, ge=0, le=99.9)
    weight_loss_concern_pct_30d: Optional[Decimal] = Field(None, ge=0, le=99.9)
    life_stage_feeding: Optional[List[Dict[str, Any]]] = None

    @field_validator("life_stage_feeding")
    @classmethod
    def _check_life_stage_feeding(cls, v: Any) -> Any:
        return _validate_life_stage_feeding(v)

    water_bowl_description: Optional[str] = None
    soaking_behavior: Optional[str] = None
    brumation_required: Optional[bool] = None
    brumation_notes: Optional[str] = None
    defensive_displays: Optional[List[str]] = None
    lifespan_captivity_min_yrs: Optional[int] = None
    lifespan_captivity_max_yrs: Optional[int] = None
    cites_appendix: Optional[str] = None
    iucn_status: Optional[str] = None
    wild_population_notes: Optional[str] = None
    has_morph_market: Optional[bool] = None
    morph_complexity: Optional[str] = None
    care_guide: Optional[str] = None
    image_url: Optional[str] = None
    source_url: Optional[str] = None
    sources: Optional[List[Any]] = None
    is_verified: Optional[bool] = None
    content_last_reviewed_at: Optional[date] = None


class ReptileSpeciesResponse(ReptileSpeciesBase):
    id: uuid.UUID
    is_verified: bool
    submitted_by: Optional[uuid.UUID] = None
    verified_by: Optional[uuid.UUID] = None
    verified_at: Optional[datetime] = None
    community_rating: float = 0.0
    times_kept: int = 0
    content_last_reviewed_at: Optional[date] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ReptileSpeciesSearchResult(BaseModel):
    """Compact shape for autocomplete — matches the Species pattern."""
    id: uuid.UUID
    scientific_name: str
    common_names: List[str] = []
    care_level: Optional[str] = None
    image_url: Optional[str] = None

    class Config:
        from_attributes = True


class ReptileSpeciesPaginatedResponse(BaseModel):
    items: List[ReptileSpeciesResponse]
    total: int
    skip: int
    limit: int
    has_more: bool
