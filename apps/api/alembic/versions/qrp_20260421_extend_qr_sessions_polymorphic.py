"""extend qr_upload_sessions with polymorphic snake_id parent

Revision ID: qrp_20260421_extend_qr_sessions_polymorphic
Revises: pht_20260421_extend_photos_polymorphic
Create Date: 2026-04-21

Sprint 2 polymorphic primitive #2 — QR upload sessions now work for snakes
too. Snake keepers get the same enclosure-label-with-QR-code workflow that
tarantula keepers already have, and `/s/{snake_id}` public profile uploads
route through this same table.

Same pattern as pht_20260421: nullable tarantula_id, new nullable snake_id,
exactly-one CHECK constraint via num_nonnulls.

`user_id` stays NOT NULL regardless — every session has an owner, that
invariant is orthogonal to which animal it's for.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'qrp_20260421_extend_qr_sessions_polymorphic'
down_revision: Union[str, None] = 'pht_20260421_extend_photos_polymorphic'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('qr_upload_sessions', 'tarantula_id', nullable=True)

    op.add_column(
        'qr_upload_sessions',
        sa.Column('snake_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_qr_upload_sessions_snake_id',
        'qr_upload_sessions', 'snakes',
        ['snake_id'], ['id'],
        ondelete='CASCADE',
    )
    op.create_index('ix_qr_upload_sessions_snake_id', 'qr_upload_sessions', ['snake_id'])

    op.create_check_constraint(
        'qr_upload_sessions_must_have_exactly_one_parent',
        'qr_upload_sessions',
        'num_nonnulls(tarantula_id, snake_id) = 1',
    )


def downgrade() -> None:
    op.drop_constraint(
        'qr_upload_sessions_must_have_exactly_one_parent',
        'qr_upload_sessions',
        type_='check',
    )
    op.drop_index('ix_qr_upload_sessions_snake_id', table_name='qr_upload_sessions')
    op.drop_constraint('fk_qr_upload_sessions_snake_id', 'qr_upload_sessions', type_='foreignkey')
    op.drop_column('qr_upload_sessions', 'snake_id')
    op.alter_column('qr_upload_sessions', 'tarantula_id', nullable=False)
