"""
Photo model
"""
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


class Photo(Base):
    __tablename__ = "photos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tarantula_id = Column(UUID(as_uuid=True), ForeignKey("tarantulas.id", ondelete="CASCADE"), nullable=False)

    url = Column(String(500), nullable=False)
    thumbnail_url = Column(String(500))
    caption = Column(Text)

    taken_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tarantula = relationship("Tarantula", backref="photos")

    def __repr__(self):
        return f"<Photo {self.id}>"
