"""End a colony (with a reason)

Revision ID: cen_20261007_colony_end
Revises: cqr_20261006_colony_qr_sessions
Create Date: 2026-10-07

A colony is a population, so it does not "die" the way an individual animal
does (ADR-015, inverts.died_at) -- it ENDS, and the useful thing to record is
why: it crashed or died out, it was sold or rehomed, it was merged into another
colony, or something else.

* `ended_at` DATE NULL (indexed): the day it ended. NULL = still running.
* `end_reason` VARCHAR(20) NULL with a CHECK on the four values.
* `end_notes` TEXT NULL.

Like `died_at`, an ended colony keeps every event, feeding and photo; it just
stops counting toward the free-tier cap and drops out of the default lists.
All three columns are nullable with no default, so this is additive and older
app builds never see a different shape.
"""
from alembic import op
import sqlalchemy as sa


revision = 'cen_20261007_colony_end'
down_revision = 'cqr_20261006_colony_qr_sessions'
branch_labels = None
depends_on = None

TABLE = 'colonies'
CHECK = 'colonies_end_reason_check'
INDEX = 'ix_colonies_ended_at'

# Kept in lockstep with models/colony.py::COLONY_END_REASONS.
PREDICATE = "end_reason IS NULL OR end_reason IN ('crashed', 'sold', 'merged', 'other')"


def upgrade() -> None:
    op.add_column(TABLE, sa.Column('ended_at', sa.Date(), nullable=True))
    op.add_column(TABLE, sa.Column('end_reason', sa.String(length=20), nullable=True))
    op.add_column(TABLE, sa.Column('end_notes', sa.Text(), nullable=True))
    op.create_check_constraint(CHECK, TABLE, PREDICATE)
    op.create_index(INDEX, TABLE, ['ended_at'])


def downgrade() -> None:
    op.drop_index(INDEX, table_name=TABLE)
    op.drop_constraint(CHECK, TABLE, type_='check')
    op.drop_column(TABLE, 'end_notes')
    op.drop_column(TABLE, 'end_reason')
    op.drop_column(TABLE, 'ended_at')
