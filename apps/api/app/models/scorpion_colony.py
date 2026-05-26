"""
Scorpion colony model — a grouping layer for communal setups.

This is a deliberate scope-in for v1 (Cory, 2026-05-22): Pandinus and
Heterometrus communal setups are common enough that deferring colonies
would feel half-built. Each scorpion may belong to zero or one colony
via `scorpions.colony_id`.

Important design note: logs (feeding / molt / substrate) stay
PER-SCORPION, not per-colony. The colony is a grouping layer, NOT a
polymorphic log parent. The frontend's "log feeding across colony" bulk
action will fire one feeding row per member rather than a single
colony-scoped log — that keeps the per-animal analytics meaningful and
sidesteps the awkward case of partial acceptance ("3 of 5 ate").
"""
from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base


class ScorpionColony(Base):
    __tablename__ = "scorpion_colonies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name = Column(String(100), nullable=False)
    # Optional pointer to the physical enclosure the colony lives in.
    # SET NULL on delete so removing the enclosure record doesn't drop
    # the colony — the keeper might rehouse and reuse the colony name.
    enclosure_id = Column(
        UUID(as_uuid=True),
        ForeignKey("enclosures.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes = Column(Text)

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", backref="scorpion_colonies")
    enclosure = relationship("Enclosure")
    # Members of this colony. Defined here rather than on Scorpion so
    # the back_populates resolves at import time regardless of which
    # model is imported first.
    members = relationship(
        "Scorpion", back_populates="colony", foreign_keys="Scorpion.colony_id",
    )

    def __repr__(self):
        return f"<ScorpionColony {self.name}>"
