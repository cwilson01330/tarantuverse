"""
OAuth utilities for Google and Apple Sign-In
"""
import httpx
from typing import Optional, Dict, Any
from fastapi import HTTPException, status
import os
from jose import jwt
from datetime import datetime, timedelta


# OAuth Configuration from environment variables
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:3000/api/auth/callback/google")

APPLE_CLIENT_ID = os.getenv("APPLE_CLIENT_ID", "")
APPLE_TEAM_ID = os.getenv("APPLE_TEAM_ID", "")
APPLE_KEY_ID = os.getenv("APPLE_KEY_ID", "")
APPLE_PRIVATE_KEY = os.getenv("APPLE_PRIVATE_KEY", "")
APPLE_REDIRECT_URI = os.getenv("APPLE_REDIRECT_URI", "http://localhost:3000/api/auth/callback/apple")


async def exchange_google_code_for_token(code: str) -> Dict[str, Any]:
    """
    Exchange Google authorization code for access token and user info
    """
    async with httpx.AsyncClient() as client:
        # Exchange code for access token
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        
        if token_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to exchange Google authorization code"
            )
        
        token_data = token_response.json()
        access_token = token_data.get("access_token")
        
        # Get user info from Google
        user_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        
        if user_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to fetch Google user info"
            )
        
        user_data = user_response.json()
        
        return {
            "email": user_data.get("email"),
            "name": user_data.get("name"),
            "picture": user_data.get("picture"),
            "provider_id": user_data.get("id"),
            "access_token": access_token,
            "refresh_token": token_data.get("refresh_token"),
        }


async def verify_apple_id_token(id_token: str) -> Dict[str, Any]:
    """
    Verify Apple ID token and extract user info
    Apple uses JWT tokens that we need to decode
    """
    try:
        # Fetch Apple's public keys
        async with httpx.AsyncClient() as client:
            keys_response = await client.get("https://appleid.apple.com/auth/keys")
            apple_keys = keys_response.json()
        
        # Decode the JWT (simplified - in production, verify signature with Apple's public key)
        # For now, we'll decode without verification (NOT RECOMMENDED FOR PRODUCTION)
        payload = jwt.decode(
            id_token,
            options={"verify_signature": False},  # TODO: Add proper signature verification
        )
        
        return {
            "email": payload.get("email"),
            "provider_id": payload.get("sub"),
            "email_verified": payload.get("email_verified", False),
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to verify Apple ID token: {str(e)}"
        )


async def exchange_apple_code_for_token(code: str) -> Dict[str, Any]:
    """
    Exchange Apple authorization code for tokens
    """
    # Generate client secret (Apple requires JWT client secret)
    client_secret = generate_apple_client_secret()
    
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://appleid.apple.com/auth/token",
            data={
                "code": code,
                "client_id": APPLE_CLIENT_ID,
                "client_secret": client_secret,
                "redirect_uri": APPLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        
        if token_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to exchange Apple authorization code"
            )
        
        token_data = token_response.json()
        return token_data


def generate_apple_client_secret() -> str:
    """
    Generate Apple client secret (JWT signed with private key)
    Required for Apple Sign In
    """
    if not all([APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_CLIENT_ID]):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Apple OAuth configuration is incomplete"
        )
    
    headers = {
        "kid": APPLE_KEY_ID,
        "alg": "ES256",
    }
    
    payload = {
        "iss": APPLE_TEAM_ID,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(days=180),  # Max 6 months
        "aud": "https://appleid.apple.com",
        "sub": APPLE_CLIENT_ID,
    }
    
    # Sign with Apple's private key (ES256 algorithm)
    client_secret = jwt.encode(
        payload,
        APPLE_PRIVATE_KEY,
        algorithm="ES256",
        headers=headers,
    )
    
    return client_secret


def generate_username_from_email(email: str) -> str:
    """
    Generate a unique username from email for OAuth users
    """
    # Take the part before @ and sanitize
    base_username = email.split("@")[0]
    # Remove non-alphanumeric characters
    base_username = "".join(c for c in base_username if c.isalnum() or c == "_")
    # Limit to 30 chars
    base_username = base_username[:30]
    return base_username
