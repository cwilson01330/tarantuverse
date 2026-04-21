"""
Photo model

Polymorphic parent: a photo can belong to a tarantula OR a snake, not both.
Enforced by DB CHECK constraint `photos_must_have_exactly_one_parent` added
in migration pht_20260421_extend_photos_polymorphic.
"""
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


class Photo(Base):
    __tablename__ = "photos"
    __table_args__ = (
        CheckConstraint(
            'num_nonnulls(tarantula_id, snake_id) = 1',
            name='photos_must_have_exactly_one_parent',
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tarantula_id = Column(
        UUID(as_uuid=True),
        ForeignKey("tarantulas.id", ondelete="CASCADE"),
        nullable=True,
    )
    snake_id = Column(
        UUID(as_uuid=True),
        ForeignKey("snakes.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    url = Column(String(500), nullable=False)
    thumbnail_url = Column(String(500))
    caption = Column(Text)

    taken_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tarantula = relationship("Tarantula", backref="photos")
    snake = relationship("Snake", backref="photos")

    def __repr__(self):
        parent = self.tarantula_id or self.snake_id
        return f"<Photo {self.id} parent={parent}>"
