"""
Pydantic schemas for FeederCareLog.

log_type set — keep in sync with PRD §4:
  fed_feeders | cleaning | water_change | restock | count_update | note
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Literal
from datetime import date, datetime
import uuid


FeederLogType = Literal[
    "fed_feeders",
    "cleaning",
    "water_change",
    "restock",
    "count_update",
    "note",
]


class FeederCareLogBase(BaseModel):
    log_type: FeederLogType
    logged_at: Optional[date] = None  # defaults to server CURRENT_DATE
    count_delta: Optional[int] = None
    notes: Optional[str] = Field(None, max_length=2000)


class FeederCareLogCreate(FeederCareLogBase):
    pass


class FeederCareLogUpdate(BaseModel):
    log_type: Optional[FeederLogType] = None
    logged_at: Optional[date] = None
    count_delta: Optional[int] = None
    notes: Optional[str] = Field(None, max_length=2000)


class FeederCareLogResponse(BaseModel):
    id: uuid.UUID
    feeder_colony_id: uuid.UUID
    user_id: uuid.UUID
    log_type: FeederLogType
    logged_at: date
    count_delta: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
