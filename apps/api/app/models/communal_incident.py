from sqlalchemy import Column, String, Date, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from ..database import Base


class CommunalIncident(Base):
    __tablename__ = "communal_incidents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    enclosure_id = Column(UUID(as_uuid=True), ForeignKey("enclosures.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # What happened
    incident_type = Column(String, nullable=False)
    # aggression | cannibalism_attempt | injury | removal | addition | death | escape | observation | molt_found

    # How serious (only meaningful for aggressive events)
    severity = Column(String, nullable=True)
    # minor | moderate | severe

    occurred_at = Column(Date, nullable=False)

    # Specific individual involved (if known)
    tarantula_id = Column(UUID(as_uuid=True), ForeignKey("tarantulas.id", ondelete="SET NULL"), nullable=True)

    description = Column(Text, nullable=True)
    outcome = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    enclosure = relationship("Enclosure", back_populates="incidents")
    user = relationship("User")
    tarantula = relationship("Tarantula")
