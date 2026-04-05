"""
QR upload session model — short-lived token that allows a phone browser
to upload a photo to a specific tarantula without being logged in.
"""
from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


class QRUploadSession(Base):
    __tablename__ = "qr_upload_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # The token embedded in the QR code URL — long random UUID, not guessable
    token = Column(String(64), unique=True, nullable=False, index=True)
    tarantula_id = Column(UUID(as_uuid=True), ForeignKey("tarantulas.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Allow multiple uploads per session (e.g. a whole photo shoot)
    used_count = Column(Integer, default=0)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tarantula = relationship("Tarantula")
    user = relationship("User")

    def __repr__(self):
        return f"<QRUploadSession {self.token[:8]}... tarantula={self.tarantula_id}>"
