"""add animal_genotypes table (data layer only, no router yet)

Revision ID: gen_20260421_add_animal_genotypes_table
Revises: qrp_20260421_extend_qr_sessions_polymorphic
Create Date: 2026-04-21

Sprint 2 P1 — unblocks the morph calculator that lands in Sprint 5. Per
PRD §5.4, each row records the zygosity of a single gene on a single animal.

Design notes:

  - `gene_id` is intentionally NOT an FK right now. The `genes` table is a
    Sprint 3 deliverable (see `add_gene_definitions` in the sprint plan).
    Leaving gene_id as a typed UUID column lets Sprint 3's migration drop
    an FK + index cleanly without needing to backfill or alter this table.

  - Polymorphic parent — PRD §5.4 calls for `snake_id` + `lizard_id`
    nullable + CHECK constraint. We only have a `snakes` table for v1.
    Rather than adding a nullable `lizard_id` FK that can't reference
    anything, `snake_id` is NOT NULL for now. When lizards ship, a
    migration will alter this to nullable and add lizard_id + CHECK.
    This matches the shed_logs pattern and avoids speculative columns.

  - Zygosity is the hobby-accepted enum: het / visual / poss_het / super.
    We store it as a VARCHAR(20) — not a Postgres enum — because new
    values ("unverified super"?) are plausible and the enum migration
    dance isn't worth it for a small ref column.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'gen_20260421_add_animal_genotypes_table'
down_revision: Union[str, None] = 'qrp_20260421_extend_qr_sessions_polymorphic'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'animal_genotypes',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),

        # Polymorphic parent — v1 is snake-only (see module docstring)
        sa.Column(
            'snake_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('snakes.id', ondelete='CASCADE'),
            nullable=False,
        ),

        # Gene reference — FK intentionally deferred to Sprint 3 when the
        # genes table ships
        sa.Column('gene_id', postgresql.UUID(as_uuid=True), nullable=False),

        # Zygosity — 'het' | 'visual' | 'poss_het' | 'super'
        sa.Column('zygosity', sa.String(20), nullable=False),

        # For "66% het", "50% het" cases. NULL when zygosity != 'poss_het'.
        sa.Column('poss_het_percentage', sa.Integer(), nullable=True),

        # Proven by breeding or genetic test vs assumed-from-parentage
        sa.Column('proven', sa.Boolean(), server_default=sa.false(), nullable=False),

        sa.Column('notes', sa.Text(), nullable=True),

        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),

        sa.PrimaryKeyConstraint('id'),
    )

    # Dashboard lookup — "show me all genes on this snake"
    op.create_index('ix_animal_genotypes_snake_id', 'animal_genotypes', ['snake_id'])
    # Morph-prevalence queries — "how many animals carry this gene?"
    op.create_index('ix_animal_genotypes_gene_id', 'animal_genotypes', ['gene_id'])


def downgrade() -> None:
    op.drop_index('ix_animal_genotypes_gene_id', table_name='animal_genotypes')
    op.drop_index('ix_animal_genotypes_snake_id', table_name='animal_genotypes')
    op.drop_table('animal_genotypes')
