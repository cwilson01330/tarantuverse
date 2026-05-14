"""add frogs table

Revision ID: frg_20260513_add_frogs_table
Revises: rbf_20260511_fix_reptile_pairings_columns
Create Date: 2026-05-13

Parallel to `snakes` and `lizards`. Frogs are amphibians — biologically
not reptiles — but the herp hobby covers both, and our table is named
`reptile_species` for legacy reasons. The species table stays as-is to
avoid an FK / sitemap / public-route churn; semantically treat it as
"non-tarantula animal" rather than literally "reptile."

Frogs have overlapping-but-distinct husbandry from snakes / lizards:

  - Humidity is much higher and more critical (most species need 70-90%
    sustained). Same species-table fields cover this.
  - Shedding happens too — frogs slough their skin and typically eat
    it. `shed_logs` semantics carry over cleanly; the log is just
    another shed event.
  - Brumation is replaced by aestivation in some species (African
    bullfrogs cocoon during dry periods). We reuse the `brumation_*`
    column names because the UX is identical — temporary feeding pause
    for a seasonal physiological reason. The column names are slightly
    misleading for amphibians but renaming them everywhere is more
    churn than it's worth.
  - Diet diverges (fruit flies for darts, pinkies for bullfrogs, etc.)
    but that's a species-level concern, not per-animal.
  - Many dart frogs are sold in colonies, not as individual sexed
    animals — keepers still track them individually for hobby purposes.
    `sex` defaults to UNKNOWN; we don't gate anything on it.

The `enclosure_id` FK references the existing enclosures table; the
application-level `purpose` string extends to accept 'frog' (no schema
change — enclosures.purpose is a free-text VARCHAR).

Sex + Source enums are reused from the shared DB enum types on
`tarantulas` + `snakes` + `lizards`. Same Python enum, same DB type,
same UPPERCASE values. No new enum types created — if we drop frogs in
a downgrade, those enums stay.

This is additive only.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'frg_20260513_add_frogs_table'
down_revision: Union[str, None] = 'rbf_20260511_fix_reptile_pairings_columns'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'frogs',
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

        # Basic identity
        sa.Column('name', sa.String(100)),
        sa.Column('common_name', sa.String(100)),
        sa.Column('scientific_name', sa.String(255)),

        # Shared DB enums — same UPPERCASE-name convention as
        # tarantulas/snakes/lizards. See snk_ migration docstring for
        # the long version.
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

        # Husbandry reference. brumation_* is reused for aestivation
        # — see module docstring.
        sa.Column('feeding_schedule', sa.String(200), nullable=True),
        sa.Column('last_fed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_shed_at', sa.Date(), nullable=True),
        sa.Column('brumation_active', sa.Boolean(), server_default=sa.false()),
        sa.Column('brumation_started_at', sa.Date(), nullable=True),

        # Feeding pause — parallel to pse_20260502 on snakes/lizards.
        # Premolt-style fasting is rare for frogs but breeding-season
        # off-feed periods are common; same UX handles both.
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

    op.create_index('ix_frogs_user_id', 'frogs', ['user_id'])
    op.create_index('ix_frogs_reptile_species_id', 'frogs', ['reptile_species_id'])


def downgrade() -> None:
    op.drop_index('ix_frogs_reptile_species_id', table_name='frogs')
    op.drop_index('ix_frogs_user_id', table_name='frogs')
    op.drop_table('frogs')
    # Do NOT drop the 'sex' or 'source' enum types — they are shared
    # with tarantulas + snakes + lizards.
