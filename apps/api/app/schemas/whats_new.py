"""Schemas for the What's new routes (routers/whats_new.py)."""
from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field

from app.services.whats_new import WHATS_NEW_APPS

APP_PATTERN = "^(" + "|".join(WHATS_NEW_APPS) + ")$"


class ActionOut(BaseModel):
    label: str
    target: str


class EntryOut(BaseModel):
    id: str
    published_on: date
    title: str
    body: str
    premium: bool
    action: Optional[ActionOut] = None


class WeekOut(BaseModel):
    week_of: date  # the Monday of the ISO week
    entries: List[EntryOut]


class WhatsNewFeed(BaseModel):
    weeks: List[WeekOut]
    unseen: List[EntryOut]


class SeenRequest(BaseModel):
    app: str = Field(..., pattern=APP_PATTERN)


class SeenResponse(BaseModel):
    seen_through: Optional[date] = None
