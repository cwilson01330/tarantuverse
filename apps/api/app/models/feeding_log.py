"""
Feeding log model
"""
from sqlalchemy import Column, String, Boolean, Integer, DateTime, ForeignKey, Text, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


class FeedingLog(Base):
    __tablename__ = "feeding_logs"
    __table_args__ = (
        CheckConstraint(
            'tarantula_id IS NOT NULL OR enclosure_id IS NOT NULL',
            name='feeding_log_must_have_parent'
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tarantula_id = Column(UUID(as_uuid=True), ForeignKey("tarantulas.id", ondelete="CASCADE"), nullable=True)
    enclosure_id = Column(UUID(as_uuid=True), ForeignKey("enclosures.id", ondelete="CASCADE"), nullable=True)

    fed_at = Column(DateTime(timezone=True), nullable=False)
    food_type = Column(String(100))  # e.g., "cricket", "roach", "mealworm"
    food_size = Column(String(50))  # e.g., "small", "medium", "large"
    quantity = Column(Integer, default=1)  # For group feedings: "fed 8 roaches"
    accepted = Column(Boolean, default=True)

    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tarantula = relationship("Tarantula", backref="feeding_logs")
    enclosure = relationship("Enclosure", back_populates="feeding_logs")

    def __repr__(self):
        parent = self.tarantula_id or self.enclosure_id
        return f"<FeedingLog {parent} @ {self.fed_at}>"
