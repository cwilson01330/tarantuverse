"""Colony mode — colonies + colony_events (ADR-010)

Revision ID: col_20260702_colonies
Revises: ntf2_20260701_digest
Create Date: 2026-07-02

Population-level tracking for communal/colony keepers. Additive + non-breaking:
two new tables, no changes to existing ones. A colony is a first-class
collection entry (population, per-life-stage buckets) modeled on FeederColony.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "col_20260702_colonies"
down_revision: Union[str, None] = "ntf2_20260701_digest"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TAXON_CHECK = (
    "taxon IN ('tarantula', 'scorpion', 'centipede', "
    "'whip_spider', 'vinegaroon', 'true_spider', "
    "'millipede', 'mantis', 'roach', 'other')"
)


def upgrade() -> None:
    op.create_table(
        "colonies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("taxon", sa.String(length=20), nullable=False),
        sa.Column("species_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("invert_species.id", ondelete="SET NULL"), nullable=True),
        sa.Column("enclosure_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("enclosures.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("date_acquired", sa.Date(), nullable=True),
        sa.Column("founded_date", sa.Date(), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=True),
        sa.Column("stage_counts", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("count_is_estimated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("substrate_type", sa.String(length=100), nullable=True),
        sa.Column("substrate_depth", sa.String(length=50), nullable=True),
        sa.Column("last_substrate_change", sa.Date(), nullable=True),
        sa.Column("target_temp_min", sa.Numeric(5, 2), nullable=True),
        sa.Column("target_temp_max", sa.Numeric(5, 2), nullable=True),
        sa.Column("target_humidity_min", sa.Numeric(5, 2), nullable=True),
        sa.Column("target_humidity_max", sa.Numeric(5, 2), nullable=True),
        sa.Column("water_dish", sa.Boolean(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("photo_url", sa.String(length=500), nullable=True),
        sa.Column("visibility", sa.String(length=10), nullable=False, server_default=sa.text("'private'")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("transferred_out_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(_TAXON_CHECK, name="colonies_taxon_check"),
        sa.CheckConstraint("visibility IN ('private', 'public')", name="colonies_visibility_check"),
    )
    op.create_index("ix_colonies_user_id", "colonies", ["user_id"])
    op.create_index("ix_colonies_taxon", "colonies", ["taxon"])
    op.create_index("ix_colonies_is_active", "colonies", ["is_active"])

    op.create_table(
        "colony_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("colony_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("colonies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(length=30), nullable=False),
        sa.Column("stage", sa.String(length=40), nullable=True),
        sa.Column("count_delta", sa.Integer(), nullable=True),
        sa.Column("occurred_at", sa.Date(), server_default=sa.text("CURRENT_DATE"), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_colony_events_colony_id", "colony_events", ["colony_id"])
    op.create_index("ix_colony_events_occurred_at", "colony_events", ["occurred_at"])


def downgrade() -> None:
    op.drop_index("ix_colony_events_occurred_at", table_name="colony_events")
    op.drop_index("ix_colony_events_colony_id", table_name="colony_events")
    op.drop_table("colony_events")
    op.drop_index("ix_colonies_is_active", table_name="colonies")
    op.drop_index("ix_colonies_taxon", table_name="colonies")
    op.drop_index("ix_colonies_user_id", table_name="colonies")
    op.drop_table("colonies")
