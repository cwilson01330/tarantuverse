"""add forums and activity feed

Revision ID: h5i6j7k8l9m0
Revises: g4h5i6j7k8l9
Create Date: 2025-10-08 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'h5i6j7k8l9m0'
down_revision = 'g4h5i6j7k8l9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create forum_categories table
    op.create_table(
        'forum_categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('slug', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('icon', sa.String(length=50), nullable=True),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('thread_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('post_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug')
    )
    op.create_index('ix_forum_categories_display_order', 'forum_categories', ['display_order'])

    # Create forum_threads table
    op.create_table(
        'forum_threads',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('author_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('slug', sa.String(length=200), nullable=False),
        sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_locked', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('view_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('post_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('last_post_at', sa.DateTime(), nullable=True),
        sa.Column('last_post_user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['category_id'], ['forum_categories.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['last_post_user_id'], ['users.id'], ondelete='SET NULL')
    )
    op.create_index('ix_forum_threads_category', 'forum_threads', ['category_id'])
    op.create_index('ix_forum_threads_author', 'forum_threads', ['author_id'])
    op.create_index('ix_forum_threads_updated', 'forum_threads', ['updated_at'], postgresql_ops={'updated_at': 'DESC'})
    op.create_index('ix_forum_threads_pinned_updated', 'forum_threads', ['is_pinned', 'updated_at'], postgresql_ops={'updated_at': 'DESC'})

    # Create forum_posts table
    op.create_table(
        'forum_posts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('thread_id', sa.Integer(), nullable=False),
        sa.Column('author_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('is_edited', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('edited_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['thread_id'], ['forum_threads.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ondelete='CASCADE')
    )
    op.create_index('ix_forum_posts_thread', 'forum_posts', ['thread_id'])
    op.create_index('ix_forum_posts_author', 'forum_posts', ['author_id'])
    op.create_index('ix_forum_posts_created', 'forum_posts', ['created_at'])

    # Create activity_feed table
    op.create_table(
        'activity_feed',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('action_type', sa.String(length=50), nullable=False),
        sa.Column('target_type', sa.String(length=50), nullable=True),
        sa.Column('target_id', sa.Integer(), nullable=True),
        sa.Column('activity_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )
    op.create_index('ix_activity_feed_user', 'activity_feed', ['user_id'])
    op.create_index('ix_activity_feed_created', 'activity_feed', ['created_at'], postgresql_ops={'created_at': 'DESC'})
    op.create_index('ix_activity_feed_action_type', 'activity_feed', ['action_type'])
    op.create_index('ix_activity_feed_user_created', 'activity_feed', ['user_id', 'created_at'], postgresql_ops={'created_at': 'DESC'})

    # Add is_admin field to users table
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    # Drop is_admin from users
    op.drop_column('users', 'is_admin')
    
    # Drop activity_feed table and indexes
    op.drop_index('ix_activity_feed_user_created', table_name='activity_feed')
    op.drop_index('ix_activity_feed_action_type', table_name='activity_feed')
    op.drop_index('ix_activity_feed_created', table_name='activity_feed')
    op.drop_index('ix_activity_feed_user', table_name='activity_feed')
    op.drop_table('activity_feed')
    
    # Drop forum_posts table and indexes
    op.drop_index('ix_forum_posts_created', table_name='forum_posts')
    op.drop_index('ix_forum_posts_author', table_name='forum_posts')
    op.drop_index('ix_forum_posts_thread', table_name='forum_posts')
    op.drop_table('forum_posts')
    
    # Drop forum_threads table and indexes
    op.drop_index('ix_forum_threads_pinned_updated', table_name='forum_threads')
    op.drop_index('ix_forum_threads_updated', table_name='forum_threads')
    op.drop_index('ix_forum_threads_author', table_name='forum_threads')
    op.drop_index('ix_forum_threads_category', table_name='forum_threads')
    op.drop_table('forum_threads')
    
    # Drop forum_categories table and indexes
    op.drop_index('ix_forum_categories_display_order', table_name='forum_categories')
    op.drop_table('forum_categories')
