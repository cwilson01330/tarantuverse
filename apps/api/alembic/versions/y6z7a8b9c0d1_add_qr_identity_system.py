"""add qr identity system - upload sessions table

Revision ID: y6z7a8b9c0d1
Revises: x5y6z7a8b9c0
Create Date: 2026-04-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'y6z7a8b9c0d1'
down_revision: Union[str, None] = 'x5y6z7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'qr_upload_sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('token', sa.String(64), unique=True, nullable=False, index=True),
        sa.Column('tarantula_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tarantulas.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('used_count', sa.Integer, server_default='0'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_active', sa.Boolean, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_qr_upload_sessions_token', 'qr_upload_sessions', ['token'])
    op.create_index('ix_qr_upload_sessions_tarantula_id', 'qr_upload_sessions', ['tarantula_id'])


def downgrade() -> None:
    op.drop_index('ix_qr_upload_sessions_tarantula_id', table_name='qr_upload_sessions')
    op.drop_index('ix_qr_upload_sessions_token', table_name='qr_upload_sessions')
    op.drop_table('qr_upload_sessions')
