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
    # Polymorphic snake/lizard/frog FKs collapsed into animal_id in
    # anm_20260514 (ADR-003). animal_id is NOT NULL — no CHECK needed.

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    animal_id = Column(
        UUID(as_uuid=True),
        ForeignKey("animals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    weighed_at = Column(DateTime(timezone=True), nullable=False, index=True)
    weight_g = Column(Numeric(8, 2), nullable=False)

    # App-validated; DB stores as VARCHAR. See WEIGHT_LOG_CONTEXTS above.
    context = Column(String(20), nullable=False, default="routine")

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    animal = relationship("Animal", backref="weight_logs")

    def __repr__(self):
        return f"<WeightLog animal={self.animal_id} {self.weight_g}g @ {self.weighed_at}>"
