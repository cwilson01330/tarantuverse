"""add follow and direct messaging models

Revision ID: f3g4h5i6j7k8
Revises: e2f3g4h5i6j7
Create Date: 2025-10-08 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'f3g4h5i6j7k8'
down_revision = 'e2f3g4h5i6j7'
branch_labels = None
depends_on = None


def upgrade():
    # Create follows table
    op.create_table(
        'follows',
        sa.Column('follower_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('followed_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['follower_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['followed_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('follower_id', 'followed_id'),
        sa.UniqueConstraint('follower_id', 'followed_id', name='unique_follow')
    )

    # Create conversations table
    op.create_table(
        'conversations',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('participant1_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('participant2_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['participant1_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['participant2_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_conversation_participants', 'conversations', ['participant1_id', 'participant2_id'])

    # Create direct_messages table
    op.create_table(
        'direct_messages',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('conversation_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('sender_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('is_read', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sender_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_dm_conversation', 'direct_messages', ['conversation_id'])
    op.create_index('idx_dm_sender', 'direct_messages', ['sender_id'])


def downgrade():
    # Drop direct_messages table
    op.drop_index('idx_dm_sender', table_name='direct_messages')
    op.drop_index('idx_dm_conversation', table_name='direct_messages')
    op.drop_table('direct_messages')

    # Drop conversations table
    op.drop_index('idx_conversation_participants', table_name='conversations')
    op.drop_table('conversations')

    # Drop follows table
    op.drop_table('follows')
