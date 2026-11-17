"""seed_herp_uromastyx.py: static checks on the seed data (no database).

Every row must cite at least two real http(s) sources, respect the column
caps and allowed values, keep every min <= max, be a herbivore, and never
include Uromastyx geyri in SPECIES_DATA. Geyri is reached only through
DIET_UPDATES, which may write diet fields only, appends (never replaces)
sources, and keeps the non-diet care-guide facts.
"""
import importlib.util
import os
from datetime import date
from types import SimpleNamespace

import pytest

_API = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SPEC = importlib.util.spec_from_file_location(
    "seed_herp_uromastyx", os.path.join(_API, "seed_herp_uromastyx.py")
)
seed = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(seed)

ROWS = seed.SPECIES_DATA
IDS = [r["scientific_name"] for r in ROWS]

CAP_100 = (
    "enclosure_min_hatchling", "enclosure_min_juvenile", "enclosure_min_adult",
    "prey_size_hatchling", "prey_size_juvenile", "prey_size_adult",
    "feeding_frequency_hatchling", "feeding_frequency_juvenile", "feeding_frequency_adult",
    "genus", "family", "order_name",
)
CAP_200 = ("native_region", "water_bowl_description")

ALLOWED = {
    "care_level": {None, "beginner", "intermediate", "advanced"},
    "handleability": {None, "docile", "defensive", "nippy", "hands_off"},
    "activity_period": {None, "diurnal", "nocturnal", "crepuscular"},
    "enclosure_type": {None, "terrestrial", "arboreal", "semi_arboreal", "fossorial", "aquatic", "semi_aquatic"},
    "uvb_type": {None, "T5_HO", "T8", "not_required"},
    "diet_type": {None, "strict_carnivore", "insectivore", "omnivore", "herbivore"},
    "morph_complexity": {None, "none", "simple", "moderate", "complex"},
    "cites_appendix": {None, "I", "II", "III"},
    "iucn_status": {None, "LC", "NT", "VU", "EN", "CR", "EW", "EX", "DD"},
    "taxon": {"lizard"},
}

RANGES = [
    ("adult_length_min_in", "adult_length_max_in"),
    ("adult_weight_min_g", "adult_weight_max_g"),
    ("temp_cool_min", "temp_cool_max"),
    ("temp_warm_min", "temp_warm_max"),
    ("temp_basking_min", "temp_basking_max"),
    ("temp_night_min", "temp_night_max"),
    ("humidity_min", "humidity_max"),
    ("humidity_shed_boost_min", "humidity_shed_boost_max"),
    ("uvb_distance_min_in", "uvb_distance_max_in"),
    ("substrate_depth_min_in", "substrate_depth_max_in"),
    ("lifespan_captivity_min_yrs", "lifespan_captivity_max_yrs"),
]

# The API returns these as plain booleans; NULL would break the species list.
PLAIN_BOOLS = ("uvb_required", "bioactive_suitable", "brumation_required", "has_morph_market")


def test_expected_species_and_no_duplicates():
    names = [n.strip().lower() for n in IDS]
    assert len(names) == len(set(names))
    assert "uromastyx geyri" not in names
    assert set(names) == {
        "uromastyx ornata", "uromastyx dispar", "uromastyx ocellata",
        "uromastyx aegyptia", "uromastyx nigriventris",
    }


@pytest.mark.parametrize("row", ROWS, ids=IDS)
def test_sources(row):
    sources = row["sources"]
    assert len(sources) >= 2
    keys = [s["ref_key"] for s in sources]
    assert len(keys) == len(set(keys))
    for s in sources:
        assert s["url"].startswith(("http://", "https://")), s
        assert s.get("title") and s.get("summary")
    assert row["source_url"].startswith("https://")


