"""Lower the free-tier animal cap 20 -> 15

Revision ID: cap_20260615_lower_free_animal_cap
Revises: br2_20260615_pairing_parents_nullable
Create Date: 2026-06-15

breeding-premium-gating brief §5 P1. The cross-taxon free cap (added as
subscription_plans.max_animals in sub_20260605, backfilled to
GREATEST(max_tarantulas, 20) = 20) is lowered to 15 so the upgrade prompt
reaches a meaningful share of active keepers. Only ~3 keepers ever reached
20; ~5 sit at/above 15.

Scope: touches ONLY the `free` plan row, and only when it still holds the
backfilled default of 20 — a manually-tuned value is left alone. Premium
plans keep -1 (unlimited). No data is deleted; existing free users above
the new cap keep all their animals and are simply blocked from new creates
until they upgrade or drop below 15 (hard enforcement — enforce_collection_limit
counts existing rows).

Keep in lockstep with app/models/user.py::FREE_TIER_MAX_ANIMALS and
seed_subscription_plans.py.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'cap_20260615_lower_free_animal_cap'
down_revision: Union[str, None] = 'br2_20260615_pairing_parents_nullable'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Only adjust the free plan, and only if it's still the backfilled 20.
    op.execute(
        "UPDATE subscription_plans SET max_animals = 15 "
        "WHERE name = 'free' AND max_animals = 20"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE subscription_plans SET max_animals = 20 "
        "WHERE name = 'free' AND max_animals = 15"
    )
