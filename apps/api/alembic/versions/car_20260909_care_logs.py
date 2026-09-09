"""Add care_logs — water dish, overflow and misting events.

Revision ID: car_20260909_care_logs
Revises: com_20260908_species_communal
Create Date: 2026-09-09

Requested by a keeper through in-app support: track giving water alongside
tracking food.

WHY IT'S A REAL GAP
-------------------
`misting_schedule` already exists on tarantulas, inverts, scorpions and
enclosures — but it is a PLAN ("2x per week") with nothing anywhere that
records the plan being carried out. A keeper could state an intention on day
one and never log against it again. Food has a log; water had an intention.

THREE TYPES, NOT ONE
--------------------
* `water_dish` — topped up or refreshed.
* `overflow`   — dish deliberately overfilled to damp the substrate. A
                 distinct husbandry act, not a sloppy refill: it is how
                 moisture-dependent species get their humidity, and how often
                 it is warranted is species-driven.
* `misted`     — enclosure or webbing misted. Slings and mantids drink from
                 droplets and never touch a dish, so folding this into
                 "water" would mislabel what a large part of the catalog
                 actually gets.

NO DUE DATE, DELIBERATELY
-------------------------
There is no `next_due`, no overdue state, and no badge, and that is a design
decision rather than a missing feature. We have no evidence base for a water
cadence the way we do for feeding intervals, and the owner's own description of
the practice — dishes in most animals, topped up when noticed, some species
needing more — is not a schedule. Inventing an overdue state would manufacture
a deadline out of nothing and nag keepers with it, which is exactly what
ADR-014 exists to prevent. This table records what happened. That is all.

PARENTED ON `inverts` ONLY
--------------------------
No tarantula_id / scorpion_id columns. Legacy rows share primary keys with
`inverts` under ADR-005, so a tarantula's care logs resolve through invert_id
without a facade, and this table needs no changes when Phase D drops the legacy
tables. The one-endpoint-pair-per-taxon sprawl in substrate_changes is the
thing being avoided.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "car_20260909_care_logs"
down_revision = "com_20260908_species_communal"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "care_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        # No standalone index here — the composite below leads with invert_id,
        # so a second single-column index would be dead weight on every write.
        sa.Column(
            "invert_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inverts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("log_type", sa.String(20), nullable=False),
        sa.Column("logged_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "log_type IN ('water_dish', 'overflow', 'misted')",
            name="care_logs_log_type_check",
        ),
    )
    # Every read is "this animal's care logs, newest first". Declared ascending
    # to match the model exactly — Postgres scans it backwards for ORDER BY
    # DESC at the same cost, and a DESC-only-here index would show up as a
    # phantom diff the next time anyone autogenerates.
    op.create_index(
        "ix_care_logs_invert_logged_at",
        "care_logs",
        ["invert_id", "logged_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_care_logs_invert_logged_at", table_name="care_logs")
    op.drop_table("care_logs")
