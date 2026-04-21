"""extend photos with polymorphic snake_id parent

Revision ID: pht_20260421_extend_photos_polymorphic
Revises: shd_20260421_add_shed_logs_table
Create Date: 2026-04-21

Sprint 2 polymorphic primitive #1 — a photo can belong to a tarantula OR a
snake, not both. Follows the feeding_logs / molt_logs precedent set in
`s0t1u2v3w4x5_add_enclosures`: make the original parent column nullable,
add the new nullable FK, enforce XOR with a CHECK constraint.

Using `num_nonnulls(tarantula_id, snake_id) = 1` (exactly one parent) rather
than the older "IS NOT NULL OR" pattern because the Sprint 2 DoD explicitly
calls for "400 if both/neither parent supplied" — we want the DB to back up
that promise, not just the router.

Existing rows all have `tarantula_id` set and `snake_id` NULL → they satisfy
the new constraint without any backfill.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'pht_20260421_extend_photos_polymorphic'
down_revision: Union[str, None] = 'shd_20260421_add_shed_logs_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Make the existing tarantula_id nullable so snake-only photos are legal
    op.alter_column('photos', 'tarantula_id', nullable=True)

    # Add the new parent column + FK
    op.add_column(
        'photos',
        sa.Column('snake_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_photos_snake_id',
        'photos', 'snakes',
        ['snake_id'], ['id'],
        ondelete='CASCADE',
    )
    op.create_index('ix_photos_snake_id', 'photos', ['snake_id'])

    # Enforce exactly-one-parent at the DB level.
    # num_nonnulls() is a Postgres 9.6+ native aggregate — cleaner than a
    # chain of ORs and NULL-safe.
    op.create_check_constraint(
        'photos_must_have_exactly_one_parent',
        'photos',
        'num_nonnulls(tarantula_id, snake_id) = 1',
    )


def downgrade() -> None:
    op.drop_constraint('photos_must_have_exactly_one_parent', 'photos', type_='check')
    op.drop_index('ix_photos_snake_id', table_name='photos')
    op.drop_constraint('fk_photos_snake_id', 'photos', type_='foreignkey')
    op.drop_column('photos', 'snake_id')
    # Restoring NOT NULL on tarantula_id is only safe if no snake-only photos
    # have been inserted. Most downgrades happen on fresh environments, so
    # this is fine. Production downgrades would need cleanup first.
    op.alter_column('photos', 'tarantula_id', nullable=False)
