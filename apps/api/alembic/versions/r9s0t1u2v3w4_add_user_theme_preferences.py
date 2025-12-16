"""add user theme preferences

Revision ID: r9s0t1u2v3w4
Revises: q8r9s0t1u2v3
Create Date: 2024-12-15

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'r9s0t1u2v3w4'
down_revision = 'q8r9s0t1u2v3'
branch_labels = None
depends_on = None


def upgrade():
    # Create user_theme_preferences table
    op.create_table(
        'user_theme_preferences',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),

        # Theme mode (light/dark/system)
        sa.Column('color_mode', sa.String(20), nullable=False, server_default='dark'),

        # Preset or Custom selection ('default', 'preset', 'custom')
        sa.Column('theme_type', sa.String(20), nullable=False, server_default='default'),

        # Selected preset ID (e.g., 'gbb', 'obt', 'poecilotheria')
        sa.Column('preset_id', sa.String(50), nullable=True),

        # Custom colors (hex format: #RRGGBB) - premium only
        sa.Column('custom_primary', sa.String(7), nullable=True),
        sa.Column('custom_secondary', sa.String(7), nullable=True),
        sa.Column('custom_accent', sa.String(7), nullable=True),

        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),

        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('user_id'),
    )

    # Create index on user_id for faster lookups
    op.create_index('ix_user_theme_preferences_user_id', 'user_theme_preferences', ['user_id'])


def downgrade():
    # Drop index
    op.drop_index('ix_user_theme_preferences_user_id', table_name='user_theme_preferences')

    # Drop table
    op.drop_table('user_theme_preferences')
