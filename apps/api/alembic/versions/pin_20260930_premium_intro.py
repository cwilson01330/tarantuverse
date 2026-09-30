"""Remember that a keeper has seen the one-time "here's what you get" card.

Revision ID: pin_20260930_premium_intro
Revises: loc_20260930_animal_location
Create Date: 2026-09-30

The card is shown ONCE, after a keeper's first completed Feeding Day batch —
not at signup and not on a wall. It's tracked on the user row rather than on
the device so it can't reappear on a second phone or on the web. NULL means
never shown. Purely additive; reversible.
"""
from alembic import op
import sqlalchemy as sa


revision = 'pin_20260930_premium_intro'
down_revision = 'loc_20260930_animal_location'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('premium_intro_seen_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'premium_intro_seen_at')
