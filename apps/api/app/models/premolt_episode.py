"""
Premolt episodes (premolt v2, spec 2026-11-17).

One row per stretch during which an animal "may be in premolt". An episode is
opened by the daily pass, closed with a reason, and may carry the keeper's
answer to the card. At most one OPEN episode per animal (partial unique index).
Owner-only data: never exposed on public routes, share cards or transfers.

VARCHAR + CHECK, not PG enums. The literals below and migration
`pmv_20261117_premolt_v2` must stay in lockstep.
"""
import uuid

from sqlalchemy import (
    CheckConstraint, Column, Date, DateTime, ForeignKey, Index, String, text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.database import Base

CLOSE_REASONS = ("molted", "ate", "keeper_not_yet", "cleared", "animal_closed", "stale")
KEEPER_ANSWERS = ("yes", "not_yet")
ANSWER_SOURCES = ("card", "pause")


def _in(col: str, values: tuple) -> str:
    return f"{col} IN ({', '.join(repr(v) for v in values)})"


class PremoltEpisode(Base):
    __tablename__ = "premolt_episodes"
    __table_args__ = (
        CheckConstraint(_in("close_reason", CLOSE_REASONS), name="ck_premolt_episodes_close_reason"),
        CheckConstraint(_in("keeper_answer", KEEPER_ANSWERS), name="ck_premolt_episodes_keeper_answer"),
        CheckConstraint(_in("answer_source", ANSWER_SOURCES), name="ck_premolt_episodes_answer_source"),
        Index(
            "uq_premolt_episodes_open", "invert_id",
            unique=True, postgresql_where=text("closed_on IS NULL"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invert_id = Column(UUID(as_uuid=True), ForeignKey("inverts.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    opened_on = Column(Date, nullable=False)
    closed_on = Column(Date, nullable=True)
    close_reason = Column(String(20), nullable=True)
    branch = Column(String(30), nullable=False)
    signals = Column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    rule_version = Column(String(20), nullable=False)
    keeper_answer = Column(String(10), nullable=True)
    answer_source = Column(String(10), nullable=True)
    answered_at = Column(DateTime(timezone=True), nullable=True)
    answered_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
