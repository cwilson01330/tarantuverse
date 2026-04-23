"""add weight_logs + prey_weight_g on feeding_logs + feeding ratio fields on reptile_species

Revision ID: wgt_20260422_add_weight_logs_and_feeding_ratios
Revises: gns_20260422_add_genes_table
Create Date: 2026-04-22

Sprint 5 — snake weight & feeding intelligence (PRD-herpetoverse-v1 §5.6).

Three related additions, all snake-centric (tarantula data flow unchanged):

1. **weight_logs table** — standalone weigh-ins independent of sheds.
   Enables time-series charting and 30-day weight-loss alerts without
   requiring a keeper to weigh at every shed.

2. **feeding_logs.prey_weight_g** — optional grams value for a fed prey
   item. With snake.current_weight_g, this is what powers prey-size
   advisory on the feeding form (e.g. "12% of body weight — above
   power-feeding threshold"). Nullable because (a) tarantula feedings
   never care about prey weight and (b) snake keepers may log without
   weighing the prey.

3. **reptile_species feeding-ratio fields** — species-specific data
   that powers the advisory:
     - hatchling_weight_min_g / hatchling_weight_max_g (size bracket
       for starting life-stage classification)
     - power_feeding_threshold_pct (e.g. 15.0 for ball python — prey >
       this % of body weight triggers a soft warning)
     - weight_loss_concern_pct_30d (e.g. 10.0 — red flag threshold)
     - life_stage_feeding (JSONB array of stage brackets: weight_g_max,
       ratio_pct_min/max, interval_days_min/max — one row per life
       stage: hatchling → juvenile → subadult → adult)

   JSONB rather than 22 new columns keeps the schema tractable and
   matches the pattern already used for `sources` / `welfare_citations`.

Context column on weight_logs is a plain VARCHAR with app-layer Pydantic
validation — same pattern as gene_type on the genes table. Avoids the
enum-case-mismatch class of migration failures we hit on Python regius
seeding (gene welfare_flag), on snake/source (snk_ migration), and on
reptile_species.care_level — all shared/parallel enums have burned us.
String + app validation is the established way out.

Additive only — no existing rows rewritten. Safe to replay.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'wgt_20260422_add_weight_logs_and_feeding_ratios'
down_revision: Union[str, None] = 'gns_20260422_add_genes_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. weight_logs table ────────────────────────────────────────────
    op.create_table(
        'weight_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            'snake_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('snakes.id', ondelete='CASCADE'),
            nullable=False,
        ),

        # Weigh-in timestamp — timezone-aware like all other log timestamps
        sa.Column('weighed_at', sa.DateTime(timezone=True), nullable=False),

        # Weight in grams — positive, up to 999,999.99g (~1 ton, generous)
        sa.Column('weight_g', sa.Numeric(8, 2), nullable=False),

        # Context — plain VARCHAR with app-layer validation.
        # Accepted values (Pydantic-enforced):
        #   'routine' | 'pre_feed' | 'post_shed' | 'pre_breeding' |
        #   'post_lay' | 'other'
        sa.Column('context', sa.String(20), nullable=False, server_default='routine'),

        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),

        sa.PrimaryKeyConstraint('id'),
    )

    # Dashboard + chart queries: "all weigh-ins for this snake, newest first"
    op.create_index('ix_weight_logs_snake_id', 'weight_logs', ['snake_id'])
    op.create_index('ix_weight_logs_weighed_at', 'weight_logs', ['weighed_at'])

    # ── 2. feeding_logs.prey_weight_g ───────────────────────────────────
    # Nullable on purpose — tarantula feedings never set it, and snake
    # keepers may not weigh the prey. Suggested-range advisory on the UI
    # still works because we fall back to the life-stage bracket.
    op.add_column(
        'feeding_logs',
        sa.Column('prey_weight_g', sa.Numeric(8, 2), nullable=True),
    )

    # ── 3. reptile_species feeding-ratio fields ─────────────────────────
    op.add_column(
        'reptile_species',
        sa.Column('hatchling_weight_min_g', sa.Numeric(8, 2), nullable=True),
    )
    op.add_column(
        'reptile_species',
        sa.Column('hatchling_weight_max_g', sa.Numeric(8, 2), nullable=True),
    )
    # Percentage, 0.0–99.9 — Numeric(4,1) fits "15.0" comfortably
    op.add_column(
        'reptile_species',
        sa.Column('power_feeding_threshold_pct', sa.Numeric(4, 1), nullable=True),
    )
    op.add_column(
        'reptile_species',
        sa.Column('weight_loss_concern_pct_30d', sa.Numeric(4, 1), nullable=True),
    )
    # JSONB array: [{stage, weight_g_max, ratio_pct_min, ratio_pct_max,
    #               interval_days_min, interval_days_max}, …]
    # Validated at the schema layer — no DB-level shape enforcement.
    op.add_column(
        'reptile_species',
        sa.Column(
            'life_stage_feeding',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    # Reverse order of upgrade
    op.drop_column('reptile_species', 'life_stage_feeding')
    op.drop_column('reptile_species', 'weight_loss_concern_pct_30d')
    op.drop_column('reptile_species', 'power_feeding_threshold_pct')
    op.drop_column('reptile_species', 'hatchling_weight_max_g')
    op.drop_column('reptile_species', 'hatchling_weight_min_g')

    op.drop_column('feeding_logs', 'prey_weight_g')

    op.drop_index('ix_weight_logs_weighed_at', table_name='weight_logs')
    op.drop_index('ix_weight_logs_snake_id', table_name='weight_logs')
    op.drop_table('weight_logs')
