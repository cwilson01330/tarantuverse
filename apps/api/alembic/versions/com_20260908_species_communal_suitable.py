"""Add species.communal_suitable.

Revision ID: com_20260908_species_communal
Revises: agg_20260904_exclude_agg
Create Date: 2026-09-08

Brings the tarantula catalog in line with `invert_species` and
`scorpion_species`, which have carried this flag since scp_20260522.

WHY
---
Colony mode (ADR-010) is reachable on mobile only through a segmented control
that renders when a species is picked. That control gates on
`taxon !== 'tarantula'`, which is wrong in both directions: it offers
population tracking for centipedes (all 15 in the catalog are
`communal_suitable = false` — they are reliably cannibalistic) and withholds it
for *Monocentropus balfouri*, the single most established communal tarantula in
the hobby. Two of the three colonies that exist in production are tarantulas.

The correct gate is the per-species flag, which already exists for every taxon
EXCEPT tarantulas — so the flag has to exist here before the gate can move.
That absence is also why the `species -> invert_species` dual-write leaves all
197 mirrored tarantula rows false: it has nothing to copy.

Default false. No species becomes communal on deploy; the honest subset is
marked by `seed_communal_tarantulas.py`, which is a husbandry claim and belongs
in a reviewable script rather than in schema history.
"""
from alembic import op
import sqlalchemy as sa


revision = "com_20260908_species_communal"
down_revision = "agg_20260904_exclude_agg"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "species",
        sa.Column(
            "communal_suitable",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("species", "communal_suitable")
