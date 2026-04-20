"""add feeder_colonies table

A colony/stock of a single feeder species owned by a user. Supports two inventory
modes: simple 'count' or 'life_stage' (JSONB bucketed counts). Mode is per-colony.
Optional enclosure link; must reference an enclosure with purpose='feeder' (enforced
at the application layer, not the DB).

Revision ID: fdr3_add_feeder_colonies
Revises: fdr2_add_feeder_species
Create Date: 2026-04-20

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'fdr3_add_feeder_colonies'
down_revision = 'fdr2_add_feeder_species'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'feeder_colonies',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('feeder_species_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('enclosure_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('inventory_mode', sa.String(20), nullable=False, server_default='count'),  # count | life_stage
        sa.Column('count', sa.Integer(), nullable=True),
        sa.Column('life_stage_counts', postgresql.JSONB(), nullable=True),
        sa.Column('last_restocked', sa.Date(), nullable=True),
        sa.Column('last_cleaned', sa.Date(), nullable=True),
        sa.Column('last_fed_date', sa.Date(), nullable=True),
        sa.Column('food_notes', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('low_threshold', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['feeder_species_id'], ['feeder_species.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['enclosure_id'], ['enclosures.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_feeder_colonies_user_id', 'feeder_colonies', ['user_id'])
    op.create_index('ix_feeder_colonies_is_active', 'feeder_colonies', ['is_active'])
    op.create_index('ix_feeder_colonies_feeder_species_id', 'feeder_colonies', ['feeder_species_id'])


def downgrade():
    op.drop_index('ix_feeder_colonies_feeder_species_id', table_name='feeder_colonies')
    op.drop_index('ix_feeder_colonies_is_active', table_name='feeder_colonies')
    op.drop_index('ix_feeder_colonies_user_id', table_name='feeder_colonies')
    op.drop_table('feeder_colonies')
