"""extend polymorphic tables with lizard_id parent

Revision ID: lzp_20260423_extend_polymorphic_tables
Revises: lzd_20260423_add_lizards_table
Create Date: 2026-04-23

Companion to lzd_20260423 — the lizards table exists; now the six tables
that referenced snakes polymorphically need to accept lizards too:

  1. photos               — tarantula_id / snake_id / lizard_id XOR
  2. qr_upload_sessions   — tarantula_id / snake_id / lizard_id XOR
  3. feeding_logs         — tarantula_id / enclosure_id / snake_id / lizard_id XOR
  4. shed_logs            — snake_id / lizard_id XOR (was snake-only NOT NULL)
  5. animal_genotypes     — snake_id / lizard_id XOR (was snake-only NOT NULL)
  6. weight_logs          — snake_id / lizard_id XOR (was snake-only NOT NULL)

Tables (1)-(3) already have num_nonnulls CHECK constraints — we drop them,
add the new column + FK + index, then recreate the CHECK with the extra
parent slot. Tables (4)-(6) were snake-only with NOT NULL on snake_id —
we relax to nullable, add lizard_id, then CHECK exactly-one.

All existing rows satisfy the new CHECK automatically: they all have
exactly one parent set (the snake/tarantula one), and lizard_id is NULL
because the column was just added.

Downgrade mirrors upgrade in reverse. Downgrade is only safe on an
environment that has no lizard-parented rows yet — the lzd_ migration's
downgrade would fail if lizards exist anyway.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'lzp_20260423_extend_polymorphic_tables'
down_revision: Union[str, None] = 'lzd_20260423_add_lizards_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Table-specific constants live at module scope so upgrade/downgrade share them.
# Each entry is (table, existing_parents, old_check_name_or_None, new_check_name)
# The old_check_name is None for tables that were single-parent NOT NULL
# (shed_logs, animal_genotypes, weight_logs) and didn't have a check yet.
_ALREADY_POLY = [
    # photos already has tarantula_id + snake_id
    {
        'table': 'photos',
        'existing_cols': ['tarantula_id', 'snake_id'],
        'old_check': 'photos_must_have_exactly_one_parent',
        'new_check': 'photos_must_have_exactly_one_parent',
    },
    # qr_upload_sessions already has tarantula_id + snake_id
    {
        'table': 'qr_upload_sessions',
        'existing_cols': ['tarantula_id', 'snake_id'],
        'old_check': 'qr_upload_sessions_must_have_exactly_one_parent',
        'new_check': 'qr_upload_sessions_must_have_exactly_one_parent',
    },
    # feeding_logs already has tarantula_id + enclosure_id + snake_id
    {
        'table': 'feeding_logs',
        'existing_cols': ['tarantula_id', 'enclosure_id', 'snake_id'],
        'old_check': 'feeding_logs_must_have_exactly_one_parent',
        'new_check': 'feeding_logs_must_have_exactly_one_parent',
    },
]

_SNAKE_ONLY = [
    # shed_logs.snake_id was NOT NULL
    {'table': 'shed_logs', 'new_check': 'shed_logs_must_have_exactly_one_parent'},
    # animal_genotypes.snake_id was NOT NULL
    {'table': 'animal_genotypes', 'new_check': 'animal_genotypes_must_have_exactly_one_parent'},
    # weight_logs.snake_id was NOT NULL
    {'table': 'weight_logs', 'new_check': 'weight_logs_must_have_exactly_one_parent'},
]


def _add_lizard_id(table: str) -> None:
    """Add lizard_id column + FK + index to `table`."""
    op.add_column(
        table,
        sa.Column('lizard_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        f'fk_{table}_lizard_id',
        table,
        'lizards',
        ['lizard_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.create_index(f'ix_{table}_lizard_id', table, ['lizard_id'])


def _drop_lizard_id(table: str) -> None:
    op.drop_index(f'ix_{table}_lizard_id', table_name=table)
    op.drop_constraint(f'fk_{table}_lizard_id', table, type_='foreignkey')
    op.drop_column(table, 'lizard_id')


def upgrade() -> None:
    # ── (1)-(3): tables that were already polymorphic ──
    for spec in _ALREADY_POLY:
        table = spec['table']
        all_parents = spec['existing_cols'] + ['lizard_id']

        _add_lizard_id(table)

        # Replace the CHECK constraint with one that includes lizard_id
        op.drop_constraint(spec['old_check'], table, type_='check')
        op.create_check_constraint(
            spec['new_check'],
            table,
            f"num_nonnulls({', '.join(all_parents)}) = 1",
        )

    # ── (4)-(6): tables that were snake-only NOT NULL ──
    for spec in _SNAKE_ONLY:
        table = spec['table']

        # Relax snake_id to nullable so a row can be lizard-only
        op.alter_column(table, 'snake_id', nullable=True)

        _add_lizard_id(table)

        # Enforce exactly-one parent
        op.create_check_constraint(
            spec['new_check'],
            table,
            'num_nonnulls(snake_id, lizard_id) = 1',
        )


def downgrade() -> None:
    # Reverse order of upgrade — drop snake-only extensions first.
    for spec in reversed(_SNAKE_ONLY):
        table = spec['table']
        op.drop_constraint(spec['new_check'], table, type_='check')
        _drop_lizard_id(table)
        # Restoring NOT NULL is safe only if no lizard-only rows exist.
        # Fresh environments / replayed migrations will satisfy this.
        op.alter_column(table, 'snake_id', nullable=False)

    for spec in reversed(_ALREADY_POLY):
        table = spec['table']
        existing_cols = spec['existing_cols']

        # Drop the 4-parent CHECK and restore the original (n-1)-parent CHECK.
        op.drop_constraint(spec['new_check'], table, type_='check')
        _drop_lizard_id(table)
        op.create_check_constraint(
            spec['old_check'],
            table,
            f"num_nonnulls({', '.join(existing_cols)}) = 1",
        )
