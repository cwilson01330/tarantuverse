"""add notification preferences

Revision ID: l3m4n5o6p7q8
Revises: k2l3m4n5o6p7
Create Date: 2025-11-19

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'l3m4n5o6p7q8'
down_revision = 'k2l3m4n5o6p7'
branch_labels = None
depends_on = None


def upgrade():
    # Create notification_preferences table
    op.create_table(
        'notification_preferences',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),

        # Local Notifications
        sa.Column('feeding_reminders_enabled', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('feeding_reminder_hours', sa.Integer(), nullable=True, server_default='24'),

        sa.Column('substrate_reminders_enabled', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('substrate_reminder_days', sa.Integer(), nullable=True, server_default='90'),

        sa.Column('molt_predictions_enabled', sa.Boolean(), nullable=True, server_default='true'),

        sa.Column('maintenance_reminders_enabled', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('maintenance_reminder_days', sa.Integer(), nullable=True, server_default='30'),

        # Push Notifications (future)
        sa.Column('push_notifications_enabled', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('direct_messages_enabled', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('forum_replies_enabled', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('new_followers_enabled', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('community_activity_enabled', sa.Boolean(), nullable=True, server_default='false'),

        # Quiet hours
        sa.Column('quiet_hours_enabled', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('quiet_hours_start', sa.String(5), nullable=True, server_default="'22:00'"),
        sa.Column('quiet_hours_end', sa.String(5), nullable=True, server_default="'08:00'"),

        # Expo push token
        sa.Column('expo_push_token', sa.String(255), nullable=True),

        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('user_id')
    )

    # Create index on user_id for faster lookups
    op.create_index('ix_notification_preferences_user_id', 'notification_preferences', ['user_id'])


def downgrade():
    op.drop_index('ix_notification_preferences_user_id', table_name='notification_preferences')
    op.drop_table('notification_preferences')
