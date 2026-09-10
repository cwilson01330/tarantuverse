"""
Care log — a timestamped hydration event on an animal.

log_type values:
  - water_dish : dish topped up or refreshed
  - overflow   : dish deliberately overfilled to damp the substrate
  - misted     : enclosure, substrate or webbing misted

WHY THREE TYPES AND NOT ONE
---------------------------
They are different husbandry acts. An overflow is not a sloppy refill — it is
how moisture-dependent species get their humidity, and how often it is
warranted varies by species. Misting is what slings and mantids actually
drink from; many of them never have a dish at all. Recording all three as
"water" would make the log agree with itself and disagree with the animal.

NO SCHEDULE, NO OVERDUE STATE
-----------------------------
Deliberately absent: `next_due`, any interval, and anything that could render
as a red badge. Feeding has an evidence base for cadence; hydration does not,
and the practice it models is genuinely ad hoc — dishes kept in most animals,
topped up on noticing, with some species wanting more. Deriving a deadline
from that would be a fabricated number wearing a warning colour. See ADR-014.

PARENT IS AN INVERT **OR** A COLONY — exactly one
-------------------------------------------------
No per-taxon columns. Legacy `tarantulas` / `scorpions` rows share primary keys
with `inverts` (ADR-005), so a tarantula's logs resolve through invert_id and
this table needs no migration when Phase D drops those tables.

Colonies joined in cwc_20260910. A detritivore culture is watered constantly
and fed almost incidentally, so hydration is the *primary* husbandry record
for it — leaving colonies out meant the one group that needs this most had
nowhere to put it.

Exactly-one rather than at-least-one (which is what `substrate_changes` uses):
that table tolerates both parents because ADR-005 dual-write rows carry
`tarantula_id` and `invert_id` together. This table was born after the
consolidation and has no such mirror, so it holds the tighter invariant.
"""
from sqlalchemy import (
    Column,
    String,
    Text,
    DateTime,
    ForeignKey,
    CheckConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from ..database import Base


# Single source of truth for the vocabulary. The schema regex and the DB CHECK
# both have to agree with this — a stale copy in one of the three is the exact
# shape of bug that 422'd the species browser during the ADR-006 expansion.
CARE_LOG_TYPES = ("water_dish", "overflow", "misted")


class CareLog(Base):
    __tablename__ = "care_logs"
    __table_args__ = (
        CheckConstraint(
            "log_type IN ('water_dish', 'overflow', 'misted')",
            name="care_logs_log_type_check",
        ),
        CheckConstraint(
            "num_nonnulls(invert_id, colony_id) = 1",
            name="care_logs_exactly_one_parent",
        ),
        Index("ix_care_logs_invert_logged_at", "invert_id", "logged_at"),
        Index("ix_care_logs_colony_logged_at", "colony_id", "logged_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Indexed by the composites in __table_args__, which lead with these.
    # Nullable since cwc_20260910 — the CHECK above enforces exactly one.
    invert_id = Column(
        UUID(as_uuid=True),
        ForeignKey("inverts.id", ondelete="CASCADE"),
        nullable=True,
    )
    colony_id = Column(
        UUID(as_uuid=True),
        ForeignKey("colonies.id", ondelete="CASCADE"),
        nullable=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    log_type = Column(String(20), nullable=False)
    logged_at = Column(DateTime(timezone=True), nullable=False)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # passive_deletes so deleting the parent animal doesn't trip the FK — the
    # ondelete CASCADE above is what does the work. Same reasoning as the
    # polymorphic log backrefs.
    invert = relationship("Invert", backref="care_logs", passive_deletes=True)
    colony = relationship("Colony", backref="care_logs", passive_deletes=True)

    def __repr__(self):
        return f"<CareLog {self.log_type} @ {self.logged_at}>"
