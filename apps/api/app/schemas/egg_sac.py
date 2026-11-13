"""
Egg sac schemas
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import date, datetime
import uuid


class _EggSacFields(BaseModel):
    """The sac itself, without saying who laid it."""
    laid_date: date
    pulled_date: Optional[date] = None
    # Projection — legitimately in the future, so NO future-date validator
    # here. `hatch_date` below is the event and must not be future.
    expected_hatch_date: Optional[date] = None
    hatch_date: Optional[date] = None
    incubation_temp_min: Optional[int] = Field(None, ge=0, le=200)
    incubation_temp_max: Optional[int] = Field(None, ge=0, le=200)
    incubation_humidity_min: Optional[int] = Field(None, ge=0, le=100)
    incubation_humidity_max: Optional[int] = Field(None, ge=0, le=100)
    spiderling_count: Optional[int] = Field(None, ge=0)
    viable_count: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = None
    photo_url: Optional[str] = Field(None, max_length=500)


class EggSacBase(_EggSacFields):
    """Base egg sac schema (pairing is optional: a sac can belong to a mother only)"""
    pairing_id: Optional[uuid.UUID] = None


class EggSacCreate(_EggSacFields):
    """Schema for creating a pairing-based egg sac"""
    pairing_id: uuid.UUID


class InvertEggSacCreate(_EggSacFields):
    """Schema for logging a sac straight on the mother (no pairing)."""
    pass


class ColonyRef(BaseModel):
    id: uuid.UUID
    name: str


class EggSacUpdate(BaseModel):
    """Schema for updating an egg sac (all fields optional)"""
    pairing_id: Optional[uuid.UUID] = None
    laid_date: Optional[date] = None
    pulled_date: Optional[date] = None
    expected_hatch_date: Optional[date] = None
    hatch_date: Optional[date] = None
    incubation_temp_min: Optional[int] = None
    incubation_temp_max: Optional[int] = None
    incubation_humidity_min: Optional[int] = None
    incubation_humidity_max: Optional[int] = None
    spiderling_count: Optional[int] = None
    viable_count: Optional[int] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = None

    @field_validator("laid_date")
    @classmethod
    def _laid_date_not_cleared(cls, v: Optional[date]) -> date:
        # Omit it to leave it alone; an explicit null would hit the NOT NULL
        # column (a 500) -- a sac always has a laid/born date.
        if v is None:
            raise ValueError("laid_date can't be cleared")
        return v


class EggSacResponse(EggSacBase):
    """Schema for egg sac response"""
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: date
    mother_invert_id: Optional[uuid.UUID] = None
    outcome: Optional[str] = None
    hatched_colony: Optional[ColonyRef] = None

    class Config:
        from_attributes = True


class EggSacFailRequest(BaseModel):
    notes: Optional[str] = Field(None, max_length=2000)


class EggSacHatch(BaseModel):
    """POST /egg-sacs/{id}/hatch: the sac hatched (or the brood was born)."""
    count: int = Field(..., ge=1, le=2000)
    count_is_estimated: bool = False
    hatched_on: date
    # Blank = "{mother name} {bucket}" (e.g. "Sally slings").
    name: Optional[str] = Field(None, max_length=100)

    @field_validator("hatched_on")
    @classmethod
    def _not_in_future(cls, v: date) -> date:
        from app.schemas.death import latest_local_today
        if v > latest_local_today():
            raise ValueError("hatched_on cannot be in the future")
        return v

    @field_validator("name")
    @classmethod
    def _blank_name_is_none(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = " ".join(v.split())
        return v or None


class EggSacHatchResponse(BaseModel):
    egg_sac: EggSacResponse
    colony: "ColonyResponse"


from app.schemas.colony import ColonyResponse  # noqa: E402

EggSacHatchResponse.model_rebuild()
