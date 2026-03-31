"""add system_settings table with seed data

Revision ID: w4x5y6z7a8b9
Revises: v3w4x5y6z7a8
Create Date: 2026-03-31

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'w4x5y6z7a8b9'
down_revision: Union[str, None] = 'v3w4x5y6z7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    table = op.create_table(
        'system_settings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('key', sa.String(100), unique=True, nullable=False),
        sa.Column('value', sa.Text(), nullable=False),
        sa.Column('value_type', sa.String(20), nullable=False, server_default='string'),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('label', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_sensitive', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index('ix_system_settings_key', 'system_settings', ['key'], unique=True)
    op.create_index('ix_system_settings_category', 'system_settings', ['category'])
    op.create_index('ix_system_settings_category_key', 'system_settings', ['category', 'key'])

    # Seed default settings
    op.bulk_insert(table, [
        # ── Feature Flags ────────────────────────────────────────────────
        {
            'key': 'feature.breeding_enabled',
            'value': 'true',
            'value_type': 'bool',
            'category': 'feature_flags',
            'label': 'Breeding Module',
            'description': 'Enable the breeding module (pairings, egg sacs, offspring tracking)',
        },
        {
            'key': 'feature.forums_enabled',
            'value': 'true',
            'value_type': 'bool',
            'category': 'feature_flags',
            'label': 'Community Forums',
            'description': 'Enable the community forums system',
        },
        {
            'key': 'feature.direct_messages_enabled',
            'value': 'true',
            'value_type': 'bool',
            'category': 'feature_flags',
            'label': 'Direct Messages',
            'description': 'Allow users to send direct messages to each other',
        },
        {
            'key': 'feature.photo_uploads_enabled',
            'value': 'true',
            'value_type': 'bool',
            'category': 'feature_flags',
            'label': 'Photo Uploads',
            'description': 'Allow users to upload photos of their tarantulas',
        },
        {
            'key': 'feature.registration_enabled',
            'value': 'true',
            'value_type': 'bool',
            'category': 'feature_flags',
            'label': 'New Registrations',
            'description': 'Allow new user registrations. Disable to close signups.',
        },
        {
            'key': 'feature.data_export_enabled',
            'value': 'true',
            'value_type': 'bool',
            'category': 'feature_flags',
            'label': 'Data Export',
            'description': 'Allow users to export their data (JSON, CSV, full backup)',
        },
        {
            'key': 'feature.species_submissions_enabled',
            'value': 'true',
            'value_type': 'bool',
            'category': 'feature_flags',
            'label': 'Community Species Submissions',
            'description': 'Allow users to submit new species to the database',
        },

        # ── Platform Limits ──────────────────────────────────────────────
        {
            'key': 'limits.free_max_tarantulas',
            'value': '15',
            'value_type': 'int',
            'category': 'platform_limits',
            'label': 'Free Tier: Max Tarantulas',
            'description': 'Maximum number of tarantulas a free-tier user can add',
        },
        {
            'key': 'limits.free_max_photos_per_tarantula',
            'value': '5',
            'value_type': 'int',
            'category': 'platform_limits',
            'label': 'Free Tier: Max Photos Per Tarantula',
            'description': 'Maximum photos per tarantula for free-tier users',
        },
        {
            'key': 'limits.max_upload_size_mb',
            'value': '10',
            'value_type': 'int',
            'category': 'platform_limits',
            'label': 'Max Upload Size (MB)',
            'description': 'Maximum file upload size in megabytes',
        },
        {
            'key': 'limits.rate_limit_per_minute',
            'value': '60',
            'value_type': 'int',
            'category': 'platform_limits',
            'label': 'API Rate Limit (per minute)',
            'description': 'Maximum API requests per user per minute',
        },
        {
            'key': 'limits.max_forum_posts_per_day',
            'value': '50',
            'value_type': 'int',
            'category': 'platform_limits',
            'label': 'Max Forum Posts Per Day',
            'description': 'Maximum forum posts a user can create per day (spam protection)',
        },
        {
            'key': 'limits.max_dms_per_hour',
            'value': '30',
            'value_type': 'int',
            'category': 'platform_limits',
            'label': 'Max DMs Per Hour',
            'description': 'Maximum direct messages a user can send per hour',
        },

        # ── Maintenance ──────────────────────────────────────────────────
        {
            'key': 'maintenance.enabled',
            'value': 'false',
            'value_type': 'bool',
            'category': 'maintenance',
            'label': 'Maintenance Mode',
            'description': 'Put the platform in read-only maintenance mode. Users can view but not create/update/delete.',
        },
        {
            'key': 'maintenance.message',
            'value': 'Tarantuverse is currently undergoing scheduled maintenance. We\'ll be back shortly!',
            'value_type': 'string',
            'category': 'maintenance',
            'label': 'Maintenance Message',
            'description': 'Message displayed to users during maintenance mode',
        },
        {
            'key': 'maintenance.allow_admin_writes',
            'value': 'true',
            'value_type': 'bool',
            'category': 'maintenance',
            'label': 'Allow Admin Writes During Maintenance',
            'description': 'Allow admin users to still perform write operations during maintenance',
        },

        # ── Notifications & Email ────────────────────────────────────────
        {
            'key': 'notifications.default_feeding_reminder_hours',
            'value': '168',
            'value_type': 'int',
            'category': 'notifications',
            'label': 'Default Feeding Reminder (hours)',
            'description': 'Default hours between feeding reminders for new users (168 = 7 days)',
        },
        {
            'key': 'notifications.default_substrate_reminder_days',
            'value': '90',
            'value_type': 'int',
            'category': 'notifications',
            'label': 'Default Substrate Reminder (days)',
            'description': 'Default days between substrate change reminders for new users',
        },
        {
            'key': 'notifications.email_notifications_enabled',
            'value': 'true',
            'value_type': 'bool',
            'category': 'notifications',
            'label': 'Email Notifications',
            'description': 'Enable sending email notifications platform-wide (verification, password reset, etc.)',
        },
        {
            'key': 'notifications.push_notifications_enabled',
            'value': 'true',
            'value_type': 'bool',
            'category': 'notifications',
            'label': 'Push Notifications',
            'description': 'Enable Expo push notifications platform-wide',
        },
        {
            'key': 'notifications.global_quiet_hours_start',
            'value': '22:00',
            'value_type': 'string',
            'category': 'notifications',
            'label': 'Global Quiet Hours Start',
            'description': 'Default quiet hours start time (24h format). Users can override in their own settings.',
        },
        {
            'key': 'notifications.global_quiet_hours_end',
            'value': '08:00',
            'value_type': 'string',
            'category': 'notifications',
            'label': 'Global Quiet Hours End',
            'description': 'Default quiet hours end time (24h format). Users can override in their own settings.',
        },
    ])


def downgrade() -> None:
    op.drop_index('ix_system_settings_category_key', table_name='system_settings')
    op.drop_index('ix_system_settings_category', table_name='system_settings')
    op.drop_index('ix_system_settings_key', table_name='system_settings')
    op.drop_table('system_settings')
