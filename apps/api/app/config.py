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
    # Where share-card PNGs are rendered (the Tarantuverse web app hosts the
    # one renderer for both products). Override per environment.
    CARD_RENDERER_ORIGIN: str = "https://www.tarantuverse.com"

    # Auth email flow
    EMAIL_VERIFICATION_REQUIRED: bool = False

    # OAuth identity-token verification (see services/oauth_verification.py).
    # Comma-separated lists of EVERY client id that may appear in an identity
    # token's `aud`, across both apps and all platforms:
    #   Google -> web + iOS + Android client ids for Tarantuverse AND Herpetoverse
    #   Apple  -> the app bundle ids (and the Services ID used by web sign-in)
    # If these are empty the server refuses to verify tokens (fails CLOSED)
    # rather than accepting a token minted for somebody else's app.
    GOOGLE_OAUTH_CLIENT_IDS: str = ""
    APPLE_OAUTH_CLIENT_IDS: str = ""

    # Sign in with Apple token revocation (guideline 5.1.1(v); see
    # services/apple_siwa.py). A "Sign in with Apple" key from Certificates,
    # Identifiers & Profiles → Keys. Unset = no code exchange at sign-in and
    # no revoke at account deletion (logged as a warning).
    APPLE_SIWA_TEAM_ID: str = ""
    APPLE_SIWA_KEY_ID: str = ""
    APPLE_SIWA_PRIVATE_KEY: str = ""  # full contents of the .p8 file

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
    R2_PUBLIC_URL: str = ""  # e.g., https://photos.tarantuverse.com
    # Earlier public addresses of the SAME bucket (comma-separated). Stored
    # links that still use one are treated as ours — deletable, exportable,
    # allowed on share cards — until rewrite_photo_urls.py has moved them to
    # R2_PUBLIC_URL. The default is the bucket's r2.dev address, which every
    # photo link used before 2026-10 (it is public: it is in every old link).
    R2_LEGACY_PUBLIC_URLS: str = "https://pub-739a81bdc01a40bb8cfce4a58b122d17.r2.dev"

    # Email (Resend)
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "Tarantuverse <noreply@mail.tarantuverse.com>"
    # Daily care-digest emails (services/digest_email.py): at most this many per
    # UTC day. Resend's free plan allows 100/day, shared with password resets.
    DIGEST_EMAIL_DAILY_CAP: int = 80
    # This API's public address; the List-Unsubscribe header points back here.
    API_PUBLIC_URL: str = "https://tarantuverse-api.onrender.com"

    # Stripe Payments
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_MONTHLY: str = ""  # TV premium — price_xxx from Stripe Dashboard
    STRIPE_PRICE_YEARLY: str = ""   # TV premium — price_xxx from Stripe Dashboard
    STRIPE_PRICE_LIFETIME: str = "" # TV premium — price_xxx from Stripe Dashboard (one-time)
    # Herpetoverse premium (app-scoped 'herpetoverse')
    STRIPE_PRICE_HV_MONTHLY: str = ""
    STRIPE_PRICE_HV_YEARLY: str = ""
    STRIPE_PRICE_HV_LIFETIME: str = ""
    # All-Access bundle (app-scoped 'both' — unlocks TV + HV)
    STRIPE_PRICE_BUNDLE_MONTHLY: str = ""
    STRIPE_PRICE_BUNDLE_YEARLY: str = ""
    STRIPE_PRICE_BUNDLE_LIFETIME: str = ""

    # Apple App Store Server Notifications (V2)
    APPLE_BUNDLE_ID: str = "com.tarantuverse.app"
    # Numeric Apple ID of the app (App Store Connect → App Information →
    # General Information → Apple ID). Required to verify PRODUCTION
    # notification signatures; sandbox works without it.
    APPLE_APP_APPLE_ID: int = 0

    # Apple App Store Server API (In-App Purchase key) — enables
    # server-side transaction verification on /validate-receipt and the
    # test-notification endpoints. From App Store Connect → Users and
    # Access → Integrations → In-App Purchase.
    APPLE_IAP_KEY_ID: str = ""       # e.g. MWS2VV3XBQ
    APPLE_IAP_ISSUER_ID: str = ""    # UUID shown above the key list
    APPLE_IAP_PRIVATE_KEY: str = ""  # full contents of the .p8 file

    # Notion — admin-only push of support messages and metrics snapshots.
    # Unset means the feature is simply off; nothing errors, the buttons report
    # that it isn't configured. Create an internal integration at
    # notion.so/my-integrations, then share each database with it — an
    # integration can only see pages explicitly shared with it.
    NOTION_TOKEN: str = ""
    NOTION_FEEDBACK_DATABASE_ID: str = ""
    NOTION_METRICS_DATABASE_ID: str = ""

    # Environment
    ENVIRONMENT: str = "development"
    # Off unless set. When it defaulted to True, production (which never sets
    # it) logged every SQL statement with its values — emails, notes,
    # messages — into Render's logs. Local dev turns it on in .env.
    DEBUG: bool = False

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
