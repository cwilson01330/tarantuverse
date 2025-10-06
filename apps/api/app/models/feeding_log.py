"""
Feeding log model
"""
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


class FeedingLog(Base):
    __tablename__ = "feeding_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tarantula_id = Column(UUID(as_uuid=True), ForeignKey("tarantulas.id", ondelete="CASCADE"), nullable=False)

    fed_at = Column(DateTime(timezone=True), nullable=False)
    food_type = Column(String(100))  # e.g., "cricket", "roach", "mealworm"
    food_size = Column(String(50))  # e.g., "small", "medium", "large"
    accepted = Column(Boolean, default=True)

    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tarantula = relationship("Tarantula", backref="feeding_logs")

    def __repr__(self):
        return f"<FeedingLog {self.tarantula_id} @ {self.fed_at}>"
