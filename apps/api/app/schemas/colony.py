"""
Pydantic schemas for Colony + ColonyEvent (ADR-010).

Population-level tracking. `stage_counts` is always a bucket map
({"adults": 10, "nymphs": 100, ...}); `total_count` is summed at the API
layer. Taxon is validated against the shared invert taxon vocab.
"""
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, Dict, List
from datetime import date, datetime
import uuid

from app.models.invert_species import INVERT_TAXON_VALUES
from app.models.colony import COLONY_EVENT_TYPES

_SOURCES = ("bought", "bred", "wild_caught")
_VISIBILITY = ("private", "public")


def _validate_stage_counts(v: Optional[Dict[str, int]]) -> Optional[Dict[str, int]]:
    if v is None:
        return v
    for stage, n in v.items():
        if not isinstance(stage, str) or not stage.strip():
            raise ValueError("stage_counts keys must be non-empty strings")
        if not isinstance(n, int) or isinstance(n, bool) or n < 0:
            raise ValueError("stage_counts values must be non-negative integers")
    return v


# ---------- Colony ----------

class ColonyBase(BaseModel):
    name: str = Field(..., max_length=100)
    taxon: str
    species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None

    date_acquired: Optional[date] = None
    founded_date: Optional[date] = None
    source: Optional[str] = None

    stage_counts: Optional[Dict[str, int]] = None
    count_is_estimated: bool = False

    substrate_type: Optional[str] = Field(None, max_length=100)
    substrate_depth: Optional[str] = Field(None, max_length=50)
    last_substrate_change: Optional[date] = None
    target_temp_min: Optional[float] = None
    target_temp_max: Optional[float] = None
    target_humidity_min: Optional[float] = None
    target_humidity_max: Optional[float] = None
    water_dish: Optional[bool] = None

    notes: Optional[str] = None
    photo_url: Optional[str] = Field(None, max_length=500)
    visibility: str = "private"

    @field_validator("taxon")
    @classmethod
    def _check_taxon(cls, v: str) -> str:
        if v not in INVERT_TAXON_VALUES:
            raise ValueError(f"taxon must be one of {INVERT_TAXON_VALUES}")
        return v

    @field_validator("source")
    @classmethod
    def _check_source(cls, v):
        if v is not None and v not in _SOURCES:
            raise ValueError(f"source must be one of {_SOURCES}")
        return v

    @field_validator("visibility")
    @classmethod
    def _check_visibility(cls, v):
        if v not in _VISIBILITY:
            raise ValueError(f"visibility must be one of {_VISIBILITY}")
        return v

    @field_validator("stage_counts")
    @classmethod
    def _check_stage_counts(cls, v):
        return _validate_stage_counts(v)


class ColonyCreate(ColonyBase):
    pass


class ColonyUpdate(BaseModel):
    """All fields optional (PATCH-style; sent with exclude_unset)."""
    name: Optional[str] = Field(None, max_length=100)
    species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None
    date_acquired: Optional[date] = None
    founded_date: Optional[date] = None
    source: Optional[str] = None
    stage_counts: Optional[Dict[str, int]] = None
    count_is_estimated: Optional[bool] = None
    substrate_type: Optional[str] = Field(None, max_length=100)
    substrate_depth: Optional[str] = Field(None, max_length=50)
    last_substrate_change: Optional[date] = None
    target_temp_min: Optional[float] = None
    target_temp_max: Optional[float] = None
    target_humidity_min: Optional[float] = None
    target_humidity_max: Optional[float] = None
    water_dish: Optional[bool] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = Field(None, max_length=500)
    visibility: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("source")
    @classmethod
    def _check_source(cls, v):
        if v is not None and v not in _SOURCES:
            raise ValueError(f"source must be one of {_SOURCES}")
        return v

    @field_validator("visibility")
    @classmethod
    def _check_visibility(cls, v):
        if v is not None and v not in _VISIBILITY:
            raise ValueError(f"visibility must be one of {_VISIBILITY}")
        return v

    @field_validator("stage_counts")
    @classmethod
    def _check_stage_counts(cls, v):
        return _validate_stage_counts(v)


class ColonyResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    taxon: str
    species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None
    name: str

    date_acquired: Optional[date] = None
    founded_date: Optional[date] = None
    source: Optional[str] = None

    stage_counts: Optional[Dict[str, int]] = None
    count_is_estimated: bool = False

    substrate_type: Optional[str] = None
    substrate_depth: Optional[str] = None
    last_substrate_change: Optional[date] = None
    target_temp_min: Optional[float] = None
    target_temp_max: Optional[float] = None
    target_humidity_min: Optional[float] = None
    target_humidity_max: Optional[float] = None
    water_dish: Optional[bool] = None

    notes: Optional[str] = None
    photo_url: Optional[str] = None
    visibility: str
    is_active: bool

    created_at: datetime
    updated_at: Optional[datetime] = None

    # Computed / denormalized (populated by the router)
    total_count: Optional[int] = None
    species_display_name: Optional[str] = None
    species_scientific_name: Optional[str] = None
    species_missing: bool = False

    model_config = ConfigDict(from_attributes=True)


class ColonyListItem(BaseModel):
    """Lighter payload for the collection list."""
    id: uuid.UUID
    taxon: str
    name: str
    photo_url: Optional[str] = None
    total_count: Optional[int] = None
    count_is_estimated: bool = False
    stage_counts: Optional[Dict[str, int]] = None
    is_active: bool
    species_display_name: Optional[str] = None
    species_scientific_name: Optional[str] = None
    species_missing: bool = False

    model_config = ConfigDict(from_attributes=True)


# ---------- ColonyEvent ----------

class ColonyEventCreate(BaseModel):
    event_type: str
    stage: Optional[str] = Field(None, max_length=40)
    count_delta: Optional[int] = None
    occurred_at: Optional[date] = None
    severity: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = None

    @field_validator("event_type")
    @classmethod
    def _check_event_type(cls, v: str) -> str:
        if v not in COLONY_EVENT_TYPES:
            raise ValueError(f"event_type must be one of {COLONY_EVENT_TYPES}")
        return v


class ColonyEventUpdate(BaseModel):
    event_type: Optional[str] = None
    stage: Optional[str] = Field(None, max_length=40)
    count_delta: Optional[int] = None
    occurred_at: Optional[date] = None
    severity: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = None

    @field_validator("event_type")
    @classmethod
    def _check_event_type(cls, v):
        if v is not None and v not in COLONY_EVENT_TYPES:
            raise ValueError(f"event_type must be one of {COLONY_EVENT_TYPES}")
        return v


class ColonyEventResponse(BaseModel):
    id: uuid.UUID
    colony_id: uuid.UUID
    user_id: uuid.UUID
    event_type: str
    stage: Optional[str] = None
    count_delta: Optional[int] = None
    occurred_at: date
    severity: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
