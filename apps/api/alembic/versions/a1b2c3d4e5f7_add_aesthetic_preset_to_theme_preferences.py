"""add aesthetic_preset to user_theme_preferences

Revision ID: a1b2c3d4e5f7
Revises: z7a8b9c0d1e2
Create Date: 2026-04-14

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f7'
down_revision = 'z7a8b9c0d1e2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'user_theme_preferences',
        sa.Column(
            'aesthetic_preset',
            sa.String(20),
            nullable=False,
            server_default='hobbyist',
        ),
    )


def downgrade() -> None:
    op.drop_column('user_theme_preferences', 'aesthetic_preset')
