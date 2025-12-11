"""
Add content moderation tables (user_blocks and content_reports)

Revision ID: p7q8r9s0t1u2
Revises: o6p7q8r9s0t1
Create Date: 2025-12-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision = 'p7q8r9s0t1u2'
down_revision = 'm4n5o6p7q8r9'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    existing_tables = inspector.get_table_names()

    # Create user_blocks table if it doesn't exist
    if 'user_blocks' not in existing_tables:
        op.create_table(
            'user_blocks',
            sa.Column('id', UUID(as_uuid=True), primary_key=True),
            sa.Column('blocker_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('blocked_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('reason', sa.String(length=500), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        )

        # Create composite unique index
        op.create_index('ix_blocker_blocked', 'user_blocks', ['blocker_id', 'blocked_id'], unique=True)

    # Create content_reports table if it doesn't exist
    if 'content_reports' not in existing_tables:
        op.create_table(
            'content_reports',
            sa.Column('id', UUID(as_uuid=True), primary_key=True),
            sa.Column('reporter_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('reported_user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True),
            sa.Column('report_type', sa.String(length=50), nullable=False, index=True),
            sa.Column('content_id', sa.String(length=255), nullable=False, index=True),
            sa.Column('content_url', sa.String(length=500), nullable=True),
            sa.Column('reason', sa.String(length=100), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('status', sa.String(length=20), nullable=False, server_default='pending', index=True),
            sa.Column('reviewed_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('moderation_notes', sa.Text(), nullable=True),
            sa.Column('action_taken', sa.String(length=255), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        )


def downgrade():
    op.drop_table('content_reports')
    op.drop_table('user_blocks')
