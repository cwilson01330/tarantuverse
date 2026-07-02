"""Schemas for the in-app notification center (ADR-009)."""
from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict, Any
from datetime import datetime
import uuid


class NotificationResponse(BaseModel):
    id: uuid.UUID
    type: str
    title: str
    body: Optional[str] = None
    deeplink: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UnreadCountResponse(BaseModel):
    unread_count: int
