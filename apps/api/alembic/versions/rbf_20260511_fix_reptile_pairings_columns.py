"""Recover missing reptile_pairings.pairing_type + .outcome columns

Diagnosis (2026-05-11): GET /api/v1/reptile-pairings/ was 500-ing with
``column reptile_pairings.pairing_type does not exist``. The original
rbr_20260429 migration created the table but the two enum-typed columns
never landed on prod — this is the exact failure mode flagged in the
``feedback_alembic_pg_enum_double_create`` memory (the original
``sa.Enum(create_type=False)`` doesn't reliably suppress the
``before_create`` event, so the migration aborted mid-execution after
the table was already committed).

This migration is **idempotent recovery**:

1. Create the two enum types if they don't already exist (using a
   ``DO $$ ... EXCEPTION WHEN duplicate_object ... END $$`` block
   that survives re-runs).
2. Add ``pairing_type`` and ``outcome`` columns to ``reptile_pairings``
   only if missing. ``ADD COLUMN IF NOT EXISTS`` is supported on
   Postgres 9.6+ so a re-run on an already-recovered DB is a no-op.
3. NOT NULL + server defaults match the original migration's intent
   so any pre-existing rows (there shouldn't be any — the table was
   never usable) backfill cleanly to ``natural`` / ``in_progress``.

If for any reason rows DO exist with NULLs after the column add (it
shouldn't be possible since the column is created with a default), we
backfill via UPDATE before applying the NOT NULL constraint.

Revision ID: rbf_20260511_fix_reptile_pairings_columns
Revises: pst_20260502_add_tarantula_feeding_pause
"""
from alembic import op


revision = "rbf_20260511_fix_reptile_pairings_columns"
down_revision = "pst_20260502_add_tarantula_feeding_pause"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Enum types — create if absent ─────────────────────────────
    # The DO block swallows duplicate_object so re-running this migration
    # on a DB that already has the types is a no-op. See
    # feedback_alembic_pg_enum_double_create memory for context.
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE reptile_pairing_type AS ENUM
                ('natural', 'cohabitation', 'assisted', 'ai');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE reptile_pairing_outcome AS ENUM
                ('in_progress', 'successful', 'unsuccessful',
                 'abandoned', 'unknown');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END
        $$;
        """
    )

    # ── 2. Columns — add if absent ───────────────────────────────────
    # ADD COLUMN IF NOT EXISTS is idempotent. We declare the columns
    # with the same defaults the original migration intended so any
    # existing rows (probably none) get a sensible value backfilled.
    op.execute(
        """
        ALTER TABLE reptile_pairings
        ADD COLUMN IF NOT EXISTS pairing_type reptile_pairing_type
            NOT NULL DEFAULT 'natural';
        """
    )
    op.execute(
        """
        ALTER TABLE reptile_pairings
        ADD COLUMN IF NOT EXISTS outcome reptile_pairing_outcome
            NOT NULL DEFAULT 'in_progress';
        """
    )

    # ── 3. Defensive backfill — covers the (impossible-on-paper) case
    # where the columns were added without a default at some point and
    # left NULLs behind. Safe to run regardless; an UPDATE matching
    # zero rows is a fast no-op.
    op.execute(
        """
        UPDATE reptile_pairings
           SET pairing_type = 'natural'
         WHERE pairing_type IS NULL;
        """
    )
    op.execute(
        """
        UPDATE reptile_pairings
           SET outcome = 'in_progress'
         WHERE outcome IS NULL;
        """
    )


def downgrade() -> None:
    # Downgrade drops the columns — we leave the enum types in place
    # since they're shared with the (also created-by-rbr_20260429)
    # constraint vocab and may be referenced elsewhere. A full chain
    # rollback through rbr_20260429 would drop the types properly.
    op.execute(
        "ALTER TABLE reptile_pairings DROP COLUMN IF EXISTS pairing_type;"
    )
    op.execute(
        "ALTER TABLE reptile_pairings DROP COLUMN IF EXISTS outcome;"
    )
