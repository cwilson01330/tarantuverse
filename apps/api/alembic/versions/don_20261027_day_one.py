"""Day one: opt-in email digest columns + a preferences row for every account.

Revision ID: don_20261027_day_one
Revises: whn_20261023_whats_new_seen
Create Date: 2026-10-27

* `notification_preferences.email_digest_enabled` (NOT NULL, default false): the
  keeper's opt-in for the daily email version of the feeding digest.
* `notification_preferences.email_digest_last_sent_on` (date, nullable): the UTC
  date of the last digest email; one per person per UTC day, and the daily cap
  counts rows carrying today's date.
* Backfill: accounts that never had a preferences row (only keepers who had
  opened notification settings or registered a push token did) get one with the
  defaults the app has always written (daily digest on at 9, email off), so the
  daily reminder reaches the in-app bell for everyone. Existing rows are never
  touched; the statement is idempotent.

Reversible: downgrade drops the two columns only. The backfilled rows stay (they
are ordinary preference rows).
"""
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "don_20261027_day_one"
down_revision: Union[str, None] = "whn_20261023_whats_new_seen"
branch_labels = None
depends_on = None


# Every column of notification_preferences, NOT NULL or not, gets the value the
# app writes for a new row (services/notification_prefs.py), so a backfilled row
# is indistinguishable from one created on first GET. `gen_random_uuid()` needs
# Postgres 13+ (core since then; Neon runs newer).
BACKFILL_SQL = """
INSERT INTO notification_preferences (
    id, user_id,
    feeding_reminders_enabled, feeding_reminder_hours,
    substrate_reminders_enabled, substrate_reminder_days,
    molt_predictions_enabled,
    maintenance_reminders_enabled, maintenance_reminder_days,
    feeder_low_stock_enabled,
    push_notifications_enabled, direct_messages_enabled, forum_replies_enabled,
    new_followers_enabled, community_activity_enabled, sitter_activity_enabled,
    quiet_hours_enabled, quiet_hours_start, quiet_hours_end,
    daily_digest_enabled, digest_hour,
    email_digest_enabled
)
SELECT
    gen_random_uuid(), u.id,
    TRUE, 24,
    TRUE, 90,
    TRUE,
    TRUE, 30,
    TRUE,
    TRUE, TRUE, TRUE,
    TRUE, FALSE, TRUE,
    FALSE, '22:00', '08:00',
    TRUE, 9,
    FALSE
FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM notification_preferences p WHERE p.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING
"""


def upgrade() -> None:
    op.add_column(
        "notification_preferences",
        sa.Column("email_digest_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "notification_preferences",
        sa.Column("email_digest_last_sent_on", sa.Date(), nullable=True),
    )
    op.execute(BACKFILL_SQL)


def downgrade() -> None:
    op.drop_column("notification_preferences", "email_digest_last_sent_on")
    op.drop_column("notification_preferences", "email_digest_enabled")
