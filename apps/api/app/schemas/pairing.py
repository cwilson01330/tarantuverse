"""
Pairing schemas
"""
from pydantic import BaseModel, Field
from typing import List, Optional
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


class PairingParent(BaseModel):
    """A resolved parent, in the shape every breeding surface renders.

    Exists because the response used to return bare ids, so each client
    resolved names by fetching the whole tarantula list and building a map —
    four copies of the same hack, each of which rendered a NON-tarantula parent
    as blank, since male_id/female_id are NULL for inverts. Resolving on the
    server fixes all four at once and means a newly-enabled taxon needs no
    read-path changes.

    `taxon` is included so the client can pick the right breeding vocabulary
    (egg sac vs ootheca vs brood) without a second lookup.
    """
    id: uuid.UUID
    display_name: str
    name: Optional[str] = None
    common_name: Optional[str] = None
    scientific_name: Optional[str] = None
    sex: Optional[str] = None
    taxon: str
    photo_url: Optional[str] = None


class PairingResponse(PairingBase):
    """Schema for pairing response"""
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: date
    # ADR-010 — generic parent refs on the inverts surface (Phase A:
    # populated by dual-write; equal to male_id/female_id for tarantulas).
    male_invert_id: Optional[uuid.UUID] = None
    female_invert_id: Optional[uuid.UUID] = None

    # Resolved by services/breeding_service.attach_parents. Named *_parent
    # rather than male/female because those are mapped relationships on the
    # model and assigning over them would dirty the instance.
    #
    # Optional, and None means "this animal no longer exists" — render that as
    # "Unknown animal", which is true, rather than as blank space, which reads
    # as a bug. Routers that don't call attach_parents simply omit them, so
    # this is backward compatible for any caller not yet updated.
    male_parent: Optional[PairingParent] = None
    female_parent: Optional[PairingParent] = None

    # Advisory notes about the pairing that was just saved — currently a
    # cross-species caution. Deliberately NOT a refusal: this app records what
    # a keeper did rather than licensing it, and someone logging a cross after
    # the fact still needs to be able to write it down. Empty on reads.
    warnings: List[str] = []

    class Config:
        from_attributes = True
