"""
Push addresses, one per (account, app) (HV day one, spec 2026-11-17 §6).

Tarantuverse and Herpetoverse are separate Expo projects: a token from one
can't show a notification in the other. Both apps used to write the single
`notification_preferences.expo_push_token` and overwrote each other. That
column is still written for Tarantuverse registrations so old code paths and
the prefs GET response keep working; sending goes through
`services/push_tokens.push_token_for`.

VARCHAR + CHECK, not a PG enum. `PUSH_APPS` and migration
`pta_20261118_push_tokens_per_app` must stay in lockstep.
"""
import uuid

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.database import Base

PUSH_APPS = ("tarantuverse", "herpetoverse")


class PushToken(Base):
    __tablename__ = "push_tokens"
    __table_args__ = (
        CheckConstraint("app IN ('tarantuverse', 'herpetoverse')", name="ck_push_tokens_app"),
        UniqueConstraint("user_id", "app", name="uq_push_tokens_user_app"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    app = Column(String(20), nullable=False)
    token = Column(String(255), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    def __repr__(self) -> str:
        return f"<PushToken {self.app} user={self.user_id}>"
