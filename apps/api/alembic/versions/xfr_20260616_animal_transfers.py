"""Animal transfer & provenance ("rehome")

Revision ID: xfr_20260616_animal_transfers
Revises: cap_20260615_lower_free_animal_cap
Create Date: 2026-06-16

BRIEF-animal-transfer-provenance. Adds:
  - `animal_transfers` table (seller→buyer claim records, frozen snapshot)
  - provenance columns on `inverts` (bred_by_user_id, origin_keeper_name,
    source_transfer_id, provenance JSONB, transferred_out_at)

§4d circular-FK ordering: `animal_transfers.invert_id → inverts.id` and
`inverts.source_transfer_id → animal_transfers.id` reference each other. So:
  1. create `animal_transfers` (its FK to the existing `inverts` is fine)
  2. add the inverts provenance columns, then add the
     `inverts.source_transfer_id → animal_transfers` FK as a SEPARATE step.

Additive + non-breaking. downgrade drops the FK, the columns, then the table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'xfr_20260616_animal_transfers'
down_revision: Union[str, None] = 'cap_20260615_lower_free_animal_cap'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. animal_transfers — its invert_id/from_user_id/to_user_id/claimed_invert_id
    #    FKs all point at already-existing tables, so this is safe first.
    op.create_table(
        "animal_transfers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("token", sa.String(64), nullable=False),
        sa.Column(
            "invert_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inverts.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "from_user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "to_user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "claimed_invert_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inverts.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("sale_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("include_photos", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'claimed', 'cancelled', 'expired')",
            name="animal_transfers_status_check",
        ),
    )
    op.create_index("ix_animal_transfers_token", "animal_transfers", ["token"], unique=True)
    op.create_index("ix_animal_transfers_invert_id", "animal_transfers", ["invert_id"])
    op.create_index("ix_animal_transfers_from_user_id", "animal_transfers", ["from_user_id"])
    op.create_index("ix_animal_transfers_to_user_id", "animal_transfers", ["to_user_id"])
    op.create_index("ix_animal_transfers_status", "animal_transfers", ["status"])

    # 2. Provenance columns on inverts. Add source_transfer_id WITHOUT its FK
    #    first, then create the FK separately now that animal_transfers exists.
    op.add_column("inverts", sa.Column("bred_by_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("inverts", sa.Column("origin_keeper_name", sa.String(120), nullable=True))
    op.add_column("inverts", sa.Column("source_transfer_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("inverts", sa.Column("provenance", postgresql.JSONB(), nullable=True))
    op.add_column("inverts", sa.Column("transferred_out_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_inverts_transferred_out_at", "inverts", ["transferred_out_at"])

    op.create_foreign_key(
        "fk_inverts_bred_by_user_id", "inverts", "users",
        ["bred_by_user_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_inverts_source_transfer_id", "inverts", "animal_transfers",
        ["source_transfer_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_inverts_source_transfer_id", "inverts", type_="foreignkey")
    op.drop_constraint("fk_inverts_bred_by_user_id", "inverts", type_="foreignkey")
    op.drop_index("ix_inverts_transferred_out_at", table_name="inverts")
    op.drop_column("inverts", "transferred_out_at")
    op.drop_column("inverts", "provenance")
    op.drop_column("inverts", "source_transfer_id")
    op.drop_column("inverts", "origin_keeper_name")
    op.drop_column("inverts", "bred_by_user_id")

    op.drop_index("ix_animal_transfers_status", table_name="animal_transfers")
    op.drop_index("ix_animal_transfers_to_user_id", table_name="animal_transfers")
    op.drop_index("ix_animal_transfers_from_user_id", table_name="animal_transfers")
    op.drop_index("ix_animal_transfers_invert_id", table_name="animal_transfers")
    op.drop_index("ix_animal_transfers_token", table_name="animal_transfers")
    op.drop_table("animal_transfers")
