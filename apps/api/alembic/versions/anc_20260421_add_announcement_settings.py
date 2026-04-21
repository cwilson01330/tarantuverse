"""add announcement settings for cross-brand banner

Revision ID: anc_20260421_add_announcement_settings
Revises: wtl_20260420_add_waitlist
Create Date: 2026-04-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'anc_20260421_add_announcement_settings'
down_revision: Union[str, None] = 'wtl_20260420_add_waitlist'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SETTINGS = [
    {
        'key': 'announcements.herpetoverse_banner_enabled',
        'value': 'false',
        'value_type': 'bool',
        'category': 'announcements',
        'label': 'Herpetoverse Banner',
        'description': 'Show the cross-promo banner in the Tarantuverse dashboard linking to herpetoverse.com.',
    },
    {
        'key': 'announcements.herpetoverse_banner_message',
        'value': 'Herpetoverse is coming — a husbandry platform for reptile keepers, from the team behind Tarantuverse. One login, one profile.',
        'value_type': 'string',
        'category': 'announcements',
        'label': 'Herpetoverse Banner Message',
        'description': 'The full announcement text shown to users. Keep it short — bold headline + one-line subtitle.',
    },
    {
        'key': 'announcements.herpetoverse_banner_url',
        'value': 'https://www.herpetoverse.com',
        'value_type': 'string',
        'category': 'announcements',
        'label': 'Herpetoverse Banner URL',
        'description': 'Where the banner\'s CTA button links to. Typically the Herpetoverse landing page.',
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
