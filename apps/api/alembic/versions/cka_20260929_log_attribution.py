"""Co-keepers: who logged it, on every log a co-keeper can write.

Revision ID: cka_20260929_log_attribution
Revises: ckp_20260929_collection_members
Create Date: 2026-09-29

PRD-shared-keeping rung 3 (T10: "every write records logged_by_user_id").
feeding_logs got the column in slg_20260928; this adds it to the other log
tables a co-keeper can write in v1. NULL keeps meaning "the owner logged it",
which is what every existing row means — nothing is backfilled.

It also powers the rule that a Logger may edit or delete only their own
entries (utils/access.require_can_change).

Partial indexes because nearly every row is NULL. Purely additive; reversible.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'cka_20260929_log_attribution'
down_revision = 'ckp_20260929_collection_members'
branch_labels = None
depends_on = None

TABLES = (
    'molt_logs', 'substrate_changes', 'photos', 'care_logs',
    'animal_events', 'shed_logs', 'weight_logs', 'colony_events',
)


def upgrade() -> None:
    for t in TABLES:
        op.add_column(t, sa.Column(
            'logged_by_user_id', postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True,
        ))
        op.create_index(
            f'ix_{t}_logged_by_user_id', t, ['logged_by_user_id'],
            postgresql_where=sa.text('logged_by_user_id IS NOT NULL'),
        )


def downgrade() -> None:
    for t in reversed(TABLES):
        op.drop_index(f'ix_{t}_logged_by_user_id', table_name=t)
        op.drop_column(t, 'logged_by_user_id')
