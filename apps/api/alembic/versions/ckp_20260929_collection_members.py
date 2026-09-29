"""Co-keepers: collection_members.

Revision ID: ckp_20260929_collection_members
Revises: slg_20260928_sitter_logging
Create Date: 2026-09-29

PRD-shared-keeping rung 3, build plan docs/design/PLAN-co-keepers.md step 1.

Creates the membership table only. Nothing reads it for access until routers
migrate to utils/access, and no endpoint creates rows until the invites API
ships — so this migration changes no behaviour on its own.

Purely additive; safe on a live database; trivially reversible.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'ckp_20260929_collection_members'
down_revision = 'slg_20260928_sitter_logging'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'collection_members',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('owner_user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('member_user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('app', sa.String(20), nullable=False),
        sa.Column('role', sa.String(10), nullable=False),
        sa.Column('invited_email', sa.String(255), nullable=False),
        sa.Column('invite_token_hash', sa.String(64), nullable=True, unique=True),
        sa.Column('invite_expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(10), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("app IN ('tarantuverse', 'herpetoverse')", name='collection_members_app_check'),
        sa.CheckConstraint("role IN ('viewer', 'logger', 'keeper')", name='collection_members_role_check'),
        sa.CheckConstraint(
            "status IN ('pending', 'active', 'declined', 'removed', 'left', 'expired')",
            name='collection_members_status_check',
        ),
        sa.CheckConstraint(
            "member_user_id IS NULL OR member_user_id <> owner_user_id",
            name='collection_members_not_self',
        ),
        sa.CheckConstraint(
            "status <> 'active' OR member_user_id IS NOT NULL",
            name='collection_members_active_has_member',
        ),
        sa.CheckConstraint(
            "status <> 'pending' OR (invite_token_hash IS NOT NULL AND invite_expires_at IS NOT NULL)",
            name='collection_members_pending_has_token',
        ),
    )
    op.create_index('ix_collection_members_owner_user_id', 'collection_members', ['owner_user_id'])
    op.create_index(
        'ix_collection_members_member_lookup', 'collection_members',
        ['member_user_id', 'owner_user_id', 'app', 'status'],
    )
    op.create_index(
        'uq_collection_members_active', 'collection_members',
        ['owner_user_id', 'member_user_id', 'app'], unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )
    op.create_index(
        'uq_collection_members_pending_email', 'collection_members',
        ['owner_user_id', 'invited_email', 'app'], unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index('uq_collection_members_pending_email', table_name='collection_members')
    op.drop_index('uq_collection_members_active', table_name='collection_members')
    op.drop_index('ix_collection_members_member_lookup', table_name='collection_members')
    op.drop_index('ix_collection_members_owner_user_id', table_name='collection_members')
    op.drop_table('collection_members')
