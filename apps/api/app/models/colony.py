"""
Colony — population-level tracking for communal / colony keepers (ADR-010).

A colony is a *population* (isopods, springtails, roaches, communal setups)
tracked as ONE first-class collection entry with per-life-stage headcounts —
NOT a bag of individual `inverts`, and NOT a flavor of the physical
`enclosures` box. This mirrors the proven FeederColony shape (JSONB buckets +
an adjustment log) but for pet collections: it links to an `invert_species`
care sheet, counts as 1 toward the free-tier cap, and lives in the collection
beside individual animals.

Design notes:
* `stage_counts` is ALWAYS bucketed (ADR-010 decision). Casual keepers can put
  everything in the `mixed` bucket; breeders split adults / juveniles / nymphs.
  `count_is_estimated` keeps us honest — "~50" is a valid answer.
* `colony_events` is the population lifecycle (births / deaths / cannibalism /
  additions / removals). An event with a `count_delta` adjusts a bucket on
  write — same pattern as FeederCareLog → count.
* Taxon uses a VARCHAR + CHECK (kept in lockstep with `INVERT_TAXON_VALUES`),
  never a PG enum, per the enum-double-create memory.
"""
from sqlalchemy import (
    Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey, Numeric,
    Integer, String, Text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base


# Event vocabulary — mirrors (and generalizes) the legacy CommunalIncident
# incident_type list. Validated at the schema layer.
COLONY_EVENT_TYPES = (
    "birth", "death", "added", "removed", "cannibalism",
    "aggression", "molt_found", "split", "merge",
    "observation", "count_correction",
)


class Colony(Base):
    __tablename__ = "colonies"
    __table_args__ = (
        CheckConstraint(
            "taxon IN ('tarantula', 'scorpion', 'centipede', "
            "'whip_spider', 'vinegaroon', 'true_spider', "
            "'millipede', 'mantis', 'roach', 'other')",
            name="colonies_taxon_check",
        ),
        CheckConstraint(
            "visibility IN ('private', 'public')",
            name="colonies_visibility_check",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Taxon discriminator — lowercase value, same vocab as inverts.
    taxon = Column(String(20), nullable=False, index=True)

    species_id = Column(
        UUID(as_uuid=True),
        ForeignKey("invert_species.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Optional physical container. SET NULL so deleting the enclosure record
    # doesn't drop the colony (the keeper may rehouse + reuse the name).
    enclosure_id = Column(
        UUID(as_uuid=True),
        ForeignKey("enclosures.id", ondelete="SET NULL"),
        nullable=True,
    )

    name = Column(String(100), nullable=False)

    # Provenance
    date_acquired = Column(Date, nullable=True)
    founded_date = Column(Date, nullable=True)  # when this colony line started
    source = Column(String(20), nullable=True)  # bought | bred | wild_caught (app-level)

    # Population — ALWAYS bucketed. e.g. {"adults": 10, "juveniles": 20,
    # "nymphs": 100, "mixed": 0}. Total is summed at the API layer.
    stage_counts = Column(JSONB, nullable=True)
    count_is_estimated = Column(Boolean, nullable=False, default=False)

    # Husbandry (parity with the invert detail card)
    substrate_type = Column(String(100), nullable=True)
    substrate_depth = Column(String(50), nullable=True)
    last_substrate_change = Column(Date, nullable=True)
    target_temp_min = Column(Numeric(5, 2), nullable=True)  # Fahrenheit
    target_temp_max = Column(Numeric(5, 2), nullable=True)
    target_humidity_min = Column(Numeric(5, 2), nullable=True)  # Percentage
    target_humidity_max = Column(Numeric(5, 2), nullable=True)
    water_dish = Column(Boolean, nullable=True)

    notes = Column(Text, nullable=True)
    photo_url = Column(String(500), nullable=True)

    visibility = Column(String(10), nullable=False, default="private")

    # Archive without delete (mirrors FeederColony.is_active).
    is_active = Column(Boolean, nullable=False, default=True, index=True)

    # Reserved for a future transfer flow — mirrors inverts so a colony-aware
    # count can exclude handed-off colonies consistently.
    transferred_out_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    user = relationship("User", backref="colonies")
    species = relationship("InvertSpecies")
    enclosure = relationship("Enclosure")
    events = relationship(
        "ColonyEvent",
        back_populates="colony",
        cascade="all, delete-orphan",
        order_by="ColonyEvent.occurred_at.desc()",
    )

    def __repr__(self):
        return f"<Colony {self.taxon}:{self.name}>"


class ColonyEvent(Base):
    """Timestamped population event on a colony (ADR-010).

    Generalizes the legacy tarantula-only `CommunalIncident`. A `count_delta`
    (+ optional `stage`) mutates the colony's `stage_counts` on write.
    """
    __tablename__ = "colony_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    colony_id = Column(
        UUID(as_uuid=True),
        ForeignKey("colonies.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    event_type = Column(String(30), nullable=False)
    # Which bucket this event affects (nullable — e.g. an observation).
    stage = Column(String(40), nullable=True)
    # Signed change applied to the bucket (nullable — notes/observations).
    count_delta = Column(Integer, nullable=True)

    occurred_at = Column(
        Date, nullable=False, server_default=func.current_date(), index=True,
    )
    # Only meaningful for aggression/cannibalism: minor | moderate | severe
    severity = Column(String(20), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    colony = relationship("Colony", back_populates="events")
    user = relationship("User")

    def __repr__(self):
        return f"<ColonyEvent {self.event_type} @ {self.occurred_at}>"
