"""add photo_url to tarantulas

Revision ID: a1b2c3d4e5f6
Revises: 9588b399ad54
Create Date: 2025-10-06 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '9588b399ad54'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add photo_url column to tarantulas table
    op.add_column('tarantulas', sa.Column('photo_url', sa.String(length=500), nullable=True))


def downgrade() -> None:
    # Remove photo_url column from tarantulas table
    op.drop_column('tarantulas', 'photo_url')
