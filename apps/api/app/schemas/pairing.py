"""
Pairing schemas
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
from decimal import Decimal
import uuid
from app.models.pairing import PairingOutcome, PairingType


class PairingBase(BaseModel):
    """Base pairing schema. The tarantula parent FKs are optional because
    invert-only pairings (ADR-010 Phase C) leave them null and use the
    male_invert_id/female_invert_id fields instead."""
    male_id: Optional[uuid.UUID] = None
    female_id: Optional[uuid.UUID] = None
    paired_date: date
    separated_date: Optional[date] = None
    pairing_type: PairingType = PairingType.NATURAL
    outcome: PairingOutcome = PairingOutcome.IN_PROGRESS
    notes: Optional[str] = None


class PairingCreate(PairingBase):
    """Schema for creating a tarantula pairing — parents required here."""
    male_id: uuid.UUID
    female_id: uuid.UUID


class PairingUpdate(BaseModel):
    """Schema for updating a pairing (all fields optional)"""
    male_id: Optional[uuid.UUID] = None
    female_id: Optional[uuid.UUID] = None
    paired_date: Optional[date] = None
    separated_date: Optional[date] = None
    pairing_type: Optional[PairingType] = None
    outcome: Optional[PairingOutcome] = None
    notes: Optional[str] = None


class PairingInvertCreate(BaseModel):
    """Create a pairing between two inverts (ADR-010 Phase C — works for any
    taxon, including scorpions that have no row in the tarantulas table)."""
    male_invert_id: uuid.UUID
    female_invert_id: uuid.UUID
    paired_date: date
    separated_date: Optional[date] = None
    pairing_type: PairingType = PairingType.NATURAL
    outcome: PairingOutcome = PairingOutcome.IN_PROGRESS
    notes: Optional[str] = None


class PairingResponse(PairingBase):
    """Schema for pairing response"""
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: date
    # ADR-010 — generic parent refs on the inverts surface (Phase A:
    # populated by dual-write; equal to male_id/female_id for tarantulas).
    male_invert_id: Optional[uuid.UUID] = None
    female_invert_id: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True
