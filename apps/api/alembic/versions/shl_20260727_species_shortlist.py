"""Add species_shortlist — species a keeper is considering but doesn't own.

Keyed to `invert_species` (the unified ten-taxon catalog), so one table
serves every taxon. The unique constraint on (user_id, species_id) is what
makes the POST endpoint idempotent — bookmarking twice is a no-op.

Revision ID: shl_20260727_shortlist
Revises: hvfd_20260707_hv_feeder
Create Date: 2026-07-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "shl_20260727_shortlist"
down_revision: Union[str, None] = "hvfd_20260707_hv_feeder"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "species_shortlist",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("species_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["species_id"], ["invert_species.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "species_id", name="uq_species_shortlist_user_species"),
    )
    op.create_index("ix_species_shortlist_user_id", "species_shortlist", ["user_id"])
    op.create_index("ix_species_shortlist_species_id", "species_shortlist", ["species_id"])


def downgrade() -> None:
    op.drop_index("ix_species_shortlist_species_id", table_name="species_shortlist")
    op.drop_index("ix_species_shortlist_user_id", table_name="species_shortlist")
    op.drop_table("species_shortlist")
