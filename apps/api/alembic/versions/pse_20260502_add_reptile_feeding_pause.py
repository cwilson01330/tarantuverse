"""Reptile feeding pause — hunger-strike + post-rehouse fasting awareness

Adds two nullable columns to BOTH `snakes` and `lizards`:

  feeding_paused_reason   VARCHAR(40)  NULL
  feeding_paused_until    DATE         NULL

Semantics:
  - reason IS NULL                       → feeding is NOT paused
  - reason IS NOT NULL, until IS NULL    → paused indefinitely (keeper
                                           must clear manually)
  - reason IS NOT NULL, until in future  → paused until that date
  - reason IS NOT NULL, until in past    → backend treats as resumed
                                           (keeper forgot to clear; the
                                           feeding-status endpoint
                                           ignores stale pauses)

Why a string reason instead of an enum: the v1 picker offers four
canonical values (hunger_strike, post_rehouse, recovering,
breeding_season) plus an "other" free-text option. Locking the column
into a Postgres enum would force a migration every time we add a new
reason, and breeders use a long tail of context-specific terms ("just
shed" / "post-laying" / "winter slowdown") that aren't worth enum
churn for. VARCHAR(40) is plenty.

Why these fields live on snakes/lizards and NOT tarantulas: tarantula
parity is queued for Path C-2. Hunger strikes are way more notorious
in snake-keeping; tarantula premolts are usually short enough that
keepers don't reach for the pause toggle. Will revisit after the
Herpetoverse pattern proves itself.

Revision ID: pse_20260502_add_reptile_feeding_pause
Revises: lst_20260501_add_tarantula_life_stage
"""
from alembic import op
import sqlalchemy as sa


revision = "pse_20260502_add_reptile_feeding_pause"
down_revision = "lst_20260501_add_tarantula_life_stage"
branch_labels = None
depends_on = None


_TABLES = ("snakes", "lizards")
_COLUMNS = (
    ("feeding_paused_reason", sa.String(40)),
    ("feeding_paused_until", sa.Date()),
)


def upgrade() -> None:
    for table in _TABLES:
        for col_name, col_type in _COLUMNS:
            op.add_column(table, sa.Column(col_name, col_type, nullable=True))


def downgrade() -> None:
    for table in _TABLES:
        for col_name, _col_type in _COLUMNS:
            op.drop_column(table, col_name)
