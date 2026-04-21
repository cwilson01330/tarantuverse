"""add shed_logs table

Revision ID: shd_20260421_add_shed_logs_table
Revises: snk_20260421_add_snakes_table
Create Date: 2026-04-21

Snakes ecdyse (shed) rather than molt — separate table, separate semantics.

Key differences from `molt_logs`:

  - No leg span (snakes have length + weight in real units)
  - No "unidentified molt" case — snakes aren't kept communally the way
    communal-suited tarantulas are, so every shed has a known owner
  - `in_blue_started_at` — the pre-shed "opaque" / "going into blue" period
    where the snake's scales turn milky/dull and eyes go blue-gray. This is
    the snake analogue to premolt
  - `is_complete_shed` — did the shed come off in one piece? Incomplete sheds
    are a husbandry signal (usually humidity too low)
  - `has_retained_shed` — specifically flags retained eye caps or patches,
    which can require keeper intervention

Parent model v1: snake-only. The table is architected to accept future
polymorphic parents (e.g., `lizard_id`) by mirroring the feeding_logs /
molt_logs pattern — when lizards ship, a migration will alter `snake_id`
to nullable and add a CHECK constraint. For now, `snake_id` is NOT NULL.

This is additive only — no existing tables modified.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'shd_20260421_add_shed_logs_table'
down_revision: Union[str, None] = 'snk_20260421_add_snakes_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'shed_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            'snake_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('snakes.id', ondelete='CASCADE'),
            nullable=False,
        ),

        # Shed event timestamp — matches molt_logs pattern with TZ
        sa.Column('shed_at', sa.DateTime(timezone=True), nullable=False),

        # Pre-shed "blue" phase — optional; not every keeper catches the start
        sa.Column('in_blue_started_at', sa.DateTime(timezone=True), nullable=True),

        # Measurements in real snake units (no leg span)
        sa.Column('weight_before_g', sa.Numeric(8, 2), nullable=True),
        sa.Column('weight_after_g', sa.Numeric(8, 2), nullable=True),
        sa.Column('length_before_in', sa.Numeric(6, 2), nullable=True),
        sa.Column('length_after_in', sa.Numeric(6, 2), nullable=True),

        # Husbandry signals — reason we collect this data at all
        sa.Column('is_complete_shed', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column('has_retained_shed', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('retained_shed_notes', sa.Text(), nullable=True),

        # Free-form notes + optional photo
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('image_url', sa.String(500), nullable=True),

        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )

    # Dashboard query pattern — "last shed" per snake
    op.create_index('ix_shed_logs_snake_id', 'shed_logs', ['snake_id'])
    op.create_index('ix_shed_logs_shed_at', 'shed_logs', ['shed_at'])


def downgrade() -> None:
    op.drop_index('ix_shed_logs_shed_at', table_name='shed_logs')
    op.drop_index('ix_shed_logs_snake_id', table_name='shed_logs')
    op.drop_table('shed_logs')
