"""add waitlist_signups table + merge heads (feeder + enclosure branches)

Revision ID: wtl_20260420_waitlist
Revises: fdr5_add_feeder_low_stock_pref, s0t1u2v3w4x5
Create Date: 2026-04-20

Merges the two outstanding Alembic heads (feeder-colony branch + enclosure branch)
while adding the new waitlist_signups table. No data migration; additive only.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = 'wtl_20260420_waitlist'
down_revision = ('fdr5_add_feeder_low_stock_pref', 's0t1u2v3w4x5')
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'waitlist_signups',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('brand', sa.String(length=32), nullable=False),
        sa.Column('source', sa.String(length=64), nullable=True),
        sa.Column('user_agent', sa.String(length=512), nullable=True),
        sa.Column('ip_hash', sa.String(length=64), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.UniqueConstraint('email', 'brand', name='uq_waitlist_email_brand'),
    )
    op.create_index(
        op.f('ix_waitlist_signups_email'),
        'waitlist_signups',
        ['email'],
        unique=False,
    )
    op.create_index(
        op.f('ix_waitlist_signups_brand'),
        'waitlist_signups',
        ['brand'],
        unique=False,
    )


def downgrade():
    op.drop_index(op.f('ix_waitlist_signups_brand'), table_name='waitlist_signups')
    op.drop_index(op.f('ix_waitlist_signups_email'), table_name='waitlist_signups')
    op.drop_table('waitlist_signups')
