"""Inverts consolidation v1 — Bundle A1

Revision ID: inv_20260527_inverts_consolidation_v1
Revises: scp_20260522_add_scorpions
Create Date: 2026-05-27

Phase A1 of ADR-005 (`docs/design/ADR-005-inverts-consolidation.md`) and
`docs/design/PLAN-inverts-consolidation-v1.md`. Purely ADDITIVE — creates
new tables and adds a nullable companion column to the polymorphic log
tables. Doesn't touch any existing CHECK constraint, doesn't drop or
rename anything. The new tables start empty; dual-write lands in A2 and
backfill in B.

What this migration creates
----------------------------

  invert_species   — unified catalog. Replaces `species` (tarantulas)
                     + `scorpion_species` (scorpions) once Phase D
                     drops them. Holds centipede species seeded in C2.
  inverts          — unified per-animal table. Replaces `tarantulas`
                     + `scorpions` once Phase D drops them.

What this migration adds to existing tables
-------------------------------------------

  feeding_logs.invert_id        — nullable UUID FK → inverts.id
  molt_logs.invert_id           — nullable UUID FK → inverts.id
  substrate_changes.invert_id   — nullable UUID FK → inverts.id
  photos.invert_id              — nullable UUID FK → inverts.id
  qr_upload_sessions.invert_id  — nullable UUID FK → inverts.id

Each gets an index for the future "list by parent" queries that switch
over in Phase C1.

What this migration does NOT do
-------------------------------

* Does NOT update any CHECK constraints. `invert_id` is a companion /
  denormalization column in A1; it doesn't change the "exactly one
  parent" or "at least one parent" semantics. The CHECKs still count
  only the legacy parent columns. When Phase D drops the legacy
  columns, the CHECKs get rewritten to require `invert_id`.
* Does NOT introduce any data dependency. The new tables are empty and
  the new column is nullable everywhere; no existing INSERT or SELECT
  needs to change.
* Does NOT use a Postgres ENUM for the taxon discriminator — VARCHAR +
  CHECK per the enum-double-create memory. The HV team's `animals`
  table did use a PG enum and we honored it, but new schemas should
  follow the safer pattern.

Safety
------

Fully reversible via downgrade(). The downgrade drops the new column
on every polymorphic table, then drops `inverts` (FK source) and
`invert_species`. No legacy data is touched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'inv_20260527_inverts_consolidation_v1'
down_revision: Union[str, None] = 'scp_20260522_add_scorpions'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Allowed taxon values. Mirrored in the Pydantic schemas and the SQLAlchemy
# model. Keeping the list narrow now — centipede is the only NEW value vs
# the legacy tables; new taxa (mantises, etc.) get added in a future
# additive migration that simply widens the CHECK.
# ---------------------------------------------------------------------------
TAXON_VALUES = ('tarantula', 'scorpion', 'centipede')
TAXON_CHECK = (
    "taxon IN ('"
    + "', '".join(TAXON_VALUES)
    + "')"
)


def upgrade() -> None:
    # ---------------------------------------------------------------
    # 1. invert_species — unified species catalog
    # ---------------------------------------------------------------
    op.create_table(
        'invert_species',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),

        # Taxon discriminator. VARCHAR + CHECK, not a PG enum.
        sa.Column('taxon', sa.String(20), nullable=False),

        # Identity
        sa.Column('scientific_name', sa.String(255), nullable=False),
        sa.Column('scientific_name_lower', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(160), nullable=False),
        sa.Column('common_names', postgresql.ARRAY(sa.String()), server_default='{}'),
        sa.Column('genus', sa.String(100)),
        sa.Column('family', sa.String(100)),
        # Scientific order — `Araneae` for tarantulas, `Scorpiones` for
        # scorpions, `Scolopendromorpha` / `Geophilomorpha` / etc. for
        # centipedes. Useful for future cross-taxon filters.
        sa.Column('order_name', sa.String(100)),

        # Care profile — shared across taxa
        sa.Column('care_level', sa.String(20), server_default='beginner'),
        sa.Column('temperament', sa.String(100)),
        sa.Column('native_region', sa.String(200)),
        sa.Column('adult_size', sa.String(50)),
        sa.Column('adult_length_min_mm', sa.Numeric(6, 2)),
        sa.Column('adult_length_max_mm', sa.Numeric(6, 2)),
        sa.Column('growth_rate', sa.String(50)),
        # 'terrestrial' / 'arboreal' / 'fossorial' / 'scansorial' / 'psammophile'
        sa.Column('type', sa.String(50)),

        # Climate
        sa.Column('temperature_min', sa.Integer),
        sa.Column('temperature_max', sa.Integer),
        sa.Column('humidity_min', sa.Integer),
        sa.Column('humidity_max', sa.Integer),

        # Enclosure
        sa.Column('enclosure_size_sling', sa.String(100)),
        sa.Column('enclosure_size_juvenile', sa.String(100)),
        sa.Column('enclosure_size_adult', sa.String(100)),
        sa.Column('substrate_depth', sa.String(100)),
        sa.Column('substrate_type', sa.String(200)),

        # Feeding
        sa.Column('prey_size', sa.String(200)),
        sa.Column('feeding_frequency_sling', sa.String(100)),
        sa.Column('feeding_frequency_juvenile', sa.String(100)),
        sa.Column('feeding_frequency_adult', sa.String(100)),

        # Behavior
        sa.Column('water_dish_required', sa.Boolean, server_default=sa.false()),
        sa.Column('webbing_amount', sa.String(50)),  # tarantula
        sa.Column('burrowing', sa.String(50)),  # all
        sa.Column('communal_suitable', sa.Boolean, server_default=sa.false()),  # mostly scorpion

        # SAFETY — taxon-specific. Wide nullable columns; cheaper than
        # JSONB given the small field count and the indexes / CHECKs we'll
        # want later.
        sa.Column('urticating_hairs', sa.Boolean, server_default=sa.false()),  # tarantula
        sa.Column('medically_significant_venom', sa.Boolean, server_default=sa.false()),  # tarantula
        sa.Column('venom_severity', sa.String(30)),  # scorpion + centipede (mild|moderate|medically_significant)
        sa.Column('venom_notes', sa.Text),  # scorpion + centipede

        # Centipede-specific
        # Scolopendra and other Scolopendromorpha hatch with their full
        # adult segment count (epimorphic); Geophilomorpha and
        # Lithobiomorpha add segments with each molt (anamorphic). The
        # care UX surfaces a distinct callout for each developmental
        # class, so we capture it here.
        sa.Column('developmental_class', sa.String(20)),  # anamorphic | epimorphic
        sa.Column('typical_segment_count', sa.Integer),
        sa.Column('typical_leg_pair_count', sa.Integer),

        # Documentation
        sa.Column('care_guide', sa.Text),
        sa.Column('image_url', sa.String(500)),
        sa.Column('image_attribution', sa.Text),
        sa.Column('source_url', sa.String(500)),

        # Community
        sa.Column('is_verified', sa.Boolean, server_default=sa.false()),
        sa.Column('submitted_by', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('community_rating', sa.Numeric(3, 2)),
        sa.Column('times_kept', sa.Integer, server_default='0'),

        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),

        sa.UniqueConstraint('scientific_name', name='uq_invert_species_scientific_name'),
        sa.UniqueConstraint('scientific_name_lower', name='uq_invert_species_scientific_name_lower'),
        sa.UniqueConstraint('slug', name='uq_invert_species_slug'),
        sa.CheckConstraint(TAXON_CHECK, name='invert_species_taxon_check'),
        sa.CheckConstraint(
            "care_level IN ('beginner', 'intermediate', 'advanced')",
            name='invert_species_care_level_check',
        ),
        sa.CheckConstraint(
            "venom_severity IS NULL OR "
            "venom_severity IN ('mild', 'moderate', 'medically_significant')",
            name='invert_species_venom_severity_check',
        ),
        sa.CheckConstraint(
            "developmental_class IS NULL OR "
            "developmental_class IN ('anamorphic', 'epimorphic')",
            name='invert_species_developmental_class_check',
        ),
    )
    op.create_index('ix_invert_species_taxon', 'invert_species', ['taxon'])
    op.create_index('ix_invert_species_scientific_name', 'invert_species', ['scientific_name'])
    op.create_index('ix_invert_species_scientific_name_lower', 'invert_species', ['scientific_name_lower'])
    op.create_index('ix_invert_species_slug', 'invert_species', ['slug'])
    op.create_index('ix_invert_species_genus', 'invert_species', ['genus'])

    # ---------------------------------------------------------------
    # 2. inverts — unified per-animal table
    # ---------------------------------------------------------------
    op.create_table(
        'inverts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'),
                  nullable=False, index=True),

        # Taxon discriminator
        sa.Column('taxon', sa.String(20), nullable=False),

        sa.Column('species_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('invert_species.id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('enclosure_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('enclosures.id', ondelete='SET NULL'),
                  nullable=True),
        # Scorpion colony FK kept here so the consolidation doesn't break
        # existing colony memberships. Centipedes are solitary; tarantulas
        # don't use colonies. Future: rename to a generic group table.
        sa.Column('colony_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('scorpion_colonies.id', ondelete='SET NULL'),
                  nullable=True, index=True),

        # Identity. Reuse the shared sex / source PG enums (UPPERCASE in
        # prod per the shared-DB-enum-casing memory).
        sa.Column('name', sa.String(100)),
        sa.Column('common_name', sa.String(100)),
        sa.Column('scientific_name', sa.String(255)),
        sa.Column(
            'sex',
            postgresql.ENUM(
                'MALE', 'FEMALE', 'UNKNOWN',
                name='sex', create_type=False,
            ),
            server_default='UNKNOWN',
        ),

        # Acquisition
        sa.Column('date_acquired', sa.Date),
        sa.Column(
            'source',
            postgresql.ENUM(
                'BRED', 'BOUGHT', 'WILD_CAUGHT',
                name='source', create_type=False,
            ),
            nullable=True,
        ),
        sa.Column('price_paid', sa.Numeric(10, 2)),

        # Tarantula life stage (sling/juvenile/adult). Nullable; only
        # populated for tarantulas.
        sa.Column('life_stage', sa.String(20)),

        # Scorpion + centipede growth tracking
        sa.Column('current_instar', sa.Integer),
        sa.Column('current_length_mm', sa.Numeric(6, 2)),

        # Centipede-only growth tracking
        sa.Column('current_segment_count', sa.Integer),
        sa.Column('current_leg_pair_count', sa.Integer),

        # Husbandry — same shape as tarantulas + scorpions had
        sa.Column('enclosure_type', sa.String(30)),
        sa.Column('enclosure_size', sa.String(50)),
        sa.Column('substrate_type', sa.String(100)),
        sa.Column('substrate_depth', sa.String(50)),
        sa.Column('last_substrate_change', sa.Date),
        sa.Column('target_temp_min', sa.Numeric(5, 2)),
        sa.Column('target_temp_max', sa.Numeric(5, 2)),
        sa.Column('target_humidity_min', sa.Numeric(5, 2)),
        sa.Column('target_humidity_max', sa.Numeric(5, 2)),
        sa.Column('water_dish', sa.Boolean, server_default=sa.true()),
        sa.Column('misting_schedule', sa.String(100)),
        sa.Column('last_enclosure_cleaning', sa.Date),
        sa.Column('enclosure_notes', sa.Text),

        # Feeding pause (mirrors tarantula + scorpion behavior)
        sa.Column('feeding_paused_reason', sa.String(40)),
        sa.Column('feeding_paused_until', sa.Date),

        # Media / privacy / notes
        sa.Column('photo_url', sa.String(500)),
        sa.Column('is_public', sa.Boolean, server_default=sa.false()),
        sa.Column('visibility', sa.String(20), server_default='private'),
        sa.Column('notes', sa.Text),

        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),

        sa.CheckConstraint(TAXON_CHECK, name='inverts_taxon_check'),
        sa.CheckConstraint(
            "life_stage IS NULL OR "
            "life_stage IN ('sling', 'juvenile', 'adult')",
            name='inverts_life_stage_check',
        ),
        sa.CheckConstraint(
            "enclosure_type IS NULL OR "
            "enclosure_type IN ('terrestrial', 'arboreal', 'fossorial')",
            name='inverts_enclosure_type_check',
        ),
        sa.CheckConstraint(
            "visibility IS NULL OR visibility IN ('private', 'public')",
            name='inverts_visibility_check',
        ),
    )
    op.create_index('ix_inverts_taxon', 'inverts', ['taxon'])
    op.create_index('ix_inverts_user_taxon', 'inverts', ['user_id', 'taxon'])

    # ---------------------------------------------------------------
    # 3. Add nullable invert_id columns + indexes to the polymorphic
    # log/asset tables. Existing CHECK constraints are deliberately
    # left untouched — invert_id is a companion column.
    # ---------------------------------------------------------------
    for table in (
        'feeding_logs',
        'molt_logs',
        'substrate_changes',
        'photos',
        'qr_upload_sessions',
    ):
        op.add_column(
            table,
            sa.Column(
                'invert_id',
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey('inverts.id', ondelete='CASCADE'),
                nullable=True,
            ),
        )
        op.create_index(f'ix_{table}_invert_id', table, ['invert_id'])


def downgrade() -> None:
    # Drop the companion columns first (so the FK target can be dropped
    # cleanly), then the new tables in reverse-dependency order.
    for table in (
        'feeding_logs',
        'molt_logs',
        'substrate_changes',
        'photos',
        'qr_upload_sessions',
    ):
        op.drop_index(f'ix_{table}_invert_id', table_name=table)
        op.drop_column(table, 'invert_id')

    op.drop_index('ix_inverts_user_taxon', table_name='inverts')
    op.drop_index('ix_inverts_taxon', table_name='inverts')
    op.drop_table('inverts')

    op.drop_index('ix_invert_species_genus', table_name='invert_species')
    op.drop_index('ix_invert_species_slug', table_name='invert_species')
    op.drop_index('ix_invert_species_scientific_name_lower', table_name='invert_species')
    op.drop_index('ix_invert_species_scientific_name', table_name='invert_species')
    op.drop_index('ix_invert_species_taxon', table_name='invert_species')
    op.drop_table('invert_species')
