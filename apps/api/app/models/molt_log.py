"""
Molt log model
"""
from sqlalchemy import Column, Numeric, Boolean, DateTime, ForeignKey, Text, String, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


class MoltLog(Base):
    __tablename__ = "molt_logs"
    __table_args__ = (
        CheckConstraint(
            'tarantula_id IS NOT NULL OR enclosure_id IS NOT NULL',
            name='molt_log_must_have_parent'
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tarantula_id = Column(UUID(as_uuid=True), ForeignKey("tarantulas.id", ondelete="CASCADE"), nullable=True)
    enclosure_id = Column(UUID(as_uuid=True), ForeignKey("enclosures.id", ondelete="CASCADE"), nullable=True)

    molted_at = Column(DateTime(timezone=True), nullable=False)
    premolt_started_at = Column(DateTime(timezone=True))
    is_unidentified = Column(Boolean, default=False)  # For communals: "found a molt but don't know who"

    # Measurements
    leg_span_before = Column(Numeric(5, 2))  # in inches or cm
    leg_span_after = Column(Numeric(5, 2))
    weight_before = Column(Numeric(6, 2))  # in grams
    weight_after = Column(Numeric(6, 2))

    notes = Column(Text)
    image_url = Column(String(500))  # Photo of the molt

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tarantula = relationship("Tarantula", backref="molt_logs")
    enclosure = relationship("Enclosure", back_populates="molt_logs")

    def __repr__(self):
        parent = self.tarantula_id or self.enclosure_id
        return f"<MoltLog {parent} @ {self.molted_at}>"
