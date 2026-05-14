"""Consolidate snakes/lizards/frogs into a single animals table

Revision ID: anm_20260514_consolidate_to_animals
Revises: frb_20260513_extend_breeding_for_frogs
Create Date: 2026-05-14

Implements ADR-003. Collapses the three per-taxon tables into one
`animals` table with a `taxon` discriminator, and collapses every
polymorphic `<taxon>_id` foreign key down to a single `animal_id`.

Safe because Herpetoverse is not live — the only rows are disposable
developer test animals. UUIDs are preserved through the copy
(`animals.id` == the original `snakes.id` / `lizards.id` /
`frogs.id`), which makes every backfill a `COALESCE` and keeps any
external reference valid.

Order of operations (all in one transaction — intermediate states are
never observed):

  1. Create the `animal_taxon` enum + the `animals` table.
  2. Copy snake / lizard / frog rows into `animals`, stamping `taxon`.
  3. For each of the six polymorphic tables (photos, qr_upload_sessions,
     feeding_logs, shed_logs, weight_logs, animal_genotypes): add
     `animal_id`, backfill via COALESCE, drop the old CHECK, drop the
     three per-taxon columns (FKs + indexes auto-drop with the column
     in Postgres), wire the new FK + index, install the collapsed
     CHECK / NOT NULL.
  4. Breeding: `reptile_pairings` gets male_animal_id / female_animal_id
     / taxon; `reptile_offspring` gets animal_id. Old per-taxon columns
     dropped, old CHECK constraints dropped.
  5. Drop the now-orphaned `snakes` / `lizards` / `frogs` tables.

Downgrade is intentionally NOT supported. Reconstructing three tables
from a discriminator column, re-splitting every polymorphic FK, and
rebuilding the combinatorial CHECK constraints is error-prone busywork
for a pre-launch schema nobody will roll back to. If this needs
reverting, restore from a snapshot.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'anm_20260514_consolidate_to_animals'
down_revision: Union[str, None] = 'frb_20260513_extend_breeding_for_frogs'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# The full shared column list — snakes/lizards/frogs are byte-identical
# clones, so one list covers all three source tables. `taxon` is
# stamped per source table in the copy step.
_SHARED_COLS = """
    id, user_id, reptile_species_id, enclosure_id,
    name, common_name, scientific_name,
    sex, date_acquired, hatch_date, source, source_breeder, price_paid,
    current_weight_g, current_length_in,
    feeding_schedule, last_fed_at, last_shed_at,
    brumation_active, brumation_started_at,
    feeding_paused_reason, feeding_paused_until,
    photo_url, is_public, visibility, notes,
    created_at, updated_at
