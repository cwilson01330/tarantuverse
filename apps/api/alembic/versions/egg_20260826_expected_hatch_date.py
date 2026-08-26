"""Add expected_hatch_date to egg_sacs.

Revision ID: egg_20260826_expected_hatch
Revises: fcd_20260809_keeper_feeding_cadence
Create Date: 2026-08-26

`egg_sacs` carried only `hatch_date`, meaning the date a sac actually
hatched. So a breeder could record that a sac was laid and pulled, but not
when it was DUE — which is the number they care about for the six to eight
weeks in between, and the one they'd otherwise keep in their head or on a
sticky note on the incubator.

Herpetoverse's `clutches` table already models both (`expected_hatch_date`
and `hatch_date`); this brings the Tarantuverse side to parity.

The two are deliberately separate columns rather than one reused field:
  - `expected_hatch_date` is a projection and is normally in the FUTURE.
  - `hatch_date` is an event and can never be in the future.
Collapsing them would make it impossible to tell a prediction from a fact,
and would break the "no future dates for things that already happened"
rule the client-side pickers rely on.

Nullable: plenty of keepers won't estimate, and an unknown due date must
stay unknown rather than defaulting to something invented.
"""
from alembic import op
import sqlalchemy as sa


revision = "egg_20260826_expected_hatch"
down_revision = "fcd_20260809_keeper_feeding_cadence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "egg_sacs",
        sa.Column("expected_hatch_date", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("egg_sacs", "expected_hatch_date")
