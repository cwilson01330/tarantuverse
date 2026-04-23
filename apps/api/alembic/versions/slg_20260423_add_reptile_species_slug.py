"""add slug to reptile_species (public SEO routes)

Revision ID: slg_20260423_add_reptile_species_slug
Revises: wgt_20260422_add_weight_logs_and_feeding_ratios
Create Date: 2026-04-23

Sprint 6a — public SEO care sheets (PRD-herpetoverse-v1 §5.7 / sprint DoD
"/species/ball-python renders ... crawlable").

The `/app/species/[id]` route lives under a feature-flag-gated tree and is
reachable only when the keeper flag is on — useless for Google. We need a
parallel public route at `/species/{slug}` outside `/app`, which means the
URL has to be a stable human-readable identifier, not a UUID. That
identifier is `slug`.

Why a column (vs. slugifying on the fly)
----------------------------------------
- **Stable URLs.** A slug is the canonical ID once indexed; if we
  computed it from `common_names[0]` on every request, editing
  common_names would silently break inbound links + break sitemap
  consistency between the list and detail page.
- **DB-enforced uniqueness.** One unique index catches collisions
  (Ball Python vs. Royal Python both resolving to `royal-python`)
  instead of having route handlers do last-write-wins.
- **Editorial override.** Ops can patch the slug without touching
  common_names if SEO ever needs a rename ("ball-python-morph-guide"
  vs. "ball-python") — the PRD calls out keyword-rich URL slugs as a
  v1.5 follow-up.

Strategy
--------
1. Add `slug` nullable + plain index (no unique yet — avoids race with
   the backfill).
2. Python-backfill every existing row using `utils.slugs.slugify_unique`.
   The uniqueness predicate queries rows already assigned a slug in the
   same transaction — no duplicates slip through.
3. ALTER to NOT NULL and add the unique constraint once every row has a
   value.

Additive + backfill-safe. Downgrade drops everything in reverse.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'slg_20260423_add_reptile_species_slug'
down_revision: Union[str, None] = 'wgt_20260422_add_weight_logs_and_feeding_ratios'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Add nullable slug + plain index ─────────────────────────────
    op.add_column(
        'reptile_species',
        sa.Column('slug', sa.String(length=160), nullable=True),
    )
    # Plain index first — the unique index lands after backfill.
    op.create_index(
        'ix_reptile_species_slug',
        'reptile_species',
        ['slug'],
    )

    # ── 2. Backfill from common_names[0] → scientific_name ─────────────
    # We inline-import the util so the migration doesn't break if the
    # app package is ever restructured. The util is import-cheap.
    from app.utils.slugs import slugify_unique

    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, scientific_name, common_names "
            "FROM reptile_species "
            "ORDER BY created_at ASC"
        )
    ).fetchall()

    # Track slugs we've assigned in this migration so the uniqueness
    # predicate catches within-batch collisions too (e.g. two
    # submissions with the same first common name).
    assigned: set[str] = set()

    def is_taken(candidate: str) -> bool:
        if candidate in assigned:
            return True
        # No committed slugs exist yet on the first migration run, but
        # on a replay (alembic downgrade + re-upgrade) some rows will
        # already have values — still guard against them.
        existing = conn.execute(
            sa.text(
                "SELECT 1 FROM reptile_species WHERE slug = :slug LIMIT 1"
            ),
            {"slug": candidate},
        ).first()
        return existing is not None

    for row in rows:
        species_id = row[0]
        scientific_name = row[1]
        common_names = list(row[2] or [])
        # Prefer common_names[0] — that's what humans search. Fall back
        # to scientific_name when there are no common names populated.
        source = (common_names[0] if common_names else None) or scientific_name or ""
        slug_value = slugify_unique(
            source,
            is_taken=is_taken,
            fallback=f"species-{str(species_id)[:8]}",
        )
        assigned.add(slug_value)
        conn.execute(
            sa.text("UPDATE reptile_species SET slug = :slug WHERE id = :id"),
            {"slug": slug_value, "id": species_id},
        )

    # ── 3. Tighten: NOT NULL + unique ─────────────────────────────────
    op.alter_column(
        'reptile_species',
        'slug',
        existing_type=sa.String(length=160),
        nullable=False,
    )
    # Drop the plain index and replace with a unique one. Doing this in
    # two steps keeps the index name predictable.
    op.drop_index('ix_reptile_species_slug', table_name='reptile_species')
    op.create_index(
        'ix_reptile_species_slug',
        'reptile_species',
        ['slug'],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index('ix_reptile_species_slug', table_name='reptile_species')
    op.drop_column('reptile_species', 'slug')
