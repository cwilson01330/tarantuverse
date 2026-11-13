"""Egg sacs without a pairing, and sling groups hatched from a sac.

Revision ID: brd_20261113_egg_sac_groups
Revises: eff_20261110_effortless_logging
Create Date: 2026-11-13

Spec: docs/superpowers/specs/2026-11-13-jumping-spiders-design.md (section 3)

  * egg_sacs.pairing_id becomes NULLABLE; egg_sacs.mother_invert_id (FK inverts,
    CASCADE, indexed) names the mother directly; CHECK: one of the two is set.
  * egg_sacs.outcome ('hatched' | 'failed'; NULL = waiting).
  * colonies.egg_sac_id (FK egg_sacs, SET NULL) with a UNIQUE index: one group
    per sac, so a double tap on "Hatched" cannot make two.

Additive. No backfill needed (no egg sacs existed in production).
"""
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "brd_20261113_egg_sac_groups"
down_revision: Union[str, None] = "eff_20261110_effortless_logging"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("egg_sacs", "pairing_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.add_column(
        "egg_sacs",
        sa.Column(
            "mother_invert_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inverts.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("ix_egg_sacs_mother_invert_id", "egg_sacs", ["mother_invert_id"])
    op.add_column("egg_sacs", sa.Column("outcome", sa.String(20), nullable=True))
    op.create_check_constraint(
        "egg_sacs_parent_check", "egg_sacs",
        "pairing_id IS NOT NULL OR mother_invert_id IS NOT NULL",
    )
    op.create_check_constraint(
        "egg_sacs_outcome_check", "egg_sacs",
        "outcome IS NULL OR outcome IN ('hatched', 'failed')",
    )

    op.add_column(
        "colonies",
        sa.Column(
            "egg_sac_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("egg_sacs.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("uq_colonies_egg_sac_id", "colonies", ["egg_sac_id"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_colonies_egg_sac_id", table_name="colonies")
    op.drop_column("colonies", "egg_sac_id")

    # Re-adding NOT NULL is only safe when no sac is without a pairing.
    bind = op.get_bind()
    orphans = bind.execute(sa.text("SELECT COUNT(*) FROM egg_sacs WHERE pairing_id IS NULL")).scalar()
    if orphans:
        raise RuntimeError(
            f"Cannot downgrade: {orphans} egg sac(s) have no pairing. "
            "Delete them or attach a pairing first."
        )
    op.drop_constraint("egg_sacs_outcome_check", "egg_sacs", type_="check")
    op.drop_constraint("egg_sacs_parent_check", "egg_sacs", type_="check")
    op.drop_column("egg_sacs", "outcome")
    op.drop_index("ix_egg_sacs_mother_invert_id", table_name="egg_sacs")
    op.drop_column("egg_sacs", "mother_invert_id")
    op.alter_column("egg_sacs", "pairing_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)
