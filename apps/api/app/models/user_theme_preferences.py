"""
User theme preferences model for interface skinning
"""
from sqlalchemy import Column, String, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from ..database import Base


class UserThemePreferences(Base):
    """User theme preferences for interface customization"""
    __tablename__ = "user_theme_preferences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)

    # Theme mode (light/dark/system)
    color_mode = Column(String(20), default='dark', nullable=False)

    # Preset or Custom selection
    # 'default' - use default theme
    # 'preset' - use a predefined preset (preset_id required)
    # 'custom' - use custom colors (custom_* fields required)
    theme_type = Column(String(20), default='default', nullable=False)

    # Selected preset ID (e.g., 'gbb', 'obt', 'poecilotheria')
    # Only used when theme_type = 'preset'
    preset_id = Column(String(50), nullable=True)

    # Custom colors (hex format: #RRGGBB)
    # Only used when theme_type = 'custom' (premium feature)
    custom_primary = Column(String(7), nullable=True)
    custom_secondary = Column(String(7), nullable=True)
    custom_accent = Column(String(7), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationship
    user = relationship("User", back_populates="theme_preferences")
