"""
Photo model

Polymorphic parent: a photo can belong to a tarantula, a snake, OR a lizard —
exactly one. Enforced by DB CHECK constraint
`photos_must_have_exactly_one_parent` — added as two-parent in migration
pht_20260421_extend_photos_polymorphic, extended to three-parent in
lzp_20260423_extend_polymorphic_tables.
"""
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, backref
from sqlalchemy.sql import func
import uuid
from app.database import Base


class Photo(Base):
    __tablename__ = "photos"
    __table_args__ = (
        # Polymorphic across TV tarantulas, HV animals, and TV
        # scorpions — exactly one parent is set. scorpion_id added in
        # scp_20260522.
        CheckConstraint(
            'num_nonnulls(tarantula_id, animal_id, scorpion_id) = 1',
            name='photos_must_have_exactly_one_parent',
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tarantula_id = Column(
        UUID(as_uuid=True),
        ForeignKey("tarantulas.id", ondelete="CASCADE"),
        nullable=True,
    )
    animal_id = Column(
        UUID(as_uuid=True),
        ForeignKey("animals.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    scorpion_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scorpions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # Inverts consolidation companion column — see ADR-005.
    invert_id = Column(
        UUID(as_uuid=True),
        ForeignKey("inverts.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    url = Column(String(500), nullable=False)
    thumbnail_url = Column(String(500))
    caption = Column(Text)

    taken_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    # passive_deletes=True — DB CASCADE handles deletion. Nulling the parent
    # FK on delete violated photos_must_have_exactly_one_parent and 500'd
    # invert deletes for any animal with photos (2026-06 fix).
    tarantula = relationship("Tarantula", backref=backref("photos", passive_deletes=True))
    animal = relationship("Animal", backref=backref("photos", passive_deletes=True))
    scorpion = relationship("Scorpion", backref=backref("photos", passive_deletes=True))
    invert = relationship("Invert", backref=backref("photos", passive_deletes=True))

    def __repr__(self):
        parent = self.tarantula_id or self.animal_id or self.scorpion_id
        return f"<Photo {self.id} parent={parent}>"