@pytest.mark.parametrize("row", ROWS, ids=IDS)
def test_caps(row):
    for f in CAP_100:
        v = row.get(f)
        assert v is None or len(v) <= 100, (f, len(v))
    for f in CAP_200:
        v = row.get(f)
        assert v is None or len(v) <= 200, (f, len(v))
    assert len(row["scientific_name"]) <= 255


@pytest.mark.parametrize("row", ROWS, ids=IDS)
def test_allowed_values(row):
    for field, allowed in ALLOWED.items():
        assert row.get(field) in allowed, (field, row.get(field))
    for f in PLAIN_BOOLS:
        assert isinstance(row[f], bool), f


@pytest.mark.parametrize("row", ROWS, ids=IDS)
def test_ranges(row):
    for lo, hi in RANGES:
        a, b = row.get(lo), row.get(hi)
        if a is not None and b is not None:
            assert a <= b, (lo, a, hi, b)


@pytest.mark.parametrize("row", ROWS, ids=IDS)
def test_herbivore_and_bookkeeping(row):
    assert row["diet_type"] == "herbivore"
    assert row["genus"] == "Uromastyx"
    assert row["family"] == "Agamidae" and row["order_name"] == "Squamata"
    assert row["content_last_reviewed_at"] == date(2026, 11, 17)
    assert row["image_url"] is None
    assert row["care_guide"].startswith("**")


@pytest.mark.parametrize("row", ROWS, ids=IDS)
def test_validates_against_api_schema(row):
    from app.schemas.reptile_species import ReptileSpeciesBase

    ReptileSpeciesBase(**row)


# ---- Diet ----------------------------------------------------------------

def _has_diet_source(sources):
    return [
        s for s in sources
        if s["ref_key"] in seed.DIET_SOURCE_KEYS and s["url"].startswith(("http://", "https://"))
    ]


@pytest.mark.parametrize("row", ROWS, ids=IDS)
def test_every_row_has_a_diet_source_and_the_reconciled_diet(row):
    assert _has_diet_source(row["sources"])
    # One genus-level diet text, not a per-author list.
    assert row["supplementation_notes"] == seed._DIET_SUPP
    assert row["water_bowl_description"] == seed._DIET_WATER
    assert row["feeding_frequency_adult"] == seed._FREQ_ADULT
    assert row["feeding_frequency_juvenile"] == seed._FREQ_JUVENILE
    assert seed._DIET_SENTENCE in row["care_guide"]
    for author_tag in ("ReptiFiles:", "LafeberVet:", "Fife:", "Jones", "Dix:"):
        assert author_tag not in row["supplementation_notes"]
        assert author_tag not in row["water_bowl_description"]


def test_diet_source_keys_exist():
    assert seed.DIET_SOURCE_KEYS <= set(seed.SOURCES)


def test_adult_interval_parses_to_two_days():
    """The app reads feeding_frequency_adult first; "per week" would parse as 7."""
    from app.routers.animals import _parse_reptile_interval

    assert _parse_reptile_interval(seed._FREQ_ADULT) == 2
    assert _parse_reptile_interval(seed._FREQ_JUVENILE) == 1


# ---- Geyri diet-only update ------------------------------------------------

GEYRI_EXISTING_SOURCES = [
    {"url": "https://www.iucnredlist.org/species/pdf/22481945", "title": "Uromastyx geyri - Red List Assessment",
     "ref_key": "iucn_uromastyx_geyri", "summary": "x", "source_type": "government"},
    {"url": "https://doi.org/10.19227/jzar.v4i1.150", "title": "UV-Tool", "ref_key": "uvtool_baines",
     "summary": "x", "source_type": "academic"},
    {"url": "https://reptifiles.com/uromastyx-care-sheet/", "title": "Uromastyx Care Sheet",
     "ref_key": "reptifiles_uromastyx", "summary": "x", "source_type": "breeder_community"},
]


