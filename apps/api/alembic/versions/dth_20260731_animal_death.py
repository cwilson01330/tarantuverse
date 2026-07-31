"""An animal can die without being deleted.

Revision ID: dth_20260731_animal_death
Revises: csc_20260731_colony_substrate
Create Date: 2026-07-31

ADR-015. Before this, a keeper whose animal died had two options: hard-delete
it — destroying every feeding, molt, photo, and for a breeding female her
pairings, egg sacs and all offspring records beneath them — or leave it in the
collection pretending it was alive, where Feeding Day would nag them to feed it,
redder every week, forever.

Worse, `active_inverts_query` counts only on `transferred_out_at`, so a
dead-but-retained animal counted fully against the free-tier cap. A keeper at
their limit had to erase an animal's history to make room for another. That's
the defect this migration exists to fix.

SHAPE
-----
Deliberately modelled on `transferred_out_at`, which already proves the pattern
across all four frontends: one nullable column flips a record to read-only
history that keeps every log, drops out of counts and reminders, and gets a
badge plus an archive view. Death needs the same structure with different words,
not a new invention. A separate column because a "Transferred" badge on an
animal that died would be worse than no feature at all.

  died_at       Date  — the DATE, not a timestamp. Keepers know the day, rarely
                        the hour; a spurious 03:00 would be false precision.
  death_cause   40    — controlled vocabulary, all optional. 'unknown' is a
                        first-class answer, not a null: most invertebrate deaths
                        are genuinely unexplained and a keeper who doesn't know
                        should be able to say so rather than leave a blank that
                        reads as an omission.
  death_notes   Text  — free text, often the most valuable of the three.

Indexed on died_at because every collection list, feeding-status query and cap
count now filters on it.

NO BACKFILL, and no default. Every existing row gets NULL, meaning alive. We
have no way to know which historical animals died — a keeper who deleted one is
unrecoverable, and one who left it in their collection looks identical to one
whose animal is fine. Guessing would be inventing bereavements.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'dth_20260731_animal_death'
down_revision: Union[str, None] = 'csc_20260731_colony_substrate'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Both products get the columns. TV inverts and HV animals are separate tables
# by design (ADR-003 / ADR-005) but the lifecycle question is identical.
#
# `tarantulas` and `scorpions` get them too. Those legacy tables still back live
# read paths (GET /tarantulas/ among others) because the ADR-005 read cutover
# hasn't happened, and the reverse mirror only copies fields the legacy row
# actually has. Without these columns a keeper could mark an animal died and
# still see it alive on the legacy surface — the dual-write invariant has to
# hold for death like it does for every other shared field. They go away with
# the legacy tables at ADR-005 Phase D.
TABLES = ("inverts", "animals", "tarantulas", "scorpions")


def upgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column("died_at", sa.Date(), nullable=True))
        op.add_column(table, sa.Column("death_cause", sa.String(40), nullable=True))
        op.add_column(table, sa.Column("death_notes", sa.Text(), nullable=True))
        op.create_index(f"ix_{table}_died_at", table, ["died_at"])

    # Deliberately NOT a CHECK constraint on death_cause.
    #
    # The vocabulary will change — 'dks' is tarantula-specific, HV will want
    # different terms, and we'd rather add a cause than ship a migration to
    # widen an enum every time a keeper describes something we didn't
    # anticipate. The API validates against the list; the database stays
    # permissive so an unexpected value degrades to "shown verbatim" rather
    # than a 500 on write. Same reasoning as colony_events.event_type.


def downgrade() -> None:
    for table in TABLES:
        op.drop_index(f"ix_{table}_died_at", table_name=table)
        op.drop_column(table, "death_notes")
        op.drop_column(table, "death_cause")
        op.drop_column(table, "died_at")
