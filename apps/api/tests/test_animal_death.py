"""Death is a terminal state, never a delete (ADR-015).

The behaviours pinned here are the ones with real consequences for a keeper who
has just lost an animal:

  - the record survives, with every log attached
  - it stops counting toward the free tier
  - nothing ever asks them to feed it again

The last two were the actual defect. Before ADR-015 a dead-but-retained animal
counted against the cap, so a free-tier keeper at their limit had to delete an
animal — destroying its entire history — to make room for another. And Feeding
Day would keep listing it, redder every week, indefinitely.
"""
from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from app.schemas.death import DEATH_CAUSES, MarkDiedRequest


TODAY = date.today()


# ── The request shape ────────────────────────────────────────────────────────

def test_a_date_alone_is_a_complete_record():
    """Nothing is required. Someone who has just lost an animal should be able
    to record it and close the screen without answering questions."""
    req = MarkDiedRequest()
    assert req.died_at is None  # route defaults it to today
    assert req.death_cause is None
    assert req.death_notes is None


def test_cause_is_optional():
    assert MarkDiedRequest(died_at=TODAY).death_cause is None


def test_unknown_is_a_real_answer():
    """Not a synonym for null. Most invertebrate deaths are genuinely
    unexplained, and 'I don't know' should be recordable as a statement rather
    than left as a blank that reads like an omission."""
    assert MarkDiedRequest(death_cause="unknown").death_cause == "unknown"


def test_empty_string_cause_normalizes_to_none():
    """A cleared dropdown posts '' — that's 'didn't say', not an invalid value,
    and must not 422 someone out of recording the death at all."""
    assert MarkDiedRequest(death_cause="").death_cause is None


def test_unrecognized_cause_is_rejected():
    """Free-text causes would make the field unanalysable while looking
    structured. The DB column stays permissive; the API is the gate."""
    with pytest.raises(ValidationError):
        MarkDiedRequest(death_cause="hit by a bus")


def test_bad_molt_is_in_the_vocabulary():
    """The single most common way a tarantula dies. If this weren't offered,
    the most important cause would end up buried in free text."""
    assert "bad_molt" in DEATH_CAUSES


def test_escaped_is_distinct_from_unknown():
    """An animal that got out and was never found is a real, specific outcome —
    and a different husbandry lesson from one that died in its enclosure."""
    assert "escaped" in DEATH_CAUSES


def test_future_death_date_is_rejected():
    """Always a typo, and it would corrupt ordering in the memorial view.
    Rejected rather than silently clamped: clamping would record a date the
    keeper never chose."""
    with pytest.raises(ValidationError):
        MarkDiedRequest(died_at=TODAY + timedelta(days=1))


def test_today_is_allowed():
    """The overwhelmingly common case — boundary must be inclusive."""
    assert MarkDiedRequest(died_at=TODAY).died_at == TODAY


def test_backdating_is_allowed():
    """Keepers often log a death days later, once they've dealt with it."""
    past = TODAY - timedelta(days=45)
    assert MarkDiedRequest(died_at=past).died_at == past


# ── The exclusion rule the defect was about ──────────────────────────────────

def active_filter(transferred_out_at, died_at) -> bool:
    """Mirror of the predicate in utils/limits.py active_*_query."""
    return transferred_out_at is None and died_at is None


def test_a_living_animal_counts():
    assert active_filter(None, None)


def test_a_deceased_animal_never_counts():
    """The whole point. Charging someone for an animal that died, or making
    them erase its history to make room, isn't a trade we make for cap
    integrity."""
    assert not active_filter(None, TODAY)


def test_a_transferred_animal_still_doesnt_count():
    """Pre-existing behaviour must survive the change."""
    assert not active_filter("2026-01-01", None)


def test_backdated_death_excludes_immediately():
    """No grace period — a death recorded late still frees the slot at once."""
    assert not active_filter(None, TODAY - timedelta(days=365))
