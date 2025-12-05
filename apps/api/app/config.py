"""
Application configuration using pydantic-settings
"""
from pydantic_settings import BaseSettings
from typing import List, Union
from pydantic import field_validator


class Settings(BaseSettings):
    """Application settings"""

    # API Configuration
    API_SECRET_KEY: str = "dev-secret-key-change-in-production"
    API_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Database
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/tarantuverse"

    # CORS
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:3000",
        "http://localhost:19006",
    ]

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

    # Email (SendGrid)
    SENDGRID_API_KEY: str = ""
    SENDGRID_FROM_EMAIL: str = "noreply@tarantuverse.com"

    # Environment
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    class Config:
        env_file = "../../.env"  # Point to root .env file
        case_sensitive = True
        extra = "ignore"  # Ignore extra fields in .env


settings = Settings()
