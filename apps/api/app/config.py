"""
Application configuration using pydantic-settings
"""
from pydantic_settings import BaseSettings
from typing import List, Union
from pydantic import field_validator
import sys


class Settings(BaseSettings):
    """Application settings"""

    # API Configuration
    API_SECRET_KEY: str = "dev-secret-key-change-in-production"
    API_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 14  # 14 days. Revocation via /auth/logout + token_blocklist.

    # Database
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/tarantuverse"

    # CORS
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:3000",
        "http://localhost:19006",
    ]
    
    # Frontend URL for emails
    FRONTEND_URL: str = "http://localhost:3000"

    # Auth email flow
    EMAIL_VERIFICATION_REQUIRED: bool = False

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS_ORIGINS from string or list"""
        if isinstance(v, str):
            # Split by comma if it's a string
            return [origin.strip() for origin in v.split(",")]
        return v

    # File Storage (Legacy AWS S3)
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "us-east-1"
    AWS_S3_BUCKET: str = "tarantuverse-uploads"
    
    # Cloudflare R2 Storage
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "tarantuverse-photos"
    R2_PUBLIC_URL: str = ""  # e.g., https://pub-xxx.r2.dev

    # Email (Resend)
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "Tarantuverse <noreply@mail.tarantuverse.com>"

    # Stripe Payments
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_MONTHLY: str = ""  # price_xxx from Stripe Dashboard
    STRIPE_PRICE_YEARLY: str = ""   # price_xxx from Stripe Dashboard
    STRIPE_PRICE_LIFETIME: str = "" # price_xxx from Stripe Dashboard (one-time)

    # Environment
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    class Config:
        env_file = "../../.env"  # Point to root .env file
        case_sensitive = True
        extra = "ignore"  # Ignore extra fields in .env


settings = Settings()

# Startup validation: refuse to run with the default dev secret in production
_DEV_SECRET = "dev-secret-key-change-in-production"
if settings.API_SECRET_KEY == _DEV_SECRET and settings.ENVIRONMENT != "development":
    print(
        "[SECURITY] FATAL: API_SECRET_KEY is still set to the default dev value. "
        "Set a strong random secret in your environment before running in production.",
        file=sys.stderr,
    )
    sys.exit(1)

if settings.API_SECRET_KEY == _DEV_SECRET:
    print(
        "[SECURITY] WARNING: Using default dev JWT secret. "
        "Set API_SECRET_KEY in your environment before deploying.",
        file=sys.stderr,
    )
