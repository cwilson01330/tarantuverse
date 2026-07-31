"""Per-animal event log (ADR-015 D5).

Colonies got an event log in ADR-010. Individual animals never did, and the gap
was bigger than "colonies have a nicer timeline": there was literally nowhere to
record that an animal was injured, got sick, escaped and came back, or died.

WHY A NEW TABLE RATHER THAN A COLUMN ON AN EXISTING LOG
-------------------------------------------------------
Every per-animal log we already have is a TYPED record with type-specific
columns — a feeding has prey and acceptance, a molt has measurements, a
substrate change has a reason. An event is deliberately untyped: the whole point
is somewhere to put the thing that doesn't fit any of those. Forcing it into the
`notes` field of an unrelated log is how observations get lost.

WHY NOT REUSE colony_events WITH A NULLABLE ANIMAL FK
------------------------------------------------------
`count_delta` adjusting a `stage_counts` bucket is the core of ColonyEvent and
meaningless for an individual — an animal is one animal. Sharing the table means
every read branches on which half of the columns apply, forever, to save one
migration.

So this is ColonyEvent minus `count_delta` and `stage`, plus a polymorphic
parent so both products share it.
"""
from sqlalchemy import (
    CheckConstraint, Column, Date, DateTime, ForeignKey, String, Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import backref, relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base


# The vocabulary. Deliberately short — a long list is a list nobody reads, and
# the free-text note is where the actual information lives.
#
# `death` exists so the timeline reads coherently ("...fed, molted, died"), but
# it is NOT the source of truth for whether an animal is alive. That's
# `animals.died_at` / `inverts.died_at`. Deriving liveness by scanning an event
# log would be a correctness trap: one soft-deleted row and a dead animal comes
# back to life in the collection.
ANIMAL_EVENT_TYPES = (
    "injury",
    "illness",
    "bad_molt",
    "escape",
    "recovered",   # the counterpart to injury/illness/escape — things do go right
    "rehoused",
    "vet_visit",   # HV-leaning; exotics vets are rare for inverts but not unheard of
    "observation",
    "death",
)

# Only meaningful for injury / illness. An "observation" has no severity, and
# offering one would invite a judgment the keeper didn't make.
ANIMAL_EVENT_SEVERITIES = ("minor", "moderate", "severe")


class AnimalEvent(Base):
    """Something that happened to one animal, that isn't a feeding or a molt."""

    __tablename__ = "animal_events"
    __table_args__ = (
        # Exactly one parent. Unlike the log tables — which carry legacy
        # per-taxon FKs from before the consolidation and so can only manage
        # at-least-one — this table is new, so it can be strict from day one.
        CheckConstraint(
            "(invert_id IS NOT NULL AND animal_id IS NULL) OR "
            "(invert_id IS NULL AND animal_id IS NOT NULL)",
            name="animal_event_exactly_one_parent",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Tarantuverse parent. No legacy tarantula_id: this table postdates the
    # consolidation, so there's no dual-write history to honour.
    invert_id = Column(
        UUID(as_uuid=True),
        ForeignKey("inverts.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    # Herpetoverse parent.
    animal_id = Column(
        UUID(as_uuid=True),
        ForeignKey("animals.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    event_type = Column(String(30), nullable=False)
    # A DATE. Keepers know the day; storing a spurious time would be false
    # precision about something they usually noticed after the fact.
    occurred_at = Column(
        Date, nullable=False, server_default=func.current_date(), index=True,
    )
    severity = Column(String(20), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # passive_deletes: the DB CASCADE handles removal. Nulling the FK on the
    # Python side would violate the exactly-one-parent CHECK and 500 — the same
    # trap the polymorphic log relationships hit in 2026-06.
    invert = relationship("Invert", backref=backref("events", passive_deletes=True))
    animal = relationship("Animal", backref=backref("events", passive_deletes=True))
    user = relationship("User")

    def __repr__(self):
        return f"<AnimalEvent {self.event_type} @ {self.occurred_at}>"
