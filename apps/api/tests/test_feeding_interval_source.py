"""Feeding-cadence provenance invariants.

Tarantuverse supplies a fallback feeding interval when an animal has no linked
species — deliberately, as a safety net, because invertebrate cadences cluster
in days rather than the orders-of-magnitude spread that made Herpetoverse
decline to guess (`_animal_feeding_interval` returns None there).

The safety net is fine. Presenting it as species guidance is not. These tests
pin the distinction so a future refactor can't quietly drop `interval_source`
and leave the UI rendering "every ~7d" for an animal we know nothing about.

Pure-function tests over a stub species — no database.
"""
from types import SimpleNamespace

import pytest

from app.routers.inverts import (
    INTERVAL_SOURCE_GENERIC_DEFAULT,
    INTERVAL_SOURCE_SPECIES,
    INTERVAL_SOURCE_STAGE_DEFAULT,
    _recommended_feeding_interval_with_source,
)


def _species(**kw):
    return SimpleNamespace(
        feeding_mode=kw.get("feeding_mode", "predator"),
        feeding_frequency_sling=kw.get("sling"),
        feeding_frequency_juvenile=kw.get("juvenile"),
        feeding_frequency_adult=kw.get("adult"),
    )


def test_species_frequency_is_attributed_to_the_care_sheet():
    interval, source = _recommended_feeding_interval_with_source(
        "juvenile", _species(juvenile="every 5-7 days")
    )
    assert source == INTERVAL_SOURCE_SPECIES
    assert interval == 7  # upper bound = "should have fed by now"


def test_unknown_stage_falls_back_to_shortest_species_frequency_still_attributed():
    """Still species data, so still honest to call it a species cadence."""
    interval, source = _recommended_feeding_interval_with_source(
        None, _species(sling="every 3-4 days", adult="every 10-14 days")
    )
    assert source == INTERVAL_SOURCE_SPECIES
    assert interval == 4  # shortest defined — flags soonest


def test_no_species_but_known_stage_is_labeled_a_default():
    interval, source = _recommended_feeding_interval_with_source("sling", None)
    assert source == INTERVAL_SOURCE_STAGE_DEFAULT
    assert interval == 5


def test_nothing_to_go_on_is_labeled_a_generic_default():
    """The case the honesty audit flagged — this used to render as
    'every ~7d' with no hint that we'd invented the number."""
    interval, source = _recommended_feeding_interval_with_source(None, None)
    assert source == INTERVAL_SOURCE_GENERIC_DEFAULT
    assert interval == 7


def test_species_present_but_no_frequencies_is_still_a_default():
    """A linked species doesn't imply we have cadence data for it."""
    _, source = _recommended_feeding_interval_with_source("adult", _species())
    assert source == INTERVAL_SOURCE_STAGE_DEFAULT


def test_detritivores_get_no_cadence_at_all():
    """Millipedes graze substrate — there is no live-prey schedule to claim."""
    assert _recommended_feeding_interval_with_source(
        "adult", _species(feeding_mode="detritivore", adult="every 7 days")
    ) == (None, None)


@pytest.mark.parametrize("stage,expected", [("sling", 5), ("juvenile", 7), ("adult", 10)])
def test_defaults_lean_shorter_for_smaller_animals(stage, expected):
    interval, source = _recommended_feeding_interval_with_source(stage, None)
    assert (interval, source) == (expected, INTERVAL_SOURCE_STAGE_DEFAULT)
