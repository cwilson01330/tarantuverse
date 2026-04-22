"""extend feeding_logs for snake parent (Herpetoverse v1)

Revision ID: flg_20260421_extend_feeding_logs_polymorphic
Revises: gen_20260421_add_animal_genotypes_table
Create Date: 2026-04-21

Sprint 3 prerequisite — the sheds/feedings router work needs feeding_logs
to accept a snake parent. Pattern matches pht_ / qrp_ migrations:

  - add `snake_id` nullable FK with CASCADE
  - index snake_id for "feedings for this snake" dashboard queries
  - tighten the parent CHECK from "at-least-one" to "exactly-one"

**Pre-flight row scan:** the existing CHECK
`tarantula_id IS NOT NULL OR enclosure_id IS NOT NULL` only required at
least one parent. Before we tighten to `num_nonnulls = 1` we fail fast
if any live row has both parents set. That would be a data bug, not an
expected state — tarantuverse code has always set exactly one. But a
loud migration abort beats silent CHECK violation at deploy.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'flg_20260421_extend_feeding_logs_polymorphic'
down_revision: Union[str, None] = 'gen_20260421_add_animal_genotypes_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── Pre-flight: verify no existing row has both parents set ──
    result = conn.execute(sa.text(
        "SELECT COUNT(*) FROM feeding_logs "
        "WHERE tarantula_id IS NOT NULL AND enclosure_id IS NOT NULL"
    )).scalar()
    if result and result > 0:
        raise RuntimeError(
            f"Cannot tighten feeding_logs CHECK constraint: "
            f"{result} existing row(s) have both tarantula_id AND enclosure_id set. "
            f"Investigate and clean up before re-running this migration."
        )

    # ── Add snake_id column + FK + index ──
    op.add_column(
        'feeding_logs',
        sa.Column('snake_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_feeding_logs_snake_id',
        'feeding_logs',
        'snakes',
        ['snake_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.create_index(
        'ix_feeding_logs_snake_id',
        'feeding_logs',
        ['snake_id'],
    )

    # ── Replace weaker CHECK with strict exactly-one ──
    op.drop_constraint(
        'feeding_log_must_have_parent',
        'feeding_logs',
        type_='check',
    )
    op.create_check_constraint(
        'feeding_logs_must_have_exactly_one_parent',
        'feeding_logs',
        'num_nonnulls(tarantula_id, enclosure_id, snake_id) = 1',
    )


def downgrade() -> None:
    # Restore the weaker CHECK first so we can drop the snake_id column safely.
    op.drop_constraint(
        'feeding_logs_must_have_exactly_one_parent',
        'feeding_logs',
        type_='check',
    )
    op.create_check_constraint(
        'feeding_log_must_have_parent',
        'feeding_logs',
        'tarantula_id IS NOT NULL OR enclosure_id IS NOT NULL',
    )

    op.drop_index('ix_feeding_logs_snake_id', table_name='feeding_logs')
    op.drop_constraint('fk_feeding_logs_snake_id', 'feeding_logs', type_='foreignkey')
    op.drop_column('feeding_logs', 'snake_id')
