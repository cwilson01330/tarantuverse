"""change activity target_id to string

Revision ID: i6j7k8l9m0n1
Revises: h5i6j7k8l9m0
Create Date: 2025-10-09 20:35:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'i6j7k8l9m0n1'
down_revision = 'h5i6j7k8l9m0'
branch_labels = None
depends_on = None


def upgrade():
    # Change target_id from integer to text to support both UUIDs and integers
    op.alter_column('activity_feed', 'target_id',
                    existing_type=sa.Integer(),
                    type_=sa.String(),
                    existing_nullable=True,
                    postgresql_using='target_id::text')


def downgrade():
    # Revert back to integer (may lose data if UUIDs were stored)
    op.alter_column('activity_feed', 'target_id',
                    existing_type=sa.String(),
                    type_=sa.Integer(),
                    existing_nullable=True,
                    postgresql_using='target_id::integer')
