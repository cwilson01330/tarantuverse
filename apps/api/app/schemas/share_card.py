from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ShareCardCreate(BaseModel):
    app: str = Field(..., pattern="^(tarantuverse|herpetoverse)$")
    animal_id: UUID
    kind: str = Field(..., pattern="^(molt|profile)$")
    molt_id: Optional[UUID] = None
    fields: Optional[List[str]] = Field(None, max_length=20)
    shape: str = Field("story", pattern="^(story|post|square|wide)$")
    frame: str = Field("specimen", pattern="^(specimen|notes|herbarium)$")
    link: bool = False
    # Live-preview render: mints a token only. Never saves defaults or a link.
    preview: bool = False


class ShareCardCreated(BaseModel):
    image_url: str
    card_link: Optional[str] = None
    code: Optional[str] = None
    fields: List[str]
    frame: str = "specimen"


class CardLinkItem(BaseModel):
    code: str
    app: str
    kind: str
    name: Optional[str]
    url: str
    created_at: datetime
    revoked_at: Optional[datetime]
