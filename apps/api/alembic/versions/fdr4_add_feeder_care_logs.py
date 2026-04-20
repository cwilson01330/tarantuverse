"""add feeder_care_logs table

Timestamped events on a colony — cleaning, feeding the feeders, restocks, count
adjustments, notes. One-tap quick-log is the primary usage pattern.

Revision ID: fdr4_add_feeder_care_logs
Revises: fdr3_add_feeder_colonies
Create Date: 2026-04-20

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'fdr4_add_feeder_care_logs'
down_revision = 'fdr3_add_feeder_colonies'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'feeder_care_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('feeder_colony_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('log_type', sa.String(30), nullable=False),
        # fed_feeders | cleaning | water_change | restock | count_update | note
        sa.Column('logged_at', sa.Date(), nullable=False, server_default=sa.text('CURRENT_DATE')),
        sa.Column('count_delta', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['feeder_colony_id'], ['feeder_colonies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_feeder_care_logs_feeder_colony_id', 'feeder_care_logs', ['feeder_colony_id'])
    op.create_index('ix_feeder_care_logs_logged_at', 'feeder_care_logs', ['logged_at'])


def downgrade():
    op.drop_index('ix_feeder_care_logs_logged_at', table_name='feeder_care_logs')
    op.drop_index('ix_feeder_care_logs_feeder_colony_id', table_name='feeder_care_logs')
    op.drop_table('feeder_care_logs')
