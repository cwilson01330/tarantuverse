"""HV animal transfers + provenance (P4).

Extends the invert-only transfer system to Herpetoverse `animals`:

1. `animals` gains the provenance columns the buyer's claimed record carries
   (mirrors the same columns on `inverts`): transferred_out_at (badges a
   handed-off source record so it drops from active collection / reminders),
   bred_by_user_id, origin_keeper_name, source_transfer_id, provenance JSONB.
2. `animal_transfers` becomes polymorphic — `invert_id` is relaxed to nullable
   and companion `animal_id` / `claimed_animal_id` FKs to `animals` are added,
   with a CHECK that exactly one source domain (invert XOR animal) is set. All
   existing rows are invert-backed, so the CHECK holds on upgrade.

Revision ID: htr_20260707_animal_transfers
Revises: htx_20260703_animal_taxon
"""
from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "htr_20260707_animal_transfers"
down_revision: Union[str, None] = "htx_20260703_animal_taxon"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── animals: provenance columns (mirror inverts) ─────────────────────────
    op.add_column(
        "animals",
        sa.Column("transferred_out_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "animals",
        sa.Column("bred_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "animals",
        sa.Column("origin_keeper_name", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "animals",
        sa.Column("source_transfer_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "animals",
        sa.Column("provenance", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.create_foreign_key(
        "animals_bred_by_user_id_fkey",
        "animals", "users",
        ["bred_by_user_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_animals_transferred_out_at", "animals", ["transferred_out_at"],
    )

    # ── animal_transfers: polymorphic invert XOR animal ──────────────────────
    op.alter_column("animal_transfers", "invert_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.add_column(
        "animal_transfers",
        sa.Column("animal_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "animal_transfers",
        sa.Column("claimed_animal_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "animal_transfers_animal_id_fkey",
        "animal_transfers", "animals",
        ["animal_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "animal_transfers_claimed_animal_id_fkey",
        "animal_transfers", "animals",
        ["claimed_animal_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_animal_transfers_animal_id", "animal_transfers", ["animal_id"],
    )
    op.create_check_constraint(
        "animal_transfers_one_source_check",
        "animal_transfers",
        "(invert_id IS NOT NULL)::int + (animal_id IS NOT NULL)::int = 1",
    )


def downgrade() -> None:
    op.drop_constraint("animal_transfers_one_source_check", "animal_transfers", type_="check")
    op.drop_index("ix_animal_transfers_animal_id", table_name="animal_transfers")
    op.drop_constraint("animal_transfers_claimed_animal_id_fkey", "animal_transfers", type_="foreignkey")
    op.drop_constraint("animal_transfers_animal_id_fkey", "animal_transfers", type_="foreignkey")
    op.drop_column("animal_transfers", "claimed_animal_id")
    op.drop_column("animal_transfers", "animal_id")
    op.alter_column("animal_transfers", "invert_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)

    op.drop_index("ix_animals_transferred_out_at", table_name="animals")
    op.drop_constraint("animals_bred_by_user_id_fkey", "animals", type_="foreignkey")
    op.drop_column("animals", "provenance")
    op.drop_column("animals", "source_transfer_id")
    op.drop_column("animals", "origin_keeper_name")
    op.drop_column("animals", "bred_by_user_id")
    op.drop_column("animals", "transferred_out_at")
