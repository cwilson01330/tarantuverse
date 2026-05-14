"""extend reptile_pairings + reptile_offspring with frog parents

Revision ID: frb_20260513_extend_breeding_for_frogs
Revises: frp_20260513_extend_polymorphic_tables_for_frogs
Create Date: 2026-05-13

Pairings get male_frog_id / female_frog_id; offspring get frog_id (the
hold-back link). The original rbr_20260429 schema enforced exactly-one
male FK + exactly-one female FK + matching taxon via three CHECK
constraints; we drop and recreate them with frog included.

Note on naming: the breeding tables are called `reptile_pairings` /
`reptile_offspring` even though we're now extending them to amphibians
too. Same trade-off as keeping `reptile_species` — renaming is a much
bigger refactor than the misnomer is worth.

This is additive only. Existing pairings between snakes-and-snakes or
lizards-and-lizards satisfy the new CHECKs automatically because
male_frog_id / female_frog_id default to NULL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'frb_20260513_extend_breeding_for_frogs'
down_revision: Union[str, None] = 'frp_20260513_extend_polymorphic_tables_for_frogs'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── reptile_pairings: add male_frog_id + female_frog_id ──
    op.add_column(
        'reptile_pairings',
        sa.Column(
            'male_frog_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('frogs.id', ondelete='CASCADE'),
            nullable=True,
        ),
    )
    op.add_column(
        'reptile_pairings',
        sa.Column(
            'female_frog_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('frogs.id', ondelete='CASCADE'),
            nullable=True,
        ),
    )
    op.create_index(
        'ix_reptile_pairings_male_frog_id',
        'reptile_pairings',
        ['male_frog_id'],
    )
    op.create_index(
        'ix_reptile_pairings_female_frog_id',
        'reptile_pairings',
        ['female_frog_id'],
    )

    # Replace the three CHECK constraints so they include frog.
    op.drop_constraint(
        'reptile_pairings_male_xor', 'reptile_pairings', type_='check',
    )
    op.drop_constraint(
        'reptile_pairings_female_xor', 'reptile_pairings', type_='check',
    )
    op.drop_constraint(
        'reptile_pairings_taxon_match', 'reptile_pairings', type_='check',
    )

    op.create_check_constraint(
        'reptile_pairings_male_xor',
        'reptile_pairings',
        "(male_snake_id IS NOT NULL)::int "
        "+ (male_lizard_id IS NOT NULL)::int "
        "+ (male_frog_id IS NOT NULL)::int = 1",
    )
    op.create_check_constraint(
        'reptile_pairings_female_xor',
        'reptile_pairings',
        "(female_snake_id IS NOT NULL)::int "
        "+ (female_lizard_id IS NOT NULL)::int "
        "+ (female_frog_id IS NOT NULL)::int = 1",
    )
    # Both parents must be the same taxon. Original rule was "male and
    # female snake_ids share NULL-ness." Generalized to three taxa: the
    # NULL-ness must match per-taxon.
    op.create_check_constraint(
        'reptile_pairings_taxon_match',
        'reptile_pairings',
        "(male_snake_id IS NULL) = (female_snake_id IS NULL) "
        "AND (male_lizard_id IS NULL) = (female_lizard_id IS NULL) "
        "AND (male_frog_id IS NULL) = (female_frog_id IS NULL)",
    )

    # ── reptile_offspring: add frog_id ──
    op.add_column(
        'reptile_offspring',
        sa.Column(
            'frog_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('frogs.id', ondelete='SET NULL'),
            nullable=True,
        ),
    )
    op.create_index(
        'ix_reptile_offspring_frog_id',
        'reptile_offspring',
        ['frog_id'],
    )
    # No CHECK constraint here — offspring can be unlinked (no
    # snake/lizard/frog), exactly the same as before. The hold-back
    # link is optional.


def downgrade() -> None:
    op.drop_index(
        'ix_reptile_offspring_frog_id', table_name='reptile_offspring',
    )
    op.drop_column('reptile_offspring', 'frog_id')

    # Restore the original two-taxon CHECKs.
    op.drop_constraint(
        'reptile_pairings_taxon_match', 'reptile_pairings', type_='check',
    )
    op.drop_constraint(
        'reptile_pairings_female_xor', 'reptile_pairings', type_='check',
    )
    op.drop_constraint(
        'reptile_pairings_male_xor', 'reptile_pairings', type_='check',
    )
    op.create_check_constraint(
        'reptile_pairings_male_xor',
        'reptile_pairings',
        "(male_snake_id IS NOT NULL)::int + (male_lizard_id IS NOT NULL)::int = 1",
    )
    op.create_check_constraint(
        'reptile_pairings_female_xor',
        'reptile_pairings',
        "(female_snake_id IS NOT NULL)::int + (female_lizard_id IS NOT NULL)::int = 1",
    )
    op.create_check_constraint(
        'reptile_pairings_taxon_match',
        'reptile_pairings',
        "(male_snake_id IS NULL) = (female_snake_id IS NULL)",
    )

    op.drop_index(
        'ix_reptile_pairings_female_frog_id', table_name='reptile_pairings',
    )
    op.drop_index(
        'ix_reptile_pairings_male_frog_id', table_name='reptile_pairings',
    )
    op.drop_column('reptile_pairings', 'female_frog_id')
    op.drop_column('reptile_pairings', 'male_frog_id')
