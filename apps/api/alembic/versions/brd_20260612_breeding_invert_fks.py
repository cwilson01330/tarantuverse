"""Breeding generalization Phase A — add invert FKs to pairings + offspring

Revision ID: brd_20260612_breeding_invert_fks
Revises: rch_20260610_add_roach_taxon
Create Date: 2026-06-12

ADR-010. Expand phase only: additive, non-breaking. Adds invert-referencing
FKs alongside the legacy tarantula FKs so breeding can be re-based on the
unified `inverts` surface (and reused by every invert taxon).

Because the inverts consolidation mirrors each tarantula into `inverts`
using the SAME primary key (Invert.id == Tarantula.id), these new columns
backfill verbatim from the existing ones (Phase B, separate one-shot):
    pairings.male_invert_id   = pairings.male_id
    pairings.female_invert_id = pairings.female_id
    offspring.invert_id       = offspring.tarantula_id

Nullable for now; a later contract migration (Phase E) makes the pairing
invert FKs NOT NULL and drops the legacy tarantula FK columns once nothing
reads them.

Safety: purely additive. downgrade() drops the three columns.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'brd_20260612_breeding_invert_fks'
down_revision: Union[str, None] = 'rch_20260610_add_roach_taxon'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # pairings: generic parents on the inverts surface
    op.add_column('pairings', sa.Column('male_invert_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('pairings', sa.Column('female_invert_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index('ix_pairings_male_invert_id', 'pairings', ['male_invert_id'])
    op.create_index('ix_pairings_female_invert_id', 'pairings', ['female_invert_id'])
    op.create_foreign_key(
        'pairings_male_invert_id_fkey', 'pairings', 'inverts',
        ['male_invert_id'], ['id'], ondelete='CASCADE',
    )
    op.create_foreign_key(
        'pairings_female_invert_id_fkey', 'pairings', 'inverts',
        ['female_invert_id'], ['id'], ondelete='CASCADE',
    )

    # offspring: generic "kept" link on the inverts surface
    op.add_column('offspring', sa.Column('invert_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index('ix_offspring_invert_id', 'offspring', ['invert_id'])
    op.create_foreign_key(
        'offspring_invert_id_fkey', 'offspring', 'inverts',
        ['invert_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('offspring_invert_id_fkey', 'offspring', type_='foreignkey')
    op.drop_index('ix_offspring_invert_id', table_name='offspring')
    op.drop_column('offspring', 'invert_id')

    op.drop_constraint('pairings_female_invert_id_fkey', 'pairings', type_='foreignkey')
    op.drop_constraint('pairings_male_invert_id_fkey', 'pairings', type_='foreignkey')
    op.drop_index('ix_pairings_female_invert_id', table_name='pairings')
    op.drop_index('ix_pairings_male_invert_id', table_name='pairings')
    op.drop_column('pairings', 'male_invert_id')
    op.drop_column('pairings', 'female_invert_id')
