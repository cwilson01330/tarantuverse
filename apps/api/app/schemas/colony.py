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
from app.models.colony import COLONY_EVENT_TYPES, COLONY_END_REASONS
from app.schemas.death import latest_local_today

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

    # Enclosure — mirrors the invert fields. Free-text size because keepers
    # describe enclosures in whatever format their supplier uses.
    enclosure_type: Optional[str] = Field(
        None, pattern="^(terrestrial|arboreal|fossorial)$"
    )
    enclosure_size: Optional[str] = Field(None, max_length=50)
    substrate_type: Optional[str] = Field(None, max_length=100)
    substrate_depth: Optional[str] = Field(None, max_length=50)
    last_substrate_change: Optional[date] = None
    target_temp_min: Optional[float] = None
    target_temp_max: Optional[float] = None
    target_humidity_min: Optional[float] = None
    target_humidity_max: Optional[float] = None
    water_dish: Optional[bool] = None
    location: Optional[str] = Field(None, max_length=120)

    notes: Optional[str] = None
    photo_url: Optional[str] = Field(None, max_length=500)
    visibility: str = "private"

    @field_validator("location", mode="before")
    @classmethod
    def _normalise_location(cls, v):
        from app.utils.locations import normalize_location
        return normalize_location(v) if isinstance(v, str) else v

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
    # Enclosure — mirrors the invert fields. Free-text size because keepers
    # describe enclosures in whatever format their supplier uses.
    enclosure_type: Optional[str] = Field(
        None, pattern="^(terrestrial|arboreal|fossorial)$"
    )
    enclosure_size: Optional[str] = Field(None, max_length=50)
    substrate_type: Optional[str] = Field(None, max_length=100)
    substrate_depth: Optional[str] = Field(None, max_length=50)
    last_substrate_change: Optional[date] = None
    target_temp_min: Optional[float] = None
    target_temp_max: Optional[float] = None
    target_humidity_min: Optional[float] = None
    target_humidity_max: Optional[float] = None
    water_dish: Optional[bool] = None
    location: Optional[str] = Field(None, max_length=120)
    notes: Optional[str] = None
    photo_url: Optional[str] = Field(None, max_length=500)
    visibility: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("location", mode="before")
    @classmethod
    def _normalise_location(cls, v):
        from app.utils.locations import normalize_location
        return normalize_location(v) if isinstance(v, str) else v

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

    enclosure_type: Optional[str] = None
    enclosure_size: Optional[str] = None
    substrate_type: Optional[str] = None
    substrate_depth: Optional[str] = None
    last_substrate_change: Optional[date] = None
    target_temp_min: Optional[float] = None
    target_temp_max: Optional[float] = None
    target_humidity_min: Optional[float] = None
    target_humidity_max: Optional[float] = None
    water_dish: Optional[bool] = None
    location: Optional[str] = None

    notes: Optional[str] = None
    photo_url: Optional[str] = None
    visibility: str
    is_active: bool

    # Set when the colony has ended (POST /colonies/{id}/end); all None while
    # it is still running. Optional so older clients never see a new shape.
    ended_at: Optional[date] = None
    end_reason: Optional[str] = None
    end_notes: Optional[str] = None

    # Set when the whole colony was handed to another keeper through a claimed
    # transfer link (ctr_20261008). A partial transfer never sets it.
    transferred_out_at: Optional[datetime] = None

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
    location: Optional[str] = None
    species_display_name: Optional[str] = None
    species_scientific_name: Optional[str] = None
    species_missing: bool = False

    # Only populated on the "ended" / "past" views; None for a running colony.
    ended_at: Optional[date] = None
    end_reason: Optional[str] = None

    # Last ACCEPTED feeding, so the collection card can say "Fed 4d ago" like
    # every other card. No overdue flag: a colony has no life_stage to resolve
    # a cadence from, and guessing one would be fabrication.
    last_feeding_date: Optional[datetime] = None
    days_since_last_feeding: Optional[int] = None
    # Net of logged count changes over the last 30 days; None when nothing
    # moved the count in that window.
    change_30d: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class ColonyEndRequest(BaseModel):
    """End a colony. The colony equivalent of MarkDiedRequest.

    Only `reason` is required: a population doesn't die, it ends, and why is the
    one thing worth recording. The date defaults to today; notes are optional.
    """

    ended_at: Optional[date] = None
    reason: str
    notes: Optional[str] = Field(None, max_length=2000)

    @field_validator("reason")
    @classmethod
    def _known_reason(cls, v: str) -> str:
        if v not in COLONY_END_REASONS:
            raise ValueError(f"reason must be one of: {', '.join(COLONY_END_REASONS)}")
        return v

    @field_validator("ended_at")
    @classmethod
    def _not_in_future(cls, v: Optional[date]) -> Optional[date]:
        # Judged against the latest calendar day anywhere on earth (UTC+14), not
        # the server's UTC date -- same rule as MarkDiedRequest -- so a keeper
        # ahead of UTC recording "today" isn't told it hasn't happened yet.
        if v is not None and v > latest_local_today():
            raise ValueError("ended_at cannot be in the future")
        return v

    @field_validator("notes")
    @classmethod
    def _blank_notes_are_none(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        return v or None


# ---------- ColonyEvent ----------

class ColonyEventCreate(BaseModel):
    event_type: str
    stage: Optional[str] = Field(None, max_length=40)
    count_delta: Optional[int] = None
    occurred_at: Optional[date] = None
    severity: Optional[str] = Field(None, max_length=20)
    # Where animals went, for `removed` / `split`. Never required — plenty of
    # keepers remove animals for ordinary reasons and owe no explanation.
    destination: Optional[str] = Field(None, max_length=200)
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
    destination: Optional[str] = Field(None, max_length=200)
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
    destination: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    logged_by_user_id: Optional[uuid.UUID] = None
    # Display name of the co-keeper who logged it; None means the owner.
    logged_by_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)
