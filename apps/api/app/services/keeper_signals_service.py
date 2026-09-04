"""Keeper-consensus husbandry signals (ADR-018).

What keepers on this platform ACTUALLY do with a species, aggregated from their
own logs — shown beside the written care sheet, never replacing it.

The doctrine is inherited from ADR-014 (evidence-first market signals) and is
the whole point of the feature:

  * we describe, we do not instruct — the label is "what keepers do", never
    "recommended";
  * every figure travels with its evidence (keeper count, observation count);
  * below the gate we return NOTHING rather than a low-confidence number. An
    honest absence beats a plausible-looking figure, and these are animals
    people care about.

None of the thresholds here are tuning knobs to be loosened when coverage feels
thin. Coverage grows by keepers logging more, not by us lowering the bar.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

# ── Inclusion gates (ADR-018) ───────────────────────────────────────────────

#: Distinct keepers required before the word "consensus" is defensible.
#: Two keepers is two people's habits. Three is the smallest honest number.
#: Measured 2026-09-04: >=3 keepers/>=15 intervals shows 25 species;
#: >=5/>=20 shows only 11 (too thin to feel like a feature);
#: >=2/>=10 shows 40 but dilutes the claim.
MIN_KEEPERS = 3

#: Eligible intervals required per species.
MIN_OBSERVATIONS = 15

#: Staleness window, matching ADR-014. Husbandry practice drifts, and a
#: five-year-old feeding pattern is not evidence about how people keep this
#: species now.
WINDOW_DAYS = 730

#: Interval bounds in days. The lower bound drops same-day double-logs; the
#: upper drops the multi-month gaps that come from a keeper lapsing and
#: resuming, which describe logging behaviour rather than husbandry.
MIN_INTERVAL_DAYS = 1
MAX_INTERVAL_DAYS = 120

#: Intervals a single keeper needs before their median counts as one of the
#: voices in the species median.
#:
#: Because the aggregate is a median of per-keeper medians, EVERY keeper gets
#: exactly one vote regardless of volume — that's what stops a large account
#: dominating. The flip side, found 2026-09-04, is that a keeper with ONE
#: interval carried the same weight as a keeper with thirty. One interval is a
#: single gap between two feedings; it isn't a practice, and it shouldn't get
#: a vote.
#:
#: Two is deliberately low. Measured on production the same day, with the
#: owner's test account already excluded:
#:
#:     floor 1 → 22 species      floor 4 → 8
#:     floor 2 → 17 species      floor 5 → 8
#:     floor 3 → 14 species
#:
#: The cliff is between 3 and 4. A floor of 5 (the first instinct) would have
#: cut the feature by 61% to fix a problem the 3-keeper gate already mostly
#: handles. Two buys the real thing — a keeper has shown a repeated pattern —
#: at a cost of 5 species rather than 14.
MIN_INTERVALS_PER_KEEPER = 2


@dataclass(frozen=True)
class KeeperSignals:
    """Aggregate for one species. `meets_threshold` is the honest gate —
    when False every statistic is None and the client shows nothing."""

    species_id: str
    meets_threshold: bool
    median_interval_days: Optional[int]
    keeper_count: int
    observation_count: int
    animal_count: int
    window_days: int = WINDOW_DAYS
    min_keepers: int = MIN_KEEPERS
    min_observations: int = MIN_OBSERVATIONS


# Median of per-keeper medians, NOT a flat median over all intervals.
#
# A flat median lets one keeper with a large, heavily-logged collection set the
# species number by themselves — the platform already has an account holding
# 1221 animals, so this is a live risk rather than a hypothetical. Collapsing
# to one value per keeper first means every keeper counts once, which is what
# "what keepers do" is supposed to mean.
#
# Accepted feedings only: a refusal is not a feeding interval, it's a symptom.
# See feedback_refusals_dont_belong_in_cadence_math.
_SIGNALS_SQL = text(
    """
    WITH gaps AS (
        SELECT
            i.user_id,
            f.invert_id,
            EXTRACT(DAY FROM f.fed_at - LAG(f.fed_at) OVER (
                PARTITION BY f.invert_id ORDER BY f.fed_at
            )) AS gap_days
        FROM feeding_logs f
        JOIN inverts i ON i.id = f.invert_id
        JOIN users u   ON u.id = i.user_id
        WHERE f.accepted IS TRUE
          AND f.invert_id IS NOT NULL
          AND i.species_id = :species_id
          AND i.died_at IS NULL
          AND i.transferred_out_at IS NULL
          -- Test and demo accounts don't describe husbandry. Excluded from
          -- AGGREGATES only; they remain fully visible everywhere else.
          AND u.exclude_from_aggregates IS NOT TRUE
          AND f.fed_at >= now() - (:window_days || ' days')::interval
    ),
    all_eligible AS (
        SELECT user_id, invert_id, gap_days
        FROM gaps
        WHERE gap_days IS NOT NULL
          AND gap_days BETWEEN :min_interval AND :max_interval
    ),
    -- A keeper needs a repeated pattern before their median is a voice. One
    -- interval is a single gap between two feedings, and under median-of-
    -- medians it would otherwise weigh the same as thirty.
    voices AS (
        SELECT user_id,
               COUNT(*) AS obs,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_days) AS keeper_median
        FROM all_eligible
        GROUP BY user_id
        HAVING COUNT(*) >= :min_per_keeper
    ),
    -- Counts describe the evidence actually used, not everything discarded on
    -- the way. Reporting observations we didn't count would overstate it.
    counted AS (
        SELECT e.*
        FROM all_eligible e
        JOIN voices v ON v.user_id = e.user_id
    )
    SELECT
        (SELECT COUNT(*) FROM counted)                         AS observation_count,
        (SELECT COUNT(*) FROM voices)                          AS keeper_count,
        (SELECT COUNT(DISTINCT invert_id) FROM counted)        AS animal_count,
        (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY keeper_median)
           FROM voices)                                        AS median_of_medians
    """
)


def get_keeper_signals(db: Session, species_id: UUID | str) -> KeeperSignals:
    """Aggregate for one species, or an explicit below-threshold result.

    Never raises on thin data and never substitutes a platform-wide average —
    a species we cannot speak about honestly returns meets_threshold=False with
    its real counts, so the client can say nothing while an admin can still see
    how close it is.
    """
    row = db.execute(
        _SIGNALS_SQL,
        {
            "species_id": str(species_id),
            "window_days": WINDOW_DAYS,
            "min_interval": MIN_INTERVAL_DAYS,
            "max_interval": MAX_INTERVAL_DAYS,
            "min_per_keeper": MIN_INTERVALS_PER_KEEPER,
        },
    ).one()

    observation_count = int(row.observation_count or 0)
    keeper_count = int(row.keeper_count or 0)
    animal_count = int(row.animal_count or 0)

    meets = keeper_count >= MIN_KEEPERS and observation_count >= MIN_OBSERVATIONS

    median = None
    if meets and row.median_of_medians is not None:
        # Rounded to a whole day. A keeper does not feed on a 4.5-day cadence,
        # and a decimal would imply a precision this evidence doesn't carry.
        median = int(round(float(row.median_of_medians)))

    return KeeperSignals(
        species_id=str(species_id),
        meets_threshold=meets and median is not None,
        median_interval_days=median,
        keeper_count=keeper_count,
        observation_count=observation_count,
        animal_count=animal_count,
    )
