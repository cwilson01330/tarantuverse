"""Add enclosure_type + enclosure_size to colonies.

Revision ID: col_20260729_colony_enclosure
Revises: shl_20260727_shortlist
Create Date: 2026-07-29

Colonies carried substrate, temperature, humidity and water dish but no
enclosure dimensions, while individual `inverts` have had both `enclosure_type`
and `enclosure_size` since the consolidation. That asymmetry is backwards:
floor space per animal is the single biggest variable in whether a communal
holds together — crowding is what drives cannibalism — so the field matters
MORE for a colony than for a solitary animal, not less.

Reported 2026-07-29 by a keeper who couldn't record the enclosure size for a
Monocentropus balfouri communal.

Both columns are nullable text, matching the invert shape exactly so the two
surfaces stay comparable:
  * enclosure_type — 'terrestrial' | 'arboreal' | 'fossorial', CHECK-constrained
    the same way `inverts.enclosure_type` is.
  * enclosure_size — free text ("12x12x12 inches"), because keepers describe
    enclosures in whatever units and format their supplier uses and normalising
    that would lose information.

CHAIN NOTE: this deliberately chains onto shl_20260727_shortlist rather than
prc_20260728_pricing_private, because the pricing migration is held back
pending amendments and shouldn't gate an unrelated fix. When pricing does ship,
re-point ITS down_revision at this revision — otherwise Alembic sees two heads.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'col_20260729_colony_enclosure'
down_revision: Union[str, None] = 'shl_20260727_shortlist'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('colonies', sa.Column('enclosure_type', sa.String(length=30), nullable=True))
    op.add_column('colonies', sa.Column('enclosure_size', sa.String(length=50), nullable=True))
    # Same constraint the inverts table uses. Named explicitly so downgrade can
    # drop it by name rather than guessing at a generated identifier.
    op.create_check_constraint(
        'colonies_enclosure_type_check',
        'colonies',
        "enclosure_type IS NULL OR enclosure_type IN ('terrestrial', 'arboreal', 'fossorial')",
    )


def downgrade() -> None:
    op.drop_constraint('colonies_enclosure_type_check', 'colonies', type_='check')
    op.drop_column('colonies', 'enclosure_size')
    op.drop_column('colonies', 'enclosure_type')
