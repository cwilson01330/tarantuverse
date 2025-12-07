"""add promo codes and premium features

Revision ID: m4n5o6p7q8r9
Revises: o6p7q8r9s0t1
Create Date: 2025-12-06 17:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'm4n5o6p7q8r9'
down_revision = 'o6p7q8r9s0t1'
branch_labels = None
depends_on = None


def upgrade():
    # Create promo_codes table
    op.create_table('promo_codes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('code', sa.String(50), unique=True, nullable=False, index=True),
        sa.Column('code_type', sa.String(20), nullable=False),  # 'lifetime', '1year', '6month', 'custom'
        sa.Column('custom_duration_days', sa.Integer, nullable=True),
        sa.Column('usage_limit', sa.Integer, nullable=True),  # NULL = unlimited
        sa.Column('times_used', sa.Integer, default=0, nullable=False),
        sa.Column('is_active', sa.Boolean, default=True, nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by_admin_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.text('now()')),
    )

    # Add new columns to user_subscriptions
    op.add_column('user_subscriptions', sa.Column('promo_code_used', sa.String(50), nullable=True))
    op.add_column('user_subscriptions', sa.Column('subscription_source', sa.String(20), nullable=True))  # 'promo', 'monthly', 'yearly', 'lifetime'
    op.add_column('user_subscriptions', sa.Column('auto_renew', sa.Boolean, default=False, nullable=False, server_default='false'))
    op.add_column('user_subscriptions', sa.Column('granted_by_admin', sa.Boolean, default=False, nullable=False, server_default='false'))

    # Add lifetime pricing to subscription_plans
    op.add_column('subscription_plans', sa.Column('price_lifetime', sa.Numeric(10, 2), default=0))

    # Add breeding access to subscription_plans features
    op.add_column('subscription_plans', sa.Column('can_use_breeding', sa.Boolean, default=False, nullable=False, server_default='false'))
    op.add_column('subscription_plans', sa.Column('max_photos_per_tarantula', sa.Integer, default=5, nullable=False, server_default='5'))

    # Add foreign key for promo_code_used
    op.create_foreign_key(
        'fk_user_subscriptions_promo_code',
        'user_subscriptions', 'promo_codes',
        ['promo_code_used'], ['code'],
        ondelete='SET NULL'
    )

    # Create index on promo_code_used for faster lookups
    op.create_index('ix_user_subscriptions_promo_code_used', 'user_subscriptions', ['promo_code_used'])


def downgrade():
    # Drop foreign key and index
    op.drop_index('ix_user_subscriptions_promo_code_used', table_name='user_subscriptions')
    op.drop_constraint('fk_user_subscriptions_promo_code', 'user_subscriptions', type_='foreignkey')

    # Remove columns from subscription_plans
    op.drop_column('subscription_plans', 'can_use_breeding')
    op.drop_column('subscription_plans', 'max_photos_per_tarantula')
    op.drop_column('subscription_plans', 'price_lifetime')

    # Remove columns from user_subscriptions
    op.drop_column('user_subscriptions', 'granted_by_admin')
    op.drop_column('user_subscriptions', 'auto_renew')
    op.drop_column('user_subscriptions', 'subscription_source')
    op.drop_column('user_subscriptions', 'promo_code_used')

    # Drop promo_codes table
    op.drop_table('promo_codes')
