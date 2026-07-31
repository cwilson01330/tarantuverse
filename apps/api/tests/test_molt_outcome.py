"""Molt outcome (ADR-015 D6).

Molting is the most dangerous thing a tarantula does and the most common way one
dies, and until this existed there was nowhere to record that a molt went wrong
— the single most important husbandry signal in the hobby lived only in free
text, where nothing could query it.

The load-bearing decision here is that `outcome` is nullable with no default.
"""
import pytest
from datetime import datetime, timezone
from pydantic import ValidationError

from app.schemas.molt import MOLT_OUTCOMES, MoltLogCreate, MoltLogUpdate


NOW = datetime.now(timezone.utc)


def test_a_molt_needs_no_outcome():
    """Most molts are routine and the keeper won't say anything. A log with
    just a date stays a complete record — the value of this field is in the
    exceptions, and demanding it would suppress the ordinary logging that makes
    the exceptions visible."""
    assert MoltLogCreate(molted_at=NOW).outcome is None


def test_outcome_does_not_default_to_successful():
    """The load-bearing test.

    Defaulting to 'successful' would make every historical molt row assert an
    outcome nobody recorded. Most of those molts probably did go fine, but
    "probably fine" and "the keeper said it was fine" are different claims and
    only one of them is ours to make."""
    assert MoltLogCreate(molted_at=NOW).outcome is None


def test_each_outcome_is_accepted():
    for value in MOLT_OUTCOMES:
        assert MoltLogCreate(molted_at=NOW, outcome=value).outcome == value


def test_cleared_picker_is_not_stated_rather_than_invalid():
    """'' arrives when a keeper deselects. Rejecting it would 422 them out of
    logging the molt at all, over a field that was optional to begin with."""
    assert MoltLogCreate(molted_at=NOW, outcome="").outcome is None


def test_unknown_outcome_is_rejected():
    """Free-text outcomes would make the column unanalysable while still
    looking structured."""
    with pytest.raises(ValidationError):
        MoltLogCreate(molted_at=NOW, outcome="a bit dodgy")


def test_the_vocabulary_is_deliberately_small():
    """successful / stuck / lost_limb / fatal. Finer gradations would be
    guesses about a process the keeper mostly didn't watch."""
    assert MOLT_OUTCOMES == ("successful", "stuck", "lost_limb", "fatal")


def test_outcome_is_editable_after_the_fact():
    """A keeper often doesn't know a molt went badly until days later, when a
    leg doesn't come right or the animal dies. If this weren't on the update
    schema the correction would silently drop."""
    upd = MoltLogUpdate(outcome="lost_limb")
    assert upd.outcome == "lost_limb"


def test_update_validates_the_same_vocabulary():
    with pytest.raises(ValidationError):
        MoltLogUpdate(outcome="nope")


def test_fatal_is_recordable_without_touching_the_animal():
    """`fatal` says the animal died IN the molt. It deliberately carries no
    side effect on the animal record — inferring a death from a log entry and
    silently retiring the animal would be the app deciding something that grave
    on the keeper's behalf. The UI offers; the schema doesn't act."""
    molt = MoltLogCreate(molted_at=NOW, outcome="fatal")
    assert molt.outcome == "fatal"
    assert not hasattr(molt, "died_at")
