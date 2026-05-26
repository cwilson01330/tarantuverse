"""
Scorpion colony schemas.

Colonies are a thin grouping layer (see `ScorpionColony` model) — name,
optional enclosure pointer, notes, and the list of member scorpions on
the response. Logs stay per-scorpion, so colonies don't carry their own
feeding / molt data.
"""
from datetime import datetime
from typing import List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field


class ScorpionColonyBase(BaseModel):
    name: str = Field(..., max_length=100)
    enclosure_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class ScorpionColonyCreate(ScorpionColonyBase):
    pass


class ScorpionColonyUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    enclosure_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class ScorpionColonyMember(BaseModel):
    """Lightweight projection of a Scorpion when listed inside a colony.

    Keeps the colony detail endpoint cheap — full ScorpionResponse is
    available via `/scorpions/{id}` when needed."""
    id: uuid.UUID
    name: Optional[str] = None
    common_name: Optional[str] = None
    scientific_name: Optional[str] = None
    sex: Optional[str] = None
    current_instar: Optional[int] = None
    photo_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ScorpionColonyResponse(ScorpionColonyBase):
    id: uuid.UUID
    user_id: uuid.UUID
    member_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ScorpionColonyDetailResponse(ScorpionColonyResponse):
    """Detail view includes the projected member list."""
    members: List[ScorpionColonyMember] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
