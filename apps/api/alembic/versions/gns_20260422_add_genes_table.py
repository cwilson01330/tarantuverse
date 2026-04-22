"""add genes table + retrofit animal_genotypes.gene_id FK

Revision ID: gns_20260422_add_genes_table
Revises: flg_20260421_extend_feeding_logs_polymorphic
Create Date: 2026-04-22

Sprint 4 P0 — gene catalog for the morph calculator (PRD §5.4).

Each row is one gene attached to one species (by scientific_name rather
than by FK — genes can be cataloged before a full reptile_species sheet
exists, and the canonical key in the hobby is the Latin species name).

`welfare_flag` + `welfare_citations` are load-bearing for the
honesty-first content principle. Morph calculator will surface these to
the user whenever a flagged gene is predicted in offspring.

Retrofits `animal_genotypes.gene_id` with an FK to `genes.id` — Sprint 2
deliberately left it unconstrained (see gen_20260421 module docstring).
Safe to add now because that table has no rows in prod yet (no router
writes to it until Sprint 5).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'gns_20260422_add_genes_table'
down_revision: Union[str, None] = 'flg_20260421_extend_feeding_logs_polymorphic'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'genes',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),

        # Species linkage — stored as scientific_name rather than FK because
        # (a) the canonical identifier for a morph in the hobby is the Latin
        # species, and (b) genes can be cataloged before a full reptile_species
        # sheet exists. Uniqueness is enforced with common_name below.
        sa.Column('species_scientific_name', sa.String(255), nullable=False),

        # Hobby-facing identity
        sa.Column('common_name', sa.String(100), nullable=False),  # e.g. "Spider", "Super Pastel"
        sa.Column('symbol', sa.String(30), nullable=True),  # breeder shorthand, e.g. "SPD"
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('image_url', sa.String(500), nullable=True),

        # Inheritance — validated at the schema/app layer to the four hobby
        # categories. Stored as VARCHAR so we can accept new values (e.g.
        # "complex polygenic") without an enum migration dance. Morph
        # calculator reads this to build Punnett squares.
        sa.Column('gene_type', sa.String(30), nullable=False),

        # Welfare — load-bearing. Null welfare_flag means no known concern.
        # Values: 'neurological' | 'structural' | 'viability' | null
        # The calculator surfaces warnings whenever a non-null flag appears
        # in predicted offspring, and surfaces a lethal-homozygous warning
        # whenever two heterozygous parents could produce a super.
        sa.Column('welfare_flag', sa.String(30), nullable=True),
        sa.Column('welfare_notes', sa.Text(), nullable=True),
        sa.Column(
            'lethal_homozygous',
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        # welfare_citations schema: JSONB array of citation dicts, e.g.
        #   [
        #     {"title": "...", "author": "...", "year": 2022,
        #      "source_type": "peer_reviewed" | "veterinary" | "breeder_community",
        #      "url": "https://..."},
        #     ...
        #   ]
        # Content rubric requires 3+ citations for any non-null welfare_flag.
        sa.Column(
            'welfare_citations',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),

        # Community & verification (mirrors species/reptile_species)
        sa.Column('is_verified', sa.Boolean(), server_default=sa.false()),
        sa.Column(
            'submitted_by',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id'),
            nullable=True,
        ),
        sa.Column(
            'verified_by',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id'),
            nullable=True,
        ),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),

        # Staleness tracking for the content rubric — flagged reviews get
        # re-reviewed annually per welfare-first policy.
        sa.Column('content_last_reviewed_at', sa.Date(), nullable=True),

        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),

        sa.PrimaryKeyConstraint('id'),
        # Prevents duplicate gene entries. Case-sensitive on common_name —
        # "Pastel" and "PASTEL" are the same gene; enforcement of that is
        # the seeder's responsibility (we always store Title Case).
        sa.UniqueConstraint(
            'species_scientific_name',
            'common_name',
            name='uq_genes_species_common_name',
        ),
    )

    # Primary lookup: "list all genes for Python regius"
    op.create_index(
        'ix_genes_species_scientific_name',
        'genes',
        ['species_scientific_name'],
    )
    # Autocomplete / search over morph names across species
    op.create_index('ix_genes_common_name', 'genes', ['common_name'])
    # Welfare dashboard / admin triage
    op.create_index(
        'ix_genes_welfare_flag',
        'genes',
        ['welfare_flag'],
        postgresql_where=sa.text('welfare_flag IS NOT NULL'),
    )

    # Retrofit the FK that Sprint 2 deliberately deferred. See
    # gen_20260421_add_animal_genotypes_table for rationale. Safe now
    # because animal_genotypes has no consumer yet — no rows in prod.
    op.create_foreign_key(
        'fk_animal_genotypes_gene_id',
        'animal_genotypes',
        'genes',
        ['gene_id'],
        ['id'],
        ondelete='CASCADE',
    )


def downgrade() -> None:
    # Drop the FK first so genes can be torn down cleanly
    op.drop_constraint(
        'fk_animal_genotypes_gene_id',
        'animal_genotypes',
        type_='foreignkey',
    )

    op.drop_index('ix_genes_welfare_flag', table_name='genes')
    op.drop_index('ix_genes_common_name', table_name='genes')
    op.drop_index('ix_genes_species_scientific_name', table_name='genes')
    op.drop_table('genes')
