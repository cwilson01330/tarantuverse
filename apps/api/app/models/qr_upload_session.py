"""
QR upload session model — short-lived token that allows a phone browser
to upload a photo to a specific tarantula, snake, or lizard without being
logged in.

Polymorphic parent: exactly one of `tarantula_id` / `snake_id` / `lizard_id`
is set. Enforced by DB CHECK constraint — two-parent version added in
qrp_20260421_extend_qr_sessions_polymorphic, three-parent version added in
lzp_20260423_extend_polymorphic_tables.
"""
from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Integer, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


class QRUploadSession(Base):
    __tablename__ = "qr_upload_sessions"
    __table_args__ = (
        # Polymorphic across TV tarantulas, HV animals, and TV
        # scorpions — exactly one parent set. scorpion_id added in
        # scp_20260522.
        CheckConstraint(
            'num_nonnulls(tarantula_id, animal_id, scorpion_id) = 1',
            name='qr_upload_sessions_must_have_exactly_one_parent',
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # The token embedded in the QR code URL — long random UUID, not guessable
    token = Column(String(64), unique=True, nullable=False, index=True)
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
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Allow multiple uploads per session (e.g. a whole photo shoot)
    used_count = Column(Integer, default=0)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tarantula = relationship("Tarantula")
    animal = relationship("Animal")
    scorpion = relationship("Scorpion")
    invert = relationship("Invert")
    user = relationship("User")

    def __repr__(self):
        parent = self.tarantula_id or self.animal_id or self.scorpion_id
        return f"<QRUploadSession {self.token[:8]}... parent={parent}>"
