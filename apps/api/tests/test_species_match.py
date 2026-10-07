"""The species-name matcher, on the real names keepers filed as "Other"
(2026-10-07). See services/species_match.py."""
import asyncio
from types import SimpleNamespace as NS

import pytest

from app.services.species_match import CatalogRow, match_name, normalize

CATALOG = [
    CatalogRow("pm", "Pterinochilus murinus", "tarantula", "Orange baboon"),
    CatalogRow("tr", "Tapinauchenius rasti", "tarantula"),
    CatalogRow("tk", "Tliltocatl kahlenbergi", "tarantula"),
    CatalogRow("hm", "Hogna maderiana", "true_spider"),
    CatalogRow("pb", "Paraphidippus basalis", "true_spider"),
    CatalogRow("pa", "Phidippus apacheanus", "true_spider"),
    CatalogRow("pr", "Phidippus regius", "true_spider"),
    CatalogRow("ag", "Archispirostreptus gigas", "millipede"),
    CatalogRow("aa", "Avicularia avicularia", "tarantula"),
    CatalogRow("am", "Avicularia metallica", "tarantula"),
    CatalogRow("cb", "Cyriocosmus bertae", "tarantula"),
    CatalogRow("ce", "Cyriocosmus elegans", "tarantula"),
    CatalogRow("ch", "Cyriopagopus sp. 'Hati Hati'", "tarantula"),
    CatalogRow("ld", "Lasiodora difficilis", "tarantula"),
    CatalogRow("lp", "Lasiodora parahybana", "tarantula"),
    CatalogRow("ami", "Avicularia minatrix", "tarantula"),
    CatalogRow("em", "Ephebopus murinus", "tarantula"),
    CatalogRow("pi", "Psalmopoeus irminia", "tarantula"),
    CatalogRow("ab", "Avicularia braunshauseni", "tarantula"),
    CatalogRow("gi", "Grammostola iheringi", "tarantula"),
    CatalogRow("cbr", "Ceratogyrus brachycephalus", "tarantula"),
    CatalogRow("cd", "Ceratogyrus darlingi", "tarantula"),
    CatalogRow("ta", "Tliltocatl albopilosus", "tarantula"),
    CatalogRow("tv", "Tliltocatl vagans", "tarantula"),
]


@pytest.mark.parametrize("typed,want", [
    ("PTERINOCHILUS MURINUS", "pm"),
    ("Tapinauchenius rasti", "tr"),
    ("Hogna Maderiana ", "hm"),
    ("  phidippus   apacheanus", "pa"),
    ("Cyriopagopus sp. “Hati Hati”", "ch"),
    ("cyriopagopus sp hati hati", "ch"),
])
def test_exact_ignoring_case_spacing_and_quotes(typed, want):
    r = match_name(typed, CATALOG)
    assert r.match and r.match.row.id == want and r.match.kind == "exact"


def test_a_typo_in_the_genus_and_species_is_close():
    r = match_name("Archispirostreptis Giga's", CATALOG)
    assert r.match and r.match.row.id == "ag" and r.match.kind == "close"
    assert r.genus == "Archispirostreptus" and r.genus_taxon == "millipede"


@pytest.mark.parametrize("typed,genus,taxon", [
    ("Avicularia Variegata", "Avicularia", "tarantula"),
    ("Avicularia Sp Colombia", "Avicularia", "tarantula"),
    ("Cyriocosmus sp. “Oronegro”", "Cyriocosmus", "tarantula"),
    ("Phidippus Arizonensis", "Phidippus", "true_spider"),
])
def test_a_different_species_in_a_known_genus_is_not_a_match(typed, genus, taxon):
    """Never claim a different species is the same one; do say the genus."""
    r = match_name(typed, CATALOG)
    assert r.match is None
    assert (r.genus, r.genus_taxon) == (genus, taxon)


def test_different_lasiodora_is_not_claimed():
    # "Lasiodora Strictures" is a garbled L. striatipes, which isn't listed:
    # it must not be "corrected" to a Lasiodora we do have.
    r = match_name("Lasiodora Strictures", CATALOG)
    assert r.match is None and r.genus_taxon == "tarantula"


