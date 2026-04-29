"""Reptile offspring model — individual hatchlings from a clutch.

Two storage modes for the genotype:
  1. The hatchling was kept and registered as a real reptile —
     `snake_id` or `lizard_id` is set, and the live record's own
     `animal_genotypes` rows are authoritative.
  2. The hatchling was sold/traded/lost — only the offspring row
     exists, with `recorded_genotype` JSONB capturing the genotype
     observed at hatch (gene_key + zygosity per gene).

Both modes are fine. The morph-prediction comparison endpoint reads
from whichever source is present, falling back to free-text
`morph_label` for un-genotyped hatchlings.
"""
import enum
import uuid

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class ReptileOffspringStatus(str, enum.Enum):
    HATCHED = "hatched"      # alive, just emerged
    KEPT = "kept"            # rolled into keeper's collection
    AVAILABLE = "available"  # listed for sale but unsold
    SOLD = "sold"
    TRADED = "traded"
    GIFTED = "gifted"
    DECEASED = "deceased"
    UNKNOWN = "unknown"


class ReptileOffspring(Base):
    __tablename__ = "reptile_offspring"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    clutch_id = Column(
        UUID(as_uuid=True),
        ForeignKey("clutches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Optional links to live reptile records — SET NULL on delete so
    # offspring history survives the keeper later removing the spawned
    # animal (rehoming, loss, etc.).
    snake_id = Column(
        UUID(as_uuid=True),
        ForeignKey("snakes.id", ondelete="SET NULL"),
        nullable=True,
    )
    lizard_id = Column(
        UUID(as_uuid=True),
        ForeignKey("lizards.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Free-text identifier used in two cases:
    #   - hatchling without a recorded genotype yet ("Pied het albino")
    #   - human-readable name ("Hex Jr.") for the offspring entry
    morph_label = Column(String(200), nullable=True)

    # Genotype storage for hatchlings without a live snake/lizard FK.
    # Shape: [{ gene_key: 'pied', zygosity: 'het' | 'hom' | 'wild' }, ...]
    # Loose JSONB schema so adding a new genetic dimension (e.g.
    # `proven_het`) doesn't require a migration.
    recorded_genotype = Column(JSONB, nullable=True)

    status = Column(
        SQLEnum(
            ReptileOffspringStatus,
            name="reptile_offspring_status",
            values_callable=lambda x: [e.value for e in x],
        ),
        default=ReptileOffspringStatus.HATCHED,
        nullable=False,
        index=True,
    )
    status_date = Column(Date, nullable=True)

    # Sale tracking — populated when status moves to sold/traded.
    buyer_info = Column(Text, nullable=True)
    price_sold = Column(Numeric(10, 2), nullable=True)

    # Hatch measurements
    hatch_weight_g = Column(Numeric(5, 1), nullable=True)
    hatch_length_in = Column(Numeric(5, 1), nullable=True)

    notes = Column(Text, nullable=True)
    photo_url = Column(String(500), nullable=True)

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

    # Relationships — inverse of Clutch.offspring.
    clutch = relationship("Clutch", back_populates="offspring")
