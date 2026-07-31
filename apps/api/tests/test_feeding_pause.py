"""Rules for when a feeding pause ends.

The bug these pin: nothing anywhere cleared a pause. Every feeding endpoint —
single, bulk, quick-feed, both products — inserted a log and left the pause
columns untouched. So an animal you successfully fed kept its "Paused" badge on
Feeding Day and stayed permanently exempt from overdue detection.

That's the dangerous direction for a husbandry app. A stale pause doesn't
produce a visible error; it produces silence. The one animal genuinely being
forgotten becomes the one animal the app has stopped mentioning.
"""
from datetime import date, timedelta

from app.utils.feeding_pause import is_feeding_paused, resume_if_accepted


TODAY = date(2026, 7, 30)


class FakeAnimal:
    """Stands in for any paused-capable model. The real ones differ only in
    which table they live in; the rule is identical across all of them."""

    def __init__(self, reason=None, until=None):
        self.feeding_paused_reason = reason
        self.feeding_paused_until = until


# ── is_feeding_paused ────────────────────────────────────────────────────────

def test_reason_with_future_until_is_paused():
    assert is_feeding_paused("premolt", TODAY + timedelta(days=5), TODAY)


def test_reason_with_no_until_is_paused_indefinitely():
    """An open-ended pause ends when a person says so, not on a timer."""
    assert is_feeding_paused("premolt", None, TODAY)


def test_until_today_is_still_paused():
    """Inclusive: "paused until the 30th" covers the 30th. Excluding it would
    un-pause the animal a day early and re-flag it as overdue."""
    assert is_feeding_paused("premolt", TODAY, TODAY)


def test_expired_until_is_not_paused():
    assert not is_feeding_paused("premolt", TODAY - timedelta(days=1), TODAY)


def test_no_reason_is_not_paused():
    """`until` alone is not a pause. This is why callers must never test the
    reason by itself — three of the six inline copies this module replaced got
    it right only by accident of ordering."""
    assert not is_feeding_paused(None, TODAY + timedelta(days=5), TODAY)
    assert not is_feeding_paused("", TODAY + timedelta(days=5), TODAY)


# ── resume_if_accepted ───────────────────────────────────────────────────────

def test_accepted_feeding_clears_the_pause():
    a = FakeAnimal("premolt", TODAY + timedelta(days=10))
    assert resume_if_accepted(a, accepted=True) is True
    assert a.feeding_paused_reason is None
    assert a.feeding_paused_until is None


def test_refused_feeding_leaves_the_pause_alone():
    """The load-bearing test. An animal in premolt refusing a cricket is
    CONFIRMING the pause, not ending it. Clearing here would fight the keeper's
    own judgment and re-flag the animal as overdue for behaving exactly as
    expected."""
    a = FakeAnimal("premolt", TODAY + timedelta(days=10))
    assert resume_if_accepted(a, accepted=False) is False
    assert a.feeding_paused_reason == "premolt"
    assert a.feeding_paused_until == TODAY + timedelta(days=10)


def test_unpaused_animal_reports_no_change():
    """Return value drives the "resumed N animals" message, so a normal feeding
    must not claim to have resumed anything."""
    assert resume_if_accepted(FakeAnimal(), accepted=True) is False


def test_expired_pause_is_tidied_away_on_feeding():
    """Deliberately keyed on the reason, not on is_feeding_paused: an expired
    pause is already inert, and leaving the columns set lets stale UI resurrect
    later ("Edit pause" on an animal nobody paused)."""
    a = FakeAnimal("premolt", TODAY - timedelta(days=30))
    assert resume_if_accepted(a, accepted=True) is True
    assert a.feeding_paused_reason is None


def test_model_without_pause_columns_is_safe():
    """Callers shouldn't need to branch on taxon before calling this."""
    class NoColumns:
        pass

    assert resume_if_accepted(NoColumns(), accepted=True) is False


def test_no_db_means_no_twin_lookup():
    """db is optional — HV animals have no consolidation twin, and passing one
    for them would be a pointless query."""
    a = FakeAnimal("recovering", None)
    assert resume_if_accepted(a, accepted=True, db=None) is True
    assert a.feeding_paused_reason is None
