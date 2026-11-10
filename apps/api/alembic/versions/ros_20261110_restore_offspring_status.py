"""Restore reptile_offspring.status (missing in production).

Revision ID: ros_20261110_restore_offspring_status
Revises: don_20261027_day_one
Create Date: 2026-11-10

Found 2026-11-10: production's `reptile_offspring` has no `status` column
and the `reptile_offspring_status` enum type is gone, although
rbr_20260429 created both and the model still maps them. Every query that
selects the table failed with "column reptile_offspring.status does not
exist" — the data export (`/export/preview`, JSON/CSV/ZIP) for EVERY keeper
on both apps since at least 2026-10-28, plus HV clutch offspring counts and
the HV transfer offspring lookup. The table held 0 rows, so nothing was lost.
A model/DB diff of all 1,231 mapped columns found this was the only gap.

Idempotent: creates the enum only if missing (same labels as rbr_20260429),
adds the column only if missing (NOT NULL, default 'hatched' — the model's
default), and the index only if missing. On a database that already has
them (every fresh test database) it does nothing.

Downgrade is a no-op on purpose: rbr_20260429 owns the column and type.
"""
from typing import Union

from alembic import op


revision: str = "ros_20261110_restore_offspring_status"
down_revision: Union[str, None] = "don_20261027_day_one"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE reptile_offspring_status AS ENUM
                ('hatched','kept','available','sold','traded','gifted','deceased','unknown');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
        """
    )
    op.execute(
        """
        ALTER TABLE reptile_offspring
            ADD COLUMN IF NOT EXISTS status reptile_offspring_status
            NOT NULL DEFAULT 'hatched'
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_reptile_offspring_status "
        "ON reptile_offspring (status)"
    )


def downgrade() -> None:
    pass
