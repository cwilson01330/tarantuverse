"""Grazers are recognised by taxon when no species is linked (audit 2026-10-08 M14).

The server used to read `feeding_mode` from the linked species only, so an
unlinked millipede, isopod or roach got the generic 7-day cadence and was
flagged overdue on Feeding Day, the dashboard and the daily push, while the
mobile collection (which decides by taxon) showed nothing.
"""
import inspect
import re
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.routers import inverts as inverts_router
from app.routers import sitter_passes
from app.routers.inverts import (
    INTERVAL_SOURCE_GENERIC_DEFAULT,
    INTERVAL_SOURCE_KEEPER,
    _recommended_feeding_interval,
    _recommended_feeding_interval_with_source,
)
from app.services import digest_service, sitter_card
from app.utils.feeding_mode import (
    TAXON_FEEDING_MODE,
    effective_feeding_mode,
    has_feeding_cadence,
)

REPO = Path(__file__).resolve().parents[3]


def _species(mode="predator", adult=None):
    return SimpleNamespace(
        feeding_mode=mode,
        feeding_frequency_sling=None,
        feeding_frequency_juvenile=None,
        feeding_frequency_adult=adult,
    )


@pytest.mark.parametrize("taxon", ["millipede", "isopod", "roach"])
def test_unlinked_grazers_get_no_cadence(taxon):
    assert _recommended_feeding_interval_with_source("adult", None, taxon=taxon) == (None, None)
    assert _recommended_feeding_interval(None, None, taxon=taxon) is None


@pytest.mark.parametrize("taxon", ["tarantula", "scorpion", "centipede", "mantis", "other"])
def test_unlinked_predators_keep_the_default(taxon):
    assert _recommended_feeding_interval_with_source(None, None, taxon=taxon) == (
        7, INTERVAL_SOURCE_GENERIC_DEFAULT,
    )


def test_species_that_grazes_wins_over_a_predator_taxon():
    # An 'other' animal linked to an omnivore species.
    assert _recommended_feeding_interval_with_source(
        "adult", _species("omnivore", adult="every 7 days"), taxon="other",
    ) == (None, None)


def test_predator_default_on_a_grazer_species_does_not_resurrect_a_cadence():
    # invert_species.feeding_mode is NOT NULL with a 'predator' server default,
    # so a millipede species left at the default must not start nagging.
    assert _recommended_feeding_interval_with_source(
        "adult", _species("predator", adult="every 7 days"), taxon="millipede",
    ) == (None, None)


def test_keeper_interval_still_wins_for_a_grazer():
    assert _recommended_feeding_interval_with_source(
        "adult", None, 14, taxon="isopod",
    ) == (14, INTERVAL_SOURCE_KEEPER)


def test_effective_mode():
    assert effective_feeding_mode("millipede") == "detritivore"
    assert effective_feeding_mode("roach") == "omnivore"
    assert effective_feeding_mode("tarantula") == "predator"
    assert effective_feeding_mode(None) == "predator"
    assert effective_feeding_mode("tarantula", _species("detritivore")) == "detritivore"
    assert has_feeding_cadence("mantis") and not has_feeding_cadence("isopod")


def test_every_cadence_caller_passes_the_taxon():
    """A caller that forgets `taxon=` silently brings the bug back."""
    for module in (inverts_router, digest_service, sitter_passes):
        src = inspect.getsource(module)
        calls = re.findall(r"_recommended_feeding_interval(?:_with_source)?\((.*?)\)\n", src, re.S)
        real = [c for c in calls if "life_stage" in c and "Optional" not in c]
        assert real, f"no call sites found in {module.__name__}"
        for c in real:
            assert "taxon=" in c, f"{module.__name__} calls the cadence resolver without taxon=: {c!r}"


def test_sitter_card_unlinked_millipede_grazes():
    src = inspect.getsource(sitter_card.compose_invert_card)
    assert "has_feeding_cadence" in src


def test_taxon_defaults_match_the_mobile_registry():
    reg = REPO / "apps/mobile/src/lib/inverts.ts"
    if not reg.exists():
        pytest.skip("mobile app not in this checkout")
    text = reg.read_text(encoding="utf-8")
    block = text[text.index("export const INVERT_TAXA"):text.index("export const INVERT_TAXON_ORDER")]
    modes = dict(re.findall(r"key: '(\w+)'[^}]*?feedingMode: '(\w+)'", block, re.S))
    assert len(modes) >= 11, modes
    mobile_grazers = {t: m for t, m in modes.items() if m != "predator"}
    assert mobile_grazers == TAXON_FEEDING_MODE, (
        f"mobile registry feedingMode {mobile_grazers} != API TAXON_FEEDING_MODE "
        f"{TAXON_FEEDING_MODE} (apps/api/app/utils/feeding_mode.py)"
    )
