"""
Add reset password and email verification fields

Revision ID: o6p7q8r9s0t1
Revises: l3m4n5o6p7q8
Create Date: 2024-12-05 16:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision = 'o6p7q8r9s0t1'
down_revision = 'l3m4n5o6p7q8'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    columns = [c['name'] for c in inspector.get_columns('users')]

    if 'reset_token' not in columns:
        op.add_column('users', sa.Column('reset_token', sa.String(length=255), nullable=True))
    
    if 'reset_token_expires_at' not in columns:
        op.add_column('users', sa.Column('reset_token_expires_at', sa.DateTime(timezone=True), nullable=True))

    if 'is_verified' not in columns:
        op.add_column('users', sa.Column('is_verified', sa.Boolean(), nullable=True))
        # Set default value for existing users to True
        op.execute("UPDATE users SET is_verified = TRUE")

    if 'verification_token' not in columns:
        op.add_column('users', sa.Column('verification_token', sa.String(length=255), nullable=True))

    if 'verification_token_expires_at' not in columns:
        op.add_column('users', sa.Column('verification_token_expires_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('users', 'verification_token_expires_at')
    op.drop_column('users', 'verification_token')
    op.drop_column('users', 'is_verified')
    op.drop_column('users', 'reset_token_expires_at')
    op.drop_column('users', 'reset_token')
