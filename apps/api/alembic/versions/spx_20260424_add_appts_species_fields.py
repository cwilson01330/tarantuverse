"""add appts-unique species fields to species table

Adds four optional string columns to `species`:
  - venom_potency
  - lifespan_male
  - lifespan_female
  - activity_level

These fields used to live in the Appalachian Tarantulas (appts) Prisma
`Species` model. Appts is migrating its care sheets to read exclusively
from the Tarantuverse species API, so the appts-unique fields need to
exist on the TV side to avoid a data loss / schema downgrade when we
swap appts's detail page to consume the API.

Safe additive migration — every column is nullable with no default, so
existing rows keep working unchanged. No seed backfill here; the backfill
lives in a separate one-off script so it can be re-run independently.

Revision ID: spx_20260424_add_appts_species_fields
Revises: lzp_20260423_extend_polymorphic_tables
Create Date: 2026-04-24 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'spx_20260424_add_appts_species_fields'
down_revision: Union[str, None] = 'lzp_20260423_extend_polymorphic_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('species', sa.Column('venom_potency', sa.String(length=50), nullable=True))
    op.add_column('species', sa.Column('lifespan_male', sa.String(length=50), nullable=True))
    op.add_column('species', sa.Column('lifespan_female', sa.String(length=50), nullable=True))
    op.add_column('species', sa.Column('activity_level', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('species', 'activity_level')
    op.drop_column('species', 'lifespan_female')
    op.drop_column('species', 'lifespan_male')
    op.drop_column('species', 'venom_potency')
