"""
The per-taxon care facts seed must not assert anything it can't back up.

These fields exist because `venom_severity` can't describe a millipede that
burns you or a roach that flies out of the tub. That makes a wrong value here
worse than no value: the care sheets render NULL as nothing and `false` as
"No", so a bad default becomes containment advice a keeper acts on.

The seed therefore only claims facts that hold for a whole order or class, and
these tests pin both halves of that — what it asserts, and what it refuses to.
"""
import importlib.util
import os

import pytest


# Loaded by path: the seed scripts live at the apps/api root, not in a package.
_SPEC = importlib.util.spec_from_file_location(
    "seed_per_taxon_care_facts",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 "seed_per_taxon_care_facts.py"),
)
seed = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(seed)


class S:
    def __init__(self, taxon, scientific_name="X y", order_name=None, family=None):
        self.taxon = taxon
        self.scientific_name = scientific_name
        self.order_name = order_name
        self.family = family


# ---------------------------------------------------------------------------
# Millipede chemistry splits by ORDER, and the split is the whole point
# ---------------------------------------------------------------------------

def test_flat_backed_millipedes_are_recorded_as_cyanide_producers():
    """Harpaphe haydeniana is *called* the cyanide millipede. Labelling it a
    quinone producer would be the exact confident-wrong-answer these fields
    were added to prevent."""
    f = seed.facts_for(
        S("millipede", "Harpaphe haydeniana", order_name="Polydesmida")
    )
    assert f["defensive_secretion"] == "hydrogen_cyanide"


@pytest.mark.parametrize("order", ["Spirobolida", "Spirostreptida"])
def test_round_backed_millipedes_are_recorded_as_quinone_producers(order):
    f = seed.facts_for(S("millipede", "Archispirostreptus gigas", order_name=order))
    assert f["defensive_secretion"] == "benzoquinone"


def test_an_unrecognised_millipede_order_gets_no_secretion_claim():
    """Silence beats a guess. The other class-level facts still apply."""
    f = seed.facts_for(S("millipede", "Glomeris marginata", order_name="Glomerida"))
    assert "defensive_secretion" not in f
    assert f["supplemental_calcium_required"] is True


def test_order_matching_is_case_insensitive():
    """`order_name` is free text in the catalog."""
    assert (
        seed.facts_for(S("millipede", "X", order_name="polydesmida"))["defensive_secretion"]
        == "hydrogen_cyanide"
    )


def test_every_millipede_gets_the_class_level_facts():
    f = seed.facts_for(S("millipede", "X", order_name="Spirobolida"))
    assert f["developmental_class"] == "anamorphic"
    assert f["supplemental_calcium_required"] is True
    assert f["moisture_gradient_required"] is True


# ---------------------------------------------------------------------------
# Vinegaroons
# ---------------------------------------------------------------------------

def test_vinegaroons_are_recorded_as_acetic_acid_sprayers():
    f = seed.facts_for(
        S("vinegaroon", "Mastigoproctus giganteus", order_name="Thelyphonida")
    )
    assert f["defensive_secretion"] == "acetic_acid"


def test_vinegaroon_falls_back_to_family_when_order_is_missing():
    f = seed.facts_for(
        S("vinegaroon", "Typopeltis crucifer", family="Thelyphonidae")
    )
    assert f["defensive_secretion"] == "acetic_acid"


# ---------------------------------------------------------------------------
# Isopods
# ---------------------------------------------------------------------------

def test_isopods_get_the_two_facts_that_keep_a_culture_alive():
    f = seed.facts_for(S("isopod", "Armadillidium vulgare"))
    assert f["supplemental_calcium_required"] is True
    assert f["moisture_gradient_required"] is True


def test_isopod_secretion_is_a_recorded_none_not_a_blank():
    """"We checked, it hasn't" is information. A blank says nobody looked."""
    assert seed.facts_for(S("isopod", "Cubaris murina"))["defensive_secretion"] == "none"


@pytest.mark.parametrize(
    "name", ["Trichorhina tomentosa", "Porcellionides pruinosus", "Porcellio laevis"]
)
def test_clean_up_crew_species_are_marked_as_such(name):
    assert seed.facts_for(S("isopod", name))["bioactive_suitable"] is True


@pytest.mark.parametrize(
    "name", ['Cubaris sp. "Panda King"', 'Cubaris sp. "Rubber Ducky"', "Cubaris murina"]
)
def test_cubaris_are_not_advertised_as_clean_up_crew(name):
    """Biologically fine, but they're expensive display animals. Marking them
    invites a beginner to spend $200 on springtail work."""
    assert "bioactive_suitable" not in seed.facts_for(S("isopod", name))


