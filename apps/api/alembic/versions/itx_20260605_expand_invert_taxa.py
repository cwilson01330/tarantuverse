"""Expand invert taxa (ADR-006) + add feeding_mode to invert_species

Revision ID: itx_20260605_expand_invert_taxa
Revises: sub_20260605_add_max_animals_to_plans
Create Date: 2026-06-05

Context
-------
ADR-006 expands the invert platform beyond tarantula / scorpion /
centipede. This is the single foundational migration that unblocks every
new taxon: it widens the `taxon` CHECK on both `inverts` and
`invert_species` to the full committed value set, and adds the
`feeding_mode` column that makes detritivores (millipedes, many `other`
inverts) honest.

New taxon values (lowercase common-name style, matching existing rows):
    whip_spider | vinegaroon | true_spider | millipede | mantis | other

feeding_mode (invert_species):
    predator    — live prey (default; all current taxa)
    detritivore — decaying plant matter / leaf litter (millipede)
    omnivore    — both (some `other` species)

All new taxa live on `inverts` directly (the centipede pattern) — no
legacy tables, no dual-write. The free-tier cap already counts `inverts`
cross-taxon, so new taxa are capped automatically.

Safety
------
* Widening a CHECK is non-destructive to existing rows (the old value
  set is a subset of the new one).
* `feeding_mode` ships with server_default 'predator', so every existing
  invert_species row is valid immediately.
* downgrade() restores the narrow CHECKs and drops feeding_mode. It is
  UNSAFE once any row uses a new taxon or a non-default feeding_mode —
  those rows would violate the restored constraints. That's by design;
  the schema records intent.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'itx_20260605_expand_invert_taxa'
down_revision: Union[str, None] = 'sub_20260605_add_max_animals_to_plans'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Full committed taxon set after this migration (ADR-006).
_TAXA = (
    "'tarantula', 'scorpion', 'centipede', "
    "'whip_spider', 'vinegaroon', 'true_spider', "
    "'millipede', 'mantis', 'other'"
)
_TAXA_NARROW = "'tarantula', 'scorpion', 'centipede'"


def upgrade() -> None:
    # Widen taxon CHECK on both surfaces.
    op.drop_constraint('inverts_taxon_check', 'inverts', type_='check')
    op.create_check_constraint(
        'inverts_taxon_check', 'inverts', f"taxon IN ({_TAXA})",
    )
    op.drop_constraint('invert_species_taxon_check', 'invert_species', type_='check')
    op.create_check_constraint(
        'invert_species_taxon_check', 'invert_species', f"taxon IN ({_TAXA})",
    )

    # feeding_mode — species-level driver of husbandry copy + reminder logic.
    op.add_column(
        'invert_species',
        sa.Column(
            'feeding_mode', sa.String(20),
            nullable=False, server_default='predator',
        ),
    )
    op.create_check_constraint(
        'invert_species_feeding_mode_check', 'invert_species',
        "feeding_mode IN ('predator', 'detritivore', 'omnivore')",
    )


def downgrade() -> None:
    op.drop_constraint(
        'invert_species_feeding_mode_check', 'invert_species', type_='check',
    )
    op.drop_column('invert_species', 'feeding_mode')

    op.drop_constraint('invert_species_taxon_check', 'invert_species', type_='check')
    op.create_check_constraint(
        'invert_species_taxon_check', 'invert_species', f"taxon IN ({_TAXA_NARROW})",
    )
    op.drop_constraint('inverts_taxon_check', 'inverts', type_='check')
    op.create_check_constraint(
        'inverts_taxon_check', 'inverts', f"taxon IN ({_TAXA_NARROW})",
    )