@pytest.mark.parametrize("typed", ["Liphistius jarujini", "Gryllus bimaculatus", "Lobellini sp. Thai Red", "x"])
def test_unknown_genus_matches_nothing(typed):
    r = match_name(typed, CATALOG)
    assert r.match is None and r.genus is None and r.genus_taxon is None


def test_genus_shared_across_taxa_gives_no_taxon():
    rows = CATALOG + [CatalogRow("x", "Hogna radiata", "tarantula")]  # hypothetical clash
    assert match_name("Hogna sp", rows).genus_taxon is None


def test_normalize():
    assert normalize("  Cyriocosmus sp. “Oronegro” ") == "cyriocosmus sp oronegro"
    assert normalize("Archispirostreptis Giga's") == "archispirostreptis gigas"
    assert normalize(None) == ""


def test_endpoint_shape(monkeypatch):
    from app.routers import invert_species as r

    monkeypatch.setattr(r, "_catalog_rows", lambda db: CATALOG)
    out = asyncio.run(r.match_invert_species(name="PTERINOCHILUS MURINUS", taxon=None, db=NS()))
    assert out == {
        "match": {"id": "pm", "scientific_name": "Pterinochilus murinus", "common_name": "Orange baboon",
                  "taxon": "tarantula", "slug": None, "kind": "exact"},
        "genus": "Pterinochilus", "genus_taxon": "tarantula",
    }
    none = asyncio.run(r.match_invert_species(name="Liphistius jarujini", taxon=None, db=NS()))
    assert none == {"match": None, "genus": None, "genus_taxon": None}


def test_match_route_is_registered_before_the_id_route():
    from app.routers import invert_species as r
    paths = [route.path for route in r.router.routes]
    assert paths.index("/match") < paths.index("/{species_id}")


# ── Bare epithets ("minatrix") ───────────────────────────────────────────────

@pytest.mark.parametrize("typed,want", [("minatrix", "ami"), ("irminia", "pi"), (" Irminia ", "pi")])
def test_bare_epithet_unique_in_taxon(typed, want):
    r = match_name(typed, CATALOG, taxon="tarantula")
    assert r.match and r.match.row.id == want and r.match.kind == "epithet"


def test_ambiguous_epithet_is_not_guessed():
    # Pterinochilus murinus and Ephebopus murinus are both tarantulas.
    assert match_name("murinus", CATALOG, taxon="tarantula").match is None


def test_epithet_never_crosses_taxa():
    # Phidippus regius is a jumping spider; a "regius" filed as a tarantula is not it.
    assert match_name("regius", CATALOG, taxon="tarantula").match is None
    assert match_name("regius", CATALOG, taxon="true_spider").match.row.id == "pr"


def test_epithet_needs_a_real_taxon():
    assert match_name("minatrix", CATALOG).match is None
    assert match_name("minatrix", CATALOG, taxon="other").match is None


def test_a_bare_genus_matches_no_species():
    r = match_name("Avicularia", CATALOG, taxon="tarantula")
    assert r.match is None and r.genus_taxon == "tarantula"


@pytest.mark.parametrize("typed,taxon,want,kind", [
    ("braunshaseni", "tarantula", "ab", "epithet"),
    ("iherengi", "tarantula", "gi", "epithet"),
    ("Ceratogryus brachycephalus", "tarantula", "cbr", "close"),
    ("Tliltocatl albopilosum", "tarantula", "ta", "close"),
    ("Aviculara Aviculara", "tarantula", "aa", "close"),
])
def test_real_typos_from_the_collection(typed, taxon, want, kind):
    r = match_name(typed, CATALOG, taxon=taxon)
    assert r.match and r.match.row.id == want and r.match.kind == kind


# ── Named forms ("sp. 'mascara'") and renames — from the 2026-10-07 report ───

