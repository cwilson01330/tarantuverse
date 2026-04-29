"""Reptile breeding records — pairings, clutches, offspring

Adds three new tables for reptile breeding workflows. Kept entirely
separate from Tarantuverse's pairings/egg_sacs/offspring trio because
reptile biology diverges meaningfully:

  - Snakes lay one large clutch per pairing; geckos lay 2-egg clutches
    repeatedly through a season. The `clutches` table sits 1-to-many
    under a single pairing to model both.
  - Hatchlings are individual records with optional genotype linkage,
    not anonymous slingling counts.
  - Pairings are cross-taxon — both parents can be snakes, both can be
    lizards, but never one of each (different species don't interbreed).
    A CHECK constraint enforces "matched taxon" at the DB level.

Privacy: per-pairing `is_private` flag overrides the user's default
collection_visibility. Defaults to TRUE since competitors checking
your morph projects before you list offspring is a real concern.

Revision ID: rbr_20260429_add_reptile_breeding_tables
Revises: img_20260424_add_species_image_attribution
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "rbr_20260429_add_reptile_breeding_tables"
down_revision = "img_20260424_add_species_image_attribution"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ────────────────────────────────────────────────────────────────────
    # Enums — created at module level so they can be reused across the
    # three tables. Use values_callable=lambda x: [e.value for e in x]
    # to keep DB enum casing aligned with the Python enum string values.
    # ────────────────────────────────────────────────────────────────────
    pairing_type = postgresql.ENUM(
        "natural",
        "cohabitation",
        "assisted",
        "ai",
        name="reptile_pairing_type",
        create_type=True,
    )
    pairing_type.create(op.get_bind(), checkfirst=True)

    pairing_outcome = postgresql.ENUM(
        "in_progress",
        "successful",
        "unsuccessful",
        "abandoned",
        "unknown",
        name="reptile_pairing_outcome",
        create_type=True,
    )
    pairing_outcome.create(op.get_bind(), checkfirst=True)

    offspring_status = postgresql.ENUM(
        "hatched",
        "kept",
        "available",
        "sold",
        "traded",
        "gifted",
        "deceased",
        "unknown",
        name="reptile_offspring_status",
        create_type=True,
    )
    offspring_status.create(op.get_bind(), checkfirst=True)

    # ────────────────────────────────────────────────────────────────────
    # reptile_pairings
    # ────────────────────────────────────────────────────────────────────
    op.create_table(
        "reptile_pairings",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Cross-taxon parents — exactly one of male_snake_id / male_lizard_id
        # is set, ditto for female. CHECK constraint enforces this + that
        # both parents are the same taxon.
        sa.Column(
            "male_snake_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("snakes.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "male_lizard_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lizards.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "female_snake_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("snakes.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "female_lizard_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lizards.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("paired_date", sa.Date, nullable=False),
        sa.Column("separated_date", sa.Date, nullable=True),
        sa.Column(
            "pairing_type",
            sa.Enum(
                "natural",
                "cohabitation",
                "assisted",
                "ai",
                name="reptile_pairing_type",
                create_type=False,
            ),
            nullable=False,
            server_default="natural",
        ),
        sa.Column(
            "outcome",
            sa.Enum(
                "in_progress",
                "successful",
                "unsuccessful",
                "abandoned",
                "unknown",
                name="reptile_pairing_outcome",
                create_type=False,
            ),
            nullable=False,
            server_default="in_progress",
        ),
        # Privacy: TRUE by default. Pairings often involve unannounced
        # morph projects keepers don't want competitors seeing until
        # offspring are ready to list.
        sa.Column(
            "is_private",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=True,
        ),
        # Exactly one male FK and one female FK populated; both parents
        # must be the same taxon.
        sa.CheckConstraint(
            "(male_snake_id IS NOT NULL)::int + (male_lizard_id IS NOT NULL)::int = 1",
            name="reptile_pairings_male_xor",
        ),
        sa.CheckConstraint(
            "(female_snake_id IS NOT NULL)::int + (female_lizard_id IS NOT NULL)::int = 1",
            name="reptile_pairings_female_xor",
        ),
        sa.CheckConstraint(
            "(male_snake_id IS NULL) = (female_snake_id IS NULL)",
            name="reptile_pairings_taxon_match",
        ),
    )
    op.create_index(
        "ix_reptile_pairings_user_id",
        "reptile_pairings",
        ["user_id"],
    )
    op.create_index(
        "ix_reptile_pairings_paired_date",
        "reptile_pairings",
        ["paired_date"],
    )

    # ────────────────────────────────────────────────────────────────────
    # clutches — 1:N under reptile_pairings. Snakes get one big clutch
    # per pairing; geckos lay 2-egg clutches through a season — both fit.
    # ────────────────────────────────────────────────────────────────────
    op.create_table(
        "clutches",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "pairing_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("reptile_pairings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Lifecycle dates
        sa.Column("laid_date", sa.Date, nullable=False),
        # When the keeper pulled the eggs from the female (vs. maternal
        # incubation). Optional — some keepers leave with mom.
        sa.Column("pulled_date", sa.Date, nullable=True),
        sa.Column("expected_hatch_date", sa.Date, nullable=True),
        sa.Column("hatch_date", sa.Date, nullable=True),
        # Incubation conditions — Decimal for half-degree precision.
        sa.Column(
            "incubation_temp_min_f", sa.Numeric(4, 1), nullable=True,
        ),
        sa.Column(
            "incubation_temp_max_f", sa.Numeric(4, 1), nullable=True,
        ),
        sa.Column("incubation_humidity_min_pct", sa.Integer, nullable=True),
        sa.Column("incubation_humidity_max_pct", sa.Integer, nullable=True),
        # Counts. Distinguish between expected (laid), fertile (candled),
        # slugs (infertile / failed), hatched (live), and viable (made
        # it past the first week). All optional — keepers fill in as
        # they observe.
        sa.Column("expected_count", sa.Integer, nullable=True),
        sa.Column("fertile_count", sa.Integer, nullable=True),
        sa.Column("slug_count", sa.Integer, nullable=True),
        sa.Column("hatched_count", sa.Integer, nullable=True),
        sa.Column("viable_count", sa.Integer, nullable=True),
        # Free-form candling log — list of {date, fertile, slug, notes}
        # entries. Schema deliberately loose so keepers can record their
        # own field shapes without us churning columns.
        sa.Column(
            "candle_log",
            postgresql.JSONB,
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("photo_url", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=True,
        ),
    )
    op.create_index("ix_clutches_pairing_id", "clutches", ["pairing_id"])
    op.create_index("ix_clutches_user_id", "clutches", ["user_id"])
    op.create_index("ix_clutches_laid_date", "clutches", ["laid_date"])

    # ────────────────────────────────────────────────────────────────────
    # reptile_offspring — individual hatchlings.
    #
    # If a hatchling is kept and registered as a real reptile, snake_id
    # or lizard_id link it back to the live record. If sold/traded, we
    # only have the offspring row, with optional `recorded_genotype`
    # JSONB capturing what the keeper observed at hatch.
    # ────────────────────────────────────────────────────────────────────
    op.create_table(
        "reptile_offspring",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "clutch_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clutches.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Optional links to live reptile records — SET NULL on delete so
        # offspring history survives if the keeper later removes the
        # spawned animal.
        sa.Column(
            "snake_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("snakes.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "lizard_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lizards.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # Free-text label for non-genotyped hatchlings (e.g. "Pied het
        # albino" written informally before genotype is committed).
        sa.Column("morph_label", sa.String(200), nullable=True),
        # Recorded genotype — JSONB list of {gene_key, zygosity} entries.
        # Used when the offspring isn't a full reptile record yet (e.g.
        # sold) but the keeper wants the genotype on file for buyer
        # paperwork. When the offspring IS linked to a snake/lizard, we
        # prefer reading from animal_genotypes.
        sa.Column(
            "recorded_genotype",
            postgresql.JSONB,
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "hatched",
                "kept",
                "available",
                "sold",
                "traded",
                "gifted",
                "deceased",
                "unknown",
                name="reptile_offspring_status",
                create_type=False,
            ),
            nullable=False,
            server_default="hatched",
        ),
        sa.Column("status_date", sa.Date, nullable=True),
        # Sale tracking — independent of pairing privacy. Null when not
        # sold yet.
        sa.Column("buyer_info", sa.Text(), nullable=True),
        sa.Column("price_sold", sa.Numeric(10, 2), nullable=True),
        sa.Column(
            "hatch_weight_g",
            sa.Numeric(5, 1),
            nullable=True,
        ),
        sa.Column(
            "hatch_length_in",
            sa.Numeric(5, 1),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("photo_url", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_reptile_offspring_clutch_id",
        "reptile_offspring",
        ["clutch_id"],
    )
    op.create_index(
        "ix_reptile_offspring_user_id",
        "reptile_offspring",
        ["user_id"],
    )
    op.create_index(
        "ix_reptile_offspring_status",
        "reptile_offspring",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index("ix_reptile_offspring_status", table_name="reptile_offspring")
    op.drop_index("ix_reptile_offspring_user_id", table_name="reptile_offspring")
    op.drop_index("ix_reptile_offspring_clutch_id", table_name="reptile_offspring")
    op.drop_table("reptile_offspring")

    op.drop_index("ix_clutches_laid_date", table_name="clutches")
    op.drop_index("ix_clutches_user_id", table_name="clutches")
    op.drop_index("ix_clutches_pairing_id", table_name="clutches")
    op.drop_table("clutches")

    op.drop_index("ix_reptile_pairings_paired_date", table_name="reptile_pairings")
    op.drop_index("ix_reptile_pairings_user_id", table_name="reptile_pairings")
    op.drop_table("reptile_pairings")

    bind = op.get_bind()
    sa.Enum(name="reptile_offspring_status").drop(bind, checkfirst=True)
    sa.Enum(name="reptile_pairing_outcome").drop(bind, checkfirst=True)
    sa.Enum(name="reptile_pairing_type").drop(bind, checkfirst=True)
