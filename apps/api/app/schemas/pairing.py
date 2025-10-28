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
    """Base pairing schema"""
    male_id: uuid.UUID
    female_id: uuid.UUID
    paired_date: date
    separated_date: Optional[date] = None
    pairing_type: PairingType = PairingType.NATURAL
    outcome: PairingOutcome = PairingOutcome.IN_PROGRESS
    notes: Optional[str] = None


class PairingCreate(PairingBase):
    """Schema for creating a new pairing"""
    pass


class PairingUpdate(BaseModel):
    """Schema for updating a pairing (all fields optional)"""
    male_id: Optional[uuid.UUID] = None
    female_id: Optional[uuid.UUID] = None
    paired_date: Optional[date] = None
    separated_date: Optional[date] = None
    pairing_type: Optional[PairingType] = None
    outcome: Optional[PairingOutcome] = None
    notes: Optional[str] = None


class PairingResponse(PairingBase):
    """Schema for pairing response"""
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: date

    class Config:
        from_attributes = True
