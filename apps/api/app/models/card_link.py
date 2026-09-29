"""A card link — an unlisted, frozen, revocable page showing ONE share card.

Spec §6. The payload is the composed card (already filtered to the fields the
keeper chose) captured at the moment of sharing, so later edits to the animal
never reach it. There is deliberately no FK to the animal: animals live in two
tables (`inverts`, `animals`), and a deleted animal is detected at read time
(the link then reads as revoked).
"""
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


class CardLink(Base):
    __tablename__ = "card_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(32), unique=True, index=True, nullable=False)
    app = Column(String(20), nullable=False)
    animal_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    kind = Column(String(20), nullable=False)
    payload = Column(JSONB, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
