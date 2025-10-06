"""
Substrate change log model
"""
from sqlalchemy import Column, String, Text, Date, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


class SubstrateChange(Base):
    __tablename__ = "substrate_changes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tarantula_id = Column(UUID(as_uuid=True), ForeignKey("tarantulas.id", ondelete="CASCADE"), nullable=False)

    changed_at = Column(Date, nullable=False)
    substrate_type = Column(String(100))  # Type of substrate used
    substrate_depth = Column(String(50))  # Depth of substrate
    reason = Column(String(200))  # e.g., "routine maintenance", "mold", "rehousing"
    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tarantula = relationship("Tarantula", backref="substrate_changes")

    def __repr__(self):
        return f"<SubstrateChange {self.tarantula_id} @ {self.changed_at}>"
