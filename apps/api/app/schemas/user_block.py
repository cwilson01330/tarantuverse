"""
User block schemas
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
from uuid import UUID


class UserBlockCreate(BaseModel):
    blocked_id: UUID
    reason: Optional[str] = None


class UserBlockResponse(BaseModel):
    id: UUID
    blocker_id: UUID
    blocked_id: UUID
    reason: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
