"""Keeper-defined location on Herpetoverse animals (room / rack / shelf).

Revision ID: hloc_20261007_animal_location
Revises: cen_20261007_colony_end
Create Date: 2026-10-07

The Herpetoverse twin of loc_20260930_animal_location: one optional free-text
column on `animals`, canonicalised on write by utils/locations (trimmed,
whitespace-collapsed, snapped to the keeper's existing spelling
case-insensitively) so "reptile room" and "Reptile Room" can never become two
groups. Grouping reads compare lower(location), which is what the partial
expression index is for.

Scoped on purpose: a keeper's Herpetoverse locations are separate from their
Tarantuverse ones, so the helpers look at `animals` only when called with the
herpetoverse scope. Nothing is backfilled — no location means no grouping,
which is the whole point. Purely additive; reversible.
"""
from alembic import op
import sqlalchemy as sa


revision = 'hloc_20261007_animal_location'
down_revision = 'cen_20261007_colony_end'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('animals', sa.Column('location', sa.String(length=40), nullable=True))
    op.execute(
        "CREATE INDEX ix_animals_user_location_lower ON animals (user_id, lower(location)) "
        "WHERE location IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_animals_user_location_lower")
    op.drop_column('animals', 'location')
