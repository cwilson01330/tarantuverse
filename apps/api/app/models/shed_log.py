"""Shed log model

Reptile ecdysis tracking — snake and lizard alike. Parallel to `molt_logs`
per ADR-002 §D1 because shed semantics differ from molt semantics (no leg
span, shed-quality observations are a first-class husbandry signal).

Polymorphic parent: exactly one of `snake_id` / `lizard_id` is set.
Originally snake-only with NOT NULL on snake_id; extended to polymorphic
in lzp_20260423_extend_polymorphic_tables using the same nullable-column
+ CHECK pattern as feeding_logs / photos / qr_upload_sessions.

Lizard sheds are patchier than snake sheds — the `is_complete_shed` field
is less meaningful for geckos (who shed in pieces and eat them) but the
keeper-useful `has_retained_shed` signal still applies (stuck toe-tips on
a gecko is the exact same humidity-too-low red flag as retained eye caps
on a snake).
"""
from sqlalchemy import (
    Column,
    Numeric,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    String,
    CheckConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


class ShedLog(Base):
    __tablename__ = "shed_logs"
    __table_args__ = (
        CheckConstraint(
            'num_nonnulls(snake_id, lizard_id) = 1',
            name='shed_logs_must_have_exactly_one_parent',
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    snake_id = Column(
        UUID(as_uuid=True),
        ForeignKey("snakes.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    lizard_id = Column(
        UUID(as_uuid=True),
        ForeignKey("lizards.id", ondelete="CASCADE"),
        nullable=True,
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
    lizard = relationship("Lizard", backref="shed_logs")

    def __repr__(self):
        parent = self.snake_id or self.lizard_id
        return f"<ShedLog parent={parent} @ {self.shed_at}>"
