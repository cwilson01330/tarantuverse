"""Weight log model

Standalone weigh-ins for snakes or lizards, independent of sheds.
ShedLog captures weight-at-shed-event; this table captures arbitrary
weigh-ins — the keeper weighs the animal every week, every feeding,
whenever. Powers:

  - Time-series weight chart on the animal detail page
  - 30-day weight-loss alert (vs. species-specific concern threshold)
  - Life-stage classification for the feeding advisory (which uses
    the most-recent weight to pick the right ratio bracket from the
    reptile_species.life_stage_feeding JSONB)

Polymorphic parent: exactly one of `snake_id` / `lizard_id` is set.
Originally snake-only with NOT NULL on snake_id; extended to polymorphic
in lzp_20260423_extend_polymorphic_tables.

`context` is a plain VARCHAR with app-layer Pydantic validation — see
the wgt_20260422 migration module docstring for the rationale.
"""
from sqlalchemy import (
    Column,
    String,
    Numeric,
    DateTime,
    ForeignKey,
    Text,
    CheckConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


# App-layer accepted values for weight_logs.context — kept in sync with
# the WeightLogBase.context Pydantic pattern. Stored as VARCHAR.
WEIGHT_LOG_CONTEXTS = (
    "routine",       # Regular weekly/monthly weigh-in
    "pre_feed",      # Weighed right before a feeding (best for ratio math)
    "post_shed",     # Weighed right after a shed (snakes/lizards often drop weight)
    "pre_breeding",  # Pre-pairing weight check (breeders)
    "post_lay",      # Post-ovipositing weight (breeders, females)
    "other",         # Anything that doesn't fit — keeper adds context in notes
)


class WeightLog(Base):
    __tablename__ = "weight_logs"
    __table_args__ = (
        CheckConstraint(
            'num_nonnulls(snake_id, lizard_id) = 1',
            name='weight_logs_must_have_exactly_one_parent',
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    snake_id = Column(
        UUID(as_uuid=True),
        ForeignKey("snakes.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    lizard_id = Column(
        UUID(as_uuid=True),
        ForeignKey("lizards.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    weighed_at = Column(DateTime(timezone=True), nullable=False, index=True)
    weight_g = Column(Numeric(8, 2), nullable=False)

    # App-validated; DB stores as VARCHAR. See WEIGHT_LOG_CONTEXTS above.
    context = Column(String(20), nullable=False, default="routine")

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    snake = relationship("Snake", backref="weight_logs")
    lizard = relationship("Lizard", backref="weight_logs")

    def __repr__(self):
        parent = self.snake_id or self.lizard_id
        return f"<WeightLog parent={parent} {self.weight_g}g @ {self.weighed_at}>"
