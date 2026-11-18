"""Push addresses per app: push_tokens (one row per account per app).

Revision ID: pta_20261118_push_tokens_per_app
Revises: pmv_20261117_premolt_v2
Create Date: 2026-11-18

Spec: docs/superpowers/specs/2026-11-17-hv-day-one-and-smart-reminders-design.md
(§5 calls 3, 4, 12; §6 "Push addresses per app").

  * push_tokens: id, user_id (CASCADE), app ('tarantuverse' | 'herpetoverse'),
    token, updated_at; UNIQUE (user_id, app).
  * Every existing notification_preferences.expo_push_token is copied in,
    attributed by what the account keeps: HV animals and no inverts ->
    herpetoverse; everything else (TV only, both, neither) -> tarantuverse.
    The HV app re-registers with `app` on its next launch after its OTA.

The legacy column is left as it is (still written for TV registrations).
Downgrade drops the table; the legacy column still holds the old addresses.
"""
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "pta_20261118_push_tokens_per_app"
down_revision: Union[str, None] = "pmv_20261117_premolt_v2"
branch_labels = None
depends_on = None


# Kept as a function so tests can run the exact attribution on seeded rows.
# Idempotent: a (user, app) that already has a row is left alone.
COPY_LEGACY_TOKENS_SQL = """
INSERT INTO push_tokens (id, user_id, app, token, updated_at)
SELECT
    gen_random_uuid(),
    np.user_id,
    CASE
        WHEN EXISTS (SELECT 1 FROM animals a WHERE a.user_id = np.user_id)
         AND NOT EXISTS (SELECT 1 FROM inverts i WHERE i.user_id = np.user_id)
        THEN 'herpetoverse'
        ELSE 'tarantuverse'
    END,
    np.expo_push_token,
    now()
FROM notification_preferences np
WHERE np.expo_push_token IS NOT NULL AND np.expo_push_token <> ''
ON CONFLICT (user_id, app) DO NOTHING
"""


def copy_legacy_tokens(bind) -> None:
    bind.execute(sa.text(COPY_LEGACY_TOKENS_SQL))


def upgrade() -> None:
    op.create_table(
        "push_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("app", sa.String(20), nullable=False),
        sa.Column("token", sa.String(255), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("app IN ('tarantuverse', 'herpetoverse')", name="ck_push_tokens_app"),
        sa.UniqueConstraint("user_id", "app", name="uq_push_tokens_user_app"),
    )
    op.create_index("ix_push_tokens_user_id", "push_tokens", ["user_id"])
    copy_legacy_tokens(op.get_bind())


def downgrade() -> None:
    op.drop_index("ix_push_tokens_user_id", table_name="push_tokens")
    op.drop_table("push_tokens")
