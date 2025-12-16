"""add referral system

Revision ID: t1u2v3w4x5y6
Revises: s0t1u2v3w4x5
Create Date: 2025-12-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 't1u2v3w4x5y6'
down_revision: Union[str, None] = 's0t1u2v3w4x5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add referral fields to users table
    op.add_column('users', sa.Column('referral_code', sa.String(12), nullable=True))
    op.add_column('users', sa.Column('referred_by_user_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('users', sa.Column('referred_at', sa.DateTime(timezone=True), nullable=True))

    # Create unique index on referral_code
    op.create_index('ix_users_referral_code', 'users', ['referral_code'], unique=True)

    # Create foreign key for referred_by_user_id
    op.create_foreign_key(
        'fk_users_referred_by_user_id',
        'users', 'users',
        ['referred_by_user_id'], ['id'],
        ondelete='SET NULL'
    )

    # Create referral_rewards table
    op.create_table(
        'referral_rewards',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('referrer_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('referral_milestone', sa.Integer(), nullable=False),
        sa.Column('free_month_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('free_month_end', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    # Drop referral_rewards table
    op.drop_table('referral_rewards')

    # Drop foreign key and index from users table
    op.drop_constraint('fk_users_referred_by_user_id', 'users', type_='foreignkey')
    op.drop_index('ix_users_referral_code', table_name='users')

    # Drop columns from users table
    op.drop_column('users', 'referred_at')
    op.drop_column('users', 'referred_by_user_id')
    op.drop_column('users', 'referral_code')
