"""add purpose column to enclosures

Extends the enclosures table to support non-tarantula uses (feeders, and later reptiles)
under a single shared table. Backfills existing rows with 'tarantula'.

Revision ID: fdr1_add_enclosure_purpose
Revises: mrg_20260420_feeder_base
Create Date: 2026-04-20

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'fdr1_add_enclosure_purpose'
down_revision = 'mrg_20260420_feeder_base'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'enclosures',
        sa.Column('purpose', sa.String(20), nullable=False, server_default='tarantula'),
    )
    op.create_index('ix_enclosures_purpose', 'enclosures', ['purpose'])


def downgrade():
    op.drop_index('ix_enclosures_purpose', table_name='enclosures')
    op.drop_column('enclosures', 'purpose')
