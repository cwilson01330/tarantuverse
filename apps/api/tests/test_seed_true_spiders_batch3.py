"""seed_care_true_spiders_batch3.py: every filled field is backed by a source.

Static tests read the seed's data without a database: every species has a
source_url, is a true spider with a family, and every field the seed fills
names the source it came from (``FIELD_SOURCES``). A field nobody's source
states stays out of the row, so it is NULL in the catalog.

The Postgres tests insert the rows inside the test transaction (so a bad
column name, CHECK value or length fails here, not in the Render shell),
and check that the script only writes with ``apply=True`` and never touches
a row that already exists.
"""
import csv
import importlib.util
import os
import re
import uuid

import pytest

_API = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_REPO = os.path.dirname(os.path.dirname(_API))

_SPEC = importlib.util.spec_from_file_location(
    "seed_care_true_spiders_batch3",
    os.path.join(_API, "seed_care_true_spiders_batch3.py"),
)
seed = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(seed)

ROWS = {r["scientific_name"]: r for r in seed.SPECIES_DATA}

# The candidates from the plan, minus Eresus balcanicus (already in the
# catalog, checked against the live API on 2026-11-13).
EXPECTED = {
    "Platycryptus undatus",
    "Maevia inclemens",
    "Pelegrina proterva",
    "Menemerus semilimbatus",
    "Eresus ruficapillus",
    "Gandanameno echinata",
    "Kukulcania arizonica",
    "Eratigena atrica",
}

# Fields that need no per-field source note: the name itself, the taxon the
# app files it under, the source pointer, and the bookkeeping key.
NO_NOTE_NEEDED = {"scientific_name", "taxon", "source_url", "_sources"}

# The API returns these four as plain booleans (not Optional), so a NULL in
# the table would break the species list. Left out of a row they take the
# column default False ("not flagged"; the care sheet shows the water dish as
# "Optional"). Setting one to True is a claim and needs a source.
NOT_NULL_FLAGS = {
    "water_dish_required", "communal_suitable",
    "urticating_hairs", "medically_significant_venom",
}


def _filled(row):
    return {k: v for k, v in row.items() if k not in NO_NOTE_NEEDED and v is not None}


def test_the_expected_species_and_nothing_already_in_the_catalog():
    assert set(ROWS) == EXPECTED
    assert len(seed.SPECIES_DATA) == len(EXPECTED)
    assert "Eresus balcanicus" not in ROWS
    assert len({seed._slugify(n) for n in ROWS}) == len(ROWS)


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_every_row_is_a_true_spider_with_family_and_source(name):
    r = ROWS[name]
    assert r["taxon"] == "true_spider"
    assert r.get("family"), name
    assert r.get("order_name") == "Araneae"
    assert r.get("genus") == name.split()[0]
    assert r.get("source_url", "").startswith("https://"), name
    assert r["source_url"] in seed.SOURCES.values(), "source_url must be one of the listed sources"


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_no_field_is_filled_without_a_source_note(name):
    r = ROWS[name]
    notes = r.get("_sources") or {}
    for field in _filled(r):
        assert field in notes, f"{name}: {field} is filled but has no source note"
        keys = notes[field] if isinstance(notes[field], (list, tuple)) else [notes[field]]
        assert keys, f"{name}: {field} has an empty source note"
        for key in keys:
            assert key in seed.SOURCES, f"{name}: {field} cites unknown source {key!r}"


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_source_notes_only_cover_filled_fields(name):
    r = ROWS[name]
    filled = _filled(r)
    for field in r.get("_sources") or {}:
        assert field in filled, f"{name}: source note for {field}, but the field is empty"


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_not_null_flags_are_only_set_true_with_a_source(name):
    r = ROWS[name]
    for flag in NOT_NULL_FLAGS:
        if flag in r:
            assert r[flag] is not None, f"{name}: {flag} must not be None (the API needs a bool)"


def test_instars_to_maturity_only_where_a_source_states_it():
    for name, r in ROWS.items():
        if r.get("typical_instars_to_maturity") is not None:
            assert "typical_instars_to_maturity" in (r.get("_sources") or {}), name


def test_every_listed_source_is_used_and_none_is_a_dropped_one():
    used = set()
    for r in ROWS.values():
        for keys in (r.get("_sources") or {}).values():
            used.update(keys if isinstance(keys, (list, tuple)) else [keys])
    assert used == set(seed.SOURCES), f"unused sources: {set(seed.SOURCES) - used}"
    for url in seed.SOURCES.values():
        assert url.startswith("https://")
        # Read during research and set aside as unreliable (see the docstring).
        assert "bantam.earth" not in url


def test_no_row_cites_exopetguides():
    # ExoPetGuides says its pages were drafted with AI help, so no field may
    # rest on it and no row may point keepers there.
    for url in seed.SOURCES.values():
        assert "exopetguides.com" not in url.lower()
    for name, r in ROWS.items():
        for key, value in r.items():
            if isinstance(value, str):
                assert "exopetguides" not in value.lower(), f"{name}: {key} cites ExoPetGuides"


