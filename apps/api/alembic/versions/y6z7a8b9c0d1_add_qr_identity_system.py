"""add qr identity system - upload sessions table

Revision ID: y6z7a8b9c0d1
Revises: x5y6z7a8b9c0
Create Date: 2026-04-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'y6z7a8b9c0d1'
down_revision: Union[str, None] = 'x5y6z7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use raw SQL with IF NOT EXISTS so this migration is fully idempotent.
    # The table/indexes may already exist from a partial previous run.
    op.execute("""
        CREATE TABLE IF NOT EXISTS qr_upload_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token VARCHAR(64) UNIQUE NOT NULL,
            tarantula_id UUID NOT NULL REFERENCES tarantulas(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            used_count INTEGER DEFAULT 0,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_qr_upload_sessions_token "
        "ON qr_upload_sessions (token)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_qr_upload_sessions_tarantula_id "
        "ON qr_upload_sessions (tarantula_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_qr_upload_sessions_tarantula_id")
    op.execute("DROP INDEX IF EXISTS ix_qr_upload_sessions_token")
    op.execute("DROP TABLE IF EXISTS qr_upload_sessions")
