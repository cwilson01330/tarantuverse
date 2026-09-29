"""Sitter logging: who logged a feeding, and a push preference for it.

Revision ID: slg_20260928_sitter_logging
Revises: sit_20260928_sitter_passes
Create Date: 2026-09-28

PRD-shared-keeping, Phase 2 (rung 2 — a sitter pass can log feedings back).

feeding_logs has never recorded an author: a row just belongs to an animal,
and "the keeper" was implied. Two nullable columns make authorship explicit:

  logged_via_pass_id  — set when a SITTER logged it through a pass
  logged_by_user_id   — set when a signed-in person logged it (rung 3,
                        co-keepers). Added now so rung 3 needs no second
                        migration on this 1,000s-of-rows table.

Both NULL means what every existing row already means: the owner logged it.
Nothing is backfilled — inventing an author for history nobody attributed
would be the same kind of guess the care cards refuse to make.

Both FKs are ON DELETE SET NULL: deleting a pass or an account must never
delete feeding history, only its attribution.

Purely additive; safe on a live database; trivially reversible.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'slg_20260928_sitter_logging'
down_revision = 'sit_20260928_sitter_passes'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'feeding_logs',
        sa.Column(
            'logged_via_pass_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('keeper_passes.id', ondelete='SET NULL'),
            nullable=True,
        ),
    )
    op.add_column(
        'feeding_logs',
        sa.Column(
            'logged_by_user_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='SET NULL'),
            nullable=True,
        ),
    )
    # Partial indexes: almost every row has NULL here, and the only queries are
    # "this pass's entries" (activity list, undo, per-pass rate cap).
    op.create_index(
        'ix_feeding_logs_logged_via_pass_id',
        'feeding_logs',
        ['logged_via_pass_id', 'created_at'],
        postgresql_where=sa.text('logged_via_pass_id IS NOT NULL'),
    )
    op.create_index(
        'ix_feeding_logs_logged_by_user_id',
        'feeding_logs',
        ['logged_by_user_id'],
        postgresql_where=sa.text('logged_by_user_id IS NOT NULL'),
    )

    op.add_column(
        'notification_preferences',
        sa.Column(
            'sitter_activity_enabled',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('true'),
        ),
    )


def downgrade() -> None:
    op.drop_column('notification_preferences', 'sitter_activity_enabled')
    op.drop_index('ix_feeding_logs_logged_by_user_id', table_name='feeding_logs')
    op.drop_index('ix_feeding_logs_logged_via_pass_id', table_name='feeding_logs')
    op.drop_column('feeding_logs', 'logged_by_user_id')
    op.drop_column('feeding_logs', 'logged_via_pass_id')
