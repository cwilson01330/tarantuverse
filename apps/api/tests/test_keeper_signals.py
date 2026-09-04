"""Keeper-consensus husbandry signals (ADR-018).

These tests exist mostly to defend the honesty gates. The statistic itself is a
median; the part that will come under pressure is the threshold, because
coverage will look thin and lowering `MIN_KEEPERS` is the obvious way to make
more species light up. That trade is the wrong one and these tests say so.

The service needs a database session for its aggregate, so the SQL is exercised
against production separately (see the ADR). What's asserted here is the
decision layer: the gate, the shape of a below-threshold result, and the
promise that a figure never travels without its evidence.
"""
import pytest

from app.schemas.keeper_signals import KeeperSignalsResponse
from app.services.keeper_signals_service import (
    MAX_INTERVAL_DAYS,
    MIN_INTERVAL_DAYS,
    MIN_INTERVALS_PER_KEEPER,
    MIN_KEEPERS,
    MIN_OBSERVATIONS,
    WINDOW_DAYS,
    KeeperSignals,
)


def signals(**kw) -> KeeperSignals:
    base = dict(
        species_id="sp-1",
        meets_threshold=True,
        median_interval_days=5,
        keeper_count=MIN_KEEPERS,
        observation_count=MIN_OBSERVATIONS,
        animal_count=4,
    )
    base.update(kw)
    return KeeperSignals(**base)


# ── The gates themselves ─────────────────────────────────────────────────────

def test_gate_constants_are_not_quietly_relaxed():
    """A deliberate tripwire.

    Three keepers is the smallest count where "consensus" is defensible — two
    is two people's habits. Fifteen observations is what makes a median mean
    anything. If coverage feels thin, the fix is more keepers logging, not a
    lower bar: the whole feature is worthless the moment it starts making
    claims its evidence can't carry.

    Changing these is allowed. Changing them without noticing is not.
    """
    assert MIN_KEEPERS == 3
    assert MIN_OBSERVATIONS == 15
    assert WINDOW_DAYS == 730          # matches ADR-014's staleness window
    assert MIN_INTERVALS_PER_KEEPER == 2


def test_interval_bounds_exclude_logging_artifacts():
    """1 day drops same-day double-logs; 120 drops the multi-month gaps that
    describe a keeper lapsing and resuming rather than how they feed."""
    assert MIN_INTERVAL_DAYS == 1
    assert MAX_INTERVAL_DAYS == 120


# ── Below threshold shows NOTHING, not a hedge ───────────────────────────────

def test_below_threshold_carries_no_figure():
    s = signals(meets_threshold=False, median_interval_days=None)
    r = KeeperSignalsResponse(
        species_id=s.species_id,
        meets_threshold=s.meets_threshold,
        median_interval_days=s.median_interval_days,
        keeper_count=2,
        observation_count=40,
        animal_count=3,
        window_days=s.window_days,
        min_keepers=s.min_keepers,
        min_observations=s.min_observations,
    )
    assert r.meets_threshold is False
    assert r.median_interval_days is None, (
        "A below-threshold species must not carry a number. An honest absence "
        "beats a plausible-looking figure — see ADR-014."
    )


def test_counts_are_still_returned_below_threshold():
    """So an admin can see how close a species is to qualifying. These are for
    the coverage view, NOT for display beside an absent figure."""
    r = KeeperSignalsResponse(
        species_id="sp-1", meets_threshold=False, median_interval_days=None,
        keeper_count=2, observation_count=40, animal_count=3,
        window_days=WINDOW_DAYS, min_keepers=MIN_KEEPERS,
        min_observations=MIN_OBSERVATIONS,
    )
    assert r.keeper_count == 2 and r.observation_count == 40


# ── A figure never travels alone ─────────────────────────────────────────────

def test_a_displayed_figure_always_has_its_evidence():
    """The response cannot express "5 days" without also saying how many
    keepers and observations produced it — the fields are required."""
    with pytest.raises(Exception):
        KeeperSignalsResponse(  # type: ignore[call-arg]
            species_id="sp-1",
            meets_threshold=True,
            median_interval_days=5,
            # keeper_count / observation_count / animal_count omitted
            window_days=WINDOW_DAYS,
            min_keepers=MIN_KEEPERS,
            min_observations=MIN_OBSERVATIONS,
        )


