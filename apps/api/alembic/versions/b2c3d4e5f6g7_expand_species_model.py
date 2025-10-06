"""expand species model for husbandry data

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2025-10-06 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6g7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new columns to species table
    op.add_column('species', sa.Column('scientific_name_lower', sa.String(length=255), nullable=True))
    op.add_column('species', sa.Column('family', sa.String(length=100), nullable=True))
    op.add_column('species', sa.Column('type', sa.String(length=50), nullable=True))

    # Husbandry columns
    op.add_column('species', sa.Column('temperature_min', sa.Integer(), nullable=True))
    op.add_column('species', sa.Column('temperature_max', sa.Integer(), nullable=True))
    op.add_column('species', sa.Column('humidity_min', sa.Integer(), nullable=True))
    op.add_column('species', sa.Column('humidity_max', sa.Integer(), nullable=True))
    op.add_column('species', sa.Column('enclosure_size_sling', sa.String(length=100), nullable=True))
    op.add_column('species', sa.Column('enclosure_size_juvenile', sa.String(length=100), nullable=True))
    op.add_column('species', sa.Column('enclosure_size_adult', sa.String(length=100), nullable=True))
    op.add_column('species', sa.Column('substrate_depth', sa.String(length=100), nullable=True))
    op.add_column('species', sa.Column('substrate_type', sa.String(length=200), nullable=True))

    # Feeding columns
    op.add_column('species', sa.Column('prey_size', sa.String(length=200), nullable=True))
    op.add_column('species', sa.Column('feeding_frequency_sling', sa.String(length=100), nullable=True))
    op.add_column('species', sa.Column('feeding_frequency_juvenile', sa.String(length=100), nullable=True))
    op.add_column('species', sa.Column('feeding_frequency_adult', sa.String(length=100), nullable=True))

    # Additional care columns
    op.add_column('species', sa.Column('water_dish_required', sa.Boolean(), nullable=True, server_default='true'))
    op.add_column('species', sa.Column('webbing_amount', sa.String(length=50), nullable=True))
    op.add_column('species', sa.Column('burrowing', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('species', sa.Column('source_url', sa.String(length=500), nullable=True))

    # Community columns
    op.add_column('species', sa.Column('is_verified', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('species', sa.Column('submitted_by', sa.UUID(), nullable=True))
    op.add_column('species', sa.Column('community_rating', sa.Float(), nullable=True, server_default='0.0'))
    op.add_column('species', sa.Column('times_kept', sa.Integer(), nullable=True, server_default='0'))

    # Populate scientific_name_lower from existing scientific_name
    op.execute("UPDATE species SET scientific_name_lower = LOWER(scientific_name)")

    # Make scientific_name_lower NOT NULL after population
    op.alter_column('species', 'scientific_name_lower', nullable=False)

    # Create unique index on scientific_name_lower
    op.create_index('ix_species_scientific_name_lower', 'species', ['scientific_name_lower'], unique=True)

    # Add foreign key for submitted_by
    op.create_foreign_key('fk_species_submitted_by', 'species', 'users', ['submitted_by'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    # Drop foreign key
    op.drop_constraint('fk_species_submitted_by', 'species', type_='foreignkey')

    # Drop index
    op.drop_index('ix_species_scientific_name_lower', table_name='species')

    # Drop all new columns
    op.drop_column('species', 'times_kept')
    op.drop_column('species', 'community_rating')
    op.drop_column('species', 'submitted_by')
    op.drop_column('species', 'is_verified')
    op.drop_column('species', 'source_url')
    op.drop_column('species', 'burrowing')
    op.drop_column('species', 'webbing_amount')
    op.drop_column('species', 'water_dish_required')
    op.drop_column('species', 'feeding_frequency_adult')
    op.drop_column('species', 'feeding_frequency_juvenile')
    op.drop_column('species', 'feeding_frequency_sling')
    op.drop_column('species', 'prey_size')
    op.drop_column('species', 'substrate_type')
    op.drop_column('species', 'substrate_depth')
    op.drop_column('species', 'enclosure_size_adult')
    op.drop_column('species', 'enclosure_size_juvenile')
    op.drop_column('species', 'enclosure_size_sling')
    op.drop_column('species', 'humidity_max')
    op.drop_column('species', 'humidity_min')
    op.drop_column('species', 'temperature_max')
    op.drop_column('species', 'temperature_min')
    op.drop_column('species', 'type')
    op.drop_column('species', 'family')
    op.drop_column('species', 'scientific_name_lower')
