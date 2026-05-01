"""Species feeding intervals — structured cadence per life stage

Adds six numeric columns to the `species` table so feeding-cadence
recommendations can be computed at the API layer instead of relying on
keepers reading the human-readable `feeding_frequency_*` strings.

  feeding_interval_min_days_sling     INTEGER
  feeding_interval_max_days_sling     INTEGER
  feeding_interval_min_days_juvenile  INTEGER
  feeding_interval_max_days_juvenile  INTEGER
  feeding_interval_min_days_adult     INTEGER
  feeding_interval_max_days_adult     INTEGER

The new columns are nullable. The existing `feeding_frequency_*`
strings stay as the canonical human-readable copy on care sheets.

Backfill is intentionally NOT in the migration — it's a separate Python
script (`scripts/backfill_species_feeding_intervals.py`) so it can be
re-run if parsing rules change without rolling the schema.

Why structured: history-based prediction was unreliable for sparse
data (Cory + Brooke, 2026-05-01: a sling with 3 logs predicted "feed
in 100 days"). The fix is to source predictions from curated species
cadence keyed on the spider's life stage. This migration is half 1
of that work — half 2 is the matching `tarantula.life_stage` enum
column (lst_20260501).

Revision ID: fcd_20260501_add_species_feeding_intervals
Revises: rbr_20260429_add_reptile_breeding_tables
"""
from alembic import op
import sqlalchemy as sa


revision = "fcd_20260501_add_species_feeding_intervals"
down_revision = "rbr_20260429_add_reptile_breeding_tables"
branch_labels = None
depends_on = None


_NEW_COLUMNS = (
    "feeding_interval_min_days_sling",
    "feeding_interval_max_days_sling",
    "feeding_interval_min_days_juvenile",
    "feeding_interval_max_days_juvenile",
    "feeding_interval_min_days_adult",
    "feeding_interval_max_days_adult",
)


def upgrade() -> None:
    for col in _NEW_COLUMNS:
        op.add_column(
            "species",
            sa.Column(col, sa.Integer(), nullable=True),
        )


def downgrade() -> None:
    for col in _NEW_COLUMNS:
        op.drop_column("species", col)
