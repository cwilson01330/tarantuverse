"""Share cards: allow colony, shed and weigh-in card links.

Revision ID: shk_20261007_share_card_kinds
Revises: hloc_20261007_animal_location
Create Date: 2026-10-07

card_links.kind was CHECKed to ('molt', 'profile') by shc_20260930. Three new
card kinds can now be shared as a link:

  * 'colony' (Tarantuverse) -- card_links.animal_id then holds the COLONY id.
    The column has no FK on purpose (animals already live in two tables), and
    the read path tells the tables apart by kind, so no new column is needed.
  * 'shed', 'weight' (Herpetoverse) -- one shed log / one weigh-in; animal_id
    stays the animal's id, as for a molt card.

Kept in lockstep with services/share_card.py::CARD_KINDS and
schemas/share_card.py::KIND_PATTERN.

Downgrade: the old CHECK can't hold rows of the new kinds, so they are deleted
first. A card link is a frozen snapshot that can be re-made, but deleting one
does take a shared link down -- run the downgrade only if you mean that.
"""
from alembic import op


revision = 'shk_20261007_share_card_kinds'
down_revision = 'hloc_20261007_animal_location'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint('card_links_kind_check', 'card_links', type_='check')
    op.create_check_constraint(
        'card_links_kind_check',
        'card_links',
        "kind IN ('molt', 'profile', 'colony', 'shed', 'weight')",
    )


def downgrade() -> None:
    op.execute("DELETE FROM card_links WHERE kind IN ('colony', 'shed', 'weight')")
    op.drop_constraint('card_links_kind_check', 'card_links', type_='check')
    op.create_check_constraint(
        'card_links_kind_check',
        'card_links',
        "kind IN ('molt', 'profile')",
    )
