"""Pydantic schemas for waitlist signup endpoint."""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from uuid import UUID


class WaitlistCreate(BaseModel):
    email: EmailStr
    brand: str = Field(..., pattern=r"^(herpetoverse|tarantuverse)$")
    source: Optional[str] = Field(None, max_length=64)


class WaitlistResponse(BaseModel):
    id: UUID
    email: str
    brand: str
    created_at: datetime

    class Config:
        from_attributes = True
