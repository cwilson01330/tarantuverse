"""The per-taxon food chips on the feeding forms (audit-2 M6).

`FOOD_VOCABULARY` lives in two hand-kept copies, apps/web/src/lib/inverts.ts and
apps/mobile/src/lib/inverts.ts. test_taxon_lists_in_sync.py checks both name
every taxon; this file checks the CONTENTS:

* web and mobile offer the same foods, in the same order (the first one is the
  default for a new feeding), with the same prey-size flag;
* every list ends with "Other" (it opens the free-text field) and has no
  duplicates;
* grazers (the taxa that are not predators in the mobile registry's
  feedingMode) get no prey-size picker and no live-prey default, and predators
  do get a prey-size picker.

The TypeScript files are read as text and the tests SKIP when they are absent
(an API-only checkout).
"""
from __future__ import annotations

import re

import pytest

from tests.test_taxon_lists_in_sync import (
    CANONICAL,
    MOB_INVERTS,
    WEB_INVERTS,
    _block,
    mobile_feeding_modes,
)

ANCHOR = r"export const FOOD_VOCABULARY: Record<InvertTaxon, FoodVocabulary> = \{"
_ENTRY = re.compile(r"(\w+):\s*\{\s*foods:\s*\[([^\]]*)\]\s*,\s*preySize:\s*(true|false)\s*,?\s*\}")

# Foods that are live prey. A grazer defaulting to one of these is the bug
# this vocabulary exists to fix.
LIVE_PREY = {"Cricket", "Dubia Roach", "Red Runner", "Mealworm", "Superworm",
             "Fruit fly", "House fly", "Blue bottle fly"}


def vocabulary(rel: str) -> dict[str, tuple[list[str], bool]]:
    block = _block(rel, ANCHOR)
    out = {
        taxon: (re.findall(r"'([^']*)'", foods), flag == "true")
        for taxon, foods, flag in _ENTRY.findall(block)
    }
    assert out, f"{rel}: could not parse FOOD_VOCABULARY - update test_food_vocabulary.py"
    return out


def test_web_and_mobile_offer_the_same_foods():
    web, mob = vocabulary(WEB_INVERTS), vocabulary(MOB_INVERTS)
    assert set(web) == set(mob) == CANONICAL
    for taxon in sorted(CANONICAL):
        assert web[taxon] == mob[taxon], (
            f"FOOD_VOCABULARY[{taxon!r}] differs: web {web[taxon]} vs mobile {mob[taxon]} "
            f"({WEB_INVERTS} vs {MOB_INVERTS})"
        )


@pytest.mark.parametrize("rel", [WEB_INVERTS, MOB_INVERTS])
def test_every_list_ends_with_other_and_has_no_duplicates(rel):
    for taxon, (foods, _) in vocabulary(rel).items():
        assert foods, f"{rel}: {taxon} has no foods"
        assert foods[-1] == "Other", f"{rel}: {taxon} must end with 'Other' (it opens the free-text field)"
        assert foods.count("Other") == 1, f"{rel}: {taxon} lists 'Other' twice"
        assert len(foods) == len(set(f.lower() for f in foods)), f"{rel}: {taxon} has a duplicate food"
        assert foods[0] != "Other", f"{rel}: {taxon} would default to 'Other'"
        # food_type is VARCHAR(100)
        assert all(0 < len(f) <= 100 for f in foods)


def test_grazers_get_grazer_food_and_no_prey_size():
    modes = mobile_feeding_modes()
    vocab = vocabulary(MOB_INVERTS)
    for taxon in sorted(CANONICAL):
        foods, prey_size = vocab[taxon]
        if modes[taxon] == "predator":
            assert prey_size, f"{taxon} is a predator: its feeding form should offer prey size"
        else:
            assert not prey_size, f"{taxon} is a {modes[taxon]}: prey size means nothing for it"
            assert foods[0] not in LIVE_PREY, f"{taxon} would default to live prey ({foods[0]!r})"


def test_fly_eaters_are_offered_flies():
    """The audit's example: mantises and jumping spiders eat flies."""
    vocab = vocabulary(MOB_INVERTS)
    for taxon in ("mantis", "true_spider"):
        assert "Fruit fly" in vocab[taxon][0]
        assert "House fly" in vocab[taxon][0]


def test_detritivores_are_offered_leaf_litter_and_calcium():
    vocab = vocabulary(MOB_INVERTS)
    for taxon in ("millipede", "isopod"):
        foods = vocab[taxon][0]
        assert foods[0] == "Leaf litter"
        assert "Rotting wood" in foods
        assert "Calcium (cuttlebone)" in foods