FORMS = CATALOG + [
    CatalogRow("pm2", "Pamphobeteus sp. 'mascara'", "tarantula"),
    CatalogRow("pg", "Phormictopus sp. 'Green'", "tarantula"),
    CatalogRow("pdp", "Phormictopus sp. 'Dominican Purple'", "tarantula"),
    CatalogRow("ty", "Tapinauchenius sp. 'Yasuni'", "tarantula"),
    CatalogRow("ov", "Omothymus sp. 'Valhalla'", "tarantula"),
    CatalogRow("cil", "Cilantica psychedelicus", "tarantula"),
    CatalogRow("las", "Lasiocyano sazimai", "tarantula"),
]


@pytest.mark.parametrize("typed", ["Pamphobeteus sp. Cascada", "Phormictopus sp. Green Gold", "Phormictopus sp 'Green Gold Carapace'"])
def test_a_different_form_is_never_a_typo(typed):
    """Locality / colour forms one letter apart are different animals."""
    assert match_name(typed, FORMS, taxon="tarantula").match is None


@pytest.mark.parametrize("typed,want", [
    ("Pamphobeteus Mascara", "pm2"), ("Tapinauchenius Yasuni", "ty"), ("Omothymus Valhalla", "ov"),
    ("Phormictopus Dominican Purple", "pdp"), ("Phormictopus sp. Dominican Purple", "pdp"),
    ("Cyriopagopus sp hati hati", "ch"),
])
def test_same_form_without_sp_or_quotes(typed, want):
    r = match_name(typed, FORMS, taxon="tarantula")
    assert r.match and r.match.row.id == want


@pytest.mark.parametrize("typed,want", [("sp. Dominican Purple", "pdp"), ("sp. Valhalla", "ov"), ("HatiHati", "ch")])
def test_bare_form_name_unique_in_taxon(typed, want):
    r = match_name(typed, FORMS, taxon="tarantula")
    assert r.match and r.match.row.id == want and r.match.kind == "epithet"
    assert match_name(typed, FORMS, taxon="true_spider").match is None


@pytest.mark.parametrize("typed,want", [
    ("devamatha", "cil"), ("Haploclastus devamatha", "cil"), ("Pterinopelma sazimai", "las"),
    ("Brachypelma albopilosum", "ta"),
])
def test_published_renames(typed, want):
    r = match_name(typed, FORMS, taxon="tarantula")
    assert r.match and r.match.row.id == want


def test_rename_needs_the_new_name_in_the_catalog():
    assert match_name("Pterinopelma sazimai", CATALOG).match is None


@pytest.mark.parametrize("typed", ["sp. Blue", "sp. blue", "sp. Green", "sp. Black Orange"])
def test_bare_colour_names_match_nothing(typed):
    rows = FORMS + [CatalogRow("hb", "Homoeomma sp. 'Blue'", "tarantula")]
    assert match_name(typed, rows, taxon="tarantula").match is None


def test_epithet_with_a_near_twin_is_not_guessed():
    """'auratus' is Phormictopus auratus exactly, but Brachypelma auratum is
    one letter away and far more often kept (2026-10-07 report)."""
    rows = CATALOG + [CatalogRow("pa2", "Phormictopus auratus", "tarantula"), CatalogRow("ba", "Brachypelma auratum", "tarantula")]
    assert match_name("auratus", rows, taxon="tarantula").match is None
    assert match_name("auratum", rows, taxon="tarantula").match is None
    # Without the twin it still resolves.
    assert match_name("auratus", CATALOG + [CatalogRow("pa2", "Phormictopus auratus", "tarantula")], taxon="tarantula").match.row.id == "pa2"


@pytest.mark.parametrize("word,want,other", [
    ("striata", "Poecilotheria striata", "Lasiodora striatipes"),
    ("formosus", "Hapalopus formosus", "Poecilotheria formosa"),
])
def test_similar_but_distinct_epithets_still_resolve(word, want, other):
    rows = [CatalogRow("a", want, "tarantula"), CatalogRow("b", other, "tarantula")]
    assert match_name(word, rows, taxon="tarantula").match.row.scientific_name == want
