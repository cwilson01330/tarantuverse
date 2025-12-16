"""
User schemas
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid


class UserCreate(BaseModel):
    """Schema for user registration"""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8, max_length=100)
    display_name: Optional[str] = Field(None, max_length=100)
    referral_code: Optional[str] = Field(None, max_length=12)  # Optional referral code


class UserLogin(BaseModel):
    """Schema for user login"""
    email: EmailStr
    password: str


class UserProfileUpdate(BaseModel):
    """Schema for updating user profile"""
    display_name: Optional[str] = Field(None, max_length=100)
    avatar_url: Optional[str] = None
    profile_bio: Optional[str] = None
    profile_location: Optional[str] = Field(None, max_length=255)
    profile_experience_level: Optional[str] = Field(None, max_length=50)
    profile_years_keeping: Optional[int] = None
    profile_specialties: Optional[List[str]] = None
    social_links: Optional[Dict[str, str]] = None
    collection_visibility: Optional[str] = Field(None, max_length=20)


class UserVisibilityUpdate(BaseModel):
    """Schema for quick visibility toggle"""
    collection_visibility: str = Field(..., pattern="^(private|public)$")


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)


class UserResponse(BaseModel):
    """Schema for user response (without password)"""
    id: uuid.UUID
    email: str
    username: str
    display_name: Optional[str]
    avatar_url: Optional[str]
    bio: Optional[str]
    is_breeder: Optional[bool] = False
    is_active: Optional[bool] = True
    is_superuser: Optional[bool] = False
    is_verified: Optional[bool] = False
    created_at: datetime
    # Community fields
    profile_bio: Optional[str] = None
    profile_location: Optional[str] = None
    profile_experience_level: Optional[str] = None
    profile_years_keeping: Optional[int] = None
    profile_specialties: Optional[List[str]] = None
    social_links: Optional[Dict[str, Any]] = None
    collection_visibility: str = 'private'

    class Config:
        from_attributes = True


class Token(BaseModel):
    """Schema for JWT token response"""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
