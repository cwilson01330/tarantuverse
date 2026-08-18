"""ADR-017 — a keeper's stated cadence outranks everything we derive.

WHY THIS MATTERS
----------------
A keeper reported her tarantulas "still show feed every 3 days". Her logs showed
she feeds roughly weekly across all 37 animals — a deliberate style — so measured
against the care sheets every animal she owned was overdue nearly all the time.
The app was telling her continuously that she was failing her collection.

The care sheets weren't wrong: the platform median really is 4 days for slings
and juveniles. What was missing was any way for her to say "this is my cadence".

These tests pin the precedence, and — just as importantly — that the number is
attributed to HER rather than presented as species knowledge.
"""
import pytest

from app.routers.inverts import (
    INTERVAL_SOURCE_GENERIC_DEFAULT,
    INTERVAL_SOURCE_KEEPER,
    INTERVAL_SOURCE_SPECIES,
    INTERVAL_SOURCE_STAGE_DEFAULT,
    _recommended_feeding_interval_with_source as resolve,
)


class FakeSpecies:
    """Only the fields the resolver reads."""

    def __init__(self, sling=None, juvenile=None, adult=None, feeding_mode="predator"):
        self.feeding_frequency_sling = sling
        self.feeding_frequency_juvenile = juvenile
        self.feeding_frequency_adult = adult
        self.feeding_mode = feeding_mode


GBB = FakeSpecies(sling="Every 2-3 days", juvenile="2-3 times per week", adult="Once per week")


# ── The override wins ────────────────────────────────────────────────────────

def test_keeper_interval_beats_the_care_sheet():
    """THE POINT OF ADR-017. The sheet says 3 days for a sling; she feeds
    weekly. Her number wins, because it describes how the animal is actually
    kept rather than what the species generally needs."""
    interval, source = resolve("sling", GBB, keeper_interval=7)
    assert interval == 7
    assert source == INTERVAL_SOURCE_KEEPER


def test_keeper_interval_beats_the_stage_default():
    interval, source = resolve("juvenile", None, keeper_interval=10)
    assert (interval, source) == (10, INTERVAL_SOURCE_KEEPER)


def test_keeper_interval_beats_the_generic_default():
    interval, source = resolve(None, None, keeper_interval=5)
    assert (interval, source) == (5, INTERVAL_SOURCE_KEEPER)


def test_keeper_interval_applies_even_to_a_detritivore():
    """Millipedes normally return (None, None) — they graze and are never
    overdue. A keeper who deliberately sets a cadence anyway gets it: an
    explicit choice beats our judgement that the question is meaningless."""
    millipede = FakeSpecies(feeding_mode="detritivore")
    assert resolve("adult", millipede) == (None, None)
    assert resolve("adult", millipede, keeper_interval=14) == (14, INTERVAL_SOURCE_KEEPER)


# ── Absent means nothing changes ─────────────────────────────────────────────

@pytest.mark.parametrize("absent", [None, 0])
def test_unset_falls_through_to_existing_behaviour(absent):
    """Nullable with no backfill: everyone who never touches this keeps exactly
    today's behaviour. 0 is treated as absent here defensively — the schema and
    a database CHECK both reject it, so it should never arrive, but falling
    through beats marking an animal permanently overdue."""
    assert resolve("sling", GBB, keeper_interval=absent) == (3, INTERVAL_SOURCE_SPECIES)
    assert resolve("juvenile", None, keeper_interval=absent) == (
        7,
        INTERVAL_SOURCE_STAGE_DEFAULT,
    )
    assert resolve(None, None, keeper_interval=absent) == (
        7,
        INTERVAL_SOURCE_GENERIC_DEFAULT,
    )


# ── Honesty ──────────────────────────────────────────────────────────────────

def test_source_distinguishes_a_keeper_number_from_a_species_claim():
    """The UI branches on this. A keeper-set number rendered as "care sheet
    says" would be the app claiming knowledge it doesn't have — the same rule
    that keeps stage defaults from posing as species data."""
    _, keeper = resolve("sling", GBB, keeper_interval=7)
    _, sheet = resolve("sling", GBB)
    assert keeper == INTERVAL_SOURCE_KEEPER
    assert sheet == INTERVAL_SOURCE_SPECIES
    assert keeper != sheet


def test_the_reported_case():
    """Courtney's actual collection: GBB juvenile, sheet says 2-3 times per
    week. Before ADR-017 she was flagged overdue every 3 days while feeding
    weekly. Setting 7 resolves it without touching a single care sheet."""
    before, before_src = resolve("juvenile", GBB)
    after, after_src = resolve("juvenile", GBB, keeper_interval=7)

    assert before == 4 and before_src == INTERVAL_SOURCE_SPECIES  # post-ceil fix
    assert after == 7 and after_src == INTERVAL_SOURCE_KEEPER