def _fake_geyri():
    return SimpleNamespace(
        scientific_name="Uromastyx geyri",
        diet_type="herbivore",
        feeding_frequency_hatchling=None,
        feeding_frequency_juvenile="Daily (as much dark leafy greens as eaten)",
        feeding_frequency_adult="4-5 times per week; seeds ~once weekly",
        supplementation_notes="Calcium + multivitamin on greens. No animal protein. Hydrates mainly from food.",
        water_bowl_description="Generally no standing water (raises humidity); offer occasionally at most.",
        care_guide="old",
        sources=[dict(s) for s in GEYRI_EXISTING_SOURCES],
        content_last_reviewed_at=None,
        # Non-diet fields that must never change:
        humidity_max=35, temp_basking_max=130, iucn_status="NT", image_url="keep.jpg",
        common_names=["Saharan Uromastyx"],
    )


def test_diet_updates_target_only_geyri_and_never_species_data():
    assert [u["scientific_name"] for u in seed.DIET_UPDATES] == ["Uromastyx geyri"]
    assert "uromastyx geyri" in seed.PROTECTED
    assert "uromastyx geyri" not in {r["scientific_name"].lower() for r in ROWS}


@pytest.mark.parametrize("upd", seed.DIET_UPDATES, ids=lambda u: u["scientific_name"])
def test_diet_update_fields_are_diet_only_and_valid(upd):
    fields = upd["fields"]
    assert set(fields) <= seed.DIET_UPDATE_FIELDS
    assert "sources" not in fields
    assert fields["diet_type"] == "herbivore"
    assert fields["content_last_reviewed_at"] == date(2026, 11, 17)
    for f in ("feeding_frequency_hatchling", "feeding_frequency_juvenile", "feeding_frequency_adult"):
        assert fields.get(f) is None or len(fields[f]) <= 100, f
    assert len(fields["water_bowl_description"]) <= 200
    guide = fields["care_guide"]
    assert guide.startswith("**Saharan Uromastyx (Uromastyx geyri)**")
    for fact in ("very hot basking spot", "strong high-output UVB", "under about 35 percent", "respiratory"):
        assert fact in guide, fact
    assert _has_diet_source(upd["append_sources"])
    for s in upd["append_sources"]:
        assert s["url"].startswith(("http://", "https://")) and s.get("title") and s.get("summary")


def test_diet_update_touches_only_allowed_fields_and_appends_sources():
    existing = _fake_geyri()
    upd = seed.DIET_UPDATES[0]
    changes = seed._diet_update_changes(existing, upd)

    assert set(changes) <= seed.DIET_UPDATE_FIELDS
    assert "sources" in changes
    old, new = changes["sources"]
    # The three existing sources are kept, first, untouched.
    assert new[: len(GEYRI_EXISTING_SOURCES)] == GEYRI_EXISTING_SOURCES
    appended = new[len(GEYRI_EXISTING_SOURCES):]
    keys = [s["ref_key"] for s in appended]
    assert "reptifiles_uromastyx" not in keys  # already held under the same ref_key
    assert len(keys) == len(set(keys)) and appended
    assert changes["content_last_reviewed_at"] == (None, date(2026, 11, 17))
    # diet_type already herbivore -> not a change.
    assert "diet_type" not in changes

    # Applying the changes, then diffing again, is a no-op (idempotent re-run).
    for field, (_o, n) in changes.items():
        setattr(existing, field, n)
    assert seed._diet_update_changes(existing, upd) == {}
    # Non-diet fields untouched.
    assert existing.humidity_max == 35 and existing.image_url == "keep.jpg" and existing.iucn_status == "NT"


def test_diet_update_refuses_non_diet_fields():
    bad = {"scientific_name": "Uromastyx geyri", "fields": {"humidity_max": 50}, "append_sources": []}
    with pytest.raises(SystemExit):
        seed._diet_update_changes(_fake_geyri(), bad)
    replacing = {"scientific_name": "Uromastyx geyri", "fields": {"sources": []}, "append_sources": []}
    with pytest.raises(SystemExit):
        seed._diet_update_changes(_fake_geyri(), replacing)
