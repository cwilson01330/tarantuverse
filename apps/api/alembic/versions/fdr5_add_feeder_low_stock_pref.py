"""add feeder_low_stock_enabled to notification_preferences

Local-notification trigger when a feeder colony's count (or sum of meaningful
life-stage counts) drops below its user-set low_threshold.

Revision ID: fdr5_add_feeder_low_stock_pref
Revises: fdr4_add_feeder_care_logs
Create Date: 2026-04-20

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'fdr5_add_feeder_low_stock_pref'
down_revision = 'fdr4_add_feeder_care_logs'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'notification_preferences',
        sa.Column('feeder_low_stock_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
    )


def downgrade():
    op.drop_column('notification_preferences', 'feeder_low_stock_enabled')
