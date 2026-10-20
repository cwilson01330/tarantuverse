from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

CARE_SHEET_MAX_ANIMALS = 60
CARE_SHEET_NOTE_MAX = 500


class CareSheetCreate(BaseModel):
    app: str = Field(..., pattern="^(tarantuverse|herpetoverse)$")
    # TV: invert ids. HV: animal ids.
    animal_ids: List[UUID] = Field(default_factory=list, max_length=CARE_SHEET_MAX_ANIMALS)
    # TV only: population colonies.
    colony_ids: List[UUID] = Field(default_factory=list, max_length=CARE_SHEET_MAX_ANIMALS)
    # The keeper's own message to the sitter, printed at the top.
    note: Optional[str] = Field(None, max_length=CARE_SHEET_NOTE_MAX)
    # Whose collection (owner user id) when a co-keeper makes the sheet.
    # Absent = the caller's own.
    collection: Optional[UUID] = None
    # The client's resolved display units — used only when the keeper never
    # chose a setting (users.measurement_units NULL = device region).
    units: Optional[str] = Field(None, pattern="^(imperial|metric)$")
    # JS getTimezoneOffset(), so "today" on the sheet is the keeper's today.
    tz_offset_minutes: Optional[int] = Field(None, ge=-840, le=840)


class CareSheetCreated(BaseModel):
    url: str
    token: str
    expires_at: datetime
