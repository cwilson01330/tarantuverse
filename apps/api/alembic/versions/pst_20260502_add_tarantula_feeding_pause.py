"""Tarantula feeding pause — premolt + post-rehouse fasting awareness

Mirror of pse_20260502 but for tarantulas. Adds two nullable columns:

  feeding_paused_reason   VARCHAR(40)  NULL
  feeding_paused_until    DATE         NULL

Same semantics as the reptile version:
  - reason IS NULL                      → not paused
  - reason set, until IS NULL           → paused indefinitely
  - reason set, until in future         → paused until that date
  - reason set, until in past           → backend treats as resumed
                                          (column stays as a record;
                                          the keeper can clear it
                                          when they're ready)

Why this matters for tarantulas: keeping a long-premolt spider on the
feeding-cadence chart is the most common false-overdue source in
Tarantuverse. A spider in premolt for 7 months will trigger the red
overdue badge every day, which reads as broken. Manual pause lets
the keeper say "I know, she's in premolt, stop screaming."

Canonical reason values used by the mobile + web pickers:
  premolt | post_rehouse | recovering | mating_season | other

Free-form values pass through verbatim. The picker offers the
canonical list so most uses stay machine-readable for analytics
later (e.g., "what % of refusals coincide with paused state?").

Revision ID: pst_20260502_add_tarantula_feeding_pause
Revises: pse_20260502_add_reptile_feeding_pause
"""
from alembic import op
import sqlalchemy as sa


revision = "pst_20260502_add_tarantula_feeding_pause"
down_revision = "pse_20260502_add_reptile_feeding_pause"
branch_labels = None
depends_on = None


_COLUMNS = (
    ("feeding_paused_reason", sa.String(40)),
    ("feeding_paused_until", sa.Date()),
)


def upgrade() -> None:
    for col_name, col_type in _COLUMNS:
        op.add_column("tarantulas", sa.Column(col_name, col_type, nullable=True))


def downgrade() -> None:
    for col_name, _col_type in _COLUMNS:
        op.drop_column("tarantulas", col_name)
