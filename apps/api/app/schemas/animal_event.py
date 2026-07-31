"""Per-animal event schemas (ADR-015 D5)."""
from datetime import date, datetime
from typing import Optional
import uuid

from pydantic import BaseModel, Field, field_validator

from app.models.animal_event import ANIMAL_EVENT_SEVERITIES, ANIMAL_EVENT_TYPES


# Module-level so create and update share one definition. Reaching into the
# base class's validators via __func__ also works, but it's the kind of clever
# that quietly breaks on a Pydantic upgrade.

def _check_type(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    if v not in ANIMAL_EVENT_TYPES:
        raise ValueError(f"event_type must be one of: {', '.join(ANIMAL_EVENT_TYPES)}")
    return v


def _check_severity(v: Optional[str]) -> Optional[str]:
    # '' is a cleared picker — "didn't say", not invalid. Rejecting it would
    # 422 someone out of logging the event over an optional field.
    if v is None or v == "":
        return None
    if v not in ANIMAL_EVENT_SEVERITIES:
        raise ValueError(f"severity must be one of: {', '.join(ANIMAL_EVENT_SEVERITIES)}")
    return v


def _check_not_future(v: Optional[date]) -> Optional[date]:
    # An event that hasn't happened yet is a typo. Rejected rather than
    # clamped: clamping would record a date the keeper never chose.
    if v is not None and v > date.today():
        raise ValueError("occurred_at cannot be in the future")
    return v


class AnimalEventBase(BaseModel):
    event_type: str
    # Defaults to today server-side. Backdating is expected and normal — most
    # events are noticed and logged after the fact.
    occurred_at: Optional[date] = None
    severity: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=5000)

    _v_type = field_validator("event_type")(_check_type)
    _v_sev = field_validator("severity")(_check_severity)
    _v_date = field_validator("occurred_at")(_check_not_future)


class AnimalEventCreate(AnimalEventBase):
    pass


class AnimalEventUpdate(BaseModel):
    """All optional. Events get corrected — an injury turns out to be a
    mismolt, a severity is revised once the animal recovers or doesn't."""

    event_type: Optional[str] = None
    occurred_at: Optional[date] = None
    severity: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=5000)

    _v_type = field_validator("event_type")(_check_type)
    _v_sev = field_validator("severity")(_check_severity)
    _v_date = field_validator("occurred_at")(_check_not_future)


class AnimalEventResponse(AnimalEventBase):
    id: uuid.UUID
    invert_id: Optional[uuid.UUID] = None
    animal_id: Optional[uuid.UUID] = None
    occurred_at: date
    created_at: datetime

    class Config:
        from_attributes = True