def test_thresholds_are_echoed_so_clients_dont_hardcode_them():
    r = KeeperSignalsResponse(
        species_id="sp-1", meets_threshold=True, median_interval_days=5,
        keeper_count=4, observation_count=20, animal_count=6,
        window_days=WINDOW_DAYS, min_keepers=MIN_KEEPERS,
        min_observations=MIN_OBSERVATIONS,
    )
    assert r.min_keepers == MIN_KEEPERS
    assert r.min_observations == MIN_OBSERVATIONS


# ── The aggregate must be per-keeper, not per-interval ───────────────────────

def test_service_uses_median_of_per_keeper_medians():
    """Regression guard for the method, asserted against the SQL source.

    A flat median over all intervals weights by volume of logging, letting one
    heavily-logging account set a species number alone — the platform has an
    account holding 1,221 animals, so this is live, not hypothetical. Measured
    2026-09-04, the two methods disagree materially: Tliltocatl albopilosus
    reads 4 days flat and 7 days per-keeper.
    """
    import inspect

    from app.services import keeper_signals_service as svc

    sql = inspect.getsource(svc)
    assert "per_keeper" in sql, (
        "The aggregate must collapse to one value per keeper before taking the "
        "species median, or a single prolific logger defines the consensus."
    )
    assert "median_of_medians" in sql


def test_only_accepted_feedings_count():
    """A refusal is a symptom, not a feeding interval. Including refusals
    inflates apparent cadence — see feedback_refusals_dont_belong_in_cadence_math."""
    import inspect

    from app.services import keeper_signals_service as svc

    assert "f.accepted IS TRUE" in inspect.getsource(svc)


def test_dead_and_transferred_animals_are_excluded():
    """Their logs describe a keeper who no longer has the animal, and in the
    transferred case may double-count once the new keeper starts logging."""
    import inspect

    from app.services import keeper_signals_service as svc

    src = inspect.getsource(svc)
    assert "i.died_at IS NULL" in src
    assert "i.transferred_out_at IS NULL" in src


# ── Per-keeper floor and aggregate exclusion (added 2026-09-04) ──────────────

def test_a_keeper_needs_a_repeated_pattern_to_get_a_voice():
    """One interval is a single gap between two feedings, not a practice.

    Under median-of-medians every keeper gets one vote regardless of volume —
    that's what stops a large account dominating. Without a floor it also meant
    a keeper with ONE interval outweighed nothing and counted as much as a
    keeper with thirty. Found on production: a single 63-day interval was a
    full voice in Brachypelma hamorii.
    """
    import inspect

    from app.services import keeper_signals_service as svc

    src = inspect.getsource(svc)
    assert "HAVING COUNT(*) >= :min_per_keeper" in src, (
        "Per-keeper observations must be floored before a keeper's median "
        "joins the species median."
    )


def test_the_floor_is_deliberately_low():
    """Measured 2026-09-04 with the test account already excluded:
    floor 1 → 22 species, 2 → 17, 3 → 14, 4 → 8, 5 → 8.

    The cliff is between 3 and 4. Raising this is not free — 5 would cut
    coverage by 61% to solve a problem the 3-keeper gate already mostly
    handles.
    """
    assert MIN_INTERVALS_PER_KEEPER == 2


def test_excluded_accounts_are_dropped_from_aggregates():
    import inspect

    from app.services import keeper_signals_service as svc

    assert "u.exclude_from_aggregates IS NOT TRUE" in inspect.getsource(svc)


def test_exclusion_is_scoped_to_aggregates_only():
    """A guard against scope creep.

    `exclude_from_aggregates` keeps an account out of community STATISTICS. It
    is not a shadowban: the account stays visible in forums, keeper listings,
    follows and messages. If something ever needs to hide an account from
    people, that is a different flag with a different name — reusing this one
    would silently turn a statistics setting into a moderation action.
    """
    from app.models.user import User

    assert hasattr(User, "exclude_from_aggregates")
    # The flag must not have leaked into visibility logic.
    import inspect

    from app.routers import keepers

    assert "exclude_from_aggregates" not in inspect.getsource(keepers), (
        "exclude_from_aggregates must not gate keeper visibility — it is an "
        "aggregates-only flag."
    )


def test_counts_describe_evidence_actually_used():
    """Counts come from `counted` (post-floor), not `all_eligible`. Reporting
    observations we discarded would overstate the evidence behind the figure."""
    import inspect

    from app.services import keeper_signals_service as svc

    src = inspect.getsource(svc)
    assert "FROM counted)" in src
    assert "(SELECT COUNT(*) FROM voices)" in src
