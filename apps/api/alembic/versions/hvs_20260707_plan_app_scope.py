"""Per-app subscription scope — HV gets its own paid entitlement.

Adds `subscription_plans.app` so a plan can be scoped to a single Appalachian
Tarantulas app ('tarantuverse' | 'herpetoverse') or cover both ('both'). This
lets Herpetoverse sell its own subscription (keepers who use only one app pay
only for that app), with an optional 'both' bundle / TV-subscriber add-on later.

Existing plans are TV-era, so they backfill to 'tarantuverse' — an existing TV
subscriber does NOT silently gain HV premium. Entitlement is resolved per-app by
`User.is_premium_for_app(app)`.

Revision ID: hvs_20260707_plan_app_scope
Revises: htr_20260707_animal_transfers
"""
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "hvs_20260707_plan_app_scope"
down_revision: Union[str, None] = "htr_20260707_animal_transfers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "subscription_plans",
        sa.Column("app", sa.String(length=20), nullable=False, server_default="tarantuverse"),
    )
    # Existing rows are TV-era; keep them TV-scoped explicitly (server_default
    # already covers the backfill, this is belt-and-suspenders + clarity).
    op.execute("UPDATE subscription_plans SET app = 'tarantuverse' WHERE app IS NULL")
    op.create_check_constraint(
        "subscription_plans_app_check",
        "subscription_plans",
        "app IN ('tarantuverse', 'herpetoverse', 'both')",
    )


def downgrade() -> None:
    op.drop_constraint("subscription_plans_app_check", "subscription_plans", type_="check")
    op.drop_column("subscription_plans", "app")
