"""
Co-keepers (PRD-shared-keeping, rung 3; build plan docs/design/PLAN-co-keepers.md).

A co-keeper is another user with their OWN account who can reach an owner's
collection in ONE app with a role. There are no sub-accounts: the member signs
in as themselves, and every request re-resolves the membership (utils/access),
so removing someone takes effect on their very next request (T9).

Roles, lowest to highest:
  viewer  — sees the shared collection, logs nothing
  logger  — logs feedings, molts, substrate, photos, care and events
  keeper  — logger, plus creating and editing animals and husbandry
Owner-only, whatever the role: deleting animals, transfers, import/export,
billing, invites and sitter links.

Invites (T11): the raw token is emailed once and never stored — only its
SHA-256 — and it can only be accepted by a signed-in account whose VERIFIED
email matches `invited_email`.
"""
import uuid

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base

MEMBER_APPS = ("tarantuverse", "herpetoverse")
MEMBER_ROLES = ("viewer", "logger", "keeper")
MEMBER_STATUSES = ("pending", "active", "declined", "removed", "left", "expired")
MAX_MEMBERS_PER_COLLECTION = 10  # active + pending, per owner per app (Cory, 2026-09-29)


class CollectionMember(Base):
    __tablename__ = "collection_members"
    __table_args__ = (
        CheckConstraint("app IN ('tarantuverse', 'herpetoverse')", name="collection_members_app_check"),
        CheckConstraint("role IN ('viewer', 'logger', 'keeper')", name="collection_members_role_check"),
        CheckConstraint(
            "status IN ('pending', 'active', 'declined', 'removed', 'left', 'expired')",
            name="collection_members_status_check",
        ),
        CheckConstraint(
            "member_user_id IS NULL OR member_user_id <> owner_user_id",
            name="collection_members_not_self",
        ),
        # An active membership needs a member; a pending invite needs a token.
        CheckConstraint(
            "status <> 'active' OR member_user_id IS NOT NULL",
            name="collection_members_active_has_member",
        ),
        CheckConstraint(
            "status <> 'pending' OR (invite_token_hash IS NOT NULL AND invite_expires_at IS NOT NULL)",
            name="collection_members_pending_has_token",
        ),
        Index(
            "uq_collection_members_active",
            "owner_user_id", "member_user_id", "app",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        Index(
            "uq_collection_members_pending_email",
            "owner_user_id", "invited_email", "app",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
        # The resolver's hot path: "is this user an active member of that owner's collection?"
        Index("ix_collection_members_member_lookup", "member_user_id", "owner_user_id", "app", "status"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # NULL until the invite is accepted. SET NULL when the member deletes their
    # account: the row stays (as history for attribution) but can never resolve.
    member_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    app = Column(String(20), nullable=False)
    role = Column(String(10), nullable=False)
    invited_email = Column(String(255), nullable=False)
    invite_token_hash = Column(String(64), nullable=True, unique=True)
    invite_expires_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(10), nullable=False, default="pending", server_default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    owner = relationship("User", foreign_keys=[owner_user_id])
    member = relationship("User", foreign_keys=[member_user_id])

    def __repr__(self) -> str:
        return f"<CollectionMember {self.app} {self.role} {self.status}>"
