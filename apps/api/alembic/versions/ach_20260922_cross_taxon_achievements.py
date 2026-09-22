"""De-tarantula the achievement copy.

Revision ID: ach_20260922_cross_taxon
Revises: iso_20260920_add_isopod_taxon
Create Date: 2026-09-22

The achievement SERVICE now counts every taxon (see
`app/services/achievement_service.py`). This migration fixes the half that
lives in data: five collection badges whose wording still promises tarantulas,
and one whose name — "The Arachnid Tycoon" — excludes mantids, isopods,
millipedes, roaches and centipedes, which between them are most of the taxa
the platform now supports.

The feeding and molt badges are already taxon-neutral ("Logged your first
feeding"), so they aren't touched.

Copy only. No keys change: `first_tarantula` stays `first_tarantula`, because
it is a foreign-key-ish identifier referenced from `user_achievements` and
from the service's dispatch table. Renaming it would orphan every badge
already earned to buy nothing.
"""
from alembic import op
import sqlalchemy as sa


revision = 'ach_20260922_cross_taxon'
down_revision = 'iso_20260920_add_isopod_taxon'
branch_labels = None
depends_on = None


# key -> (new name or None to leave it, new description)
NEW_COPY = {
    'first_tarantula': (None, 'Added your first animal to your collection'),
    'collector_5': (None, 'Added 5 animals to your collection'),
    'collector_10': (None, 'Added 10 animals to your collection'),
    'collector_25': (None, 'Added 25 animals to your collection'),
    'collector_50': ('The Invertebrate Tycoon', 'Added 50 animals to your collection'),
}

OLD_COPY = {
    'first_tarantula': (None, 'Added your first tarantula to your collection'),
    'collector_5': (None, 'Added 5 tarantulas to your collection'),
    'collector_10': (None, 'Added 10 tarantulas to your collection'),
    'collector_25': (None, 'Added 25 tarantulas to your collection'),
    'collector_50': ('The Arachnid Tycoon', 'Added 50 tarantulas to your collection'),
}


def _apply(copy_map):
    conn = op.get_bind()
    for key, (name, description) in copy_map.items():
        if name is None:
            conn.execute(
                sa.text(
                    "UPDATE achievement_definitions SET description = :d WHERE key = :k"
                ),
                {"d": description, "k": key},
            )
        else:
            conn.execute(
                sa.text(
                    "UPDATE achievement_definitions "
                    "SET name = :n, description = :d WHERE key = :k"
                ),
                {"n": name, "d": description, "k": key},
            )


def upgrade():
    _apply(NEW_COPY)


def downgrade():
    _apply(OLD_COPY)
