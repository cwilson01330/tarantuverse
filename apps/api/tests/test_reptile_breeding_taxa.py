"""
Herpetoverse breeding is open to every HV taxon, not just snake/lizard/frog.

`TaxonStr` in schemas/reptile_breeding.py used to be
Literal["snake", "lizard", "frog"], so a turtle, tortoise, salamander or
"other" keeper got a 422 on POST /reptile-pairings/ even though the DB CHECK
on `animals.taxon` (and `reptile_pairings.taxon`) allowed all seven.

Also pins `_animal_display`: `Animal.taxon` is a plain VARCHAR (ADR-011), so
the unnamed-animal fallback must not call `.value` on it.
"""
import uuid
from datetime import date
from typing import get_args

import pytest
from pydantic import ValidationError

from app.models.animal import ANIMAL_TAXON_VALUES
from app.routers.reptile_pairings import _animal_display
from app.schemas.reptile_breeding import ReptilePairingCreate, TaxonStr


def _payload(taxon):
    return {
        "taxon": taxon,
        "male_id": str(uuid.uuid4()),
        "female_id": str(uuid.uuid4()),
        "paired_date": date(2026, 3, 1).isoformat(),
    }


def test_taxon_literal_matches_animal_taxon_values():
    assert set(get_args(TaxonStr)) == set(ANIMAL_TAXON_VALUES)
    assert len(ANIMAL_TAXON_VALUES) == 7


@pytest.mark.parametrize("taxon", ANIMAL_TAXON_VALUES)
def test_pairing_create_accepts_every_hv_taxon(taxon):
    p = ReptilePairingCreate(**_payload(taxon))
    assert p.taxon == taxon


@pytest.mark.parametrize("taxon", ["tarantula", "scorpion", "dragon", "", "Snake"])
def test_pairing_create_rejects_unknown_taxon(taxon):
    with pytest.raises(ValidationError):
        ReptilePairingCreate(**_payload(taxon))


class _FakeAnimal:
    def __init__(self, taxon, name=None, common_name=None, scientific_name=None):
        self.taxon = taxon
        self.name = name
        self.common_name = common_name
        self.scientific_name = scientific_name


@pytest.mark.parametrize("taxon", ANIMAL_TAXON_VALUES)
def test_animal_display_unnamed_with_str_taxon(taxon):
    assert _animal_display(_FakeAnimal(taxon)) == f"Unnamed {taxon}"


def test_animal_display_prefers_name_then_common_then_scientific():
    assert _animal_display(_FakeAnimal("snake", name="Noodle", common_name="Ball python")) == "Noodle"
    assert _animal_display(_FakeAnimal("snake", common_name="Ball python", scientific_name="Python regius")) == "Ball python"
    assert _animal_display(_FakeAnimal("snake", scientific_name="Python regius")) == "Python regius"


def test_animal_display_tolerates_enum_like_taxon():
    class _Enumish:
        value = "turtle"

    assert _animal_display(_FakeAnimal(_Enumish())) == "Unnamed turtle"
