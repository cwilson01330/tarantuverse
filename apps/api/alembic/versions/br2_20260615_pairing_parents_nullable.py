"""Breeding generalization Phase C — make pairing tarantula FKs nullable

Revision ID: br2_20260615_pairing_parents_nullable
Revises: brd_20260612_breeding_invert_fks
Create Date: 2026-06-15

ADR-010 Phase C. A pairing between non-tarantula inverts (e.g. scorpions)
has no row in the `tarantulas` table, so it can only populate the generic
`male_invert_id` / `female_invert_id` columns added in Phase A. That
requires the legacy `male_id` / `female_id` (FK → tarantulas) to be
nullable.

Tarantula pairings continue to set BOTH the legacy and invert FKs (the
ids are identical — shared PK), so existing reads/lineage are unaffected.

Safety: loosening NOT NULL is non-breaking for existing rows. downgrade()
restores NOT NULL, which would fail if any invert-only pairing exists (by
design — the schema records intent).
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'br2_20260615_pairing_parents_nullable'
down_revision: Union[str, None] = 'brd_20260612_breeding_invert_fks'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('pairings', 'male_id', nullable=True)
    op.alter_column('pairings', 'female_id', nullable=True)


def downgrade() -> None:
    op.alter_column('pairings', 'male_id', nullable=False)
    op.alter_column('pairings', 'female_id', nullable=False)
