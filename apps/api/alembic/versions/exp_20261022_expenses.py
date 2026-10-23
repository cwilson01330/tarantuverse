"""Expense tracking: expenses + expense_shares.

Revision ID: exp_20261022_expenses
Revises: fcm_20261022_feeding_cost
Create Date: 2026-10-22

One row per purchase (`expenses`), plus one row per animal / colony it was
divided across (`expense_shares`). Shares keep their row when the animal is
deleted (the three target FKs are ON DELETE SET NULL) so purchase totals still
add up. See docs/superpowers/specs/2026-10-22-expense-tracking-design.md.

Purely additive; reversible (downgrade drops both tables).
"""
from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "exp_20261022_expenses"
down_revision: Union[str, None] = "fcm_20261022_feeding_cost"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "expenses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "created_by", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("app", sa.String(length=20), nullable=False),
        sa.Column("spent_on", sa.Date(), nullable=False),
        sa.Column("description", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=30), nullable=False),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("split_mode", sa.String(length=20), nullable=False, server_default="none"),
        sa.Column("split_label", sa.String(length=40), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("app IN ('tarantuverse', 'herpetoverse')", name="expenses_app_check"),
        sa.CheckConstraint(
            "category IN ('feeders', 'substrate_decor', 'enclosures_equipment', "
            "'heat_lighting', 'health_vet', 'shipping', 'other')",
            name="expenses_category_check",
        ),
        sa.CheckConstraint(
            "split_mode IN ('none', 'animals', 'location', 'collection')",
            name="expenses_split_mode_check",
        ),
        sa.CheckConstraint("amount > 0 AND amount <= 100000", name="expenses_amount_check"),
    )
    op.create_index("ix_expenses_owner_id", "expenses", ["owner_id"])
    op.create_index("ix_expenses_spent_on", "expenses", ["spent_on"])
    op.create_index(
        "ix_expenses_owner_app_spent_on",
        "expenses",
        ["owner_id", "app", sa.text("spent_on DESC")],
    )

    op.create_table(
        "expense_shares",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "expense_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "invert_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inverts.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "colony_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("colonies.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "animal_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("animals.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "num_nonnulls(invert_id, colony_id, animal_id) <= 1",
            name="expense_shares_one_target_check",
        ),
        sa.CheckConstraint("amount >= 0", name="expense_shares_amount_check"),
    )
    op.create_index("ix_expense_shares_expense_id", "expense_shares", ["expense_id"])
    op.create_index("ix_expense_shares_invert_id", "expense_shares", ["invert_id"])
    op.create_index("ix_expense_shares_colony_id", "expense_shares", ["colony_id"])
    op.create_index("ix_expense_shares_animal_id", "expense_shares", ["animal_id"])


def downgrade() -> None:
    # Indexes and constraints go with their tables.
    op.drop_table("expense_shares")
    op.drop_table("expenses")
