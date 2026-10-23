"""What's new: per-app "seen through" markers on users.

Revision ID: whn_20261023_whats_new_seen
Revises: exp_20261022_expenses
Create Date: 2026-10-23

`users.whats_new_seen_tv` / `users.whats_new_seen_hv` hold the `published_on`
of the newest What's-new entry the keeper has dismissed in that app. NULL =
never dismissed. On the user (not the device) so a dismissal follows them to
their other devices. See docs/superpowers/specs/2026-10-23-whats-new-design.md.

Purely additive; reversible (downgrade drops both columns).
"""
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "whn_20261023_whats_new_seen"
down_revision: Union[str, None] = "exp_20261022_expenses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("whats_new_seen_tv", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("whats_new_seen_hv", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "whats_new_seen_hv")
    op.drop_column("users", "whats_new_seen_tv")
