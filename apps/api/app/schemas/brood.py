"""
Brood schemas — scorpion analogue of egg sacs.

Scorpions are viviparous; a brood is the litter the mother carries on
her back through 1st instar. `father_scorpion_id` is OPTIONAL because
several keepable species (Hottentotta, certain Tityus) reproduce
parthenogenetically.

`pairing_id` is reserved for Phase 5 — accepted on input but not yet
backed by a FK constraint.
"""
from datetime import date, datetime
from typing import Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field


class BroodBase(BaseModel):
    date_born: date
    count: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = None


class BroodCreate(BroodBase):
    mother_scorpion_id: uuid.UUID
    father_scorpion_id: Optional[uuid.UUID] = None
    pairing_id: Optional[uuid.UUID] = None


class BroodUpdate(BaseModel):
    date_born: Optional[date] = None
    count: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = None
    father_scorpion_id: Optional[uuid.UUID] = None
    pairing_id: Optional[uuid.UUID] = None


class BroodResponse(BroodBase):
    id: uuid.UUID
    user_id: uuid.UUID
    mother_scorpion_id: uuid.UUID
    father_scorpion_id: Optional[uuid.UUID] = None
    pairing_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
