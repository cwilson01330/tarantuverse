"""Per-animal event log (ADR-015 D5).

Colonies have had an event log since ADR-010; individual animals had nothing.
Recording "she was injured on the 14th and recovered by the 20th" or "escaped,
found behind the shelf two days later" had literally nowhere to go except the
single overwritable `notes` blob on the animal.
"""
from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from app.models.animal_event import ANIMAL_EVENT_SEVERITIES, ANIMAL_EVENT_TYPES
from app.schemas.animal_event import AnimalEventCreate, AnimalEventUpdate


TODAY = date.today()


# ── Vocabulary ───────────────────────────────────────────────────────────────

def test_every_type_is_accepted():
    for t in ANIMAL_EVENT_TYPES:
        assert AnimalEventCreate(event_type=t).event_type == t


def test_unknown_type_is_rejected():
    with pytest.raises(ValidationError):
        AnimalEventCreate(event_type="vibes")


def test_recovered_exists():
    """The counterpart to injury/illness/escape. Without it the log can only
    record things going wrong, which is both a depressing timeline and a false
    picture — animals do recover, and a keeper should be able to close the
    loop on an injury they logged."""
    assert "recovered" in ANIMAL_EVENT_TYPES


def test_escape_exists():
    """A real and common event that isn't a death and isn't an injury. It has
    husbandry consequences (how did it get out?) worth recording separately."""
    assert "escape" in ANIMAL_EVENT_TYPES


# ── Optionality ──────────────────────────────────────────────────────────────

def test_type_alone_is_a_complete_event():
    """Date defaults server-side, severity and notes are optional. Logging
    should never be a form-filling exercise."""
    e = AnimalEventCreate(event_type="observation")
    assert e.occurred_at is None
    assert e.severity is None
    assert e.notes is None


def test_severity_is_optional():
    """Only meaningful for injury/illness. An observation has no severity, and
    demanding one would invite a judgment the keeper never made."""
    assert AnimalEventCreate(event_type="observation").severity is None


def test_cleared_severity_is_not_stated_rather_than_invalid():
    assert AnimalEventCreate(event_type="injury", severity="").severity is None


def test_unknown_severity_is_rejected():
    with pytest.raises(ValidationError):
        AnimalEventCreate(event_type="injury", severity="catastrophic")


def test_severity_vocabulary():
    assert ANIMAL_EVENT_SEVERITIES == ("minor", "moderate", "severe")


# ── Dates ────────────────────────────────────────────────────────────────────

def test_backdating_is_normal():
    """Most events are noticed after the fact — you find the injury, you don't
    watch it happen."""
    past = TODAY - timedelta(days=10)
    assert AnimalEventCreate(event_type="injury", occurred_at=past).occurred_at == past


def test_today_is_allowed():
    assert AnimalEventCreate(event_type="injury", occurred_at=TODAY).occurred_at == TODAY


def test_future_is_rejected():
    with pytest.raises(ValidationError):
        AnimalEventCreate(event_type="injury", occurred_at=TODAY + timedelta(days=1))


# ── Corrections ──────────────────────────────────────────────────────────────

def test_events_are_editable():
    """They get revised more than most logs — an 'injury' turns out to have
    been a mismolt, a severity is downgraded once the animal recovers. Making
    these read-only would push keepers into delete-and-re-add, which loses the
    original date."""
    upd = AnimalEventUpdate(event_type="bad_molt", severity="moderate")
    assert upd.event_type == "bad_molt"
    assert upd.severity == "moderate"


def test_update_validates_the_same_vocabulary():
    with pytest.raises(ValidationError):
        AnimalEventUpdate(event_type="vibes")
    with pytest.raises(ValidationError):
        AnimalEventUpdate(severity="apocalyptic")
    with pytest.raises(ValidationError):
        AnimalEventUpdate(occurred_at=TODAY + timedelta(days=1))


def test_empty_update_changes_nothing():
    """The router uses exclude_unset, so an empty body must not null every
    field. This pins that the schema doesn't fabricate defaults."""
    assert AnimalEventUpdate().model_dump(exclude_unset=True) == {}


# ── The invariant that matters ───────────────────────────────────────────────

def test_death_is_an_event_type_but_not_the_source_of_truth():
    """`death` exists so the timeline reads coherently ("...fed, molted, died").

    But liveness is decided by `died_at` on the animal and nowhere else.
    Deriving it by scanning an event log would mean one deleted or edited row
    could bring a dead animal back into the collection — and events are
    explicitly editable and deletable, which makes that a matter of when, not
    if."""
    assert "death" in ANIMAL_EVENT_TYPES
    event = AnimalEventCreate(event_type="death")
    assert not hasattr(event, "died_at")


def test_exactly_one_parent_predicate():
    """Mirror of the CHECK in aev_20260731. Unlike the older log tables — which
    can only manage at-least-one because dual-write rows legitimately populate
    two legacy FKs — this table is new and gets to be strict."""

    def ok(invert_id, animal_id) -> bool:
        return (invert_id is not None and animal_id is None) or (
            invert_id is None and animal_id is not None
        )

    assert ok("inv", None)
    assert ok(None, "animal")
    assert not ok(None, None)      # orphan
    assert not ok("inv", "animal")  # can't belong to both products
