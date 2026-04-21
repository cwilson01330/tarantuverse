"""Shed log model

Snake ecdysis tracking — the reptile analogue to `molt_logs`. Parallel table
per ADR-002 §D1 because shed semantics differ from molt semantics (no leg span,
no unidentified parent case, shed-quality observations are a first-class
husbandry signal).

Only `snake_id` parent for v1. Future polymorphic parents (e.g., `lizard_id`)
will follow the same add-nullable-column + CHECK constraint pattern that
`feeding_logs` / `molt_logs` used when they went polymorphic in the
s0t1u2v3w4x5_add_enclosures migration.
"""
from sqlalchemy import (
    Column,
    Numeric,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


class ShedLog(Base):
    __tablename__ = "shed_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    snake_id = Column(
        UUID(as_uuid=True),
        ForeignKey("snakes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    shed_at = Column(DateTime(timezone=True), nullable=False, index=True)

    # Pre-shed "in blue" phase — snake goes opaque/milky before shedding.
    # Optional because not every keeper catches the start.
    in_blue_started_at = Column(DateTime(timezone=True), nullable=True)

    # Measurements in real snake units (no leg span concept)
    weight_before_g = Column(Numeric(8, 2), nullable=True)
    weight_after_g = Column(Numeric(8, 2), nullable=True)
    length_before_in = Column(Numeric(6, 2), nullable=True)
    length_after_in = Column(Numeric(6, 2), nullable=True)

    # Husbandry-signal fields — the reason shed logs exist at all.
    # A keeper logging "incomplete shed + retained eye caps" is reporting
    # a humidity problem, not just a timestamp.
    is_complete_shed = Column(Boolean, default=True, nullable=False)
    has_retained_shed = Column(Boolean, default=False, nullable=False)
    retained_shed_notes = Column(Text, nullable=True)

    # Free-form + optional photo of the shed
    notes = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    snake = relationship("Snake", backref="shed_logs")

    def __repr__(self):
        return f"<ShedLog snake={self.snake_id} @ {self.shed_at}>"
