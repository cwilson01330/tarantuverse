"""Colony transfers: hand over a whole colony or part of it.

Revision ID: ctr_20261008_colony_transfers
Revises: shk_20261007_share_card_kinds
Create Date: 2026-10-08

`animal_transfers` already carries one source of two kinds (invert XOR animal,
htr_20260707). A colony becomes the third kind:

  * colony_id          -- the SOURCE colony (CASCADE, like invert_id/animal_id)
  * claimed_colony_id  -- the colony created for the buyer on claim (SET NULL)
  * transfer_counts    -- NULL for a full transfer; for a partial one the
                          {stage: n} being handed over, every n > 0

The one-source CHECK is widened to exactly one of invert_id / animal_id /
colony_id. Every existing row has exactly one of the first two, so the wider
CHECK holds on upgrade.

Downgrade: the old CHECK can't hold colony rows, so they are deleted first.
That takes down any open colony transfer link -- run it only if you mean that.
"""
from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "ctr_20261008_colony_transfers"
down_revision: Union[str, None] = "shk_20261007_share_card_kinds"
branch_labels = None
depends_on = None


ONE_SOURCE_V3 = (
    "(invert_id IS NOT NULL)::int + (animal_id IS NOT NULL)::int"
    " + (colony_id IS NOT NULL)::int = 1"
)
ONE_SOURCE_V2 = "(invert_id IS NOT NULL)::int + (animal_id IS NOT NULL)::int = 1"


def upgrade() -> None:
    op.add_column(
        "animal_transfers",
        sa.Column("colony_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "animal_transfers",
        sa.Column("claimed_colony_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "animal_transfers",
        sa.Column("transfer_counts", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.create_foreign_key(
        "animal_transfers_colony_id_fkey",
        "animal_transfers", "colonies",
        ["colony_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "animal_transfers_claimed_colony_id_fkey",
        "animal_transfers", "colonies",
        ["claimed_colony_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_animal_transfers_colony_id", "animal_transfers", ["colony_id"],
    )
    op.drop_constraint("animal_transfers_one_source_check", "animal_transfers", type_="check")
    op.create_check_constraint(
        "animal_transfers_one_source_check", "animal_transfers", ONE_SOURCE_V3,
    )


def downgrade() -> None:
    op.execute("DELETE FROM animal_transfers WHERE colony_id IS NOT NULL")
    op.drop_constraint("animal_transfers_one_source_check", "animal_transfers", type_="check")
    op.create_check_constraint(
        "animal_transfers_one_source_check", "animal_transfers", ONE_SOURCE_V2,
    )
    op.drop_index("ix_animal_transfers_colony_id", table_name="animal_transfers")
    op.drop_constraint("animal_transfers_claimed_colony_id_fkey", "animal_transfers", type_="foreignkey")
    op.drop_constraint("animal_transfers_colony_id_fkey", "animal_transfers", type_="foreignkey")
    op.drop_column("animal_transfers", "transfer_counts")
    op.drop_column("animal_transfers", "claimed_colony_id")
    op.drop_column("animal_transfers", "colony_id")
