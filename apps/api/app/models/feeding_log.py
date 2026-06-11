"""
Feeding log model
"""
from sqlalchemy import Column, String, Boolean, Integer, DateTime, ForeignKey, Numeric, Text, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, backref
from sqlalchemy.sql import func
import uuid
from app.database import Base


class FeedingLog(Base):
    __tablename__ = "feeding_logs"
    __table_args__ = (
        # Polymorphic parent: exactly one of tarantula_id / enclosure_id
        # / animal_id / scorpion_id is set. snake/lizard/frog were
        # collapsed into animal_id in anm_20260514 (ADR-003); scorpion_id
        # was added in scp_20260522 (scorpion expansion v1).
        CheckConstraint(
            'num_nonnulls(tarantula_id, enclosure_id, animal_id, scorpion_id) = 1',
            name='feeding_logs_must_have_exactly_one_parent',
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tarantula_id = Column(UUID(as_uuid=True), ForeignKey("tarantulas.id", ondelete="CASCADE"), nullable=True)
    enclosure_id = Column(UUID(as_uuid=True), ForeignKey("enclosures.id", ondelete="CASCADE"), nullable=True)
    animal_id = Column(
        UUID(as_uuid=True),
        ForeignKey("animals.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    scorpion_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scorpions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # Companion column for the inverts consolidation (ADR-005 Phase A1).
    # Nullable + not in any CHECK constraint — it shadows whichever
    # legacy parent column is set, populated by dual-write in Phase A2
    # and by the backfill script in Phase B. Becomes the canonical
    # parent once Phase D drops the legacy columns.
    invert_id = Column(
        UUID(as_uuid=True),
        ForeignKey("inverts.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    fed_at = Column(DateTime(timezone=True), nullable=False)
    food_type = Column(String(100))  # e.g., "cricket", "roach", "mealworm"
    food_size = Column(String(50))  # e.g., "small", "medium", "large"
    quantity = Column(Integer, default=1)  # For group feedings: "fed 8 roaches"
    accepted = Column(Boolean, default=True)

    # Snake-only (for now): grams of prey fed. With snake.current_weight_g
    # this is what powers the prey-size advisory on the snake feeding form.
    # Null for tarantula, enclosure-level, and lizard feedings and for snake
    # keepers who didn't weigh prey. See wgt_20260422 migration for rationale.
    prey_weight_g = Column(Numeric(8, 2), nullable=True)

    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    # passive_deletes=True lets the DB ON DELETE CASCADE remove these rows.
    # Without it SQLAlchemy nulls the parent FK on delete, which violates the
    # polymorphic "exactly one parent" CHECK (cip_20260527) and 500s — this
    # was the invert-delete bug (2026-06).
    tarantula = relationship("Tarantula", backref=backref("feeding_logs", passive_deletes=True))
    enclosure = relationship("Enclosure", back_populates="feeding_logs")
    animal = relationship("Animal", backref=backref("feeding_logs", passive_deletes=True))
    scorpion = relationship("Scorpion", backref=backref("feeding_logs", passive_deletes=True))
    invert = relationship("Invert", backref=backref("feeding_logs", passive_deletes=True))

    def __repr__(self):
        parent = (
            self.tarantula_id or self.enclosure_id or self.animal_id
            or self.scorpion_id
        )
        return f"<FeedingLog {parent} @ {self.fed_at}>"
