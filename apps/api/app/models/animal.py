"""Animal model — unified Herpetoverse taxon record.

Implements ADR-003. Replaces the per-taxon Snake / Lizard / Frog models
with a single table discriminated by `taxon`. The three former tables
were byte-identical clones — the genuine biological divergence lives in
the species catalog and the log tables, not the per-animal record.

Adding a taxon now is: add a value to the `animal_taxon` enum and seed
species. No new table, no clone, no migration.

The `Sex` and `Source` enums are imported from the tarantula module —
shared DB enum types, UPPERCASE values (MALE/FEMALE/UNKNOWN,
BRED/BOUGHT/WILD_CAUGHT). Do NOT set values_callable; SQLAlchemy's
default (write .name) matches the prod enum values.

Naming note: the species FK column is `herp_species_id` → `herp_species`
(renamed from reptile_species in anh_20260514) but the related Python
class is still `ReptileSpecies` — the class rename was deferred to keep
the blast radius down; only the DB-facing name needed fixing.
"""
import enum
import uuid

from sqlalchemy import (
    Column,
    String,
    Text,
    Boolean,
    Numeric,
    Date,
    DateTime,
    ForeignKey,
    CheckConstraint,
    Enum as SQLEnum,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.tarantula import Sex, Source  # shared DB enums


# Taxon discriminator values (ADR-011). Single source of truth for the
# `animals.taxon` VARCHAR column + CHECK. Adding a herp group = add a value
# here, widen the CHECK in a migration, update the two frontend registries,
# and seed species — no PG-enum migration (that's why the old `animal_taxon`
# enum was retired). Kept in lockstep with the CHECK in
# htx_20260703_animal_taxon and the frontend `ANIMAL_TAXA` registries.
ANIMAL_TAXON_VALUES = (
    "snake", "lizard", "turtle", "tortoise", "frog", "salamander", "other",
)


class Animal(Base):
    __tablename__ = "animals"
    __table_args__ = (
        CheckConstraint(
            "taxon IN ('snake', 'lizard', 'turtle', 'tortoise', "
            "'frog', 'salamander', 'other')",
            name="animals_taxon_check",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    herp_species_id = Column(
        UUID(as_uuid=True),
        ForeignKey("herp_species.id"),
        nullable=True,
        index=True,
    )
    enclosure_id = Column(
        UUID(as_uuid=True),
        ForeignKey("enclosures.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Discriminator — every animal has a taxon. VARCHAR + CHECK (ADR-011),
    # not a PG enum, so adding a herp group is cheap. Lowercase values from
    # ANIMAL_TAXON_VALUES.
    taxon = Column(String(20), nullable=False, index=True)

    # Basic identity
    name = Column(String(100))
    common_name = Column(String(100))
    scientific_name = Column(String(255))

    # Shared DB enum types — see module docstring on values_callable.
    sex = Column(
        SQLEnum(Sex, name="sex", create_type=False),
        default=Sex.UNKNOWN,
    )

    # Acquisition
    date_acquired = Column(Date)
    hatch_date = Column(Date, nullable=True)
    source = Column(SQLEnum(Source, name="source", create_type=False))
    source_breeder = Column(String(255))
    price_paid = Column(Numeric(10, 2))

    # Current state (measured, not derived from species)
    current_weight_g = Column(Numeric(8, 2), nullable=True)
    current_length_in = Column(Numeric(6, 2), nullable=True)

    # Husbandry reference. brumation_* doubles as aestivation for
    # amphibians — same UX, slightly misleading column name kept for
    # cross-taxon consistency.
    feeding_schedule = Column(String(200), nullable=True)
    last_fed_at = Column(DateTime(timezone=True), nullable=True)
    last_shed_at = Column(Date, nullable=True)
    brumation_active = Column(Boolean, default=False)
    brumation_started_at = Column(Date, nullable=True)

    # Feeding pause — hunger strikes, post-rehouse fasting, post-shed
    # waits, breeding-season off-feed. See pse_20260502.
    feeding_paused_reason = Column(String(40), nullable=True)
    feeding_paused_until = Column(Date, nullable=True)

    # CGD override — NULL inherits from herp_species.feeds_on_cgd,
    # true/false explicitly overrides for this animal. Drives CGD-aware
    # feeding-status thresholds in the clients (overdue at day 4 instead
    # of day 7). See cgd_20260522 migration.
    feeds_on_cgd_override = Column(Boolean, nullable=True)

    # Media
    photo_url = Column(String(500))

    # Provenance / transfer (htr_20260707 — mirrors inverts). A non-null
    # transferred_out_at badges a handed-off SOURCE record so it drops from
    # the owner's active collection + feeding reminders. The buyer's CLAIMED
    # record carries bred_by_user_id / origin_keeper_name / source_transfer_id
    # and a frozen `provenance` snapshot.
    transferred_out_at = Column(DateTime(timezone=True), nullable=True, index=True)
    bred_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    origin_keeper_name = Column(String(255), nullable=True)
    source_transfer_id = Column(UUID(as_uuid=True), nullable=True)
    provenance = Column(JSONB, nullable=True)

    # Privacy
    is_public = Column(Boolean, default=False)
    visibility = Column(String(20), default="private")

    # Notes
    notes = Column(Text)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships. foreign_keys pins the owner FK — bred_by_user_id is a
    # SECOND users FK (provenance), so the join is otherwise ambiguous.
    user = relationship("User", foreign_keys=[user_id], backref="animals")
    herp_species = relationship("ReptileSpecies", backref="animals")
    enclosure = relationship("Enclosure", backref="animal_inhabitants")

    @property
    def feeds_on_cgd(self) -> bool:
        """Resolved CGD flag — per-animal override wins, then species
        default, then False. Read by AnimalResponse.feeds_on_cgd via
        Pydantic from_attributes. For list endpoints, the animals
        router eager-loads herp_species to avoid an N+1.
        """
        if self.feeds_on_cgd_override is not None:
            return bool(self.feeds_on_cgd_override)
        if self.herp_species is not None:
            return bool(self.herp_species.feeds_on_cgd)
        return False

    def __repr__(self):
        return f"<Animal {self.taxon} {self.name or self.scientific_name}>"
