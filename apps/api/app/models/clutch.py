"""Clutch model — eggs laid from a reptile pairing.

1:N under reptile_pairings. Snakes get one big clutch per pairing;
geckos lay 2-egg clutches repeatedly through a season — both fit the
same shape, distinguished only by `expected_count` and how many
clutch rows hang under the pairing.
"""
import uuid

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Clutch(Base):
    __tablename__ = "clutches"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    pairing_id = Column(
        UUID(as_uuid=True),
        ForeignKey("reptile_pairings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Lifecycle dates
    laid_date = Column(Date, nullable=False, index=True)
    pulled_date = Column(Date, nullable=True)
    expected_hatch_date = Column(Date, nullable=True)
    hatch_date = Column(Date, nullable=True)

    # Incubation conditions
    incubation_temp_min_f = Column(Numeric(4, 1), nullable=True)
    incubation_temp_max_f = Column(Numeric(4, 1), nullable=True)
    incubation_humidity_min_pct = Column(Integer, nullable=True)
    incubation_humidity_max_pct = Column(Integer, nullable=True)

    # Counts — independent fields so a keeper can fill them in as
    # observations come in over the incubation period without forcing a
    # specific completion order.
    expected_count = Column(Integer, nullable=True)  # eggs laid
    fertile_count = Column(Integer, nullable=True)   # candled fertile
    slug_count = Column(Integer, nullable=True)      # infertile / failed
    hatched_count = Column(Integer, nullable=True)   # cracked + emerged
    viable_count = Column(Integer, nullable=True)    # past first week

    # Free-form candling log. Each entry is a dict like:
    # { date: '2026-04-14', fertile: 6, slug: 1, notes: '...' }
    # Loose schema so keepers' field practices don't force migrations.
    candle_log = Column(JSONB, nullable=True)

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

    # Relationships
    pairing = relationship("ReptilePairing", back_populates="clutches")
    offspring = relationship(
        "ReptileOffspring",
        back_populates="clutch",
        cascade="all, delete-orphan",
    )
