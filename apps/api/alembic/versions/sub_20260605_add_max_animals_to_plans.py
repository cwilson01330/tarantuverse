"""Add max_animals limit to subscription_plans (cross-taxon collection cap)

Revision ID: sub_20260605_add_max_animals_to_plans
Revises: cip_20260527_widen_log_checks_for_inverts
Create Date: 2026-06-05

Context
-------
The free-tier collection cap historically lived in
`subscription_plans.max_tarantulas` and was enforced ONLY on the
tarantula create path, counting rows in the `Tarantula` table. After
the inverts consolidation (ADR-005) a keeper's collection spans
tarantulas, scorpions, and centipedes — all mirrored into / stored on
the unified `inverts` table — so a tarantula-only cap was both
under-counting and trivially bypassable by adding other taxa.

This migration introduces `max_animals`: a single cross-taxon cap
counted against `inverts`. The application enforces it on every invert
create route via `enforce_collection_limit`.

Data backfill
-------------
* Every plan gets a value (server_default '20' covers the column add).
* Unlimited plans (max_tarantulas = -1, i.e. premium / verified) stay
  unlimited: max_animals = -1.
* Finite plans take GREATEST(max_tarantulas, 20) so the free tier rises
  from 15 -> 20 while any higher finite cap is preserved, never reduced.

`max_tarantulas` is intentionally left in place for backward
compatibility; a later cleanup migration can drop it once nothing reads
it.

Safety
------
* Additive column + idempotent data update. Reversible.
* downgrade() drops the column.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'sub_20260605_add_max_animals_to_plans'
down_revision: Union[str, None] = 'cip_20260527_widen_log_checks_for_inverts'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'subscription_plans',
        sa.Column('max_animals', sa.Integer(), nullable=False, server_default='20'),
    )
    # Preserve unlimited plans; raise finite plans to at least 20 without
    # ever reducing a higher existing cap.
    op.execute(
        """
        UPDATE subscription_plans
        SET max_animals = CASE
            WHEN max_tarantulas = -1 THEN -1
            ELSE GREATEST(max_tarantulas, 20)
        END
        """
    )


def downgrade() -> None:
    op.drop_column('subscription_plans', 'max_animals')
