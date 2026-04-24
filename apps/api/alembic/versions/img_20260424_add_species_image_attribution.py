"""add image_attribution to species

Adds a nullable TEXT column so we can store credit for each care-sheet
photo. Expected format is a short human-readable line, e.g.:

    "Photo: Jane Doe (CC BY-SA 4.0) via Wikimedia Commons"

The care sheet renders this verbatim under the image so we comply with
CC-BY and CC-BY-SA attribution requirements. PD / CC0 images get a
terser line ("Photo: public domain via Wikimedia Commons").

Nullable + no default, so it's safe to ship ahead of populating any
rows. Downgrade drops the column.

Revision ID: img_20260424_add_species_image_attribution
Revises: vis_20260424_backfill_public_visibility
Create Date: 2026-04-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'img_20260424_add_species_image_attribution'
down_revision: Union[str, None] = 'vis_20260424_backfill_public_visibility'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'species',
        sa.Column('image_attribution', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('species', 'image_attribution')
