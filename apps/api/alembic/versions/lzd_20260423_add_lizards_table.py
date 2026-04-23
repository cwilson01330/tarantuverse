"""add lizards table

Revision ID: lzd_20260423_add_lizards_table
Revises: slg_20260423_add_reptile_species_slug
Create Date: 2026-04-23

Parallel to `snakes` per ADR-002 §D1 (same "don't clone, don't inherit,
separate but consistent" pattern that gave snakes their own table). Lizards
have overlapping-but-distinct husbandry from snakes:

  - UVB is a first-class feature (most diurnal lizards mandate it) — but
    we already capture this on the species care sheet, not per-animal.
  - Shedding is patchy/piecemeal rather than whole-skin — shed_logs row
    semantics unchanged; a lizard log is just another shed event.
  - Some species (leopard gecko, bearded dragon) brumate; others don't —
    we reuse `brumation_active` / `brumation_started_at` identically.
  - Diet varies wildly (insectivore vs. omnivore vs. herbivore) — again,
    species-level concern, not per-animal. Our feeding_logs record is
    dietary-agnostic.
  - Tail autotomy (gecko tail drops) is NOT captured in v1 — if the hobby
    asks for it, we add a separate boolean + dropped_at field then.

The `enclosure_id` FK references the existing enclosures table; the
application-level `purpose` string extends to accept 'lizard' (no schema
change — enclosures.purpose is a free-text VARCHAR).

Sex + Source enums are reused from the shared DB enum types on
`tarantulas` + `snakes`. Same Python enum, same DB type, same UPPERCASE
values (MALE/FEMALE/UNKNOWN, BRED/BOUGHT/WILD_CAUGHT). No new enum types
created — if we drop lizards in a downgrade, those enums stay.

This is additive only.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'lzd_20260423_add_lizards_table'
down_revision: Union[str, None] = 'slg_20260423_add_reptile_species_slug'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'lizards',
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
        sa.Column('name', sa.String(100)),
        sa.Column('common_name', sa.String(100)),
        sa.Column('scientific_name', sa.String(255)),

        # Shared DB enums — same story as snakes (see snk_ migration
        # module docstring). UPPERCASE names map to uppercase DB values.
        sa.Column(
            'sex',
            postgresql.ENUM('MALE', 'FEMALE', 'UNKNOWN', name='sex', create_type=False),
            server_default='UNKNOWN',
        ),

        # Acquisition — hatch_date matters for lizards too (CB provenance +
        # age-based husbandry)
        sa.Column('date_acquired', sa.Date()),
        sa.Column('hatch_date', sa.Date(), nullable=True),
        sa.Column(
            'source',
            postgresql.ENUM('BRED', 'BOUGHT', 'WILD_CAUGHT', name='source', create_type=False),
        ),
        sa.Column('source_breeder', sa.String(255)),  # morph provenance
        sa.Column('price_paid', sa.Numeric(10, 2)),

        # Current state (measured, not derived from species)
        sa.Column('current_weight_g', sa.Numeric(8, 2), nullable=True),
        sa.Column('current_length_in', sa.Numeric(6, 2), nullable=True),

        # Husbandry reference — same pattern as snakes. feeding_schedule
        # stays a free-text phrase because real keeper usage is
        # "insects 5x/week, greens daily" — not an integer interval.
        sa.Column('feeding_schedule', sa.String(200), nullable=True),
        sa.Column('last_fed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_shed_at', sa.Date(), nullable=True),
        sa.Column('brumation_active', sa.Boolean(), server_default=sa.false()),
        sa.Column('brumation_started_at', sa.Date(), nullable=True),

        # Media
        sa.Column('photo_url', sa.String(500)),

        # Privacy
        sa.Column('is_public', sa.Boolean(), server_default=sa.false()),
        sa.Column('visibility', sa.String(20), server_default='private'),

        # Notes
        sa.Column('notes', sa.Text()),

        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),

        sa.PrimaryKeyConstraint('id'),
    )

    op.create_index('ix_lizards_user_id', 'lizards', ['user_id'])
    op.create_index('ix_lizards_reptile_species_id', 'lizards', ['reptile_species_id'])


def downgrade() -> None:
    op.drop_index('ix_lizards_reptile_species_id', table_name='lizards')
    op.drop_index('ix_lizards_user_id', table_name='lizards')
    op.drop_table('lizards')
    # Do NOT drop the 'sex' or 'source' enum types — they are shared with
    # tarantulas + snakes and would break those tables.
