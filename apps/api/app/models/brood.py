"""
Brood model — scorpion analogue of the tarantula `EggSac`.

Scorpions are viviparous (and ovoviviparous): the female carries the
developing embryos internally, then the newly-born scorplings climb
onto her back where they remain through their 1st instar. The "brood"
is that litter — there's no egg sac stage to track.

Father is NULLABLE because several keepable species are
parthenogenetic (Hottentotta hottentotta, Tityus serrulatus, Tityus
metuendus). The breeding UI will surface a hint when the mother's
species is documented as parthenogenetic-capable.

`pairing_id` is reserved for Phase 5. The scorpion_pairings table
doesn't exist yet — it'll be created at the same time as the breeding
router and a FK constraint will be added then. v1 keepers can still
log broods; they just won't be linked to a pairing event.
"""
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base


class Brood(Base):
    __tablename__ = "broods"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    mother_scorpion_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scorpions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Nullable for parthenogenetic species (Hottentotta, some Tityus).
    father_scorpion_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scorpions.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Reserved for Phase 5 — no FK constraint yet because the
    # scorpion_pairings table doesn't exist. Phase 5's migration will
    # add the FK.
    pairing_id = Column(UUID(as_uuid=True), nullable=True)

    date_born = Column(Date, nullable=False)
    count = Column(Integer)
    notes = Column(Text)

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", backref="broods")
    mother = relationship(
        "Scorpion",
        foreign_keys=[mother_scorpion_id],
        back_populates="broods_as_mother",
    )
    father = relationship(
        "Scorpion",
        foreign_keys=[father_scorpion_id],
        back_populates="broods_as_father",
    )

    def __repr__(self):
        return f"<Brood mother={self.mother_scorpion_id} date={self.date_born}>"
