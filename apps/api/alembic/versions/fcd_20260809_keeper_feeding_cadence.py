"""ADR-017 — keeper-set feeding cadence.

Adds an optional per-animal feeding interval. When set it replaces the derived
interval entirely, so a keeper whose practice differs from a care sheet stops
being told daily that they're behind.

WHY NULLABLE WITH NO BACKFILL
-----------------------------
Absent means "derive it as before", which preserves today's behaviour for every
existing animal. Backfilling the current derived value would freeze a guess into
a keeper's record and make the care sheet stop applying — the opposite of what
this is for.

WHY NOT ON `tarantulas` / `scorpions`
-------------------------------------
Feeding status is computed from `inverts` (`utils/limits.active_inverts_query`
feeds `list_feeding_status`), so the legacy tables never read this. Adding it
there would create a shared column requiring mirror entries in both directions
of the ADR-005 dual-write for no benefit — see tests/test_dualwrite_coverage.py.

Revision ID: fcd_20260809_keeper_feeding_cadence
Revises: aev_20260731_animal_events
"""
from alembic import op
import sqlalchemy as sa


revision = "fcd_20260809_keeper_feeding_cadence"
down_revision = "aev_20260731_animal_events"
branch_labels = None
depends_on = None


# Both TV inverts and HV animals — parity is a project rule, and the resolver
# on each side reads the same column name.
_TABLES = ("inverts", "animals")


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(
            table,
            sa.Column("feeding_interval_days", sa.Integer(), nullable=True),
        )
        # Guard at the database too, not only in Pydantic. A 0 would make every
        # animal permanently overdue and a negative would be nonsense; both are
        # worth refusing at the lowest level rather than trusting every future
        # write path to validate.
        op.create_check_constraint(
            f"ck_{table}_feeding_interval_days_range",
            table,
            "feeding_interval_days IS NULL OR "
            "(feeding_interval_days >= 1 AND feeding_interval_days <= 365)",
        )


def downgrade() -> None:
    for table in _TABLES:
        op.drop_constraint(
            f"ck_{table}_feeding_interval_days_range", table, type_="check"
        )
        op.drop_column(table, "feeding_interval_days")
