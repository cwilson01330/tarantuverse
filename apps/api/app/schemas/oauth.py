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
    redirect_uri: Optional[str] = None  # Mobile apps need to send their redirect_uri
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


class LinkedAccountResponse(BaseModel):
    """Response for a linked OAuth account"""
    id: str
    provider: str
    provider_email: Optional[str] = None
    provider_name: Optional[str] = None
    provider_avatar: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class LinkAccountRequest(BaseModel):
    """Request to link a new OAuth account"""
    provider: str  # 'google' or 'apple'
    code: str  # OAuth authorization code
    id_token: Optional[str] = None  # Required for Apple
    redirect_uri: Optional[str] = None  # For mobile apps


class LinkAccountDirectRequest(BaseModel):
    """Link a provider using an identity TOKEN obtained by a native SDK.

    The client sends the raw signed token rather than an authorization code;
    the server verifies it against the provider JWKS (see
    services/oauth_verification.py). Used by the mobile + web "Linked sign-in
    methods" screens.

    NOTE: `id`/`email`/`picture` are accepted for backwards compatibility with
    older mobile builds but are IGNORED — the account identity comes solely
    from the verified token. Only `name` is used, and only cosmetically for
    Apple (which omits it from the token).
    """
    provider: str  # 'google' or 'apple'
    id_token: Optional[str] = None       # Google ID token / Apple identity token
    identity_token: Optional[str] = None  # alias used by expo-apple-authentication
    credential: Optional[str] = None      # alias used by Google Identity Services (web)

    # Ignored — retained so old clients don't 422 before they see the 401.
    id: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    picture: Optional[str] = None
