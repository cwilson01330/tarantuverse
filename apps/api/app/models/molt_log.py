"""
Molt log model
"""
from sqlalchemy import Column, Numeric, Boolean, DateTime, ForeignKey, Text, String, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, backref
from sqlalchemy.sql import func
import uuid
from app.database import Base


class MoltLog(Base):
    __tablename__ = "molt_logs"
    __table_args__ = (
        # At-least-one parent. Kept in step with the LIVE definition — this
        # declaration had drifted (it omitted invert_id, added in inv_20260527)
        # and a stale copy here is worse than none, because it reads as
        # authoritative while the database enforces something else.
        # colony_id added in cml_20260730.
        CheckConstraint(
            'tarantula_id IS NOT NULL OR enclosure_id IS NOT NULL '
            'OR scorpion_id IS NOT NULL OR invert_id IS NOT NULL '
            'OR colony_id IS NOT NULL',
            name='molt_log_must_have_parent'
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tarantula_id = Column(UUID(as_uuid=True), ForeignKey("tarantulas.id", ondelete="CASCADE"), nullable=True)
    enclosure_id = Column(UUID(as_uuid=True), ForeignKey("enclosures.id", ondelete="CASCADE"), nullable=True)
    scorpion_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scorpions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # Inverts consolidation companion column. See feeding_log.py for
    # the full ADR-005 explanation; same pattern.
    invert_id = Column(
        UUID(as_uuid=True),
        ForeignKey("inverts.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # cml_20260730: a communal's molts belong to the GROUP. Finding a shed
    # skin is often the only observation a communal keeper gets, and it's how
    # sexing happens — you sex the molt, not the spider.
    colony_id = Column(
        UUID(as_uuid=True),
        ForeignKey("colonies.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    molted_at = Column(DateTime(timezone=True), nullable=False)
    premolt_started_at = Column(DateTime(timezone=True))
    # "Found a molt but don't know who." Meaningful for an enclosure-level or
    # communal record; for a colony-parented row it's implied — a colony molt
    # is by definition unattributed, since you can't tell which of eleven
    # spiders shed it.
    is_unidentified = Column(Boolean, default=False)

    # Measurements
    leg_span_before = Column(Numeric(5, 2))  # in inches or cm
    leg_span_after = Column(Numeric(5, 2))
    weight_before = Column(Numeric(6, 2))  # in grams
    weight_after = Column(Numeric(6, 2))

    notes = Column(Text)
    image_url = Column(String(500))  # Photo of the molt

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    # passive_deletes=True — DB CASCADE handles deletion; nulling the parent
    # FK would violate the polymorphic one-parent CHECK and 500 (2026-06 fix).
    tarantula = relationship("Tarantula", backref=backref("molt_logs", passive_deletes=True))
    enclosure = relationship("Enclosure", back_populates="molt_logs")
    scorpion = relationship("Scorpion", backref=backref("molt_logs", passive_deletes=True))
    invert = relationship("Invert", backref=backref("molt_logs", passive_deletes=True))
    colony = relationship("Colony", backref=backref("molt_logs", passive_deletes=True))

    def __repr__(self):
        parent = (
            self.tarantula_id or self.enclosure_id or self.scorpion_id
            or self.invert_id or self.colony_id
        )
        return f"<MoltLog {parent} @ {self.molted_at}>"
