"""seed_isopod_species_batch2.py: the rows are honest and actually insert.

The pure tests pin the care facts a keeper acts on; the Postgres test inserts
every row inside the test transaction so a bad CHECK value, slug or column name
fails here rather than in the Render shell.
"""
import importlib.util
import os
import uuid

import pytest

_SPEC = importlib.util.spec_from_file_location(
    "seed_isopod_species_batch2",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 "seed_isopod_species_batch2.py"),
)
seed = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(seed)

ROWS = {r["scientific_name"]: r for r in seed.SPECIES_DATA}


def test_the_requested_species_is_there():
    r = ROWS["Cristarmadillidium muricatum"]
    assert r["family"] == "Armadillidiidae"  # not "Armadillidae", a different family
    assert r["humidity_max"] <= 70  # dry Mediterranean, not tropical


def test_six_unique_isopods():
    assert len(seed.SPECIES_DATA) == 6
    assert len(ROWS) == 6
    assert len({seed._slugify(n) for n in ROWS}) == 6


@pytest.mark.parametrize("name", list(ROWS))
def test_every_row_is_a_harmless_detritivore_without_a_water_dish(name):
    r = ROWS[name]
    assert r["taxon"] == "isopod"
    assert r["feeding_mode"] == "detritivore"
    assert r["water_dish_required"] is False  # standing water drowns isopods
    assert r["supplemental_calcium_required"] is True
    assert r["moisture_gradient_required"] is True
    assert r["venom_severity"] is None


def test_titan_is_spelled_correctly_and_findable_by_the_trade_spelling():
    assert "Porcellio hoffmannseggii" in ROWS
    assert "Porcellio hoffmannseggi" in ROWS["Porcellio hoffmannseggii"]["common_names"]


def test_disputed_numbers_are_left_blank_not_guessed():
    titan = ROWS["Porcellio hoffmannseggii"]
    assert titan["humidity_min"] is None and titan["humidity_max"] is None
    armadillo = ROWS["Armadillo officinalis"]
    assert "adult_length_min_mm" not in armadillo and "adult_length_max_mm" not in armadillo


def test_ember_bee_is_marked_as_a_trade_name_and_keeps_its_old_genus_searchable():
    r = ROWS['Ardentiella sp. "Ember Bee"']
    assert 'Merulanella sp. "Ember Bee"' in r["common_names"]
    assert "undescribed" in r["care_guide"]
    assert "CAPTIVE-BRED" in r["care_guide"]


def test_clean_up_crew_flags_match_the_facts_seed():
    facts = importlib.util.spec_from_file_location(
        "seed_per_taxon_care_facts",
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                     "seed_per_taxon_care_facts.py"),
    )
    mod = importlib.util.module_from_spec(facts)
    facts.loader.exec_module(mod)
    for name, r in ROWS.items():
        flagged = r.get("bioactive_suitable") is True
        assert flagged == (name.lower() in mod.CUC_ISOPODS), name


@pytest.mark.requires_postgres
def test_every_row_inserts(db_session):
    from app.models.invert_species import InvertSpecies

    for data in seed.SPECIES_DATA:
        row = dict(data)
        name = row["scientific_name"]
        # Unique-suffix the name so an already-seeded test DB can't collide.
        suffix = uuid.uuid4().hex[:6]
        row["scientific_name"] = f"{name} {suffix}"
        taxon = row.pop("taxon")
        db_session.add(InvertSpecies(
            id=uuid.uuid4(),
            taxon=taxon,
            scientific_name_lower=row["scientific_name"].lower(),
            slug=seed._slugify(row["scientific_name"]),
            **row,
        ))
    db_session.flush()
