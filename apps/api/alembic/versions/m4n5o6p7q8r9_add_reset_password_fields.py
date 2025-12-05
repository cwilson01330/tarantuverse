"""
Add reset_token and reset_token_expires_at to users

Revision ID: m4n5o6p7q8r9
Revises: l3m4n5o6p7q8
Create Date: 2024-12-05 13:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'm4n5o6p7q8r9'
down_revision = 'l3m4n5o6p7q8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('reset_token', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column('reset_token_expires_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('users', 'reset_token_expires_at')
    op.drop_column('users', 'reset_token')
