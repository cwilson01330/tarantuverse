"""Make pricing_submissions.is_public default FALSE.

The application layer already defaults new submissions to private (see
schemas/pricing.py), but the Postgres column default still said TRUE — the
opposite of the policy. Anything that inserts without naming the column (a
backfill script, a manual fix, a future code path that forgets) would silently
create an aggregate-eligible row from a report the keeper never consented to
share.

METADATA ONLY. This changes the column default for FUTURE inserts and does not
touch existing rows: `ALTER COLUMN ... SET DEFAULT` rewrites the catalog entry,
not the table. Verified 2026-07-28 that production `pricing_submissions` holds
zero rows, so there is nothing to reinterpret either way — an unusually clean
moment to correct it.

Note this does NOT flip the meaning of `is_public`. Public still means
"eligible for anonymous aggregation", not "individually retrievable" — see the
comment on the model.

Revision ID: prc_20260728_pricing_private
Revises: cph_20260729_colony_logs
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'prc_20260728_pricing_private'
# Re-pointed 2026-07-29. Both this and col_20260729_colony_enclosure were
# written against shl_20260727_shortlist, which left Alembic with two heads.
# The colony migration ships first (this one is held pending pricing amendments
# 5 and 8), so this chains onto it to keep the history linear.
down_revision: Union[str, None] = 'cph_20260729_colony_logs'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE pricing_submissions ALTER COLUMN is_public SET DEFAULT false"
    )


def downgrade() -> None:
    # Restores the previous (permissive) default. Deliberately reversible even
    # though we would not want to run it: a migration that can't be undone is
    # harder to reason about than one whose downgrade is simply unwise.
    op.execute(
        "ALTER TABLE pricing_submissions ALTER COLUMN is_public SET DEFAULT true"
    )
