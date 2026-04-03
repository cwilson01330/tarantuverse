"""add achievements table with seed data

Revision ID: x5y6z7a8b9c0
Revises: w4x5y6z7a8b9
Create Date: 2026-04-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'x5y6z7a8b9c0'
down_revision: Union[str, None] = 'w4x5y6z7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create achievement_definitions table
    achievement_defs_table = op.create_table(
        'achievement_definitions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('key', sa.String(50), unique=True, nullable=False, index=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.String(300), nullable=False),
        sa.Column('icon', sa.String(10), nullable=False),
        sa.Column('category', sa.String(50), nullable=False, index=True),
        sa.Column('tier', sa.String(20), nullable=False),
        sa.Column('requirement_count', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Create user_achievements table
    op.create_table(
        'user_achievements',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('achievement_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('earned_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['achievement_id'], ['achievement_definitions.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('user_id', 'achievement_id', name='uq_user_achievement'),
    )

    # Seed achievement definitions
    op.bulk_insert(achievement_defs_table, [
        # ──────── COLLECTION ────────────
        {
            'key': 'first_tarantula',
            'name': 'First Steps',
            'description': 'Added your first tarantula to your collection',
            'icon': '🕷️',
            'category': 'collection',
            'tier': 'bronze',
            'requirement_count': 1,
        },
        {
            'key': 'collector_5',
            'name': 'Collector',
            'description': 'Added 5 tarantulas to your collection',
            'icon': '🏺',
            'category': 'collection',
            'tier': 'bronze',
            'requirement_count': 5,
        },
        {
            'key': 'collector_10',
            'name': 'Serious Collector',
            'description': 'Added 10 tarantulas to your collection',
            'icon': '🏺',
            'category': 'collection',
            'tier': 'silver',
            'requirement_count': 10,
        },
        {
            'key': 'collector_25',
            'name': 'Prolific Collector',
            'description': 'Added 25 tarantulas to your collection',
            'icon': '🎪',
            'category': 'collection',
            'tier': 'gold',
            'requirement_count': 25,
        },
        {
            'key': 'collector_50',
            'name': 'The Arachnid Tycoon',
            'description': 'Added 50 tarantulas to your collection',
            'icon': '👑',
            'category': 'collection',
            'tier': 'platinum',
            'requirement_count': 50,
        },
        # ──────── FEEDING ────────────
        {
            'key': 'first_feeding',
            'name': 'First Meal',
            'description': 'Logged your first feeding',
            'icon': '🦗',
            'category': 'feeding',
            'tier': 'bronze',
            'requirement_count': 1,
        },
        {
            'key': 'dedicated_feeder_50',
            'name': 'Dedicated Feeder',
            'description': 'Logged 50 feeding events',
            'icon': '🦗',
            'category': 'feeding',
            'tier': 'silver',
            'requirement_count': 50,
        },
        {
            'key': 'dedicated_feeder_100',
            'name': 'Master Feeder',
            'description': 'Logged 100 feeding events',
            'icon': '🍽️',
            'category': 'feeding',
            'tier': 'gold',
            'requirement_count': 100,
        },
        {
            'key': 'feeding_streak_7',
            'name': 'Week-Long Commitment',
            'description': 'Logged feedings for 7 consecutive days',
            'icon': '🔥',
            'category': 'feeding',
            'tier': 'silver',
            'requirement_count': 7,
        },
        {
            'key': 'feeding_streak_30',
            'name': 'Feeding Consistency',
            'description': 'Logged feedings for 30 consecutive days',
            'icon': '🔥',
            'category': 'feeding',
            'tier': 'gold',
            'requirement_count': 30,
        },
        # ──────── MOLTS ────────────
        {
            'key': 'first_molt',
            'name': 'First Shed',
            'description': 'Logged your first molt',
            'icon': '🐚',
            'category': 'molts',
            'tier': 'bronze',
            'requirement_count': 1,
        },
        {
            'key': 'molt_watcher_10',
            'name': 'Molt Watcher',
            'description': 'Logged 10 molts',
            'icon': '🐚',
            'category': 'molts',
            'tier': 'silver',
            'requirement_count': 10,
        },
        {
            'key': 'molt_watcher_25',
            'name': 'Growth Analyst',
            'description': 'Logged 25 molts',
            'icon': '📊',
            'category': 'molts',
            'tier': 'gold',
            'requirement_count': 25,
        },
        # ──────── COMMUNITY ────────────
        {
            'key': 'first_post',
            'name': 'Voice Your Thoughts',
            'description': 'Posted your first forum thread',
            'icon': '💬',
            'category': 'community',
            'tier': 'bronze',
            'requirement_count': 1,
        },
        {
            'key': 'contributor_10',
            'name': 'Active Contributor',
            'description': 'Posted 10 forum threads',
            'icon': '📢',
            'category': 'community',
            'tier': 'silver',
            'requirement_count': 10,
        },
        {
            'key': 'social_butterfly',
            'name': 'Social Butterfly',
            'description': 'Following 10 other keepers',
            'icon': '🦋',
            'category': 'community',
            'tier': 'silver',
            'requirement_count': 10,
        },
        # ──────── BREEDING ────────────
        {
            'key': 'first_pairing',
            'name': 'Love Connection',
            'description': 'Logged your first breeding pairing',
            'icon': '💕',
            'category': 'breeding',
            'tier': 'silver',
            'requirement_count': 1,
        },
        {
            'key': 'breeder',
            'name': 'Successful Breeder',
            'description': 'Achieved a successful breeding pairing',
            'icon': '🏆',
            'category': 'breeding',
            'tier': 'gold',
            'requirement_count': 1,
        },
    ])


def downgrade() -> None:
    op.drop_table('user_achievements')
    op.drop_table('achievement_definitions')
