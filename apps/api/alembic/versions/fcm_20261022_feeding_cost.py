"""Per-keeper cost per feeding for the advanced-analytics cost estimate.

Revision ID: fcm_20261022_feeding_cost
Revises: vex_20261009_visibility_explicit
Create Date: 2026-10-22

The "Est. Monthly Feeding Cost" card multiplied every feeding by a fixed
$0.50, which a keeper reported as far too high for their prey (2026-10-22).
Keepers now set their own figure. NULL = never set; the API then uses the
old 0.50 default, so nobody's number changes until they choose one.

Purely additive; reversible.
"""
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "fcm_20261022_feeding_cost"
down_revision: Union[str, None] = "vex_20261009_visibility_explicit"
branch_labels = None
depends_on = None


CHECK_NAME = "users_feeding_cost_per_meal_check"
PREDICATE = "feeding_cost_per_meal IS NULL OR (feeding_cost_per_meal >= 0 AND feeding_cost_per_meal <= 1000)"


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("feeding_cost_per_meal", sa.Numeric(precision=7, scale=2), nullable=True),
    )
    op.create_check_constraint(CHECK_NAME, "users", PREDICATE)


def downgrade() -> None:
    op.drop_constraint(CHECK_NAME, "users", type_="check")
    op.drop_column("users", "feeding_cost_per_meal")
