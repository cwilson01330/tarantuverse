"""add reptile_species table

Revision ID: rsp_20260421_add_reptile_species_table
Revises: hva_20260421_add_herpetoverse_app_flag
Create Date: 2026-04-21

Parallel to the existing `species` (tarantula) table. Separate because the
reptile field set is materially richer — multiple temperature zones, UVB
requirements, humidity shed-boost, CITES/IUCN status, brumation profiles.

Per ADR-002 §D1 (parallel taxon tables) and PRD-herpetoverse-v1.md §5.3.

This is additive only. No existing data is moved.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'rsp_20260421_add_reptile_species_table'
down_revision: Union[str, None] = 'hva_20260421_add_herpetoverse_app_flag'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'reptile_species',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),

        # Taxonomy
        sa.Column('scientific_name', sa.String(255), nullable=False),
        sa.Column('scientific_name_lower', sa.String(255), nullable=False),
        sa.Column('common_names', postgresql.ARRAY(sa.String()), server_default='{}'),
        sa.Column('genus', sa.String(100)),
        sa.Column('family', sa.String(100)),
        sa.Column('order_name', sa.String(100)),  # "order" is a reserved word in some contexts; store as order_name

        # Care classification
        sa.Column(
            'care_level',
            sa.Enum('beginner', 'intermediate', 'advanced', name='reptilecarelevel'),
            server_default='beginner',
        ),
        sa.Column('handleability', sa.String(30)),  # 'docile' | 'defensive' | 'nippy' | 'hands_off'
        sa.Column('activity_period', sa.String(30)),  # 'diurnal' | 'nocturnal' | 'crepuscular'

        # Geography / size
        sa.Column('native_region', sa.String(200)),
        sa.Column('adult_length_min_in', sa.Numeric(6, 2)),
        sa.Column('adult_length_max_in', sa.Numeric(6, 2)),
        sa.Column('adult_weight_min_g', sa.Numeric(8, 2)),
        sa.Column('adult_weight_max_g', sa.Numeric(8, 2)),

        # Climate — richer than tarantulas (multiple zones, shed boost)
        sa.Column('temp_cool_min', sa.Numeric(5, 2)),
        sa.Column('temp_cool_max', sa.Numeric(5, 2)),
        sa.Column('temp_warm_min', sa.Numeric(5, 2)),
        sa.Column('temp_warm_max', sa.Numeric(5, 2)),
        sa.Column('temp_basking_min', sa.Numeric(5, 2)),
        sa.Column('temp_basking_max', sa.Numeric(5, 2)),
        sa.Column('temp_night_min', sa.Numeric(5, 2)),
        sa.Column('temp_night_max', sa.Numeric(5, 2)),
        sa.Column('humidity_min', sa.Integer()),
        sa.Column('humidity_max', sa.Integer()),
        sa.Column('humidity_shed_boost_min', sa.Integer()),
        sa.Column('humidity_shed_boost_max', sa.Integer()),

        # UVB
        sa.Column('uvb_required', sa.Boolean(), server_default=sa.false()),
        sa.Column('uvb_type', sa.String(30)),  # 'T5_HO' | 'T8' | 'not_required'
        sa.Column('uvb_distance_min_in', sa.Numeric(5, 2)),
        sa.Column('uvb_distance_max_in', sa.Numeric(5, 2)),
        sa.Column('uvb_replacement_months', sa.Integer()),

        # Enclosure
        sa.Column('enclosure_type', sa.String(30)),  # 'terrestrial' | 'arboreal' | 'semi_arboreal' | 'fossorial'
        sa.Column('enclosure_min_hatchling', sa.String(100)),
        sa.Column('enclosure_min_juvenile', sa.String(100)),
        sa.Column('enclosure_min_adult', sa.String(100)),
        sa.Column('bioactive_suitable', sa.Boolean(), server_default=sa.false()),

        # Substrate
        sa.Column('substrate_safe_list', postgresql.ARRAY(sa.String()), server_default='{}'),
        sa.Column('substrate_avoid_list', postgresql.ARRAY(sa.String()), server_default='{}'),
        sa.Column('substrate_depth_min_in', sa.Numeric(5, 2)),
        sa.Column('substrate_depth_max_in', sa.Numeric(5, 2)),

        # Diet
        sa.Column('diet_type', sa.String(30)),  # 'strict_carnivore' | 'insectivore' | 'omnivore' | 'herbivore'
        sa.Column('prey_size_hatchling', sa.String(100)),
        sa.Column('prey_size_juvenile', sa.String(100)),
        sa.Column('prey_size_adult', sa.String(100)),
        sa.Column('feeding_frequency_hatchling', sa.String(100)),
        sa.Column('feeding_frequency_juvenile', sa.String(100)),
        sa.Column('feeding_frequency_adult', sa.String(100)),
        sa.Column('supplementation_notes', sa.Text()),

        # Water & behavior
        sa.Column('water_bowl_description', sa.String(200)),
        sa.Column('soaking_behavior', sa.Text()),
        sa.Column('brumation_required', sa.Boolean(), server_default=sa.false()),
        sa.Column('brumation_notes', sa.Text()),
        sa.Column('defensive_displays', postgresql.ARRAY(sa.String()), server_default='{}'),

        # Lifespan
        sa.Column('lifespan_captivity_min_yrs', sa.Integer()),
        sa.Column('lifespan_captivity_max_yrs', sa.Integer()),

        # Conservation / legal
        sa.Column('cites_appendix', sa.String(5)),  # 'I' | 'II' | 'III' | null
        sa.Column('iucn_status', sa.String(5)),  # 'LC'|'NT'|'VU'|'EN'|'CR'|'EW'|'EX'|'DD'
        sa.Column('wild_population_notes', sa.Text()),

        # Morphs (informational; full data in `genes` table)
        sa.Column('has_morph_market', sa.Boolean(), server_default=sa.false()),
        sa.Column('morph_complexity', sa.String(20)),  # 'none' | 'simple' | 'moderate' | 'complex'

        # Documentation
        sa.Column('care_guide', sa.Text()),
        sa.Column('image_url', sa.String(500)),
        sa.Column('source_url', sa.String(500)),
        sa.Column('sources', postgresql.JSONB(astext_type=sa.Text())),

        # Community / verification
        sa.Column('is_verified', sa.Boolean(), server_default=sa.false()),
        sa.Column('submitted_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('verified_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('verified_at', sa.DateTime(timezone=True)),
        sa.Column('community_rating', sa.Float(), server_default='0.0'),
        sa.Column('times_kept', sa.Integer(), server_default='0'),

        # Audit / staleness
        sa.Column('content_last_reviewed_at', sa.Date()),

        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),

        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('scientific_name', name='uq_reptile_species_scientific_name'),
        sa.UniqueConstraint('scientific_name_lower', name='uq_reptile_species_scientific_name_lower'),
    )

    op.create_index(
        'ix_reptile_species_scientific_name',
        'reptile_species',
        ['scientific_name'],
    )
    op.create_index(
        'ix_reptile_species_scientific_name_lower',
        'reptile_species',
        ['scientific_name_lower'],
    )
    op.create_index(
        'ix_reptile_species_genus',
        'reptile_species',
        ['genus'],
    )


def downgrade() -> None:
    op.drop_index('ix_reptile_species_genus', table_name='reptile_species')
    op.drop_index('ix_reptile_species_scientific_name_lower', table_name='reptile_species')
    op.drop_index('ix_reptile_species_scientific_name', table_name='reptile_species')
    op.drop_table('reptile_species')
    sa.Enum(name='reptilecarelevel').drop(op.get_bind(), checkfirst=True)
