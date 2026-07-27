"""
SpeciesShortlist — species a keeper is considering but doesn't own yet.

WHY SERVER-SIDE, NOT LOCAL
-------------------------
The design brief called this a "local shortlist". It's stored server-side
instead, because Tarantuverse is a web + mobile platform: a keeper who
bookmarks a species while browsing on their phone at an expo and then opens
the site at home expects to find it. A device-local list would silently
diverge between the two and be lost on reinstall — which for a "things I want
to buy" list is exactly the moment it matters.

It's also cheap: one narrow table, no per-taxon branching.

SHAPE
-----
Keyed to `invert_species`, which is the unified catalog covering ALL ten taxa
(tarantulas are mirrored in there by the ADR-005 backfill). That means one
table serves every taxon rather than one per catalog, and the legacy `species`
table doesn't need to be involved.

`note` exists because the real use is "P. metallica — the one Dave has at
$140, ask about sexing" rather than a bare bookmark.
"""
from sqlalchemy import Column, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base


class SpeciesShortlist(Base):
    __tablename__ = "species_shortlist"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # → invert_species (the unified catalog), NOT the legacy `species` table.
    species_id = Column(
        UUID(as_uuid=True),
        ForeignKey("invert_species.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        # Bookmarking twice is a no-op, not a duplicate row. The router
        # relies on this to make POST idempotent.
        UniqueConstraint("user_id", "species_id", name="uq_species_shortlist_user_species"),
    )

    species = relationship("InvertSpecies", lazy="joined")