# ---------------------------------------------------------------------------
# Stage vocabulary
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "taxon",
    ["mantis", "scorpion", "centipede", "vinegaroon", "whip_spider", "roach"],
)
def test_instar_taxa_are_not_left_in_spider_vocabulary(taxon):
    """Roach and whip_spider were missed on the first pass — the dry run
    showed 39 species getting no stage_scheme, and 38 of them count in
    instars. Only `other` has a legitimate reason to be blank."""
    assert seed.facts_for(S(taxon, "X"))["stage_scheme"] == "instar"


def test_only_the_unknown_taxon_is_left_without_a_stage_scheme():
    """A missing stage_scheme should mean "we can't say", not "we forgot"."""
    known = [
        "tarantula", "scorpion", "centipede", "whip_spider", "vinegaroon",
        "true_spider", "millipede", "mantis", "roach", "isopod",
    ]
    for taxon in known:
        f = seed.facts_for(S(taxon, "X", order_name="Spirobolida"))
        assert "stage_scheme" in f, f"{taxon} would ship with no stage vocabulary"
    assert "stage_scheme" not in seed.facts_for(S("other", "X"))


@pytest.mark.parametrize("taxon", ["tarantula", "true_spider"])
def test_spiders_keep_sling_juvenile_adult(taxon):
    assert seed.facts_for(S(taxon, "X"))["stage_scheme"] == "sling_juvenile_adult"


@pytest.mark.parametrize("taxon", ["millipede", "isopod"])
def test_taxa_without_stages_say_so(taxon):
    assert seed.facts_for(S(taxon, "X", order_name="Spirobolida"))["stage_scheme"] == "none"


# ---------------------------------------------------------------------------
# What it refuses to claim
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("taxon", ["roach", "mantis", "millipede", "isopod", "tarantula"])
def test_flight_and_climbing_are_never_guessed(taxon):
    """These two vary enormously between roach species and are the facts a
    roach keeper most needs right. A taxon-level average here would be
    containment advice invented from nothing."""
    f = seed.facts_for(S(taxon, "X", order_name="Spirobolida"))
    assert "can_fly" not in f
    assert "can_climb_smooth" not in f


@pytest.mark.parametrize("taxon", ["mantis", "scorpion"])
def test_instar_counts_are_never_guessed(taxon):
    """Mantids run roughly 5–9 depending on species."""
    assert "typical_instars_to_maturity" not in seed.facts_for(S(taxon, "X"))


def test_roaches_get_their_stage_vocabulary_and_nothing_else():
    """A roach's stage scheme is a fact about the whole group — they're
    hemimetabolous and develop through nymphal instars.

    Everything else a roach keeper needs (does it fly, does it climb glass)
    is species-specific and stays blank. This test previously asserted an
    empty dict, which conflated "we can't generalise the husbandry" with
    "we can't even say what its life stages are called".
    """
    assert seed.facts_for(S("roach", "Blaptica dubia")) == {"stage_scheme": "instar"}


def test_the_catch_all_taxon_produces_no_claims():
    """`other` is by definition unmodellable — anything asserted about it
    would be asserted about an unknown animal."""
    assert seed.facts_for(S("other", "X")) == {}


def test_every_value_is_a_legal_column_value():
    """A typo'd literal would be rejected by the CHECK constraint at write
    time — after the script has already printed a confident dry run."""
    from app.schemas.invert_species import (
        DEFENSIVE_SECRETION_PATTERN,
        STAGE_SCHEME_PATTERN,
        DEVELOPMENTAL_CLASS_PATTERN,
    )
    import re

    samples = [
        S("millipede", "X", order_name="Polydesmida"),
        S("millipede", "X", order_name="Spirobolida"),
        S("vinegaroon", "X", order_name="Thelyphonida"),
        S("isopod", "Porcellio laevis"),
        S("mantis", "X"),
        S("tarantula", "X"),
        S("centipede", "X"),
    ]
    patterns = {
        "defensive_secretion": DEFENSIVE_SECRETION_PATTERN,
        "stage_scheme": STAGE_SCHEME_PATTERN,
        "developmental_class": DEVELOPMENTAL_CLASS_PATTERN,
    }
    for s in samples:
        for field, value in seed.facts_for(s).items():
            if field in patterns:
                assert re.match(patterns[field], value), (
                    f"{s.taxon}: {field}={value!r} violates its CHECK constraint"
                )
