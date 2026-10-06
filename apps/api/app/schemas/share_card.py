from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class PhotoFocus(BaseModel):
    """Where the keeper wants the photo framed: the point of the photo (0-1
    across, 0-1 down) to centre in the card's photo window, and how far to
    zoom in. Works for every frame and shape, since each crops around it."""
    x: float = Field(0.5, ge=0, le=1)
    y: float = Field(0.5, ge=0, le=1)
    zoom: float = Field(1, ge=1, le=4)


class ShareCardCreate(BaseModel):
    app: str = Field(..., pattern="^(tarantuverse|herpetoverse)$")
    animal_id: UUID
    kind: str = Field(..., pattern="^(molt|profile)$")
    molt_id: Optional[UUID] = None
    fields: Optional[List[str]] = Field(None, max_length=20)
    shape: str = Field("story", pattern="^(story|post|square|wide)$")
    frame: str = Field("specimen", pattern="^(specimen|notes|herbarium)$")
    # Which of the animal's photos to use. None = its main photo.
    photo_id: Optional[UUID] = None
    # How to frame that photo. None = automatic.
    focus: Optional[PhotoFocus] = None
    link: bool = False
    # Live-preview render: mints a token only. Never saves defaults or a link.
    preview: bool = False


class ShareCardCreated(BaseModel):
    image_url: str
    card_link: Optional[str] = None
    code: Optional[str] = None
    fields: List[str]
    frame: str = "specimen"


class SharePhotoItem(BaseModel):
    id: UUID
    url: str
    thumbnail_url: Optional[str]
    is_main: bool


class CardLinkItem(BaseModel):
    code: str
    app: str
    kind: str
    name: Optional[str]
    url: str
    created_at: datetime
    revoked_at: Optional[datetime]
