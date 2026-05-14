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
    Enum as SQLEnum,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.tarantula import Sex, Source  # shared DB enums


class AnimalTaxon(str, enum.Enum):
    """Discriminator for the unified animals table.

    Stored lowercase in the `animal_taxon` PG enum. SQLEnum columns
    referencing this MUST use values_callable so SQLAlchemy writes the
    value (lowercase) rather than the name — same rule as the TV
    breeding enums (see feedback_tv_breeding_enum_values_callable).
    """
    SNAKE = "snake"
    LIZARD = "lizard"
    FROG = "frog"


class Animal(Base):
    __tablename__ = "animals"

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

    # Discriminator — every animal has a taxon.
    taxon = Column(
        SQLEnum(
            AnimalTaxon,
            name="animal_taxon",
            create_type=False,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        index=True,
    )

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

    # Media
    photo_url = Column(String(500))

    # Privacy
    is_public = Column(Boolean, default=False)
    visibility = Column(String(20), default="private")

    # Notes
    notes = Column(Text)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", backref="animals")
    herp_species = relationship("ReptileSpecies", backref="animals")
    enclosure = relationship("Enclosure", backref="animal_inhabitants")

    def __repr__(self):
        return f"<Animal {self.taxon} {self.name or self.scientific_name}>"
