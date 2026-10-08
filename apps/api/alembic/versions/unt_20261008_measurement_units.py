"""Per-keeper measurement units: imperial (in, °F) or metric (cm, °C).

Revision ID: unt_20261008_measurement_units
Revises: ctr_20261008_colony_transfers
Create Date: 2026-10-08

Display preference only. Storage never changes: molt leg spans stay inches,
`*_mm` columns stay millimetres, temperatures stay °F, weights stay grams.
Clients convert at the edges.

NULL means the keeper has never chosen. Clients then use their device or
browser region (US, Liberia, Myanmar -> imperial; everywhere else -> metric)
and save that once, so it follows the keeper to their other devices.

Purely additive; reversible.
"""
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "unt_20261008_measurement_units"
down_revision: Union[str, None] = "ctr_20261008_colony_transfers"
branch_labels = None
depends_on = None


CHECK_NAME = "users_measurement_units_check"
PREDICATE = "measurement_units IS NULL OR measurement_units IN ('imperial', 'metric')"


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("measurement_units", sa.String(length=10), nullable=True),
    )
    op.create_check_constraint(CHECK_NAME, "users", PREDICATE)


def downgrade() -> None:
    op.drop_constraint(CHECK_NAME, "users", type_="check")
    op.drop_column("users", "measurement_units")
