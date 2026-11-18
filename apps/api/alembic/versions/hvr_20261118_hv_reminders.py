"""Herpetoverse smart reminders: snooze, one log per reminder, inbox per app.

Revision ID: hvr_20261118_hv_reminders
Revises: hve_20261118_hv_email_guard
Create Date: 2026-11-18

Spec: docs/superpowers/specs/2026-11-17-hv-day-one-and-smart-reminders-design.md
(§5 calls 8 and 10, §7).

  * animals.reminder_snoozed_until (Date, nullable): the HV "Tomorrow" button —
    the first local day the animal is reminded again. Not a feeding pause.
  * uq_feeding_logs_reminder_animal: unique partial index on
    feeding_logs (animal_id, reminder_date) WHERE reminder_date IS NOT NULL, so
    two taps or two phones on one HV reminder write one feeding (the TV twin is
    uq_feeding_logs_reminder on invert_id).
  * notifications.app (String(20), nullable, CHECK): which app a row belongs
    to. NULL = Tarantuverse (every row written before this, and TV's calls,
    which don't pass an app). HV rows ('herpetoverse') stay out of the TV bell.
  * Backfill: smart_reminders_enabled and refusal_restarts_wait ON for the
    prefs rows of accounts that keep HV animals and no inverts (§5 call 8).
    Everyone else keeps what they have.

Downgrade drops the column, index and notifications.app; the backfilled
switches are left ON (which rows were flipped is not recorded, and ON is what
new accounts get anyway).
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "hvr_20261118_hv_reminders"
down_revision: Union[str, None] = "hve_20261118_hv_email_guard"
branch_labels = None
depends_on = None


# Kept as a function so tests can run the exact backfill on seeded rows.
# Same "HV only" test as pta_20261118_push_tokens_per_app.
BACKFILL_HV_SWITCHES_SQL = """
UPDATE notification_preferences np
SET smart_reminders_enabled = true,
    refusal_restarts_wait = true
WHERE EXISTS (SELECT 1 FROM animals a WHERE a.user_id = np.user_id)
  AND NOT EXISTS (SELECT 1 FROM inverts i WHERE i.user_id = np.user_id)
"""


def backfill_hv_switches(bind) -> None:
    bind.execute(sa.text(BACKFILL_HV_SWITCHES_SQL))


def upgrade() -> None:
    op.add_column("animals", sa.Column("reminder_snoozed_until", sa.Date(), nullable=True))
    op.create_index(
        "uq_feeding_logs_reminder_animal",
        "feeding_logs",
        ["animal_id", "reminder_date"],
        unique=True,
        postgresql_where=sa.text("reminder_date IS NOT NULL"),
    )
    op.add_column("notifications", sa.Column("app", sa.String(20), nullable=True))
    op.create_check_constraint(
        "ck_notifications_app",
        "notifications",
        "app IS NULL OR app IN ('tarantuverse', 'herpetoverse')",
    )
    backfill_hv_switches(op.get_bind())


def downgrade() -> None:
    op.drop_constraint("ck_notifications_app", "notifications", type_="check")
    op.drop_column("notifications", "app")
    op.drop_index("uq_feeding_logs_reminder_animal", table_name="feeding_logs")
    op.drop_column("animals", "reminder_snoozed_until")
