"""Keeper-defined location on animals and colonies (room / rack / shelf).

Revision ID: loc_20260930_animal_location
Revises: shc_20260930_share_cards
Create Date: 2026-09-30

One optional free-text column, canonicalised on write by utils/locations —
trimmed, whitespace-collapsed, and snapped to the keeper's existing spelling
case-insensitively, so "spider room" and "Spider Room" can never become two
groups. Grouping reads compare lower(location), which is what the index is for.

Lives on `inverts` and `colonies` only. There is deliberately NO column on the
legacy `tarantulas` / `scorpions` tables (ADR-005 dual-write): the legacy
routers accept `location` and write it straight onto the mirrored `inverts`
row, and the mirror's forward copy leaves it alone because it isn't in the
kwargs builder. Nothing is backfilled — no location means no grouping, which
is the whole point. Purely additive; reversible.
"""
from alembic import op
import sqlalchemy as sa


revision = 'loc_20260930_animal_location'
down_revision = 'shc_20260930_share_cards'
branch_labels = None
depends_on = None

TABLES = ('inverts', 'colonies')


def upgrade() -> None:
    for t in TABLES:
        op.add_column(t, sa.Column('location', sa.String(length=40), nullable=True))
        # Partial + expression index: the grouping and the snap-to-existing
        # lookup both run on lower(location) scoped to one keeper, and most
        # rows will stay NULL.
        op.execute(
            f"CREATE INDEX ix_{t}_user_location_lower ON {t} (user_id, lower(location)) "
            f"WHERE location IS NOT NULL"
        )


def downgrade() -> None:
    for t in reversed(TABLES):
        op.execute(f"DROP INDEX IF EXISTS ix_{t}_user_location_lower")
        op.drop_column(t, 'location')
