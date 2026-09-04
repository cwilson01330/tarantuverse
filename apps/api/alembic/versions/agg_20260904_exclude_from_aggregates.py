"""Add users.exclude_from_aggregates.

Revision ID: agg_20260904_exclude_agg
Revises: egg_20260826_expected_hatch
Create Date: 2026-09-04

Marks an account whose data must not feed community aggregates — today that
means ADR-018's keeper-consensus husbandry signals.

WHY
---
The owner's account is a test bed: most of its animals are fixtures, fed on
whatever schedule a feature needed that day rather than on husbandry. That data
was materially shaping numbers published as "what keepers actually do" — in
four of the twenty-three qualifying species it moved the displayed figure, and
in two of those it did so off a single logged interval.

Scope is deliberately NARROW. This excludes an account from AGGREGATES only.
It is not a shadowban and must never become one: the account still appears in
forums, keeper listings, follows, messages and every other community surface.
If a future feature wants to hide an account from people rather than from
statistics, that is a different flag with a different name and a different
conversation.

Default false, so no existing account changes behaviour on deploy. The owner's
account is flagged separately by hand (a one-row UPDATE), not in this
migration — a data change about one specific person doesn't belong in schema
history.
"""
from alembic import op
import sqlalchemy as sa


revision = "agg_20260904_exclude_agg"
down_revision = "egg_20260826_expected_hatch"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "exclude_from_aggregates",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "exclude_from_aggregates")
