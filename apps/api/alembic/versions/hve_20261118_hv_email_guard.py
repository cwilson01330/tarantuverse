"""Herpetoverse email reminder: its own once-a-day guard.

Revision ID: hve_20261118_hv_email_guard
Revises: pta_20261118_push_tokens_per_app
Create Date: 2026-11-18

Spec: docs/superpowers/specs/2026-11-17-hv-day-one-and-smart-reminders-design.md
(§5 call 6, §6 "Email").

  * notification_preferences.email_digest_last_sent_on_hv (Date, nullable): the
    UTC date the Herpetoverse reminder email last went out. The existing
    `email_digest_last_sent_on` stays the Tarantuverse one, so a keeper with
    animals due in both apps gets both emails on the same day. The daily cap
    counts rows carrying today's date in either column.

Additive and nullable: nothing to backfill. Downgrade drops the column.
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "hve_20261118_hv_email_guard"
down_revision: Union[str, None] = "pta_20261118_push_tokens_per_app"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notification_preferences",
        sa.Column("email_digest_last_sent_on_hv", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("notification_preferences", "email_digest_last_sent_on_hv")
