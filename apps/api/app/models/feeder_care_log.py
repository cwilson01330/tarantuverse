"""
Feeder care log — timestamped event on a colony.

log_type values:
  - fed_feeders    : fed the feeders themselves (veg, gut-load, etc.)
  - cleaning       : cleaned the colony bin
  - water_change   : refreshed water/hydration source
  - restock        : added feeders to the colony (positive count_delta)
  - count_update   : manual inventory correction (can be +/-)
  - note           : free-form observation, no count change

One-tap quick-log is the primary usage pattern.
"""
from sqlalchemy import Column, String, Integer, Text, Date, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from ..database import Base


class FeederCareLog(Base):
    __tablename__ = "feeder_care_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    feeder_colony_id = Column(
        UUID(as_uuid=True),
        ForeignKey("feeder_colonies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    log_type = Column(String(30), nullable=False)
    logged_at = Column(Date, nullable=False, server_default=func.current_date(), index=True)

    # Change to colony count/stock caused by this event. Optional —
    # cleaning/notes don't need a delta.
    count_delta = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    colony = relationship("FeederColony", back_populates="care_logs")
    user = relationship("User")

    def __repr__(self):
        return f"<FeederCareLog {self.log_type} @ {self.logged_at}>"
