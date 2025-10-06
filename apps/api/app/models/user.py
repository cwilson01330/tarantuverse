"""
User model
"""
from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.sql import func
import uuid
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)

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

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<User {self.username}>"
