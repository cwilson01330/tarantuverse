"""
Content report schemas
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
from uuid import UUID


class ContentReportCreate(BaseModel):
    reported_user_id: Optional[UUID] = None
    report_type: str  # forum_post, forum_reply, direct_message, user_profile, etc.
    content_id: str  # ID of the reported content
    content_url: Optional[str] = None
    reason: str  # harassment, spam, illegal, hate_speech, etc.
    description: Optional[str] = None


class ContentReportResponse(BaseModel):
    id: UUID
    reporter_id: UUID
    reported_user_id: Optional[UUID] = None
    report_type: str
    content_id: str
    content_url: Optional[str] = None
    reason: str
    description: Optional[str] = None
    status: str
    reviewed_by: Optional[UUID] = None
    reviewed_at: Optional[datetime] = None
    moderation_notes: Optional[str] = None
    action_taken: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ContentReportUpdate(BaseModel):
    status: Optional[str] = None
    moderation_notes: Optional[str] = None
    action_taken: Optional[str] = None
