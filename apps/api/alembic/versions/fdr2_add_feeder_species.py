"""add feeder_species table

Separate from the tarantula species table — feeders have a different care profile shape
(life-stage vocabulary varies per species, breeding-rate framing doesn't apply).

Revision ID: fdr2_add_feeder_species
Revises: fdr1_add_enclosure_purpose
Create Date: 2026-04-20

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'fdr2_add_feeder_species'
down_revision = 'fdr1_add_enclosure_purpose'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'feeder_species',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('scientific_name', sa.String(150), nullable=False),
        sa.Column('scientific_name_lower', sa.String(150), nullable=False),
        sa.Column('common_names', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('category', sa.String(20), nullable=False),  # cricket|roach|larvae|other
        sa.Column('care_level', sa.String(20), nullable=True),  # easy|moderate|hard
        sa.Column('temperature_min', sa.Integer(), nullable=True),
        sa.Column('temperature_max', sa.Integer(), nullable=True),
        sa.Column('humidity_min', sa.Integer(), nullable=True),
        sa.Column('humidity_max', sa.Integer(), nullable=True),
        sa.Column('typical_adult_size_mm', sa.Integer(), nullable=True),
        sa.Column('supports_life_stages', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('default_life_stages', postgresql.JSONB(), nullable=True),
        sa.Column('prey_size_notes', sa.Text(), nullable=True),
        sa.Column('care_notes', sa.Text(), nullable=True),
        sa.Column('image_url', sa.String(500), nullable=True),
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('scientific_name'),
        sa.UniqueConstraint('scientific_name_lower'),
    )
    op.create_index('ix_feeder_species_scientific_name', 'feeder_species', ['scientific_name'])
    op.create_index('ix_feeder_species_scientific_name_lower', 'feeder_species', ['scientific_name_lower'])
    op.create_index('ix_feeder_species_category', 'feeder_species', ['category'])


def downgrade():
    op.drop_index('ix_feeder_species_category', table_name='feeder_species')
    op.drop_index('ix_feeder_species_scientific_name_lower', table_name='feeder_species')
    op.drop_index('ix_feeder_species_scientific_name', table_name='feeder_species')
    op.drop_table('feeder_species')
