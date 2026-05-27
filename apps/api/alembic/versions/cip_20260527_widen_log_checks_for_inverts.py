"""Widen polymorphic-log CHECK constraints to accept invert-only parents

Revision ID: cip_20260527_widen_log_checks_for_inverts
Revises: inv_20260527_inverts_consolidation_v1
Create Date: 2026-05-27

Context
-------
ADR-005 Phase C2 launches centipedes on the unified `inverts` table.
Centipedes don't have a legacy per-taxon table (no `centipede_id`
column on log rows), so a centipede feeding/molt/substrate/photo/QR
record carries ONLY `invert_id` — no tarantula_id, no scorpion_id, no
animal_id, no enclosure_id.

The existing CHECK constraints on the five polymorphic-log tables
were written before `inverts` existed and they reject invert-only
rows because they count only the legacy parent columns.

This migration widens each CHECK to accept invert-only rows while
preserving the original exactly-one / at-least-one semantics for
existing parents.

Predicate shape — "exactly one parent" tables
---------------------------------------------
  feeding_logs, photos, qr_upload_sessions

  OLD:  num_nonnulls(<legacy FKs>) = 1
  NEW:  (num_nonnulls(<legacy FKs>) = 1)
        OR (num_nonnulls(<legacy FKs>) = 0 AND invert_id IS NOT NULL)

  Branch 1 matches every existing tarantula/scorpion/animal/enclosure
  row — and importantly it matches POST-A2/B rows where invert_id is
  ALSO set: branch 1 counts only the legacy FKs, so a row with
  tarantula_id + invert_id BOTH set still passes (one legacy FK = 1).

  Branch 2 is the centipede path: no legacy FK, invert_id present.
  Multiple legacy FKs + invert_id fails both branches (correctly).

Predicate shape — "at least one parent" tables
----------------------------------------------
  molt_logs, substrate_changes

  Original predicate was a chain of `IS NOT NULL OR` over the legacy
  FKs. Simply append `OR invert_id IS NOT NULL`.

Safety
------
* Idempotent against existing rows — every backfilled row passes the
  new predicate because branch 1 preserves the old semantics for
  legacy FKs.
* Reversible. downgrade() restores the prior predicates (the
  invert-only rows that exist between this migration and a hypothetical
  downgrade — centipede logs — would violate the restored constraint,
  so downgrade is unsafe AFTER any centipede log exists. That's by
  design: the schema records intent).
* No data migration. Just constraint swaps.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'cip_20260527_widen_log_checks_for_inverts'
down_revision: Union[str, None] = 'inv_20260527_inverts_consolidation_v1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _exactly_one_or_invert_only(legacy_fks: list[str]) -> str:
    """Build the CHECK predicate for an exactly-one-parent table that
    also accepts invert-only rows."""
    legacy = ", ".join(legacy_fks)
    return (
        f"(num_nonnulls({legacy}) = 1) "
        f"OR (num_nonnulls({legacy}) = 0 AND invert_id IS NOT NULL)"
    )


def _at_least_one_or_invert(legacy_fks: list[str]) -> str:
    """Build the CHECK predicate for an at-least-one-parent table
    extended to accept invert_id."""
    clauses = [f"{c} IS NOT NULL" for c in legacy_fks] + ["invert_id IS NOT NULL"]
    return " OR ".join(clauses)


def upgrade() -> None:
    # ---------------------------------------------------------------
    # feeding_logs — exactly-one parent across (tarantula, enclosure, animal, scorpion)
    # ---------------------------------------------------------------
    op.drop_constraint(
        'feeding_logs_must_have_exactly_one_parent',
        'feeding_logs', type_='check',
    )
    op.create_check_constraint(
        'feeding_logs_must_have_exactly_one_parent',
        'feeding_logs',
        _exactly_one_or_invert_only(
            ['tarantula_id', 'enclosure_id', 'animal_id', 'scorpion_id']
        ),
    )

    # ---------------------------------------------------------------
    # photos — exactly-one parent across (tarantula, animal, scorpion)
    # ---------------------------------------------------------------
    op.drop_constraint(
        'photos_must_have_exactly_one_parent',
        'photos', type_='check',
    )
    op.create_check_constraint(
        'photos_must_have_exactly_one_parent',
        'photos',
        _exactly_one_or_invert_only(
            ['tarantula_id', 'animal_id', 'scorpion_id']
        ),
    )

    # ---------------------------------------------------------------
    # qr_upload_sessions — exactly-one parent across (tarantula, animal, scorpion)
    # ---------------------------------------------------------------
    op.drop_constraint(
        'qr_upload_sessions_must_have_exactly_one_parent',
        'qr_upload_sessions', type_='check',
    )
    op.create_check_constraint(
        'qr_upload_sessions_must_have_exactly_one_parent',
        'qr_upload_sessions',
        _exactly_one_or_invert_only(
            ['tarantula_id', 'animal_id', 'scorpion_id']
        ),
    )

    # ---------------------------------------------------------------
    # molt_logs — at-least-one parent. Constraint name is the singular
    # `molt_log_must_have_parent` (from s0t1u2v3w4x5_add_enclosures.py).
    # ---------------------------------------------------------------
    op.drop_constraint(
        'molt_log_must_have_parent',
        'molt_logs', type_='check',
    )
    op.create_check_constraint(
        'molt_log_must_have_parent',
        'molt_logs',
        _at_least_one_or_invert(
            ['tarantula_id', 'enclosure_id', 'scorpion_id']
        ),
    )

    # ---------------------------------------------------------------
    # substrate_changes — at-least-one parent. Same singular name.
    # ---------------------------------------------------------------
    op.drop_constraint(
        'substrate_change_must_have_parent',
        'substrate_changes', type_='check',
    )
    op.create_check_constraint(
        'substrate_change_must_have_parent',
        'substrate_changes',
        _at_least_one_or_invert(
            ['tarantula_id', 'enclosure_id', 'scorpion_id']
        ),
    )


def downgrade() -> None:
    """Restore the pre-centipede predicates.

    UNSAFE if any centipede log rows exist (invert-only rows). The
    restored constraint will fail them. Drop centipede log rows first
    if you really need to roll back.
    """
    # substrate_changes
    op.drop_constraint(
        'substrate_change_must_have_parent',
        'substrate_changes', type_='check',
    )
    op.create_check_constraint(
        'substrate_change_must_have_parent',
        'substrate_changes',
        'tarantula_id IS NOT NULL OR enclosure_id IS NOT NULL '
        'OR scorpion_id IS NOT NULL',
    )

    # molt_logs
    op.drop_constraint(
        'molt_log_must_have_parent',
        'molt_logs', type_='check',
    )
    op.create_check_constraint(
        'molt_log_must_have_parent',
        'molt_logs',
        'tarantula_id IS NOT NULL OR enclosure_id IS NOT NULL '
        'OR scorpion_id IS NOT NULL',
    )

    # qr_upload_sessions
    op.drop_constraint(
        'qr_upload_sessions_must_have_exactly_one_parent',
        'qr_upload_sessions', type_='check',
    )
    op.create_check_constraint(
        'qr_upload_sessions_must_have_exactly_one_parent',
        'qr_upload_sessions',
        'num_nonnulls(tarantula_id, animal_id, scorpion_id) = 1',
    )

    # photos
    op.drop_constraint(
        'photos_must_have_exactly_one_parent',
        'photos', type_='check',
    )
    op.create_check_constraint(
        'photos_must_have_exactly_one_parent',
        'photos',
        'num_nonnulls(tarantula_id, animal_id, scorpion_id) = 1',
    )

    # feeding_logs
    op.drop_constraint(
        'feeding_logs_must_have_exactly_one_parent',
        'feeding_logs', type_='check',
    )
    op.create_check_constraint(
        'feeding_logs_must_have_exactly_one_parent',
        'feeding_logs',
        'num_nonnulls(tarantula_id, enclosure_id, animal_id, scorpion_id) = 1',
    )
