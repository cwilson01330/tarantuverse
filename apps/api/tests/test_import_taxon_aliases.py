"""Free-text taxon words in an import file resolve onto the canonical taxa."""
import pytest

from app.services.import_service import TAXA, _normalize_taxon


@pytest.mark.parametrize(
    "word",
    ["isopod", "Isopods", "pillbug", "Pill Bug", "woodlouse", "woodlice", "roly poly", "Roly-Poly"],
)
def test_isopod_aliases(word):
    assert _normalize_taxon(word) == "isopod"


def test_roach_aliases_still_resolve():
    assert _normalize_taxon("Roaches") == "roach"
    assert _normalize_taxon("hisser") == "roach"


def test_every_canonical_taxon_resolves_to_itself():
    for t in TAXA:
        assert _normalize_taxon(t) == t
