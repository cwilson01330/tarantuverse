"""Feeding-frequency parser invariants.

Regression suite for a bug reported by a keeper on 2026-07-28: her adult
Aphonopelma moderatum showed "Feed now — Every 1d". The care sheet said
"1 prey every 10-18 days"; the old parser took the first number in the string
("1", the prey count) and ignored what followed it.

The failure was one-directional — always toward feeding MORE often, because the
leading number is a prey count and prey counts are small. ~245 of 655 catalog
strings were affected. Chronic overfeeding of terrestrial tarantulas causes
obesity and molt complications, so these cases are correctness-critical, not
cosmetic.

Every string below is a real value from invert_species in production, with the
count of rows carrying it at the time of the fix.
"""
import pytest

from app.services.feeding_reminder_service import parse_frequency_string


@pytest.mark.parametrize(
    "text,expected_upper",
    [
        # The reported case. Was 1.
        ("1 prey every 10-18 days", 18),
        # Interval phrasing in weeks — was 2.
        ("Every 1-2 weeks", 14),
        ("1 prey every 1-2 weeks", 14),      # was 1
        ("Once every 1-2 weeks", 14),        # was 1
        # Frequency phrasing — count per period, was the raw count.
        ("1 prey per week", 7),              # was 1
        ("1-2 prey per week", 7),            # was 2
        # The upper bound rounds UP as of 2026-08-09. Twice a week is every 3.5
        # days; the July fix produced 3 because 7 // 2 floors — an incidental
        # result of the arithmetic, not a decision about rounding. Callers use
        # this bound as "should have fed by now", so flooring declared the
        # animal overdue half a day early on every cycle. Reported by a keeper
        # as juveniles perpetually showing "feed every 3 days".
        #
        # These changes tighten the parser rather than relax the July
        # regression — the raw-count bug it guards is still covered by the
        # "was N" cases above.
        ("2 prey per week", 4),              # was 2, then 3
        ("2-3 prey per week", 4),
        ("2-3 small prey per week", 4),
        # Word counts — previously fell through to the fake "10" default.
        ("Once per week", 7),
        ("Twice per week", 4),
        ("weekly", 7),
        ("2x per week", 4),
        # Interval phrasing in days — these were the ONLY correct cases before.
        ("every 2-3 days", 3),
        ("Every 4-5 days", 5),
        ("Every 3-4 days", 4),
        ("Every 5-7 days", 7),
        ("every 7-10 days", 10),
        ("Every 3 days", 3),
    ],
)
def test_real_catalog_strings(text, expected_upper):
    parsed = parse_frequency_string(text)
    assert parsed is not None, f"failed to parse {text!r}"
    assert parsed[1] == expected_upper, f"{text!r} -> {parsed}, expected upper {expected_upper}"


@pytest.mark.parametrize(
    "text",
    [
        "continuous — leaf litter, decaying hardwood, veg + calcium",
        "continuous (chow + fresh produce for moisture)",
        "",
        None,
        "as needed",
    ],
)
def test_unreadable_returns_none_not_a_fabricated_default(text):
    """The old default of (10, 10) was indistinguishable from a real
    'every 10 days'. Detritivore grazing has no live-prey cadence and must not
    be given one."""
    assert parse_frequency_string(text) is None


def test_more_feedings_per_week_means_shorter_interval():
    """Guards the inversion in frequency mode. Getting this backwards would
    tell keepers to feed a hungry sling less often."""
    once = parse_frequency_string("Once per week")
    twice = parse_frequency_string("Twice per week")
    assert twice[1] < once[1]


def test_range_upper_bound_is_the_longer_interval():
    """Upper bound is used as 'should have fed by now', so it must be the
    LONGER wait, never the shorter one."""
    lo, hi = parse_frequency_string("1 prey every 10-18 days")
    assert (lo, hi) == (10, 18)


def test_never_returns_a_daily_cadence_for_a_weekly_care_sheet():
    """The specific shape of the reported bug — a weekly-or-slower care sheet
    resolving to a 1-day interval."""
    for text in ["1 prey per week", "1 prey every 1-2 weeks", "1 prey every 10-18 days"]:
        assert parse_frequency_string(text)[1] > 1
