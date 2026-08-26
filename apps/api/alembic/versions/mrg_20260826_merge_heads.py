"""Merge the four divergent Alembic heads into one.

Revision ID: mrg_20260826_merge_heads
Revises: a0b1c2d3e4f5, b1c2d3e4f5g6, fcd_20260809_keeper_feeding_cadence,
         fdr5_add_feeder_low_stock_pref
Create Date: 2026-08-26

WHY THIS EXISTS
---------------
The migration graph had drifted into FOUR heads:

    a0b1c2d3e4f5                     (communal incidents)
    b1c2d3e4f5g6                     (username change tracking)
    fcd_20260809_keeper_feeding_cadence   (ADR-017)
    fdr5_add_feeder_low_stock_pref   (feeder low-stock pref)

`apps/api/start.sh` runs `alembic upgrade head` — singular. With more than
one head Alembic raises:

    Multiple head revisions are present for given argument 'head'

and because start.sh has no `set -e`, the failure was printed and then
uvicorn booted anyway. So **migrations silently stopped running on every
deploy**. Nothing broke only because the production schema already
contained everything the code expected — the bookkeeping was wrong, not
the database.

That was verified on 2026-08-26 before writing this: `alembic_version` held
a single row (`fcd_20260809_keeper_feeding_cadence`), while 63 revisions on
the other three branches were unrecorded — yet every table they create
(token_blocklist, qr_upload_sessions, achievement_definitions,
user_achievements, system_settings, announcements, communal_incidents,
hv_feeder_species, feeder_colonies, enclosures, user_theme_preferences)
was present in production.

DO NOT let Alembic try to *run* those 63 revisions. They would fail
immediately on duplicate tables/columns. They are already applied in
substance; only the version table forgot.

REQUIRED ONE-OFF BEFORE THIS DEPLOYS
------------------------------------
On the Render shell, once:

    cd apps/api && alembic stamp heads

That records all four heads as applied WITHOUT executing them — which is
the truth, since their schema is live. This merge then collapses the four
recorded heads into one, and `upgrade head` is unambiguous again.

This migration intentionally does nothing to the schema.
"""
from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401


revision = "mrg_20260826_merge_heads"
down_revision = (
    "a0b1c2d3e4f5",
    "b1c2d3e4f5g6",
    "fcd_20260809_keeper_feeding_cadence",
    "fdr5_add_feeder_low_stock_pref",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    """No-op. This revision exists purely to rejoin the graph."""
    pass


def downgrade() -> None:
    """No-op. Downgrading would re-split the heads, which is never wanted."""
    pass
