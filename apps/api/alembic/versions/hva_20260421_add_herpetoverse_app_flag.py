"""add herpetoverse app-enabled feature flag

Revision ID: hva_20260421_add_herpetoverse_app_flag
Revises: anc_20260421_add_announcement_settings
Create Date: 2026-04-21

Adds the master toggle that controls whether the Herpetoverse web app
(behind /app on herpetoverse.com) is accessible to the public.

When False: all /app/* routes redirect to the landing page.
When True:  the app is live.

Toggled via the shared admin panel (Tarantuverse /dashboard/admin/settings).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'hva_20260421_add_herpetoverse_app_flag'
down_revision: Union[str, None] = 'anc_20260421_add_announcement_settings'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SETTINGS = [
    {
        'key': 'features.herpetoverse_app_enabled',
        'value': 'false',
        'value_type': 'bool',
        'category': 'feature_flags',
        'label': 'Herpetoverse App Enabled',
        'description': 'Master toggle for the Herpetoverse web app (herpetoverse.com/app). When off, /app/* redirects to the landing page. Admins can still preview via the herp_preview=1 cookie.',
    },
]


def upgrade() -> None:
    settings_table = sa.table(
        'system_settings',
        sa.column('key', sa.String),
        sa.column('value', sa.Text),
        sa.column('value_type', sa.String),
        sa.column('category', sa.String),
        sa.column('label', sa.String),
        sa.column('description', sa.Text),
    )
    op.bulk_insert(settings_table, SETTINGS)


def downgrade() -> None:
    conn = op.get_bind()
    keys = tuple(s['key'] for s in SETTINGS)
    conn.execute(
        sa.text("DELETE FROM system_settings WHERE key = ANY(:keys)"),
        {"keys": list(keys)},
    )
