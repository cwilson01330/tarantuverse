"""add snakes table

Revision ID: snk_20260421_add_snakes_table
Revises: rsp_20260421_add_reptile_species_table
Create Date: 2026-04-21

Parallel to `tarantulas`. Per ADR-002 §D1 — NOT a rename, NOT an inheritance
pattern. Snakes have genuinely different husbandry semantics than tarantulas:

  - No substrate_depth obsession (snakes live ON substrate, not IN it for most species)
  - No urticating_hairs / webbing_amount / misting_schedule (all tarantula-specific)
  - Length + weight tracked in real units (inches, grams) vs. tarantula leg span
  - Ecdysis (shedding) instead of molting — separate shed_logs table (next migration)
  - Brumation is a thing — tracked as a boolean for in-progress brumation cycles
  - Feeding expressed as schedule (e.g. "1 medium rat every 10 days") rather than
    per-log food_type+accepted

The `enclosure_id` FK references the existing enclosures table, whose `purpose`
column gets application-level extended to accept 'snake' (no schema change).

Sex + Source enums are reused from the existing enum types on the tarantulas
table — same DB enum, same Python enum. No new enum types created.

This is additive only.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'snk_20260421_add_snakes_table'
down_revision: Union[str, None] = 'rsp_20260421_add_reptile_species_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'snakes',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            'user_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'reptile_species_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('reptile_species.id'),
            nullable=True,
        ),
        sa.Column(
            'enclosure_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('enclosures.id', ondelete='SET NULL'),
            nullable=True,
        ),

        # Basic identity
        sa.Column('name', sa.String(100)),  # Keeper's pet name
        sa.Column('common_name', sa.String(100)),  # e.g., "Ball Python"
        sa.Column('scientific_name', sa.String(255)),  # e.g., "Python regius"

        # Reuse existing `sex` and `source` enums from the tarantulas table.
        # These enum types were created by the initial migration with UPPERCASE
        # values (MALE/FEMALE/UNKNOWN, BRED/BOUGHT/WILD_CAUGHT) — see
        # 9588b399ad54_initial_migration.py. We attach to the existing enum
        # type rather than creating a parallel type — this is why we pass
        # create_type=False to postgresql.ENUM. The Python enum's .name maps
        # to the uppercase DB value; SQLAlchemy writes .name by default.
        sa.Column(
            'sex',
            postgresql.ENUM('MALE', 'FEMALE', 'UNKNOWN', name='sex', create_type=False),
            server_default='UNKNOWN',
        ),

        # Acquisition (snakes have a more useful hatch_date than tarantulas often do)
        sa.Column('date_acquired', sa.Date()),
        sa.Column('hatch_date', sa.Date(), nullable=True),  # CB provenance
        sa.Column(
            'source',
            postgresql.ENUM('BRED', 'BOUGHT', 'WILD_CAUGHT', name='source', create_type=False),
        ),
        sa.Column('source_breeder', sa.String(255)),  # Morph provenance — important for snakes
        sa.Column('price_paid', sa.Numeric(10, 2)),

        # Current state (measured, not computed from species)
        sa.Column('current_weight_g', sa.Numeric(8, 2), nullable=True),
        sa.Column('current_length_in', sa.Numeric(6, 2), nullable=True),

        # Husbandry reference (fine-grained conditions live in environment_readings)
        # feeding_schedule is a human-readable string because real keepers talk
        # in phrases like "1 medium rat every 10-14 days" not in strict integer days.
        sa.Column('feeding_schedule', sa.String(200), nullable=True),
        # Denormalized timestamps — updated by the app on feeding/shed log insert.
        # Denormalized for fast dashboard queries ("days since last fed" badge).
        sa.Column('last_fed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_shed_at', sa.Date(), nullable=True),
        sa.Column('brumation_active', sa.Boolean(), server_default=sa.false()),
        sa.Column('brumation_started_at', sa.Date(), nullable=True),

        # Media
        sa.Column('photo_url', sa.String(500)),

        # Privacy (same pattern as tarantulas)
        sa.Column('is_public', sa.Boolean(), server_default=sa.false()),
        sa.Column('visibility', sa.String(20), server_default='private'),

        # Notes
        sa.Column('notes', sa.Text()),

        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),

        sa.PrimaryKeyConstraint('id'),
    )

    op.create_index('ix_snakes_user_id', 'snakes', ['user_id'])
    op.create_index('ix_snakes_reptile_species_id', 'snakes', ['reptile_species_id'])


def downgrade() -> None:
    op.drop_index('ix_snakes_reptile_species_id', table_name='snakes')
    op.drop_index('ix_snakes_user_id', table_name='snakes')
    op.drop_table('snakes')
    # DO NOT drop the 'sex' or 'source' enum types — they are shared with the
    # tarantulas table and would break it.
