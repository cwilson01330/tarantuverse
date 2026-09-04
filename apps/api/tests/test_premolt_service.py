"""Premolt decision logic.

No database: `evaluate_premolt_likely` is a pure function of three
already-computed signals, extracted from `predict_premolt` for exactly this
reason. The decision had been subtly wrong for a long time because it sat
mid-function with nothing asserting its behaviour.

The case that motivated these tests: branch 1 (3+ consecutive refusals) had
no temporal gate, while branches 2 and 3 both did. Refusals are counted from
the last moult forward, so three POST-moult refusals — normal fang-hardening
behaviour, and a keeper diligently offering food — declared premolt on an
animal that had just moulted.
"""
import pytest

from app.services.premolt_service import (
    MIN_DAYS_FOR_REFUSAL_ONLY,
    MIN_PROGRESS_FOR_REFUSAL_ONLY,
    evaluate_premolt_likely,
)


def evaluate(streak=0, progress=None, days=None):
    return evaluate_premolt_likely(
        recent_refusal_streak=streak,
        molt_interval_progress=progress,
        days_since_last_molt=days,
    )


# ── The regression this file exists for ──────────────────────────────────────

def test_refusals_alone_do_not_flag_a_freshly_moulted_animal():
    """Three refusals four days after a moult is fang-hardening, not premolt."""
    assert evaluate(streak=3, progress=6, days=4) is False


def test_refusals_alone_do_not_flag_when_no_average_exists_and_moult_is_recent():
    """Fewer than 3 moults logged, so no average — fall back to the day floor."""
    assert evaluate(streak=5, progress=None, days=3) is False


def test_refusals_flag_once_clear_of_the_post_moult_window():
    """Same refusals, same animal, later in the cycle — this is the signal."""
    assert evaluate(streak=3, progress=40, days=27) is True


def test_day_floor_applies_when_no_average_interval_is_known():
    assert evaluate(streak=3, days=MIN_DAYS_FOR_REFUSAL_ONLY - 1) is False
    assert evaluate(streak=3, days=MIN_DAYS_FOR_REFUSAL_ONLY) is True


def test_progress_gate_boundary():
    assert evaluate(streak=3, progress=MIN_PROGRESS_FOR_REFUSAL_ONLY - 1, days=99) is False
    assert evaluate(streak=3, progress=MIN_PROGRESS_FOR_REFUSAL_ONLY, days=99) is True


def test_no_moult_history_is_not_gated():
    """Nothing on file to contradict the refusals, so don't suppress the
    warning — a keeper whose spider is refusing should still hear about it."""
    assert evaluate(streak=3, progress=None, days=None) is True


# ── The other two branches must be unaffected ────────────────────────────────

def test_two_refusals_plus_interval_progress_still_flags():
    assert evaluate(streak=2, progress=60, days=45) is True


def test_two_refusals_below_progress_threshold_does_not_flag():
    assert evaluate(streak=2, progress=59, days=45) is False


def test_overdue_with_no_refusals_still_flags():
    """Some adults eat straight through premolt, so the interval signal
    carries information on its own."""
    assert evaluate(streak=0, progress=110, days=31) is True


def test_overdue_branch_requires_more_than_thirty_days():
    """Guards a fast-cycling sling: 110% of a 25-day average is day 28, which
    is still inside the post-moult window for many animals."""
    assert evaluate(streak=0, progress=200, days=30) is False


# ── A real animal, as a sanity anchor ────────────────────────────────────────

def test_verushka_is_not_in_premolt():
    """Psalmopoeus irminia, checked against production on 2026-09-01 while
    investigating a report of recently-moulted animals showing premolt.

    Moulted 31 days earlier, four feedings since and every one accepted,
    moult intervals 60/92/57/61 → 67.5 day average → 46% progress. Every
    branch should decline. She was NOT the branch-1 case; the report is still
    unexplained, and this test just pins the arithmetic for her.
    """
    assert evaluate(streak=0, progress=46, days=31) is False


@pytest.mark.parametrize("streak", [0, 1, 2])
def test_short_streaks_never_flag_without_temporal_support(streak):
    assert evaluate(streak=streak, progress=10, days=5) is False
