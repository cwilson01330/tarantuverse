"""backfill tarantula visibility to match owner's collection_visibility

Context: the `tarantulas.visibility` column defaults to 'private' at the
model level, but the keeper profile router filters visitors' views with
`visibility == 'public'`. Result: a keeper who sets their profile public
gets an empty public page because every one of their tarantulas is still
individually `private`. This was reported in the wild — a beta tester's
collection appeared empty to their mutual follows despite both keepers
having public profiles.

This migration fixes the data. Going forward, the create endpoint inherits
visibility from the owner's profile at insert time, and profile-visibility
flips cascade to tarantulas (see routers/tarantulas.py + routers/auth.py).

Idempotent: safe to run repeatedly — we only touch rows that are
currently 'private' AND owned by a public-profile keeper.

Revision ID: vis_20260424_backfill_public_visibility
Revises: spx_20260424_add_appts_species_fields
Create Date: 2026-04-24 12:00:00
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'vis_20260424_backfill_public_visibility'
down_revision: Union[str, None] = 'spx_20260424_add_appts_species_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Flip all currently-'private' tarantulas whose owner has a public
    # profile to 'public'. Keepers can still hide individual tarantulas
    # afterwards via the edit form — this just undoes the accidental
    # default that hid everything.
    op.execute("""
        UPDATE tarantulas
        SET visibility = 'public'
        WHERE id IN (
            SELECT t.id
            FROM tarantulas t
            JOIN users u ON u.id = t.user_id
            WHERE u.collection_visibility = 'public'
              AND t.visibility = 'private'
        )
    """)


def downgrade() -> None:
    # No-op: we can't distinguish which tarantulas were 'private' because
    # the keeper explicitly hid them versus 'private' because of the old
    # default. Rolling this back would conflate those two groups, so we
    # leave the data as-is and only the code change is reversed.
    pass
