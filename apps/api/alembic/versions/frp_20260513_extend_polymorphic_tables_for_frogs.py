"""extend polymorphic tables with frog_id parent

Revision ID: frp_20260513_extend_polymorphic_tables_for_frogs
Revises: frg_20260513_add_frogs_table
Create Date: 2026-05-13

Companion to frg_20260513 — the frogs table exists; now the six tables
that referenced snakes + lizards polymorphically need to accept frogs
too:

  1. photos               — tarantula_id / snake_id / lizard_id / frog_id XOR
  2. qr_upload_sessions   — tarantula_id / snake_id / lizard_id / frog_id XOR
  3. feeding_logs         — tarantula_id / enclosure_id / snake_id / lizard_id / frog_id XOR
  4. shed_logs            — snake_id / lizard_id / frog_id XOR
  5. animal_genotypes     — snake_id / lizard_id / frog_id XOR
  6. weight_logs          — snake_id / lizard_id / frog_id XOR

All six tables already have a `*_must_have_exactly_one_parent` CHECK
after the lzp_20260423 migration. We drop the existing CHECK, add
frog_id (+ FK + index), then recreate the CHECK with frog_id included.

All existing rows satisfy the new CHECK automatically: they have
exactly one parent set, and frog_id is NULL because the column was
just added.

Downgrade mirrors upgrade. Downgrade is only safe on an environment
that has no frog-parented rows yet — the frg_ migration's downgrade
would fail if frogs exist anyway.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'frp_20260513_extend_polymorphic_tables_for_frogs'
down_revision: Union[str, None] = 'frg_20260513_add_frogs_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Table-specific specs. existing_cols is the full list of parent FK
# columns prior to this migration (used for downgrade CHECK restoration).
_POLY_TABLES = [
    {
        'table': 'photos',
        'existing_cols': ['tarantula_id', 'snake_id', 'lizard_id'],
        'check': 'photos_must_have_exactly_one_parent',
    },
    {
        'table': 'qr_upload_sessions',
        'existing_cols': ['tarantula_id', 'snake_id', 'lizard_id'],
        'check': 'qr_upload_sessions_must_have_exactly_one_parent',
    },
    {
        'table': 'feeding_logs',
        'existing_cols': ['tarantula_id', 'enclosure_id', 'snake_id', 'lizard_id'],
        'check': 'feeding_logs_must_have_exactly_one_parent',
    },
    {
        'table': 'shed_logs',
        'existing_cols': ['snake_id', 'lizard_id'],
        'check': 'shed_logs_must_have_exactly_one_parent',
    },
    {
        'table': 'animal_genotypes',
        'existing_cols': ['snake_id', 'lizard_id'],
        'check': 'animal_genotypes_must_have_exactly_one_parent',
    },
    {
        'table': 'weight_logs',
        'existing_cols': ['snake_id', 'lizard_id'],
        'check': 'weight_logs_must_have_exactly_one_parent',
    },
]


def _add_frog_id(table: str) -> None:
    """Add frog_id column + FK + index to `table`."""
    op.add_column(
        table,
        sa.Column('frog_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        f'fk_{table}_frog_id',
        table,
        'frogs',
        ['frog_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.create_index(f'ix_{table}_frog_id', table, ['frog_id'])


def _drop_frog_id(table: str) -> None:
    op.drop_index(f'ix_{table}_frog_id', table_name=table)
    op.drop_constraint(f'fk_{table}_frog_id', table, type_='foreignkey')
    op.drop_column(table, 'frog_id')


def upgrade() -> None:
    for spec in _POLY_TABLES:
        table = spec['table']
        all_parents = spec['existing_cols'] + ['frog_id']

        _add_frog_id(table)

        # Replace the CHECK with one that includes frog_id.
        op.drop_constraint(spec['check'], table, type_='check')
        op.create_check_constraint(
            spec['check'],
            table,
            f"num_nonnulls({', '.join(all_parents)}) = 1",
        )


def downgrade() -> None:
    for spec in reversed(_POLY_TABLES):
        table = spec['table']
        existing_cols = spec['existing_cols']

        # Drop the frog-inclusive CHECK, drop the frog_id column + FK
        # + index, restore the original CHECK without frog_id.
        op.drop_constraint(spec['check'], table, type_='check')
        _drop_frog_id(table)
        op.create_check_constraint(
            spec['check'],
            table,
            f"num_nonnulls({', '.join(existing_cols)}) = 1",
        )
