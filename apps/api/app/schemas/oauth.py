"""
OAuth schemas
"""
from pydantic import BaseModel, EmailStr
from typing import Optional


class OAuthUserInfo(BaseModel):
    """OAuth provider user information"""
    email: EmailStr
    name: Optional[str] = None
    picture: Optional[str] = None
    provider: str  # 'google', 'apple', 'github'
    provider_id: str  # Provider's unique user ID


class GoogleOAuthCallback(BaseModel):
    """Google OAuth callback data"""
    code: str
    state: Optional[str] = None


class AppleOAuthCallback(BaseModel):
    """Apple OAuth callback data"""
    code: str
    id_token: str
    user: Optional[dict] = None  # Apple sends user info on first login only


class OAuthLoginResponse(BaseModel):
    """OAuth login response"""
    access_token: str
    token_type: str = "bearer"
    user: dict
    is_new_user: bool  # True if this was first time login (registration)
