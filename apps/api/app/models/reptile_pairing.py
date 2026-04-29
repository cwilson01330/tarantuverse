"""Reptile pairing model — male × female mating record.

Cross-taxon: a pairing is between two snakes OR two lizards. The
DB CHECK constraints enforce that exactly one of `male_snake_id` /
`male_lizard_id` is set (ditto female), and both parents share the
same taxon. The Python convenience property `taxon` derives the
discriminator from whichever FKs are populated.
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
    male_snake_id = Column(
        UUID(as_uuid=True),
        ForeignKey("snakes.id", ondelete="CASCADE"),
        nullable=True,
    )
    male_lizard_id = Column(
        UUID(as_uuid=True),
        ForeignKey("lizards.id", ondelete="CASCADE"),
        nullable=True,
    )
    female_snake_id = Column(
        UUID(as_uuid=True),
        ForeignKey("snakes.id", ondelete="CASCADE"),
        nullable=True,
    )
    female_lizard_id = Column(
        UUID(as_uuid=True),
        ForeignKey("lizards.id", ondelete="CASCADE"),
        nullable=True,
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

    @property
    def taxon(self) -> str:
        """Derived discriminator — 'snake' or 'lizard'."""
        return "snake" if self.male_snake_id is not None else "lizard"

    @property
    def male_id(self):
        return self.male_snake_id or self.male_lizard_id

    @property
    def female_id(self):
        return self.female_snake_id or self.female_lizard_id
