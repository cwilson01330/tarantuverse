"""Let colonies own care logs, and record where removed animals went.

Revision ID: cwc_20260910_colony_care
Revises: car_20260909_care_logs
Create Date: 2026-09-10

Both changes come from the same request: a keeper expanding into isopods, who
described them as sitting "somewhere in between pet and feeder".

WHY care_logs NEEDED A COLONY PARENT
------------------------------------
car_20260909 parented hydration events on `inverts` only — defensible for
tarantulas, wrong the moment you think about detritivore cultures. Colonies
aren't inverts and have no invert row, so misting and overflowing had nowhere
to go for exactly the animals where hydration IS the husbandry. An isopod
culture is watered constantly and fed almost incidentally; the previous shape
had that backwards.

The irony that made it obvious: `feeder_care_logs` has carried a
`water_change` type since the feeder work. The FEEDER system could track
hydration and the PET system could not, for a group most keepers keep as pets.

EXACTLY-ONE PARENT, unlike substrate_changes
--------------------------------------------
`substrate_changes` uses at-least-one because ADR-005 dual-write rows
legitimately carry both `tarantula_id` and `invert_id`. `care_logs` has no
legacy mirror — it was born after the consolidation — so it can hold the
tighter invariant from the start:

    num_nonnulls(invert_id, colony_id) = 1

`invert_id` drops from NOT NULL to nullable to allow it. The three existing
production rows all carry an invert_id and are unaffected.

WHY `destination` IS FREE TEXT AND NOT AN FK
--------------------------------------------
A `removed` event records that twenty animals left, not where they went — and
for someone using isopods as clean-up crew, the destination is the entire
point of the removal.

The obvious target would be `enclosures.id`. Measured before choosing:
11 enclosures exist, across 3 keepers, with **zero** inverts linked to one.
An FK to a table nobody populates produces a field nobody can fill. Free text
takes "into the GBB's enclosure", "sold 30", "gave to Brooke" — how keepers
actually describe it — and can be promoted to an FK later if enclosures ever
earns adoption.

NULLABLE AND NEVER REQUIRED. Plenty of keepers keep isopods purely as pets and
remove animals for ordinary reasons. A field that demanded a destination would
turn a neutral event into an interrogation.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "cwc_20260910_colony_care"
down_revision: Union[str, None] = "car_20260909_care_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PARENT_CHECK = "care_logs_exactly_one_parent"


def upgrade() -> None:
    op.add_column(
        "care_logs",
        sa.Column(
            "colony_id",
            UUID(as_uuid=True),
            sa.ForeignKey("colonies.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_care_logs_colony_logged_at", "care_logs", ["colony_id", "logged_at"]
    )

    # Was NOT NULL when inverts were the only possible parent.
    op.alter_column("care_logs", "invert_id", existing_type=UUID(as_uuid=True), nullable=True)

    op.create_check_constraint(
        PARENT_CHECK, "care_logs", "num_nonnulls(invert_id, colony_id) = 1"
    )

    # Optional, and only meaningful on `removed` / `split`.
    op.add_column(
        "colony_events", sa.Column("destination", sa.String(200), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("colony_events", "destination")

    op.drop_constraint(PARENT_CHECK, "care_logs", type_="check")
    # Colony-parented rows cannot survive a return to an invert-only parent.
    op.execute("DELETE FROM care_logs WHERE colony_id IS NOT NULL")
    op.alter_column("care_logs", "invert_id", existing_type=UUID(as_uuid=True), nullable=False)
    op.drop_index("ix_care_logs_colony_logged_at", table_name="care_logs")
    op.drop_column("care_logs", "colony_id")
