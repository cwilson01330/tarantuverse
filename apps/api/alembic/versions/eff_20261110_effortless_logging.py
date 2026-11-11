"""Effortless logging: reminder switches and the columns behind them.

Revision ID: eff_20261110_effortless_logging
Revises: ros_20261110_restore_offspring_status
Create Date: 2026-11-10

Spec: docs/superpowers/specs/2026-11-10-effortless-logging-design.md

  * notification_preferences: three keeper switches, NOT NULL, server default
    FALSE — every existing row ends up with all three off, so nothing changes
    for anyone until they turn a switch on. Only
    `ensure_notification_preferences` writes TRUE (new accounts).
  * molt_logs.feeding_pause_days: keeper-set pause after a molt (0 = don't pause),
    CHECK 0-60.
  * feeding_logs.reminder_date + a unique partial index on
    (invert_id, reminder_date): one log per animal per reminder day, so a double
    tap on a notification button can't create two.
  * inverts.reminder_snoozed_until: the "Tomorrow" button.
"""
from typing import Union

import sqlalchemy as sa
from alembic import op


revision: str = "eff_20261110_effortless_logging"
down_revision: Union[str, None] = "ros_20261110_restore_offspring_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name in ("smart_reminders_enabled", "refusal_restarts_wait", "post_molt_pause_enabled"):
        op.add_column(
            "notification_preferences",
            sa.Column(name, sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    op.add_column("molt_logs", sa.Column("feeding_pause_days", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_molt_logs_feeding_pause_days",
        "molt_logs",
        "feeding_pause_days IS NULL OR (feeding_pause_days >= 0 AND feeding_pause_days <= 60)",
    )

    op.add_column("feeding_logs", sa.Column("reminder_date", sa.Date(), nullable=True))
    op.create_index(
        "uq_feeding_logs_reminder",
        "feeding_logs",
        ["invert_id", "reminder_date"],
        unique=True,
        postgresql_where=sa.text("reminder_date IS NOT NULL"),
    )

    op.add_column("inverts", sa.Column("reminder_snoozed_until", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("inverts", "reminder_snoozed_until")

    op.drop_index("uq_feeding_logs_reminder", table_name="feeding_logs")
    op.drop_column("feeding_logs", "reminder_date")

    op.drop_constraint("ck_molt_logs_feeding_pause_days", "molt_logs", type_="check")
    op.drop_column("molt_logs", "feeding_pause_days")

    for name in ("post_molt_pause_enabled", "refusal_restarts_wait", "smart_reminders_enabled"):
        op.drop_column("notification_preferences", name)
