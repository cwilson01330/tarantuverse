"""Let colonies own photos and feeding logs.

Revision ID: cph_20260729_colony_logs
Revises: col_20260729_colony_enclosure
Create Date: 2026-07-29

ADR-010 deferred feeding for colonies on the grounds that colony taxa are
"mostly detritivore/casual-feed and don't fit a per-animal feeding cadence".
That's true of isopods and springtails. It is NOT true of a communal tarantula:
keepers feed a Monocentropus balfouri group on a cadence, watch it for molts,
and the animals in it are the same species they'd otherwise track individually.
The ADR generalised from feeder colonies to all colonies, and pet communals
fell through the gap — a balfouri communal could be named, housed and counted
but never photographed or fed.

Two polymorphic parents added:

  photos.colony_id        — a communal deserves a gallery like any animal
  feeding_logs.colony_id  — group feedings, one log per feeding event

CONSTRAINT SHAPE
----------------
Both tables already carried:

    num_nonnulls(<legacy parents>) = 1
    OR (num_nonnulls(<legacy parents>) = 0 AND invert_id IS NOT NULL)

The first branch is deliberately loose about `invert_id` because dual-write
rows carry BOTH a legacy id and the unified one. The rewrite preserves that and
adds colonies as a third mutually-exclusive option:

    (num_nonnulls(<legacy>) = 1 AND colony_id IS NULL)
    OR (num_nonnulls(<legacy>) = 0 AND num_nonnulls(invert_id, colony_id) = 1)

So a row belongs to exactly one animal OR exactly one colony, never both, and
existing dual-write rows keep validating unchanged.

Verified against production before writing (read-only): the definitions above
are the live ones, not what the SQLAlchemy models declare — `photo.py` still
lists the pre-invert_id version.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'cph_20260729_colony_logs'
down_revision: Union[str, None] = 'col_20260729_colony_enclosure'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PHOTO_LEGACY = "tarantula_id, animal_id, scorpion_id"
FEEDING_LEGACY = "tarantula_id, enclosure_id, animal_id, scorpion_id"


def _one_parent(legacy: str, with_colony: bool) -> str:
    """CHECK body. `with_colony=False` reproduces the pre-migration text exactly
    so downgrade restores the original definition rather than an approximation."""
    if with_colony:
        return (
            f"(num_nonnulls({legacy}) = 1 AND colony_id IS NULL) "
            f"OR (num_nonnulls({legacy}) = 0 AND num_nonnulls(invert_id, colony_id) = 1)"
        )
    return (
        f"(num_nonnulls({legacy}) = 1) "
        f"OR (num_nonnulls({legacy}) = 0 AND invert_id IS NOT NULL)"
    )


def upgrade() -> None:
    for table, legacy in (("photos", PHOTO_LEGACY), ("feeding_logs", FEEDING_LEGACY)):
        op.add_column(
            table,
            sa.Column(
                "colony_id",
                UUID(as_uuid=True),
                sa.ForeignKey("colonies.id", ondelete="CASCADE"),
                nullable=True,
            ),
        )
        # Deleting a colony should take its photos and feedings with it, same as
        # every other parent — hence CASCADE above.
        op.create_index(f"ix_{table}_colony_id", table, ["colony_id"])

        constraint = f"{table}_must_have_exactly_one_parent"
        op.drop_constraint(constraint, table, type_="check")
        op.create_check_constraint(constraint, table, _one_parent(legacy, True))


def downgrade() -> None:
    for table, legacy in (("photos", PHOTO_LEGACY), ("feeding_logs", FEEDING_LEGACY)):
        constraint = f"{table}_must_have_exactly_one_parent"
        # Colony-owned rows would violate the narrowed constraint, so clear them
        # first. Destructive, but the alternative is a downgrade that can't run.
        op.execute(f"DELETE FROM {table} WHERE colony_id IS NOT NULL")
        op.drop_constraint(constraint, table, type_="check")
        op.create_check_constraint(constraint, table, _one_parent(legacy, False))
        op.drop_index(f"ix_{table}_colony_id", table_name=table)
        op.drop_column(table, "colony_id")
