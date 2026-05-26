"""Scorpion expansion — tables + polymorphic FK extensions

Revision ID: scp_20260522_add_scorpions
Revises: cgd_20260522_add_feeds_on_cgd
Create Date: 2026-05-22

Phase 1a of the scorpion expansion (see docs/design/PLAN-scorpion-v1.md).
Adds the four scorpion-shaped tables and extends the polymorphic log /
asset tables with a nullable `scorpion_id` FK + updated CHECK so each
row still has exactly one parent.

Tables created
--------------

  scorpion_species  — catalog. Mirrors `species` shape but
                      scorpion-specific (venom severity tier, total
                      length not leg span, communal_suitable flag).
  scorpions         — per-animal record. Mirrors `tarantulas` plus
                      scorpion-specific fields (current_instar,
                      current_length_mm, colony_id).
  scorpion_colonies — first-class colony entity. A scorpion may
                      belong to zero or one colony via
                      `scorpions.colony_id`. Logs stay per-scorpion;
                      the colony is a grouping layer, not a
                      polymorphic log parent. The frontend's "log
                      feeding across colony" bulk action will fire
                      one feeding row per member.
  broods            — scorpion analogue of egg_sacs. Viviparous;
                      tracks the litter the mother carries on her
                      back. Father is nullable for parthenogenetic
                      species (Hottentotta, Tityus). pairing_id
                      stays null until Phase 5 wires the breeding
                      router.

Polymorphic FK extensions
-------------------------

Five tables get a nullable `scorpion_id` column and an updated CHECK
constraint:

  feeding_logs        was (tarantula_id, enclosure_id, animal_id)
                      becomes (… + scorpion_id), exactly-one parent
  molt_logs           was (tarantula_id, enclosure_id)
                      becomes (… + scorpion_id), at-least-one parent
  substrate_changes   same as molt_logs
  photos              was (tarantula_id, animal_id)
                      becomes (… + scorpion_id), exactly-one parent
  qr_upload_sessions  same as photos

`pairings` and `offspring` are NOT extended in v1 — the existing
schema is hardcoded NOT NULL to `tarantulas`, and Herpetoverse's
pattern was to add SEPARATE breeding tables per taxon
(`reptile_pairings`). Phase 5 follows the same playbook and creates
`scorpion_pairings` + `scorpion_offspring` rather than polymorphizing
the existing tables.

Safety notes
------------

* Tarantula rows and FKs are untouched. No data migration on
  existing tables — only column adds and CHECK swaps.
* Every new FK uses `ON DELETE CASCADE` to mirror tarantula behavior:
  delete a scorpion, its logs/photos go too.
* venom_severity / care_level / brood-related categorical values are
  plain VARCHAR with CHECK constraints rather than Postgres ENUMs —
  the enum-double-create gotcha bit prior migrations and the value
  set is small enough that VARCHAR + CHECK is the safer call.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'scp_20260522_add_scorpions'
down_revision: Union[str, None] = 'cgd_20260522_add_feeds_on_cgd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---------------------------------------------------------------
    # 1. scorpion_species
    # ---------------------------------------------------------------
    op.create_table(
        'scorpion_species',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('scientific_name', sa.String(255), nullable=False),
        sa.Column('scientific_name_lower', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(160), nullable=False),
        sa.Column('common_names', postgresql.ARRAY(sa.String()), server_default='{}'),
        sa.Column('genus', sa.String(100)),
        sa.Column('family', sa.String(100)),
        sa.Column('order_name', sa.String(100)),

        # Care profile
        sa.Column('care_level', sa.String(20), server_default='beginner'),
        sa.Column('temperament', sa.String(100)),
        sa.Column('native_region', sa.String(200)),
        sa.Column('adult_size', sa.String(50)),
        sa.Column('adult_length_min_mm', sa.Numeric(6, 2)),
        sa.Column('adult_length_max_mm', sa.Numeric(6, 2)),
        sa.Column('growth_rate', sa.String(50)),
        sa.Column('type', sa.String(50)),  # terrestrial / scansorial / fossorial / psammophile

        # Climate
        sa.Column('temperature_min', sa.Integer),
        sa.Column('temperature_max', sa.Integer),
        sa.Column('humidity_min', sa.Integer),
        sa.Column('humidity_max', sa.Integer),

        # Enclosure
        sa.Column('enclosure_size_juvenile', sa.String(100)),
        sa.Column('enclosure_size_adult', sa.String(100)),
        sa.Column('substrate_depth', sa.String(100)),
        sa.Column('substrate_type', sa.String(200)),

        # Feeding
        sa.Column('prey_size', sa.String(200)),
        sa.Column('feeding_frequency_juvenile', sa.String(100)),
        sa.Column('feeding_frequency_adult', sa.String(100)),

        # Behavior
        sa.Column('water_dish_required', sa.Boolean, server_default=sa.false()),
        sa.Column('burrowing', sa.String(50)),  # none / light / heavy
        sa.Column('communal_suitable', sa.Boolean, server_default=sa.false()),

        # SAFETY — venom_severity is THE key field for scorpions.
        # 'mild' for most species; 'medically_significant' for
        # Centruroides sculpturatus, Androctonus, Leiurus, Tityus etc.
        sa.Column('venom_severity', sa.String(30), nullable=False, server_default='mild'),
        sa.Column('venom_notes', sa.Text),

        # Documentation
        sa.Column('care_guide', sa.Text),
        sa.Column('image_url', sa.String(500)),

        # Community
        sa.Column('is_verified', sa.Boolean, server_default=sa.false()),
        sa.Column('submitted_by', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('community_rating', sa.Numeric(3, 2)),
        sa.Column('times_kept', sa.Integer, server_default='0'),

        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),

        sa.UniqueConstraint('scientific_name', name='uq_scorpion_species_scientific_name'),
        sa.UniqueConstraint('scientific_name_lower', name='uq_scorpion_species_scientific_name_lower'),
        sa.UniqueConstraint('slug', name='uq_scorpion_species_slug'),
        sa.CheckConstraint(
            "care_level IN ('beginner', 'intermediate', 'advanced')",
            name='scorpion_species_care_level_check',
        ),
        sa.CheckConstraint(
            "venom_severity IN ('mild', 'moderate', 'medically_significant')",
            name='scorpion_species_venom_severity_check',
        ),
    )
    op.create_index('ix_scorpion_species_scientific_name',
                    'scorpion_species', ['scientific_name'])
    op.create_index('ix_scorpion_species_scientific_name_lower',
                    'scorpion_species', ['scientific_name_lower'])
    op.create_index('ix_scorpion_species_slug', 'scorpion_species', ['slug'])
    op.create_index('ix_scorpion_species_genus', 'scorpion_species', ['genus'])

    # ---------------------------------------------------------------
    # 2. scorpion_colonies (created before scorpions so the colony_id
    # FK on scorpions resolves cleanly)
    # ---------------------------------------------------------------
    op.create_table(
        'scorpion_colonies',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('enclosure_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('enclosures.id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('notes', sa.Text),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # ---------------------------------------------------------------
    # 3. scorpions
    # ---------------------------------------------------------------
    op.create_table(
        'scorpions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('species_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('scorpion_species.id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('enclosure_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('enclosures.id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('colony_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('scorpion_colonies.id', ondelete='SET NULL'),
                  nullable=True, index=True),

        # Identity. Reuse the shared Sex / Source enums (UPPERCASE in
        # prod per the shared-DB-enum casing memory) so we don't
        # create new enum types.
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

        # Scorpion-specific growth tracking
        sa.Column('current_instar', sa.Integer),
        sa.Column('current_length_mm', sa.Numeric(6, 2)),

        # Husbandry — mirrors tarantulas. enclosure_type stays VARCHAR
        # here rather than re-using the existing enum to avoid an
        # alembic ENUM round-trip; the schema layer validates values.
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

        # Feeding pause (mirrors tarantula).
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
    )

    # ---------------------------------------------------------------
    # 4. broods (scorpion analogue of egg_sacs; viviparous — tracks
    # the litter the mother carries on her back)
    # ---------------------------------------------------------------
    op.create_table(
        'broods',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('mother_scorpion_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('scorpions.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        # NULL for parthenogenetic species (Hottentotta hottentotta,
        # Tityus serrulatus, etc.). The breeding UI surfaces a hint
        # when the mother's species supports parthenogenesis.
        sa.Column('father_scorpion_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('scorpions.id', ondelete='SET NULL'),
                  nullable=True),
        # Reserved for Phase 5 — scorpion_pairings table doesn't
        # exist yet. Phase 5 adds a FK constraint here.
        sa.Column('pairing_id', postgresql.UUID(as_uuid=True), nullable=True),

        sa.Column('date_born', sa.Date, nullable=False),
        sa.Column('count', sa.Integer),
        sa.Column('notes', sa.Text),

        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # ---------------------------------------------------------------
    # 5. Polymorphic FK extensions on shared log/asset tables.
    # Each one: add scorpion_id, drop old CHECK, recreate CHECK
    # including the new column.
    # ---------------------------------------------------------------

    # feeding_logs: exactly-one parent across 4 columns
    op.add_column(
        'feeding_logs',
        sa.Column('scorpion_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('scorpions.id', ondelete='CASCADE'),
                  nullable=True, index=True),
    )
    op.drop_constraint(
        'feeding_logs_must_have_exactly_one_parent',
        'feeding_logs', type_='check',
    )
    op.create_check_constraint(
        'feeding_logs_must_have_exactly_one_parent',
        'feeding_logs',
        'num_nonnulls(tarantula_id, enclosure_id, animal_id, scorpion_id) = 1',
    )

    # molt_logs: at-least-one parent. Existing check uses an
    # IS NOT NULL OR style — drop and recreate including scorpion_id.
    # NB: constraint name in prod is the singular `molt_log_must_have_parent`
    # (from s0t1u2v3w4x5_add_enclosures.py) — it was never renamed when
    # other tables moved to the `<table>_must_have_exactly_one_parent` form.
    op.add_column(
        'molt_logs',
        sa.Column('scorpion_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('scorpions.id', ondelete='CASCADE'),
                  nullable=True, index=True),
    )
    _swap_at_least_one_check(
        'molt_logs',
        'molt_log_must_have_parent',
        ['tarantula_id', 'enclosure_id', 'scorpion_id'],
    )

    # substrate_changes: same pattern as molt_logs. Constraint name in
    # prod is the singular `substrate_change_must_have_parent`.
    op.add_column(
        'substrate_changes',
        sa.Column('scorpion_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('scorpions.id', ondelete='CASCADE'),
                  nullable=True, index=True),
    )
    _swap_at_least_one_check(
        'substrate_changes',
        'substrate_change_must_have_parent',
        ['tarantula_id', 'enclosure_id', 'scorpion_id'],
    )

    # photos: exactly-one parent
    op.add_column(
        'photos',
        sa.Column('scorpion_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('scorpions.id', ondelete='CASCADE'),
                  nullable=True, index=True),
    )
    op.drop_constraint(
        'photos_must_have_exactly_one_parent',
        'photos', type_='check',
    )
    op.create_check_constraint(
        'photos_must_have_exactly_one_parent',
        'photos',
        'num_nonnulls(tarantula_id, animal_id, scorpion_id) = 1',
    )

    # qr_upload_sessions: exactly-one parent
    op.add_column(
        'qr_upload_sessions',
        sa.Column('scorpion_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('scorpions.id', ondelete='CASCADE'),
                  nullable=True, index=True),
    )
    op.drop_constraint(
        'qr_upload_sessions_must_have_exactly_one_parent',
        'qr_upload_sessions', type_='check',
    )
    op.create_check_constraint(
        'qr_upload_sessions_must_have_exactly_one_parent',
        'qr_upload_sessions',
        'num_nonnulls(tarantula_id, animal_id, scorpion_id) = 1',
    )


def _swap_at_least_one_check(table: str, constraint_name: str, columns: list[str]) -> None:
    """Drop the existing 'must have a parent' CHECK on `table` (whose
    real prod name we have to pass in — see s0t1u2v3w4x5 for the
    canonical singular names) and recreate it requiring at least one
    of `columns` to be NOT NULL."""
    op.drop_constraint(constraint_name, table, type_='check')
    or_clause = ' OR '.join(f'{c} IS NOT NULL' for c in columns)
    op.create_check_constraint(constraint_name, table, or_clause)


def downgrade() -> None:
    # Reverse the polymorphic extensions first so the FK targets
    # (scorpions table) can be dropped cleanly.

    # qr_upload_sessions
    op.drop_constraint(
        'qr_upload_sessions_must_have_exactly_one_parent',
        'qr_upload_sessions', type_='check',
    )
    op.create_check_constraint(
        'qr_upload_sessions_must_have_exactly_one_parent',
        'qr_upload_sessions',
        'num_nonnulls(tarantula_id, animal_id) = 1',
    )
    op.drop_column('qr_upload_sessions', 'scorpion_id')

    # photos
    op.drop_constraint(
        'photos_must_have_exactly_one_parent',
        'photos', type_='check',
    )
    op.create_check_constraint(
        'photos_must_have_exactly_one_parent',
        'photos',
        'num_nonnulls(tarantula_id, animal_id) = 1',
    )
    op.drop_column('photos', 'scorpion_id')

    # substrate_changes (constraint name is the singular form from
    # s0t1u2v3w4x5_add_enclosures.py)
    op.drop_constraint(
        'substrate_change_must_have_parent',
        'substrate_changes', type_='check',
    )
    op.create_check_constraint(
        'substrate_change_must_have_parent',
        'substrate_changes',
        'tarantula_id IS NOT NULL OR enclosure_id IS NOT NULL',
    )
    op.drop_column('substrate_changes', 'scorpion_id')

    # molt_logs (also singular)
    op.drop_constraint(
        'molt_log_must_have_parent',
        'molt_logs', type_='check',
    )
    op.create_check_constraint(
        'molt_log_must_have_parent',
        'molt_logs',
        'tarantula_id IS NOT NULL OR enclosure_id IS NOT NULL',
    )
    op.drop_column('molt_logs', 'scorpion_id')

    # feeding_logs
    op.drop_constraint(
        'feeding_logs_must_have_exactly_one_parent',
        'feeding_logs', type_='check',
    )
    op.create_check_constraint(
        'feeding_logs_must_have_exactly_one_parent',
        'feeding_logs',
        'num_nonnulls(tarantula_id, enclosure_id, animal_id) = 1',
    )
    op.drop_column('feeding_logs', 'scorpion_id')

    # Drop scorpion tables in reverse-dependency order.
    op.drop_table('broods')
    op.drop_table('scorpions')
    op.drop_table('scorpion_colonies')
    op.drop_index('ix_scorpion_species_genus', table_name='scorpion_species')
    op.drop_index('ix_scorpion_species_slug', table_name='scorpion_species')
    op.drop_index('ix_scorpion_species_scientific_name_lower', table_name='scorpion_species')
    op.drop_index('ix_scorpion_species_scientific_name', table_name='scorpion_species')
    op.drop_table('scorpion_species')
