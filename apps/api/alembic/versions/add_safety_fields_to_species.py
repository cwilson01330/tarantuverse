"""add safety fields to species

Revision ID: add_safety_fields
Revises:
Create Date: 2025-10-28

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_safety_fields'
down_revision = None  # Will be set automatically by alembic
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add safety information fields
    op.add_column('species', sa.Column('urticating_hairs', sa.Boolean(), nullable=True, server_default='true'))
    op.add_column('species', sa.Column('medically_significant_venom', sa.Boolean(), nullable=True, server_default='false'))


def downgrade() -> None:
    op.drop_column('species', 'medically_significant_venom')
    op.drop_column('species', 'urticating_hairs')