"""

# The six tables that referenced snakes/lizards/frogs polymorphically.
# `extra_parents` are the other XOR columns that survive the collapse
# (tarantula_id, enclosure_id). When empty, the collapsed constraint is
# a plain NOT NULL on animal_id rather than a num_nonnulls CHECK.
_POLY_TABLES = [
    {'table': 'photos', 'extra_parents': ['tarantula_id'],
     'check': 'photos_must_have_exactly_one_parent'},
    {'table': 'qr_upload_sessions', 'extra_parents': ['tarantula_id'],
     'check': 'qr_upload_sessions_must_have_exactly_one_parent'},
    {'table': 'feeding_logs', 'extra_parents': ['tarantula_id', 'enclosure_id'],
     'check': 'feeding_logs_must_have_exactly_one_parent'},
    {'table': 'shed_logs', 'extra_parents': [],
     'check': 'shed_logs_must_have_exactly_one_parent'},
    {'table': 'weight_logs', 'extra_parents': [],
     'check': 'weight_logs_must_have_exactly_one_parent'},
    {'table': 'animal_genotypes', 'extra_parents': [],
     'check': 'animal_genotypes_must_have_exactly_one_parent'},
]


def upgrade() -> None:
    # ── 1. animal_taxon enum + animals table ──────────────────────────
    # Idempotent CREATE TYPE — see feedback_alembic_pg_enum_double_create.
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE animal_taxon AS ENUM ('snake', 'lizard', 'frog');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
        """
    )

    op.create_table(
        'animals',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            'user_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'reptile_species_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('reptile_species.id'),
            nullable=True,
        ),
        sa.Column(
            'enclosure_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('enclosures.id', ondelete='SET NULL'),
            nullable=True,
        ),
        # The discriminator. NOT NULL — every animal has a taxon.
        sa.Column(
            'taxon',
            postgresql.ENUM(
                'snake', 'lizard', 'frog',
                name='animal_taxon', create_type=False,
            ),
            nullable=False,
        ),

        # Basic identity
        sa.Column('name', sa.String(100)),
        sa.Column('common_name', sa.String(100)),
        sa.Column('scientific_name', sa.String(255)),

        # Shared DB enums
        sa.Column(
            'sex',
            postgresql.ENUM(
                'MALE', 'FEMALE', 'UNKNOWN',
                name='sex', create_type=False,
            ),
            server_default='UNKNOWN',
        ),

        # Acquisition
        sa.Column('date_acquired', sa.Date()),
        sa.Column('hatch_date', sa.Date(), nullable=True),
        sa.Column(
            'source',
            postgresql.ENUM(
                'BRED', 'BOUGHT', 'WILD_CAUGHT',
                name='source', create_type=False,
            ),
        ),
        sa.Column('source_breeder', sa.String(255)),
        sa.Column('price_paid', sa.Numeric(10, 2)),

        # Current state
        sa.Column('current_weight_g', sa.Numeric(8, 2), nullable=True),
        sa.Column('current_length_in', sa.Numeric(6, 2), nullable=True),

        # Husbandry reference
        sa.Column('feeding_schedule', sa.String(200), nullable=True),
        sa.Column('last_fed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_shed_at', sa.Date(), nullable=True),
        sa.Column('brumation_active', sa.Boolean(), server_default=sa.false()),
        sa.Column('brumation_started_at', sa.Date(), nullable=True),

        # Feeding pause
        sa.Column('feeding_paused_reason', sa.String(40), nullable=True),
        sa.Column('feeding_paused_until', sa.Date(), nullable=True),

        # Media
        sa.Column('photo_url', sa.String(500)),

        # Privacy
        sa.Column('is_public', sa.Boolean(), server_default=sa.false()),
        sa.Column('visibility', sa.String(20), server_default='private'),

        # Notes
        sa.Column('notes', sa.Text()),

        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),

        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_animals_user_id', 'animals', ['user_id'])
    op.create_index('ix_animals_reptile_species_id', 'animals', ['reptile_species_id'])
    op.create_index('ix_animals_taxon', 'animals', ['taxon'])

    # ── 2. Copy snake / lizard / frog rows into animals ───────────────
    # UUIDs preserved. taxon stamped per source table. The shared
    # column list is identical across all three source tables.
    cols = _SHARED_COLS
    for taxon, src in (('snake', 'snakes'), ('lizard', 'lizards'), ('frog', 'frogs')):
        op.execute(
            f"""
            INSERT INTO animals (taxon, {cols})
            SELECT '{taxon}'::animal_taxon, {cols}
            FROM {src};
            """
        )

    # ── 3. Collapse the six polymorphic FK tables ─────────────────────
    for spec in _POLY_TABLES:
        table = spec['table']
        extra = spec['extra_parents']

        # 3a. add animal_id (nullable for the backfill window)
        op.add_column(
            table,
            sa.Column('animal_id', postgresql.UUID(as_uuid=True), nullable=True),
        )
        # 3b. backfill from whichever per-taxon column was set
        op.execute(
            f"""
            UPDATE {table}
            SET animal_id = COALESCE(snake_id, lizard_id, frog_id);
            """
        )
        # 3c. drop the old multi-column CHECK before dropping its columns
        op.drop_constraint(spec['check'], table, type_='check')
        # 3d. drop the per-taxon columns — Postgres auto-drops the
        #     dependent FK constraints + indexes with the column
        op.drop_column(table, 'snake_id')
        op.drop_column(table, 'lizard_id')
        op.drop_column(table, 'frog_id')
        # 3e. wire the new FK + index
        op.create_foreign_key(
            f'fk_{table}_animal_id', table, 'animals',
            ['animal_id'], ['id'], ondelete='CASCADE',
        )
        op.create_index(f'ix_{table}_animal_id', table, ['animal_id'])
        # 3f. collapsed constraint
        if extra:
            # still polymorphic with tarantula_id (+ enclosure_id) —
            # keep an exactly-one CHECK, just two/three-way now
            all_parents = extra + ['animal_id']
            op.create_check_constraint(
                spec['check'], table,
                f"num_nonnulls({', '.join(all_parents)}) = 1",
            )
        else:
            # animal_id is now the only parent — a plain NOT NULL says
            # everything the old CHECK said
            op.alter_column(table, 'animal_id', nullable=False)

    # ── 4a. reptile_pairings ──────────────────────────────────────────
    op.add_column(
        'reptile_pairings',
        sa.Column('male_animal_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        'reptile_pairings',
        sa.Column('female_animal_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        'reptile_pairings',
        sa.Column(
            'taxon',
            postgresql.ENUM(
                'snake', 'lizard', 'frog',
                name='animal_taxon', create_type=False,
            ),
            nullable=True,
        ),
    )
    op.execute(
        """
        UPDATE reptile_pairings SET
            male_animal_id = COALESCE(male_snake_id, male_lizard_id, male_frog_id),
            female_animal_id = COALESCE(female_snake_id, female_lizard_id, female_frog_id),
            taxon = CASE
                WHEN male_snake_id IS NOT NULL THEN 'snake'::animal_taxon
                WHEN male_lizard_id IS NOT NULL THEN 'lizard'::animal_taxon
                ELSE 'frog'::animal_taxon
            END;
        """
    )
    # drop the combinatorial CHECK constraints
    op.drop_constraint('reptile_pairings_male_xor', 'reptile_pairings', type_='check')
    op.drop_constraint('reptile_pairings_female_xor', 'reptile_pairings', type_='check')
    op.drop_constraint('reptile_pairings_taxon_match', 'reptile_pairings', type_='check')
    # drop the six per-taxon columns (FKs auto-drop with the columns)
    for col in (
        'male_snake_id', 'male_lizard_id', 'male_frog_id',
        'female_snake_id', 'female_lizard_id', 'female_frog_id',
    ):
        op.drop_column('reptile_pairings', col)
    # wire the new FKs + indexes
    op.create_foreign_key(
        'fk_reptile_pairings_male_animal_id', 'reptile_pairings', 'animals',
        ['male_animal_id'], ['id'], ondelete='CASCADE',
    )
    op.create_foreign_key(
        'fk_reptile_pairings_female_animal_id', 'reptile_pairings', 'animals',
        ['female_animal_id'], ['id'], ondelete='CASCADE',
    )
    op.create_index(
        'ix_reptile_pairings_male_animal_id', 'reptile_pairings', ['male_animal_id'],
    )
    op.create_index(
        'ix_reptile_pairings_female_animal_id', 'reptile_pairings', ['female_animal_id'],
    )
    # both parents + taxon are now mandatory; same-taxon match is
    # enforced by the application (the pairing form's species check)
    # since a cross-row CHECK would need a trigger
    op.alter_column('reptile_pairings', 'male_animal_id', nullable=False)
    op.alter_column('reptile_pairings', 'female_animal_id', nullable=False)
    op.alter_column('reptile_pairings', 'taxon', nullable=False)

    # ── 4b. reptile_offspring ─────────────────────────────────────────
    op.add_column(
        'reptile_offspring',
        sa.Column('animal_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.execute(
        """
        UPDATE reptile_offspring
        SET animal_id = COALESCE(snake_id, lizard_id, frog_id);
        """
    )
    op.drop_column('reptile_offspring', 'snake_id')
    op.drop_column('reptile_offspring', 'lizard_id')
    op.drop_column('reptile_offspring', 'frog_id')
    op.create_foreign_key(
        'fk_reptile_offspring_animal_id', 'reptile_offspring', 'animals',
        ['animal_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index(
        'ix_reptile_offspring_animal_id', 'reptile_offspring', ['animal_id'],
    )
    # animal_id stays nullable — the hold-back link is optional.

    # ── 5. Drop the orphaned per-taxon tables ─────────────────────────
    # All inbound FKs were dropped with their columns above, so these
    # drop cleanly.
    op.drop_table('frogs')
    op.drop_table('lizards')
    op.drop_table('snakes')


def downgrade() -> None:
    # Intentionally unsupported — see module docstring. Restore from a
    # snapshot if this needs reverting.
    raise NotImplementedError(
        "anm_20260514_consolidate_to_animals is a one-way migration. "
        "Restore from a database snapshot to revert."
    )
