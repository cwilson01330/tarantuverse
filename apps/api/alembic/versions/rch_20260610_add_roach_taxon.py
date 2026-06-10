"""Add roach taxon (hissers, dubia, pet roaches)

Revision ID: rch_20260610_add_roach_taxon
Revises: itx_20260605_expand_invert_taxa
Create Date: 2026-06-10

Context
-------
Adds 'roach' to the committed taxon set on `inverts` + `invert_species`.
Pet roaches (Madagascar hissers especially) are a real keeper demand —
hisser searches are already showing up in the species browser. Dubia
keepers get the taxon too; the feeder-colony system remains separate
(a future rework, deliberately NOT entangled here).

Roach species seed with feeding_mode='omnivore' (roach chow + produce,
no live-prey cadence) via seed_roach_species.py — run on Render shell
after deploy.

Code that must stay in lockstep with this value set (the ADR-006 422
trap): schemas/invert.py::TAXON_PATTERN, models/invert.py::
INVERT_TAXON_VALUES, schemas/invert_species.py, routers/invert_species.py,
routers/inverts.py list_inverts Query pattern, and the INVERT_TAXA
registries in apps/mobile/src/lib/inverts.ts + apps/web/src/lib/inverts.ts.

Safety
------
* Widening a CHECK is non-destructive (old set is a subset of new).
* downgrade() restores the nine-taxon CHECK — UNSAFE once any roach
  rows exist, by design.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'rch_20260610_add_roach_taxon'
down_revision: Union[str, None] = 'itx_20260605_expand_invert_taxa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TAXA_WITH_ROACH = (
    "'tarantula', 'scorpion', 'centipede', "
    "'whip_spider', 'vinegaroon', 'true_spider', "
    "'millipede', 'mantis', 'roach', 'other'"
)
_TAXA_NINE = (
    "'tarantula', 'scorpion', 'centipede', "
    "'whip_spider', 'vinegaroon', 'true_spider', "
    "'millipede', 'mantis', 'other'"
)


def upgrade() -> None:
    op.drop_constraint('inverts_taxon_check', 'inverts', type_='check')
    op.create_check_constraint(
        'inverts_taxon_check', 'inverts', f"taxon IN ({_TAXA_WITH_ROACH})",
    )
    op.drop_constraint('invert_species_taxon_check', 'invert_species', type_='check')
    op.create_check_constraint(
        'invert_species_taxon_check', 'invert_species',
        f"taxon IN ({_TAXA_WITH_ROACH})",
    )


def downgrade() -> None:
    op.drop_constraint('invert_species_taxon_check', 'invert_species', type_='check')
    op.create_check_constraint(
        'invert_species_taxon_check', 'invert_species', f"taxon IN ({_TAXA_NINE})",
    )
    op.drop_constraint('inverts_taxon_check', 'inverts', type_='check')
    op.create_check_constraint(
        'inverts_taxon_check', 'inverts', f"taxon IN ({_TAXA_NINE})",
    )
