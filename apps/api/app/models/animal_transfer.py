"""
AnimalTransfer — seller→buyer record handoff ("rehome").

BRIEF-animal-transfer-provenance. A seller generates a claim link/QR for an
animal they own; the buyer claims it and gets a NEW invert pre-loaded with
species, provenance, and copied photos. The seller's source record is badged
"Transferred" (see Invert.transferred_out_at) and drops out of their active
collection counts/cap/reminders.

Bright line: this records provenance and husbandry handoff — it never brokers
the sale. `sale_price` is a PRIVATE seller ledger value, never charged and never
returned to the buyer.

Token + public-claim pattern mirrors routers/qr.py (QRUploadSession).
"""
from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime, ForeignKey, Numeric, String, Text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base


class AnimalTransfer(Base):
    __tablename__ = "animal_transfers"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'claimed', 'cancelled', 'expired')",
            name="animal_transfers_status_check",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Short-lived public token — secrets.token_urlsafe(32), same as QR sessions.
    token = Column(String(64), unique=True, nullable=False, index=True)

    # Source animal being handed off.
    invert_id = Column(
        UUID(as_uuid=True),
        ForeignKey("inverts.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # Seller.
    from_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # Buyer — set on claim.
    to_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    # The NEW invert created for the buyer on claim.
    claimed_invert_id = Column(
        UUID(as_uuid=True),
        ForeignKey("inverts.id", ondelete="SET NULL"),
        nullable=True,
    )

    status = Column(String(16), nullable=False, default="pending", index=True)

    # Frozen at create — survives the seller editing/deleting their record.
    snapshot = Column(JSONB, nullable=False)

    note = Column(Text, nullable=True)  # seller's message to the buyer
    # PRIVATE seller ledger — never shown to buyer, never charged.
    sale_price = Column(Numeric(10, 2), nullable=True)
    include_photos = Column(Boolean, nullable=False, default=True)

    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships — disambiguate the two inverts FKs with foreign_keys.
    invert = relationship("Invert", foreign_keys=[invert_id])
    claimed_invert = relationship("Invert", foreign_keys=[claimed_invert_id])
    from_user = relationship("User", foreign_keys=[from_user_id])
    to_user = relationship("User", foreign_keys=[to_user_id])

    def __repr__(self):
        return f"<AnimalTransfer {self.status} invert={self.invert_id}>"
