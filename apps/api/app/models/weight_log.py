"""Weight log model

Standalone weigh-ins for snakes, independent of sheds. ShedLog captures
weight-at-shed-event; this table captures arbitrary weigh-ins — the
keeper weighs the snake every week, every feeding, whenever. Powers:

  - Time-series weight chart on the snake detail page
  - 30-day weight-loss alert (vs. species-specific concern threshold)
  - Life-stage classification for the feeding advisory (which uses
    the most-recent weight to pick the right ratio bracket from the
    reptile_species.life_stage_feeding JSONB)

Parent is snake-only for v1. If lizards/geckos ship later they can
follow the polymorphic pattern used by feeding_logs and photos.

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
    "post_shed",     # Weighed right after a shed (snakes often drop weight)
    "pre_breeding",  # Pre-pairing weight check (breeders)
    "post_lay",      # Post-ovipositing weight (breeders, females)
    "other",         # Anything that doesn't fit — keeper adds context in notes
)


class WeightLog(Base):
    __tablename__ = "weight_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    snake_id = Column(
        UUID(as_uuid=True),
        ForeignKey("snakes.id", ondelete="CASCADE"),
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
    snake = relationship("Snake", backref="weight_logs")

    def __repr__(self):
        return f"<WeightLog snake={self.snake_id} {self.weight_g}g @ {self.weighed_at}>"
