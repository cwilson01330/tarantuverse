"""Per-taxon care-sheet fields for the taxa that never got any.

Revision ID: spx_20260922_taxon_care
Revises: ach_20260922_cross_taxon
Create Date: 2026-09-22

WHY
---
`invert_species` has real depth for three taxa — tarantula (urticating hairs,
webbing), scorpion and centipede (venom severity, developmental class,
segment/leg counts). The eight taxa added since ADR-006 gained exactly one
field between them, `feeding_mode`.

That left their care sheets unable to state the things that actually matter:

  - a MILLIPEDE has no venom and can still give you a chemical burn —
    benzoquinones stain skin brown for days and hurt badly in the eyes.
    `venom_severity` is the wrong frame, so there was nowhere to say it.
  - a VINEGAROON sprays concentrated acetic acid. Same problem.
  - a ROACH is harmless and will still empty itself across the room. Whether
    it flies, and whether it climbs smooth surfaces, IS the husbandry
    question — it decides whether you need a locking lid or a barrier.
  - a MANTIS is L1–L7, a SCORPION is 2i–7i, an ISOPOD has no stages a keeper
    tracks. All three were forced into sling/juvenile/adult, which is
    tarantula vocabulary that fits three of eleven taxa.
  - ISOPODS and MILLIPEDES die without supplemental calcium and without a
    moisture gradient. Those are the two commonest ways a beginner loses a
    culture, and neither had a home in the schema.

All columns are NULLABLE with no server default. Nothing is backfilled and
nothing is inferred: an empty field means "not recorded", which is honest,
where a default `false` would assert that a species does NOT fly on no
evidence at all. Care sheets render a field only when it's set.
"""
from alembic import op
import sqlalchemy as sa


revision = 'spx_20260922_taxon_care'
down_revision = 'ach_20260922_cross_taxon'
branch_labels = None
depends_on = None


NEW_COLUMNS = [
    # Safety for the non-venomous taxa
    ('defensive_secretion', sa.String(30)),
    ('defensive_secretion_notes', sa.Text()),
    ('can_fly', sa.Boolean()),
    ('can_climb_smooth', sa.Boolean()),
    # Growth staging
    ('stage_scheme', sa.String(20)),
    ('typical_instars_to_maturity', sa.Integer()),
    # Detritivore husbandry
    ('supplemental_calcium_required', sa.Boolean()),
    ('moisture_gradient_required', sa.Boolean()),
    ('bioactive_suitable', sa.Boolean()),
]

NEW_CHECKS = [
    (
        'invert_species_defensive_secretion_check',
        "defensive_secretion IS NULL OR defensive_secretion IN "
        "('none', 'benzoquinone', 'acetic_acid', 'hydrogen_cyanide', 'other')",
    ),
    (
        'invert_species_stage_scheme_check',
        "stage_scheme IS NULL OR stage_scheme IN "
        "('sling_juvenile_adult', 'instar', 'none')",
    ),
    (
        'invert_species_instars_range_check',
        "typical_instars_to_maturity IS NULL OR "
        "typical_instars_to_maturity BETWEEN 1 AND 40",
    ),
]


def upgrade():
    for name, type_ in NEW_COLUMNS:
        op.add_column('invert_species', sa.Column(name, type_, nullable=True))
    for name, condition in NEW_CHECKS:
        op.create_check_constraint(name, 'invert_species', condition)


def downgrade():
    for name, _ in NEW_CHECKS:
        op.drop_constraint(name, 'invert_species', type_='check')
    for name, _ in reversed(NEW_COLUMNS):
        op.drop_column('invert_species', name)
