"""Let colonies own substrate changes.

Revision ID: csc_20260731_colony_substrate
Revises: cml_20260730_colony_molts
Create Date: 2026-07-31

Found while dry-running the first invert→colony conversion. The colony already
carried `substrate_type`, `substrate_depth` and `last_substrate_change` as
current-state fields, so it looked complete — but there was nowhere to put the
HISTORY, and `substrate_changes` had no `colony_id`.

That gap was about to delete real records. The keeper being converted had two
rehousing entries, one noting they were moved back to the original enclosure
for more height. Those rows hang off the invert with ON DELETE CASCADE, so
retiring the stand-in animal would have taken them with it — silently, since
the conversion reported only the tables it knew about.

A communal needs this history at least as much as a solitary animal does.
Rehousing a group is a bigger, riskier operation, and why substrate was changed
("mold", "rehousing", "they needed more height") is exactly the context a
keeper wants when a communal starts going wrong.

CONSTRAINT SHAPE
----------------
Same at-least-one-parent form as molt_logs, verified against production:

    tarantula_id IS NOT NULL OR enclosure_id IS NOT NULL
    OR scorpion_id IS NOT NULL OR invert_id IS NOT NULL

colony_id is added to that OR. Not tightened to exactly-one, for the same
reason as cml_20260730: dual-write rows legitimately carry both tarantula_id
and invert_id, and that cleanup belongs with the ADR-005 read cutover.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'csc_20260731_colony_substrate'
down_revision: Union[str, None] = 'cml_20260730_colony_molts'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT = "substrate_change_must_have_parent"

WITHOUT_COLONY = (
    "tarantula_id IS NOT NULL OR enclosure_id IS NOT NULL "
    "OR scorpion_id IS NOT NULL OR invert_id IS NOT NULL"
)
WITH_COLONY = WITHOUT_COLONY + " OR colony_id IS NOT NULL"


def upgrade() -> None:
    op.add_column(
        "substrate_changes",
        sa.Column(
            "colony_id",
            UUID(as_uuid=True),
            sa.ForeignKey("colonies.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("ix_substrate_changes_colony_id", "substrate_changes", ["colony_id"])

    op.drop_constraint(CONSTRAINT, "substrate_changes", type_="check")
    op.create_check_constraint(CONSTRAINT, "substrate_changes", WITH_COLONY)


def downgrade() -> None:
    op.execute("DELETE FROM substrate_changes WHERE colony_id IS NOT NULL")
    op.drop_constraint(CONSTRAINT, "substrate_changes", type_="check")
    op.create_check_constraint(CONSTRAINT, "substrate_changes", WITHOUT_COLONY)
    op.drop_index("ix_substrate_changes_colony_id", table_name="substrate_changes")
    op.drop_column("substrate_changes", "colony_id")
