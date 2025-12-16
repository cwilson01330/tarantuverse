"""
Substrate change log model
"""
from sqlalchemy import Column, String, Text, Date, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


class SubstrateChange(Base):
    __tablename__ = "substrate_changes"
    __table_args__ = (
        CheckConstraint(
            'tarantula_id IS NOT NULL OR enclosure_id IS NOT NULL',
            name='substrate_change_must_have_parent'
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tarantula_id = Column(UUID(as_uuid=True), ForeignKey("tarantulas.id", ondelete="CASCADE"), nullable=True)
    enclosure_id = Column(UUID(as_uuid=True), ForeignKey("enclosures.id", ondelete="CASCADE"), nullable=True)

    changed_at = Column(Date, nullable=False)
    substrate_type = Column(String(100))  # Type of substrate used
    substrate_depth = Column(String(50))  # Depth of substrate
    reason = Column(String(200))  # e.g., "routine maintenance", "mold", "rehousing"
    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tarantula = relationship("Tarantula", backref="substrate_changes")
    enclosure = relationship("Enclosure", back_populates="substrate_changes")

    def __repr__(self):
        parent = self.tarantula_id or self.enclosure_id
        return f"<SubstrateChange {parent} @ {self.changed_at}>"
