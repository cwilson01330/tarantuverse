"""merge heads before feeder module

Merges three pre-existing branches so future migrations have a single head:
  - a0b1c2d3e4f5 (add_communal_incidents)
  - b1c2d3e4f5g6 (add_username_change_tracking)
  - s0t1u2v3w4x5 (add_enclosures)

No schema change; pure merge.

Revision ID: mrg_20260420_feeder_base
Revises: a0b1c2d3e4f5, b1c2d3e4f5g6, s0t1u2v3w4x5
Create Date: 2026-04-20

"""
from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401


# revision identifiers, used by Alembic.
revision = 'mrg_20260420_feeder_base'
down_revision = ('a0b1c2d3e4f5', 'b1c2d3e4f5g6', 's0t1u2v3w4x5')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
