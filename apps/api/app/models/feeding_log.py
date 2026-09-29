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
        # Kept in sync with cph_20260729_colony_logs. Had drifted the same way
        # photos.py had — still the pre-invert_id form. A feeding belongs to
        # exactly one animal OR one colony. The first branch stays loose about
        # invert_id because dual-write rows carry both parents.
        CheckConstraint(
            '(num_nonnulls(tarantula_id, enclosure_id, animal_id, scorpion_id) = 1 '
            'AND colony_id IS NULL) '
            'OR (num_nonnulls(tarantula_id, enclosure_id, animal_id, scorpion_id) = 0 '
            'AND num_nonnulls(invert_id, colony_id) = 1)',
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
    # Group feedings. A communal is fed as a unit — one log per feeding event,
    # not one per animal (cph_20260729_colony_logs).
    colony_id = Column(
        UUID(as_uuid=True),
        ForeignKey("colonies.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
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

    # Authorship (slg_20260928_sitter_logging). Both NULL = the owner logged
    # it, which is what every row before sitter logging means. SET NULL on
    # delete: removing a pass or an account strips attribution, never history.
    logged_via_pass_id = Column(
        UUID(as_uuid=True),
        ForeignKey("keeper_passes.id", ondelete="SET NULL"),
        nullable=True,
    )
    logged_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    logged_by = relationship("User", foreign_keys=[logged_by_user_id], lazy="select")

    @property
    def logged_by_name(self):
        """Display name of the co-keeper who logged this, else None (the owner).
        Checks the id first so owner rows never trigger a lookup."""
        if self.logged_by_user_id is None:
            return None
        u = self.logged_by
        if u is None:
            return None
        return (getattr(u, "display_name", None) or "").strip() or getattr(u, "username", None)

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
    logged_via_pass = relationship("KeeperPass", lazy="select")

    @property
    def sitter_name(self):
        """Who logged this, when it came through a sitter pass; else None.

        Reads the pass's label (the sitter's name as the keeper typed it).
        Checks the id first so owner-logged rows never trigger a lazy load.
        """
        if self.logged_via_pass_id is None:
            return None
        p = self.logged_via_pass
        label = (getattr(p, "label", None) or "").strip() if p is not None else ""
        return label or "Your sitter"

    def __repr__(self):
        parent = (
            self.tarantula_id or self.enclosure_id or self.animal_id
            or self.scorpion_id
        )
        return f"<FeedingLog {parent} @ {self.fed_at}>"
