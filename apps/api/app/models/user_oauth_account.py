"""
User OAuth Account model for storing linked OAuth accounts
Allows users to link multiple OAuth providers (Google, Apple, etc.) to one account
"""
from sqlalchemy import Column, String, DateTime, Text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from app.database import Base


class UserOAuthAccount(Base):
    """
    Stores linked OAuth accounts for users.
    A user can have multiple OAuth accounts linked (e.g., both Google and Apple).
    """
    __tablename__ = "user_oauth_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # OAuth provider info
    provider = Column(String(50), nullable=False)  # 'google', 'apple', 'github'
    provider_account_id = Column(String(255), nullable=False)  # Provider's unique user ID

    # OAuth tokens (optional, for API calls if needed)
    access_token = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    token_expires_at = Column(DateTime(timezone=True), nullable=True)

    # Provider-specific profile info
    provider_email = Column(String(255), nullable=True)  # Email from this provider
    provider_name = Column(String(255), nullable=True)  # Name from this provider
    provider_avatar = Column(String(500), nullable=True)  # Avatar from this provider

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Ensure a user can only link one account per provider
    __table_args__ = (
        UniqueConstraint('user_id', 'provider', name='uq_user_provider'),
        UniqueConstraint('provider', 'provider_account_id', name='uq_provider_account'),
    )

    # Relationship to User
    user = relationship("User", back_populates="oauth_accounts")

    def __repr__(self):
        return f"<UserOAuthAccount {self.provider} for user {self.user_id}>"
