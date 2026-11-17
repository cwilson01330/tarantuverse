"""Premolt v2: episodes table, per-animal snooze, daily-run guard setting.

Revision ID: pmv_20261117_premolt_v2
Revises: brd_20261113_egg_sac_groups
Create Date: 2026-11-17

Spec: docs/superpowers/specs/2026-11-17-premolt-v2-design.md

  * premolt_episodes: one row per "may be in premolt" stretch; partial unique
    index allows only one OPEN episode per animal.
  * inverts.premolt_snoozed_until: "Not yet" hides the alert until this date.
  * system_settings row premolt.episodes_last_run_on: once-a-day guard for the
    daily pass (UTC date as text).

Additive. No backfill.
"""
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "pmv_20261117_premolt_v2"
down_revision: Union[str, None] = "brd_20261113_egg_sac_groups"
branch_labels = None
depends_on = None

SETTING_KEY = "premolt.episodes_last_run_on"


def upgrade() -> None:
    op.add_column("inverts", sa.Column("premolt_snoozed_until", sa.Date(), nullable=True))

    op.create_table(
        "premolt_episodes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("invert_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inverts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("opened_on", sa.Date(), nullable=False),
        sa.Column("closed_on", sa.Date(), nullable=True),
        sa.Column("close_reason", sa.String(20), nullable=True),
        sa.Column("branch", sa.String(30), nullable=False),
        sa.Column("signals", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("rule_version", sa.String(20), nullable=False),
        sa.Column("keeper_answer", sa.String(10), nullable=True),
        sa.Column("answer_source", sa.String(10), nullable=True),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("answered_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "close_reason IN ('molted', 'ate', 'keeper_not_yet', 'cleared', 'animal_closed', 'stale')",
            name="ck_premolt_episodes_close_reason",
        ),
        sa.CheckConstraint("keeper_answer IN ('yes', 'not_yet')", name="ck_premolt_episodes_keeper_answer"),
        sa.CheckConstraint("answer_source IN ('card', 'pause')", name="ck_premolt_episodes_answer_source"),
    )
    op.create_index("ix_premolt_episodes_invert_id", "premolt_episodes", ["invert_id"])
    op.create_index("ix_premolt_episodes_user_id", "premolt_episodes", ["user_id"])
    op.create_index(
        "uq_premolt_episodes_open", "premolt_episodes", ["invert_id"],
        unique=True, postgresql_where=sa.text("closed_on IS NULL"),
    )

    op.execute(
        sa.text(
            "INSERT INTO system_settings "
            "(id, key, value, value_type, category, label, description, is_sensitive, created_at) "
            "VALUES (gen_random_uuid(), :key, '', 'string', 'maintenance', :label, :descr, false, now()) "
            "ON CONFLICT (key) DO NOTHING"
        ).bindparams(
            key=SETTING_KEY,
            label="Premolt episodes last run",
            descr="Set by the daily premolt pass (UTC date). Not for manual editing.",
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM system_settings WHERE key = :key").bindparams(key=SETTING_KEY))
    op.drop_index("uq_premolt_episodes_open", table_name="premolt_episodes")
    op.drop_index("ix_premolt_episodes_user_id", table_name="premolt_episodes")
    op.drop_index("ix_premolt_episodes_invert_id", table_name="premolt_episodes")
    op.drop_table("premolt_episodes")
    op.drop_column("inverts", "premolt_snoozed_until")
