"""Reptile pairing model — male × female mating record.

Both parents are rows in the unified `animals` table (ADR-003). The
`taxon` column is denormalized onto the pairing — same-taxon match is
enforced by the application (the pairing form's species check) since a
cross-row CHECK would need a trigger.

The table keeps the `reptile_pairings` name even though it now also
covers amphibians — renaming it is a bigger refactor than the misnomer
is worth (same call as keeping `reptile_species` → `herp_species` as
the only rename).
"""
import enum
import uuid

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.animal import AnimalTaxon


class ReptilePairingType(str, enum.Enum):
    NATURAL = "natural"
    COHABITATION = "cohabitation"
    ASSISTED = "assisted"
    AI = "ai"  # artificial insemination — rare but happens in monitor breeding


class ReptilePairingOutcome(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    SUCCESSFUL = "successful"
    UNSUCCESSFUL = "unsuccessful"
    ABANDONED = "abandoned"
    UNKNOWN = "unknown"


class ReptilePairing(Base):
    __tablename__ = "reptile_pairings"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Cross-taxon parents — exactly one of *_snake_id / *_lizard_id is
    # populated per side. CHECK constraints in the migration enforce
    # this + same-taxon for the pair.
    # Both parents are rows in the unified animals table (ADR-003).
    # The per-taxon *_snake_id / *_lizard_id / *_frog_id columns were
    # collapsed in anm_20260514.
    male_animal_id = Column(
        UUID(as_uuid=True),
        ForeignKey("animals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    female_animal_id = Column(
        UUID(as_uuid=True),
        ForeignKey("animals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Denormalized taxon — both parents share it (app-enforced). Lets
    # the breeding overview filter/group without joining to animals.
    taxon = Column(
        SQLEnum(
            AnimalTaxon,
            name="animal_taxon",
            create_type=False,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )

    paired_date = Column(Date, nullable=False, index=True)
    separated_date = Column(Date, nullable=True)

    pairing_type = Column(
        SQLEnum(
            ReptilePairingType,
            name="reptile_pairing_type",
            values_callable=lambda x: [e.value for e in x],
        ),
        default=ReptilePairingType.NATURAL,
        nullable=False,
    )
    outcome = Column(
        SQLEnum(
            ReptilePairingOutcome,
            name="reptile_pairing_outcome",
            values_callable=lambda x: [e.value for e in x],
        ),
        default=ReptilePairingOutcome.IN_PROGRESS,
        nullable=False,
    )

    # Per-pairing privacy. Defaults TRUE — keepers don't want
    # competitors browsing morph projects before offspring are listed.
    is_private = Column(Boolean, default=True, nullable=False)

    notes = Column(Text, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=True,
    )

    # Relationships
    clutches = relationship(
        "Clutch",
        back_populates="pairing",
        cascade="all, delete-orphan",
    )
    male = relationship("Animal", foreign_keys=[male_animal_id])
    female = relationship("Animal", foreign_keys=[female_animal_id])

    # Back-compat aliases — `taxon` is now a real column. Some callers
    # still read `.male_id` / `.female_id`; keep them pointing at the
    # consolidated FKs so the router rewrite can migrate incrementally.
    @property
    def male_id(self):
        return self.male_animal_id

    @property
    def female_id(self):
        return self.female_animal_id