def test_platycryptus_has_no_husbandry_figures():
    # No human-written care sheet was found, so the row is natural history only.
    r = ROWS["Platycryptus undatus"]
    for field in (
        "care_level", "temperature_min", "temperature_max", "humidity_min", "humidity_max",
        "enclosure_size_sling", "enclosure_size_juvenile", "enclosure_size_adult",
        "substrate_depth", "substrate_type", "prey_size", "feeding_frequency_sling",
        "feeding_frequency_juvenile", "feeding_frequency_adult",
    ):
        assert r.get(field) is None, f"Platycryptus undatus: {field} has no source"


_EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")
_HYPE = re.compile(r"\b(best|amazing|stunning|perfect|incredible|awesome|ultimate)\b", re.I)


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_copy_is_plain(name):
    r = ROWS[name]
    for key, value in r.items():
        if not isinstance(value, str):
            continue
        assert "$" not in value and "€" not in value and "£" not in value, f"{name}: price in {key}"
        assert not _EMOJI.search(value), f"{name}: emoji in {key}"
        assert not _HYPE.search(value), f"{name}: superlative in {key}"


def test_text_fits_the_columns():
    seed._check_lengths()


# ---- image CSV for the R2 upload -> apply pipeline -------------------------

CSV_PATH = os.path.join(_REPO, "docs", "design", "species_images_batch3.csv")
PIPELINE_COLUMNS = [
    "scientific_name_lower", "taxon", "status", "license",
    "attribution", "image_url", "commons_file",
]
OPEN_LICENSES = re.compile(r"^(CC0( 1\.0)?|CC BY( \d\.\d)?|CC BY-SA( \d\.\d)?|Public domain)$")


def test_image_csv_follows_the_pipeline_format():
    with open(CSV_PATH, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        assert reader.fieldnames[: len(PIPELINE_COLUMNS)] == PIPELINE_COLUMNS
        rows = list(reader)
    names = {n.lower() for n in EXPECTED}
    for row in rows:
        assert row["scientific_name_lower"] in names, row
        assert row["taxon"] == "true_spider"
        if row["status"] == "verified":
            # Only rows a person has checked go through upload + apply.
            assert OPEN_LICENSES.match(row["license"]), row
            assert row["attribution"].strip(), row
            assert row["image_url"].startswith("https://upload.wikimedia.org/"), row
            assert row["commons_file"].strip(), row
        else:
            assert row["status"] == "license_pending", row


# ---- database ---------------------------------------------------------------


@pytest.mark.requires_postgres
def test_every_row_inserts(db_session):
    from app.models.invert_species import InvertSpecies

    for data in seed.SPECIES_DATA:
        row = seed.row_for_insert(data)
        suffix = uuid.uuid4().hex[:6]
        row["scientific_name"] = f"{row['scientific_name']} {suffix}"
        taxon = row.pop("taxon")
        db_session.add(InvertSpecies(
            id=uuid.uuid4(), taxon=taxon,
            scientific_name_lower=row["scientific_name"].lower(),
            slug=seed._slugify(row["scientific_name"]),
            **row,
        ))
    db_session.flush()


@pytest.mark.requires_postgres
def test_dry_run_writes_nothing_and_apply_skips_existing(db_session):
    from app.models.invert_species import InvertSpecies

    def ours():
        return db_session.query(InvertSpecies).filter(
            InvertSpecies.scientific_name_lower.in_([n.lower() for n in EXPECTED])
        )

    # A row someone else already made must never be touched.
    pre = ours().first()
    if pre is None:
        db_session.add(InvertSpecies(
            id=uuid.uuid4(), taxon="true_spider",
            scientific_name="Kukulcania arizonica",
            scientific_name_lower="kukulcania arizonica",
            slug="kukulcania-arizonica", care_guide="keeper-written text",
        ))
        db_session.flush()
    before = {r.scientific_name_lower: (r.id, r.care_guide) for r in ours()}

    planned = seed.seed(apply=False, db=db_session)
    assert planned["added"] == 0
    assert planned["would_add"] == len(EXPECTED) - len(before)
    assert {r.scientific_name_lower for r in ours()} == set(before)

    done = seed.seed(apply=True, db=db_session, commit=False)
    assert done["added"] == len(EXPECTED) - len(before)
    assert done["skipped"] == len(before)
    after = {r.scientific_name_lower: (r.id, r.care_guide) for r in ours()}
    for name, value in before.items():
        assert after[name] == value  # untouched
    assert len(after) == len(EXPECTED)

    again = seed.seed(apply=True, db=db_session, commit=False)
    assert again["added"] == 0 and again["skipped"] == len(EXPECTED)
