"""
Feeding log model
"""
from sqlalchemy import Column, String, Boolean, Integer, DateTime, ForeignKey, Numeric, Text, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


class FeedingLog(Base):
    __tablename__ = "feeding_logs"
    __table_args__ = (
        # Polymorphic parent: exactly one of tarantula_id / enclosure_id /
        # snake_id / lizard_id is set. Enforced by DB CHECK — the three-
        # parent version was added in flg_20260421_extend_feeding_logs_polymorphic,
        # extended to four parents in lzp_20260423_extend_polymorphic_tables.
        CheckConstraint(
            'num_nonnulls(tarantula_id, enclosure_id, snake_id, lizard_id) = 1',
            name='feeding_logs_must_have_exactly_one_parent',
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tarantula_id = Column(UUID(as_uuid=True), ForeignKey("tarantulas.id", ondelete="CASCADE"), nullable=True)
    enclosure_id = Column(UUID(as_uuid=True), ForeignKey("enclosures.id", ondelete="CASCADE"), nullable=True)
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

    fed_at = Column(DateTime(timezone=True), nullable=False)
    food_type = Column(String(100))  # e.g., "cricket", "roach", "mealworm"
    food_size = Column(String(50))  # e.g., "small", "medium", "large"
    quantity = Column(Integer, default=1)  # For group feedings: "fed 8 roaches"
    accepted = Column(Boolean, default=True)

    # Snake-only (for now): grams of prey fed. With snake.current_weight_g
    # this is what powers the prey-size advisory on the snake feeding form.
    # Null for tarantula, enclosure-level, and lizard feedings and for snake
    # keepers who didn't weigh prey. See wgt_20260422 migration for rationale.
    prey_weight_g = Column(Numeric(8, 2), nullable=True)

    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tarantula = relationship("Tarantula", backref="feeding_logs")
    enclosure = relationship("Enclosure", back_populates="feeding_logs")
    snake = relationship("Snake", backref="feeding_logs")
    lizard = relationship("Lizard", backref="feeding_logs")

    def __repr__(self):
        parent = self.tarantula_id or self.enclosure_id or self.snake_id or self.lizard_id
        return f"<FeedingLog {parent} @ {self.fed_at}>"
