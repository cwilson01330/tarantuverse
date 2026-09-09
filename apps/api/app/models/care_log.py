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

PARENT IS `inverts`, ALWAYS
---------------------------
No per-taxon columns. Legacy `tarantulas` / `scorpions` rows share primary keys
with `inverts` (ADR-005), so a tarantula's logs resolve through invert_id and
this table needs no migration when Phase D drops those tables.
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
        Index("ix_care_logs_invert_logged_at", "invert_id", "logged_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Indexed by the composite in __table_args__, which leads with this column.
    invert_id = Column(
        UUID(as_uuid=True),
        ForeignKey("inverts.id", ondelete="CASCADE"),
        nullable=False,
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

    def __repr__(self):
        return f"<CareLog {self.log_type} @ {self.logged_at}>"
