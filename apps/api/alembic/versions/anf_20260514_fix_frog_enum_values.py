"""Fix invalid enum values on the seeded frog herp_species rows

Revision ID: anf_20260514_fix_frog_enum_values
Revises: anh_20260514_rename_reptile_species_to_herp_species
Create Date: 2026-05-14

The 5 frog species seeded in F1 (Wednesday night) went in with
placeholder enum strings that don't match the Pydantic `Field(pattern=)`
regexes on ReptileSpeciesResponse:

    handleability    'minimal_handling' / 'no_handling'  -> invalid
    uvb_type         'low_optional' / 'low_5_uvb'        -> invalid
    morph_complexity 'low'                               -> invalid

The herp_species columns are plain VARCHAR, so the bad rows inserted
fine — then 500'd the *entire* GET /reptile-species/ list endpoint
(one invalid row fails the whole paginated response). That endpoint
backs both the Herpetoverse species browser and appalachiantarantulas.com's
care guides, so this is a live two-app outage.

seed_frog_species.py was corrected last session, but the bad rows were
already in `reptile_species` and the anh_20260514 rename carried them
into `herp_species` verbatim. This migration repairs the existing data
in place — keyed by scientific_name so it only touches these 5 rows and
is idempotent (re-running sets canonical values to canonical values).

Canonical values match the corrected seed_frog_species.py:

    Ceratophrys ornata        hands_off  / not_required / moderate
    Dendrobates auratus       hands_off  / not_required / moderate
    Trachycephalus resinifictrix  hands_off / T8        / none
    Litoria caerulea          docile     / T8           / simple
    Pyxicephalus adspersus    defensive  / not_required / simple
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'anf_20260514_fix_frog_enum_values'
down_revision: Union[str, None] = 'anh_20260514_rename_reptile_species_to_herp_species'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (scientific_name, handleability, uvb_type, morph_complexity).
# All values are hard-coded constants from the corrected seed script —
# no user input, no quotes in the names, so literal SQL is safe and
# matches the op.execute() style used by the rest of this revision set.
_FROG_FIXES = [
    ('Ceratophrys ornata', 'hands_off', 'not_required', 'moderate'),
    ('Dendrobates auratus', 'hands_off', 'not_required', 'moderate'),
    ('Trachycephalus resinifictrix', 'hands_off', 'T8', 'none'),
    ('Litoria caerulea', 'docile', 'T8', 'simple'),
    ('Pyxicephalus adspersus', 'defensive', 'not_required', 'simple'),
]


def upgrade() -> None:
    for sci_name, handleability, uvb_type, morph_complexity in _FROG_FIXES:
        op.execute(
            "UPDATE herp_species SET "
            f"handleability = '{handleability}', "
            f"uvb_type = '{uvb_type}', "
            f"morph_complexity = '{morph_complexity}' "
            f"WHERE scientific_name = '{sci_name}'"
        )


def downgrade() -> None:
    # No-op: the previous values were invalid placeholder strings that
    # broke the list endpoint. Reverting to them would only re-break the
    # API, so there's nothing meaningful to roll back to.
    pass
