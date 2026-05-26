"""Add feeds_on_cgd flag to herp_species + per-animal override

Revision ID: cgd_20260522_add_feeds_on_cgd
Revises: anf_20260514_fix_frog_enum_values
Create Date: 2026-05-22

Rhacodactylid geckos (cresties, gargoyles, leachies, chahoua, mossy) —
and the day geckos that eat alongside them — are fed a complete diet
("CGD" — Pangea, Repashy, etc.) refreshed every 1-3 days rather than
discrete prey events. The existing feeding-stats logic treats anything
beyond 7 days as overdue, which is correct for snakes but wrong for
cresties (overdue starts around day 4). We need to know per-species
whether to apply CGD cadence thresholds, and per-animal we want a
manual override in case the keeper handles an individual differently.

This migration adds:

  herp_species.feeds_on_cgd      BOOLEAN NOT NULL DEFAULT false
  animals.feeds_on_cgd_override  BOOLEAN NULL  (NULL = inherit species)

And flips feeds_on_cgd=true on the rhacodactylid species currently in
the seed (Correlophus ciliatus, Rhacodactylus auriculatus). The three
that aren't seeded yet (Rhacodactylus leachianus, Mniarogekko chahoua,
the mossy variant) get added in a follow-up content task — when those
rows land, seed_reptile_species.py will set feeds_on_cgd=true on them
directly so this migration's data update doesn't need re-running.

Fully reversible — both columns are dropped on downgrade.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cgd_20260522_add_feeds_on_cgd'
down_revision: Union[str, None] = 'anf_20260514_fix_frog_enum_values'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Rhacodactylids currently in the seed catalog. Future additions
# (leachianus, chahoua, mossy) set this directly in the seed script, so
# this list doesn't need to grow.
_CGD_SCIENTIFIC_NAMES = (
    'Correlophus ciliatus',
    'Rhacodactylus auriculatus',
)


def upgrade() -> None:
    # herp_species: per-species default
    op.add_column(
        'herp_species',
        sa.Column(
            'feeds_on_cgd',
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    # animals: per-animal override (NULL = inherit species default)
    op.add_column(
        'animals',
        sa.Column(
            'feeds_on_cgd_override',
            sa.Boolean(),
            nullable=True,
        ),
    )

    # Mark the rhac species already in the catalog. The IN-list is the
    # safety net — any row not listed keeps its default of false. Safe
    # to re-run; setting true→true is a no-op.
    placeholders = ', '.join(f"'{name}'" for name in _CGD_SCIENTIFIC_NAMES)
    op.execute(
        "UPDATE herp_species SET feeds_on_cgd = true "
        f"WHERE scientific_name IN ({placeholders})"
    )


def downgrade() -> None:
    op.drop_column('animals', 'feeds_on_cgd_override')
    op.drop_column('herp_species', 'feeds_on_cgd')
