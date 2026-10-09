"""Remember which animals the keeper hid by hand.

Revision ID: vex_20261009_visibility_explicit
Revises: unt_20261008_measurement_units
Create Date: 2026-10-09

`inverts.visibility_explicit` (NOT NULL, default false) is true once the
keeper has chosen an animal's visibility themselves. Turning a collection
private->public used to flip EVERY private animal to public, so a breeder's
hidden holdbacks went public the next time they reopened their profile. The
cascade now flips only rows where this is false.

Backfill: an animal that is 'private' while its owner's collection is
'public' cannot have inherited that (new animals inherit the collection's
visibility, and the cascade had already made everything public), so it was
hidden by hand -> true. Everything else stays false: a private animal in a
private collection is indistinguishable from a default and keeps flipping
the way it always has.

Only `inverts` gets the column. The legacy `tarantulas`/`scorpions` rows share
the invert's id, and the cascade reads the flag from `inverts` for them.

Additive; reversible.
"""
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "vex_20261009_visibility_explicit"
down_revision: Union[str, None] = "unt_20261008_measurement_units"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "inverts",
        sa.Column(
            "visibility_explicit",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.execute(
        """
        UPDATE inverts AS i
           SET visibility_explicit = true
          FROM users AS u
         WHERE u.id = i.user_id
           AND i.visibility = 'private'
           AND u.collection_visibility = 'public'
        """
    )


def downgrade() -> None:
    op.drop_column("inverts", "visibility_explicit")
