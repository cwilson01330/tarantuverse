"""
Molt log schemas
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime
from decimal import Decimal
import uuid


# A molt either worked, went wrong, or killed the animal. Nothing in between is
# worth a separate value — finer gradations ("slightly stuck") would be guesses
# about a process the keeper mostly didn't watch.
#
# `fatal` records that the animal died IN the molt. It does NOT itself mark the
# animal as died — see ADR-015 D6. Inferring a death from a log entry and
# silently retiring the animal would be the app deciding something that grave
# on the keeper's behalf.
MOLT_OUTCOMES = ("successful", "stuck", "lost_limb", "fatal")


class MoltLogBase(BaseModel):
    """Base molt log schema"""
    molted_at: datetime
    premolt_started_at: Optional[datetime] = None
    is_unidentified: bool = False  # For communals: "found a molt but don't know who"
    leg_span_before: Optional[Decimal] = Field(None, ge=0, le=999.99)
    leg_span_after: Optional[Decimal] = Field(None, ge=0, le=999.99)
    weight_before: Optional[Decimal] = Field(None, ge=0, le=9999.99)
    weight_after: Optional[Decimal] = Field(None, ge=0, le=9999.99)
    # Outcome (ADR-015). Optional — a molt log with just a date is still a
    # complete record, and most keepers won't fill this in on a routine molt.
    # The value is in the exceptions.
    outcome: Optional[str] = None
    complication_notes: Optional[str] = None
    notes: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=500)

    @field_validator("outcome")
    @classmethod
    def _known_outcome(cls, v: Optional[str]) -> Optional[str]:
        # '' comes from a cleared picker — that's "didn't say", not invalid,
        # and must not 422 someone out of logging the molt at all.
        if v is None or v == "":
            return None
        if v not in MOLT_OUTCOMES:
            raise ValueError(f"outcome must be one of: {', '.join(MOLT_OUTCOMES)}")
        return v


class MoltLogCreate(MoltLogBase):
    """Schema for creating a molt log"""
    pass


class MoltLogUpdate(BaseModel):
    """Schema for updating a molt log (all fields optional)"""
    molted_at: Optional[datetime] = None
    premolt_started_at: Optional[datetime] = None
    is_unidentified: Optional[bool] = None
    leg_span_before: Optional[Decimal] = None
    leg_span_after: Optional[Decimal] = None
    weight_before: Optional[Decimal] = None
    weight_after: Optional[Decimal] = None
    # Editable after the fact — a keeper often doesn't know a molt went badly
    # until days later, when a leg doesn't come right or the animal dies.
    outcome: Optional[str] = None
    complication_notes: Optional[str] = None
    notes: Optional[str] = None
    image_url: Optional[str] = None

    @field_validator("outcome")
    @classmethod
    def _known_outcome(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if v not in MOLT_OUTCOMES:
            raise ValueError(f"outcome must be one of: {', '.join(MOLT_OUTCOMES)}")
        return v


class MoltLogResponse(MoltLogBase):
    """Schema for molt log response"""
    id: uuid.UUID
    tarantula_id: Optional[uuid.UUID] = None  # Now optional - can be enclosure-level
    enclosure_id: Optional[uuid.UUID] = None  # For enclosure-level molts
    scorpion_id: Optional[uuid.UUID] = None
    invert_id: Optional[uuid.UUID] = None  # unified inverts surface (ADR-005)
    # cml_20260730: a communal's molts belong to the group. Exposed so a client
    # can tell a colony molt from an individual one without inferring it from
    # which parent id happens to be absent.
    colony_id: Optional[uuid.UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True
