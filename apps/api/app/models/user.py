"""
User model
"""
from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=True)  # Nullable for OAuth users
    
    # OAuth fields
    oauth_provider = Column(String(50))  # 'google', 'apple', 'github'
    oauth_id = Column(String(255))  # Provider's unique user ID
    oauth_access_token = Column(Text)  # Store for API calls if needed
    oauth_refresh_token = Column(Text)  # For token refresh

    display_name = Column(String(100))
    avatar_url = Column(String(500))
    bio = Column(Text)
    is_breeder = Column(Boolean, default=False)

    # Community/Profile fields
    profile_bio = Column(Text)
    profile_location = Column(String(255))
    profile_experience_level = Column(String(50))  # beginner, intermediate, advanced, expert
    profile_years_keeping = Column(Integer)
    profile_specialties = Column(ARRAY(String))  # e.g., ['arboreal', 'old_world', 'breeding']
    social_links = Column(JSONB)  # {instagram: '', youtube: '', website: ''}
    collection_visibility = Column(String(20), default='private')  # private, public

    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    is_admin = Column(Boolean, default=False, nullable=False)  # For forum moderation
    
    # Password Reset
    reset_token = Column(String(255), nullable=True)
    reset_token_expires_at = Column(DateTime(timezone=True), nullable=True)

    # Email Verification
    is_verified = Column(Boolean, default=False)
    verification_token = Column(String(255), nullable=True)
    verification_token_expires_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships (lazy loading to avoid circular imports)
    # messages = relationship("Message", back_populates="user", lazy="select")  # Legacy message board (deprecated, commented out to avoid circular import)
    # subscriptions = relationship("UserSubscription", back_populates="user", lazy="select")  # Temporarily commented out to fix deployment

    # Breeding relationships
    pairings = relationship("Pairing", back_populates="user", lazy="select")
    egg_sacs = relationship("EggSac", back_populates="user", lazy="select")
    offspring = relationship("Offspring", back_populates="user", lazy="select")

    # Notification preferences
    notification_preferences = relationship("NotificationPreferences", back_populates="user", uselist=False, lazy="select")

    # Theme preferences
    theme_preferences = relationship("UserThemePreferences", back_populates="user", uselist=False, lazy="select")

    def __repr__(self):
        return f"<User {self.username}>"

    @property
    def is_premium(self) -> bool:
        """Check if user has an active premium subscription"""
        from datetime import datetime, timezone
        from app.models.subscription import UserSubscription, SubscriptionStatus

        # Import here to avoid circular dependency
        from sqlalchemy.orm import object_session
        session = object_session(self)
        if not session:
            return False

        # Use string value explicitly for reliable comparison
        subscription = session.query(UserSubscription).filter(
            UserSubscription.user_id == self.id,
            UserSubscription.status == "active"
        ).first()

        if not subscription:
            return False

        # Check if subscription is expired
        if subscription.expires_at and subscription.expires_at < datetime.now(timezone.utc):
            return False

        # Get subscription plan
        from app.models.subscription import SubscriptionPlan
        plan = session.query(SubscriptionPlan).filter(
            SubscriptionPlan.id == subscription.plan_id
        ).first()

        # User is premium if they have any plan other than "free"
        return plan and plan.name != "free"

    def get_subscription_limits(self):
        """Get user's current subscription limits"""
        from app.models.subscription import UserSubscription, SubscriptionPlan, SubscriptionStatus
        from sqlalchemy.orm import object_session

        session = object_session(self)
        if not session:
            # Return free tier defaults
            return {
                "max_tarantulas": 15,
                "can_use_breeding": False,
                "max_photos_per_tarantula": 5,
                "has_priority_support": False,
                "is_premium": False
            }

        # Get active subscription
        # Use string value explicitly for reliable comparison
        subscription = session.query(UserSubscription).filter(
            UserSubscription.user_id == self.id,
            UserSubscription.status == "active"
        ).first()

        if not subscription:
            # Return free tier defaults
            return {
                "max_tarantulas": 15,
                "can_use_breeding": False,
                "max_photos_per_tarantula": 5,
                "has_priority_support": False,
                "is_premium": False
            }

        # Get plan details
        plan = session.query(SubscriptionPlan).filter(
            SubscriptionPlan.id == subscription.plan_id
        ).first()

        if not plan:
            # Fallback to free tier
            return {
                "max_tarantulas": 15,
                "can_use_breeding": False,
                "max_photos_per_tarantula": 5,
                "has_priority_support": False,
                "is_premium": False
            }

        return {
            "max_tarantulas": plan.max_tarantulas,
            "can_use_breeding": plan.can_use_breeding,
            "max_photos_per_tarantula": plan.max_photos_per_tarantula,
            "has_priority_support": plan.has_priority_support,
            "is_premium": plan.name != "free"
        }
