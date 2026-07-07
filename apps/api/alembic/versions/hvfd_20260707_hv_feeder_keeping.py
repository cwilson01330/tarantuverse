"""HV feeder keeping (ADR-012) — own tables for reptile/aquatic + frozen feeders.

Creates hv_feeder_species, hv_feeder_stocks, hv_feeder_logs. Separate from TV's
feeder_* tables so rodents/fish/chicks + frozen inventory stay out of the invert
catalog and can be gated as an HV-premium feature.

Revision ID: hvfd_20260707_hv_feeder
Revises: hvs_20260707_plan_app_scope
"""
from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "hvfd_20260707_hv_feeder"
down_revision: Union[str, None] = "hvs_20260707_plan_app_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "hv_feeder_species",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("scientific_name", sa.String(150), nullable=False),
        sa.Column("scientific_name_lower", sa.String(150), nullable=False),
        sa.Column("common_names", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("care_level", sa.String(20), nullable=True),
        sa.Column("temperature_min", sa.Integer(), nullable=True),
        sa.Column("temperature_max", sa.Integer(), nullable=True),
        sa.Column("humidity_min", sa.Integer(), nullable=True),
        sa.Column("humidity_max", sa.Integer(), nullable=True),
        sa.Column("supports_sizes", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("typical_sizes", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("typical_adult_size_mm", sa.Integer(), nullable=True),
        sa.Column("prey_size_notes", sa.Text(), nullable=True),
        sa.Column("care_notes", sa.Text(), nullable=True),
        sa.Column("handling_notes", sa.Text(), nullable=True),
        sa.Column("image_url", sa.String(500), nullable=True),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "category IN ('rodent', 'fish', 'insect', 'chick', 'other')",
            name="hv_feeder_species_category_check",
        ),
    )
    op.create_index("ix_hv_feeder_species_scientific_name", "hv_feeder_species", ["scientific_name"], unique=True)
    op.create_index("ix_hv_feeder_species_scientific_name_lower", "hv_feeder_species", ["scientific_name_lower"], unique=True)
    op.create_index("ix_hv_feeder_species_category", "hv_feeder_species", ["category"])

    op.create_table(
        "hv_feeder_stocks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("hv_feeder_species_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("hv_feeder_species.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("form", sa.String(20), nullable=False, server_default="frozen"),
        sa.Column("inventory_mode", sa.String(20), nullable=False, server_default="count"),
        sa.Column("count", sa.Integer(), nullable=True),
        sa.Column("sized_counts", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("storage_location", sa.String(120), nullable=True),
        sa.Column("last_restocked", sa.Date(), nullable=True),
        sa.Column("last_used", sa.Date(), nullable=True),
        sa.Column("last_cleaned", sa.Date(), nullable=True),
        sa.Column("low_threshold", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("form IN ('live', 'frozen')", name="hv_feeder_stocks_form_check"),
        sa.CheckConstraint("inventory_mode IN ('count', 'sized')", name="hv_feeder_stocks_inventory_mode_check"),
    )
    op.create_index("ix_hv_feeder_stocks_user_id", "hv_feeder_stocks", ["user_id"])
    op.create_index("ix_hv_feeder_stocks_hv_feeder_species_id", "hv_feeder_stocks", ["hv_feeder_species_id"])
    op.create_index("ix_hv_feeder_stocks_is_active", "hv_feeder_stocks", ["is_active"])

    op.create_table(
        "hv_feeder_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("hv_feeder_stock_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("hv_feeder_stocks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("log_type", sa.String(30), nullable=False),
        sa.Column("size", sa.String(30), nullable=True),
        sa.Column("count_delta", sa.Integer(), nullable=True),
        sa.Column("logged_at", sa.Date(), server_default=sa.func.current_date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "log_type IN ('restock', 'used', 'cleaned', 'bred', 'died', 'count_correction')",
            name="hv_feeder_logs_log_type_check",
        ),
    )
    op.create_index("ix_hv_feeder_logs_hv_feeder_stock_id", "hv_feeder_logs", ["hv_feeder_stock_id"])
    op.create_index("ix_hv_feeder_logs_logged_at", "hv_feeder_logs", ["logged_at"])


def downgrade() -> None:
    op.drop_table("hv_feeder_logs")
    op.drop_table("hv_feeder_stocks")
    op.drop_table("hv_feeder_species")
