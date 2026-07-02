"""Daily digest + timezone prefs (ADR-009 Phase 3)

Revision ID: ntf2_20260701_digest
Revises: ntf_20260701_notifications
Create Date: 2026-07-01

Adds daily-digest controls + the device timezone to notification_preferences so
the digest job can fire one "N animals due for feeding" push per user at a
sensible local hour. Additive + non-breaking.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'ntf2_20260701_digest'
down_revision: Union[str, None] = 'ntf_20260701_notifications'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "notification_preferences",
        sa.Column("daily_digest_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "notification_preferences",
        sa.Column("digest_hour", sa.Integer(), nullable=False, server_default=sa.text("9")),
    )
    op.add_column(
        "notification_preferences",
        sa.Column("tz_offset_minutes", sa.Integer(), nullable=True),
    )
    op.add_column(
        "notification_preferences",
        sa.Column("last_digest_sent_on", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("notification_preferences", "last_digest_sent_on")
    op.drop_column("notification_preferences", "tz_offset_minutes")
    op.drop_column("notification_preferences", "digest_hour")
    op.drop_column("notification_preferences", "daily_digest_enabled")
