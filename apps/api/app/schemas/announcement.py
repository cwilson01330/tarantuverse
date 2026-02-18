"""
Announcement schemas
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID


class AnnouncementBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1, max_length=500)
    banner_type: str = Field("info", description="info, sale, update, or coupon")
    link_url: Optional[str] = Field(None, max_length=500)
    link_text: Optional[str] = Field(None, max_length=100)
    coupon_code: Optional[str] = Field(None, max_length=50)
    is_active: bool = True
    priority: int = 0
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class AnnouncementCreate(AnnouncementBase):
    pass


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    message: Optional[str] = Field(None, max_length=500)
    banner_type: Optional[str] = None
    link_url: Optional[str] = Field(None, max_length=500)
    link_text: Optional[str] = Field(None, max_length=100)
    coupon_code: Optional[str] = Field(None, max_length=50)
    is_active: Optional[bool] = None
    priority: Optional[int] = None
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class AnnouncementResponse(AnnouncementBase):
    id: UUID
    created_by_id: Optional[UUID]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
        orm_mode = True
