"""add message interactions: replies, likes, reactions

Revision ID: f3g4h5i6j7k8
Revises: e2f3g4h5i6j7
Create Date: 2025-10-06 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'f3g4h5i6j7k8'
down_revision = 'e2f3g4h5i6j7'
branch_labels = None
depends_on = None


def upgrade():
    # Create message_replies table
    op.create_table(
        'message_replies',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('message_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['message_id'], ['messages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_message_replies_message_id', 'message_replies', ['message_id'])
    op.create_index('ix_message_replies_user_id', 'message_replies', ['user_id'])
    op.create_index('ix_message_replies_created_at', 'message_replies', ['created_at'])

    # Create message_likes table
    op.create_table(
        'message_likes',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('message_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['message_id'], ['messages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('message_id', 'user_id', name='unique_message_user_like')
    )
    op.create_index('ix_message_likes_message_id', 'message_likes', ['message_id'])
    op.create_index('ix_message_likes_user_id', 'message_likes', ['user_id'])

    # Create message_reactions table
    op.create_table(
        'message_reactions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('message_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('emoji', sa.String(length=10), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['message_id'], ['messages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('message_id', 'user_id', 'emoji', name='unique_message_user_reaction')
    )
    op.create_index('ix_message_reactions_message_id', 'message_reactions', ['message_id'])
    op.create_index('ix_message_reactions_user_id', 'message_reactions', ['user_id'])


def downgrade():
    # Drop message_reactions table
    op.drop_index('ix_message_reactions_user_id', table_name='message_reactions')
    op.drop_index('ix_message_reactions_message_id', table_name='message_reactions')
    op.drop_table('message_reactions')

    # Drop message_likes table
    op.drop_index('ix_message_likes_user_id', table_name='message_likes')
    op.drop_index('ix_message_likes_message_id', table_name='message_likes')
    op.drop_table('message_likes')

    # Drop message_replies table
    op.drop_index('ix_message_replies_created_at', table_name='message_replies')
    op.drop_index('ix_message_replies_user_id', table_name='message_replies')
    op.drop_index('ix_message_replies_message_id', table_name='message_replies')
    op.drop_table('message_replies')
