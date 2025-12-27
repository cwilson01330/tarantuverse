"""add user oauth accounts table for account linking

Revision ID: u2v3w4x5y6z7
Revises: t1u2v3w4x5y6
Create Date: 2025-12-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'u2v3w4x5y6z7'
down_revision: Union[str, None] = 't1u2v3w4x5y6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create user_oauth_accounts table for storing linked OAuth accounts
    op.create_table(
        'user_oauth_accounts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('provider', sa.String(50), nullable=False),
        sa.Column('provider_account_id', sa.String(255), nullable=False),
        sa.Column('access_token', sa.Text(), nullable=True),
        sa.Column('refresh_token', sa.Text(), nullable=True),
        sa.Column('token_expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('provider_email', sa.String(255), nullable=True),
        sa.Column('provider_name', sa.String(255), nullable=True),
        sa.Column('provider_avatar', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # Create index on user_id for fast lookups
    op.create_index('ix_user_oauth_accounts_user_id', 'user_oauth_accounts', ['user_id'])

    # Create unique constraint: a user can only link one account per provider
    op.create_unique_constraint('uq_user_provider', 'user_oauth_accounts', ['user_id', 'provider'])

    # Create unique constraint: each provider account can only be linked to one user
    op.create_unique_constraint('uq_provider_account', 'user_oauth_accounts', ['provider', 'provider_account_id'])

    # Migrate existing OAuth data from users table to user_oauth_accounts
    # This is a data migration to preserve existing OAuth links
    op.execute("""
        INSERT INTO user_oauth_accounts (id, user_id, provider, provider_account_id, access_token, refresh_token, provider_email, created_at)
        SELECT
            gen_random_uuid(),
            id,
            oauth_provider,
            oauth_id,
            oauth_access_token,
            oauth_refresh_token,
            email,
            created_at
        FROM users
        WHERE oauth_provider IS NOT NULL AND oauth_id IS NOT NULL
    """)


def downgrade() -> None:
    # Drop the table
    op.drop_table('user_oauth_accounts')
