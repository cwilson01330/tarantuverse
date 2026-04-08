"""
User schemas
"""
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid
import re


def _validate_password_complexity(password: str) -> str:
    """
    Enforce password complexity rules:
    - At least 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character
    """
    errors = []
    if len(password) < 8:
        errors.append("at least 8 characters")
    if not re.search(r"[A-Z]", password):
        errors.append("at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        errors.append("at least one lowercase letter")
    if not re.search(r"\d", password):
        errors.append("at least one number")
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?`~]", password):
        errors.append("at least one special character (!@#$%^&* etc.)")
    if errors:
        raise ValueError("Password must contain: " + ", ".join(errors))
    return password


class UserCreate(BaseModel):
    """Schema for user registration"""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8, max_length=100)
    display_name: Optional[str] = Field(None, max_length=100)
    referral_code: Optional[str] = Field(None, max_length=12)  # Optional referral code

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        return _validate_password_complexity(v)


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

    @field_validator("new_password")
    @classmethod
    def new_password_complexity(cls, v: str) -> str:
        return _validate_password_complexity(v)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


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
    is_admin: Optional[bool] = False
    is_verified: Optional[bool] = False
    is_premium: Optional[bool] = False
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
