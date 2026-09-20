"""
Population history is OBSERVED, never forecast (2026-09-20).

The whole value of this feature is that it's the keeper's own data reflected
back. The temptation — and the request that will eventually arrive — is to
extrapolate it into "your colony will reach N by December". For isopods that
would be indefensible: reproduction depends on species, temperature, humidity,
calcium, protein, substrate depth and founding sex ratio, and the last of those
is unknowable because most isopods can't be sexed at a glance and nobody counts
a colony living inside substrate. `count_is_estimated` defaults to True for
that reason, so a projection would be a guess stacked on a guess.

These tests pin the honesty properties, not just the arithmetic:

  - a rate is withheld until there are enough points over enough days;
  - the reason for withholding is stated, so the UI never has to invent one;
  - a divergence between the replayed timeline and the stored total is
    reported rather than hidden.

The replay itself is exercised with plain objects — no database needed, and
the maths is the part worth pinning.
"""
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from app.services.colony_history_service import (
    MIN_DAYS_FOR_RATE,
    MIN_POINTS_FOR_RATE,
    _growth,
    _replay,
)


def ev(days_ago: int, delta, stage=None, event_type="count_correction"):
    """A stand-in ColonyEvent. Only the replayed fields matter."""
    return SimpleNamespace(
        occurred_at=date.today() - timedelta(days=days_ago),
        created_at=None,
        count_delta=delta,
        stage=stage,
        event_type=event_type,
    )


# ── replay ────────────────────────────────────────────────────────────────

def test_replay_accumulates_into_a_running_total():
    points = _replay([ev(60, 20), ev(30, 15), ev(0, 10)])
    assert [p["total"] for p in points] == [20, 35, 45]


def test_events_without_a_delta_make_no_point():
    """Observations and molt-found notes are real history but don't move the
    count — charting them as points would draw a flat step that suggests a
    measurement happened when none did."""
    points = _replay([ev(30, 20), ev(20, None, event_type="observation"), ev(10, 0)])
    assert len(points) == 1


def test_a_missing_stage_lands_in_mixed():
    """Matches _apply_delta in the router. If these two disagreed, the chart
    would drift from the stored counts for every keeper who doesn't bucket."""
    points = _replay([ev(10, 12)])
    assert points[0]["stage_counts"] == {"mixed": 12}


def test_buckets_are_tracked_separately_but_totalled():
    points = _replay([ev(30, 10, "adults"), ev(20, 4, "mancae")])
    assert points[-1]["stage_counts"] == {"adults": 10, "mancae": 4}
    assert points[-1]["total"] == 14


def test_replay_clamps_at_zero_like_the_router_does():
    """A keeper who sells more than the bucket held must not drive it negative
    — _apply_delta clamps, so the replay has to clamp identically or the chart
    and the headline number part ways."""
    points = _replay([ev(30, 10), ev(10, -25)])
    assert points[-1]["total"] == 0


# ── the honesty properties ────────────────────────────────────────────────

def test_no_rate_from_too_few_points():
    g = _growth(_replay([ev(40, 10), ev(10, 10)]))
    assert g["has_rate"] is False
    assert str(MIN_POINTS_FOR_RATE) in g["reason"]


def test_no_rate_from_too_short_a_window():
    """Three counts in a week is arithmetically enough and practically
    meaningless — it would read as explosive growth from noise."""
    g = _growth(_replay([ev(6, 10), ev(3, 10), ev(0, 10)]))
    assert g["has_rate"] is False
    assert str(MIN_DAYS_FOR_RATE) in g["reason"]


def test_withholding_always_carries_a_reason():
    """The UI must never have to invent an explanation for a missing number."""
    for events in ([ev(40, 10), ev(10, 10)], [ev(6, 10), ev(3, 10), ev(0, 10)]):
        g = _growth(_replay(events))
        assert g["has_rate"] is False
        assert g["reason"], "a withheld rate with no reason forces the client to guess"


def test_a_real_window_reports_observed_change_only():
    g = _growth(_replay([ev(60, 30), ev(30, 15), ev(0, 15)]))
    assert g["has_rate"] is True
    assert g["net_change"] == 30       # 60 - 30, first point to last
    assert g["days_observed"] == 60
    assert g["per_30_days"] == 15.0


def test_decline_is_reported_as_readily_as_growth():
    """A colony crashing is the more urgent signal. Nothing may floor this at
    zero or dress it up."""
    g = _growth(_replay([ev(90, 100), ev(45, -30), ev(0, -30)]))
    assert g["has_rate"] is True
    assert g["net_change"] == -60
    assert g["per_30_days"] < 0


def test_the_payload_offers_nothing_that_looks_like_a_forecast():
    """The guard that matters. If a future change adds a projected figure it
    should have to delete this test and think about why."""
    g = _growth(_replay([ev(60, 30), ev(30, 15), ev(0, 15)]))
    forbidden = [
        k for k in g
        if any(w in k for w in ("project", "forecast", "predict", "expected", "estimate_at"))
    ]
    assert not forbidden, f"population history must not forecast: {forbidden}"
