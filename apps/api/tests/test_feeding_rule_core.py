"""The pure due-date core (services/feeding_rule.py::decide).

One rule, two loaders: TV's compute_feeding_status and HV's
compute_animal_feeding_status both gather their own rows and ask this function
who is due. No DB here — every case is plain dates.
"""
from datetime import date, timedelta

from app.services.feeding_rule import FeedingDecision, decide

TODAY = date(2026, 11, 20)
CUTOFF = date(2026, 11, 18)


def run(**over):
    args = dict(
        last_accepted=None,
        last_offered=None,
        baseline=TODAY - timedelta(days=1),
        interval_days=7,
        paused=False,
        today=TODAY,
        created_local=TODAY - timedelta(days=1),
        cutoff=CUTOFF,
        refusal_restarts_wait=False,
        has_any_log=False,
        post_pause_until=None,
    )
    args.update(over)
    return decide(**args)


def ago(n):
    return TODAY - timedelta(days=n)


# ── fed animals ─────────────────────────────────────────────────────────────

def test_fed_overdue_at_interval():
    d = run(last_accepted=ago(7), has_any_log=True)
    assert isinstance(d, FeedingDecision)
    assert d.is_overdue is True
    assert d.days_since_last_feeding == 7
    assert d.needs_first_feeding is False
    assert d.days_since_baseline is None
    assert d.wait_from == ago(7)


def test_fed_not_yet_due():
    d = run(last_accepted=ago(6), has_any_log=True)
    assert d.is_overdue is False and d.days_since_last_feeding == 6


def test_fed_counts_never_clamp_a_future_meal():
    d = run(last_accepted=TODAY + timedelta(days=2), has_any_log=True)
    assert d.days_since_last_feeding == -2 and d.is_overdue is False


# ── never-fed animals ───────────────────────────────────────────────────────

def test_never_fed_after_cutoff_nudges_then_due():
    created = CUTOFF
    early = run(baseline=created, created_local=created, today=created + timedelta(days=3))
    assert early.is_overdue is False
    assert early.needs_first_feeding is True
    assert early.days_since_baseline == 3
    assert early.days_since_last_feeding is None
    assert early.wait_from == created

    late = run(baseline=created, created_local=created, today=created + timedelta(days=7))
    assert late.is_overdue is True
    assert late.needs_first_feeding is False
    assert late.days_since_baseline == 7


def test_never_fed_before_cutoff_never_due():
    created = CUTOFF - timedelta(days=1)
    d = run(baseline=created, created_local=created, today=created + timedelta(days=90))
    assert d.is_overdue is False
    assert d.needs_first_feeding is True


def test_never_fed_baseline_in_future_clamps_to_zero():
    d = run(baseline=TODAY + timedelta(days=5), created_local=CUTOFF)
    assert d.days_since_baseline == 0 and d.is_overdue is False


def test_refusal_only_animal_gets_no_nudge():
    d = run(baseline=CUTOFF, created_local=CUTOFF, today=CUTOFF + timedelta(days=2), has_any_log=True)
    assert d.needs_first_feeding is False and d.is_overdue is False


# ── refusal restarts the wait ───────────────────────────────────────────────

def test_refusal_restart_on_pushes_due_out():
    on = run(last_accepted=ago(10), last_offered=ago(2), refusal_restarts_wait=True, has_any_log=True)
    assert on.is_overdue is False
    assert on.days_since_last_feeding == 10  # still means "last meal"
    assert on.wait_from == ago(2)


def test_refusal_restart_off_ignores_last_offered():
    off = run(last_accepted=ago(10), last_offered=ago(2), refusal_restarts_wait=False, has_any_log=True)
    assert off.is_overdue is True
    assert off.wait_from == ago(10)


def test_refusal_restart_never_pulls_due_in():
    d = run(last_accepted=ago(3), last_offered=ago(9), refusal_restarts_wait=True, has_any_log=True)
    assert d.wait_from == ago(3) and d.is_overdue is False


def test_refusal_restart_for_never_fed_counts_from_later_of_baseline_and_refusal():
    created = CUTOFF
    today = created + timedelta(days=10)
    d = run(baseline=created, created_local=created, today=today,
            last_offered=today - timedelta(days=3), refusal_restarts_wait=True, has_any_log=True)
    assert d.is_overdue is False
    assert d.days_since_baseline == 10
    assert d.wait_from == today - timedelta(days=3)


# ── pauses and missing cadence ──────────────────────────────────────────────

def test_paused_never_due_and_no_nudge():
    fed = run(last_accepted=ago(30), paused=True, has_any_log=True)
    assert fed.is_overdue is False
    never = run(baseline=CUTOFF, created_local=CUTOFF, today=CUTOFF + timedelta(days=30), paused=True)
    assert never.is_overdue is False and never.needs_first_feeding is False


def test_interval_none_never_due_and_no_nudge():
    fed = run(last_accepted=ago(300), interval_days=None, has_any_log=True)
    assert fed.is_overdue is False and fed.days_since_last_feeding == 300
    never = run(baseline=CUTOFF, created_local=CUTOFF, today=CUTOFF + timedelta(days=30), interval_days=None)
    assert never.is_overdue is False and never.needs_first_feeding is False


def test_post_pause_forces_not_due_and_no_nudge():
    fed = run(last_accepted=ago(30), has_any_log=True, post_pause_until=TODAY + timedelta(days=2))
    assert fed.is_overdue is False
    assert fed.post_pause_until == TODAY + timedelta(days=2)
    never = run(baseline=CUTOFF, created_local=CUTOFF, today=CUTOFF + timedelta(days=1),
                post_pause_until=TODAY)
    assert never.needs_first_feeding is False


def test_post_pause_ignored_when_not_eligible():
    """A keeper pause or no cadence wins: the post-molt window is not reported."""
    paused = run(last_accepted=ago(30), paused=True, has_any_log=True, post_pause_until=TODAY)
    assert paused.post_pause_until is None
    no_cadence = run(last_accepted=ago(30), interval_days=None, has_any_log=True, post_pause_until=TODAY)
    assert no_cadence.post_pause_until is None


def test_decision_is_frozen():
    d = run(last_accepted=ago(1), has_any_log=True)
    try:
        d.is_overdue = True  # type: ignore[misc]
    except Exception:
        return
    raise AssertionError("FeedingDecision must be frozen")
