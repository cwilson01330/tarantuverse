"""Card text is composed server-side, from only the fields the keeper chose.

These pin the privacy promise (a field that wasn't chosen, or isn't on the
allow-list, never appears) and the "no empty rows" rule from the spec.
"""
from datetime import date

import pytest

from app.services.share_card import (
    DEFAULT_FIELDS, FIELD_ALLOW, CardSubject, MoltFacts,
    clean_fields, compose_card, in_care_label,
)

TODAY = date(2026, 9, 30)


def rosie(**kw):
    base = dict(
        app="tarantuverse", taxon="tarantula", name="Rosie",
        scientific_name="Brachypelma hamorii", common_name="Mexican redknee",
        sex="female", date_acquired=date(2025, 8, 14),
        photo_url="https://pub.example.r2.dev/photos/0b1c.jpg",
        molt_count=9, latest_size="4.1 in",
    )
    base.update(kw)
    return CardSubject(**base)


def test_unknown_and_disallowed_fields_are_dropped():
    assert clean_fields("tarantuverse", "profile", ["name", "price_paid", "notes", "email", "sex"]) == ["name", "sex"]


def test_none_means_defaults():
    assert clean_fields("tarantuverse", "molt", None) == list(DEFAULT_FIELDS[("tarantuverse", "molt")])


def test_herpetoverse_has_no_molt_card():
    with pytest.raises(ValueError):
        clean_fields("herpetoverse", "molt", None)


def test_profile_card_full():
    card = compose_card("profile", rosie(), list(FIELD_ALLOW[("tarantuverse", "profile")]), today=TODAY)
    assert card["header"] == "Specimen · female"
    assert card["name"] == "Rosie"
    assert card["scientific_name"] == "Brachypelma hamorii"
    assert card["common_name"] == "Mexican redknee"
    assert card["photo_url"].endswith("0b1c.jpg")
    assert card["facts"] == [
        {"label": "In care", "value": "1 yr, 1 mo"},
        {"label": "Molts", "value": "9"},
        {"label": "Leg span", "value": "4.1 in"},
    ]


def test_unchosen_fields_are_absent_not_blank():
    card = compose_card("profile", rosie(), ["species"], today=TODAY)
    assert card["name"] is None and card["photo_url"] is None
    assert card["header"] == "Specimen"  # sex not chosen
    assert card["facts"] == []


def test_missing_values_remove_rows():
    card = compose_card(
        "profile", rosie(date_acquired=None, molt_count=0, latest_size=None, sex="unknown"),
        list(FIELD_ALLOW[("tarantuverse", "profile")]), today=TODAY,
    )
    assert card["header"] == "Specimen"
    assert card["facts"] == []


def test_molt_card_with_measurements():
    molt = MoltFacts(number=9, molted_on=date(2026, 9, 29), span_before=3.2, span_after=4.1)
    card = compose_card("molt", rosie(), ["name", "species", "size_change", "days_in_care"], molt=molt, today=TODAY)
    assert card["header"] == "Specimen · molt no. 9"
    assert card["facts"] == [
        {"label": "Leg span", "value": "3.2 → 4.1 in"},
        {"label": "In care", "value": "day 411"},
    ]


def test_molt_card_without_measurements_is_still_complete():
    """385 of 438 production molts have no measurements (2026-09-29)."""
    molt = MoltFacts(number=3, molted_on=date(2026, 9, 29), span_before=None, span_after=None)
    card = compose_card("molt", rosie(), ["name", "species", "size_change"], molt=molt, today=TODAY)
    assert card["header"] == "Specimen · molt no. 3"
    assert card["facts"] == []


def test_molt_card_after_only():
    molt = MoltFacts(number=4, molted_on=TODAY, span_before=None, span_after=2.0)
    card = compose_card("molt", rosie(), ["size_change"], molt=molt, today=TODAY)
    assert card["facts"] == [{"label": "Leg span", "value": "2 in"}]


def test_non_spider_size_label():
    s = rosie(taxon="scorpion", latest_size="62 mm")
    card = compose_card("profile", s, ["size"], today=TODAY)
    assert card["facts"] == [{"label": "Body length", "value": "62 mm"}]


def test_herpetoverse_profile():
    s = CardSubject(
        app="herpetoverse", taxon="snake", name="Juniper", scientific_name="Python regius",
        common_name="Ball python", sex="male", date_acquired=date(2023, 5, 2), photo_url=None,
        weight_g=1412.0, length_in=38.5, shed_count=14,
    )
    card = compose_card("profile", s, list(FIELD_ALLOW[("herpetoverse", "profile")]), today=TODAY)
    assert card["header"] == "Specimen · male"
    assert card["facts"] == [
        {"label": "In care", "value": "3 yr, 4 mo"},
        {"label": "Weight", "value": "1.41 kg"},
        {"label": "Length", "value": "38.5 in"},
        {"label": "Sheds", "value": "14"},
    ]


@pytest.mark.parametrize("start,end,label", [
    (date(2026, 9, 1), date(2026, 9, 30), "less than a month"),
    (date(2026, 8, 30), date(2026, 9, 30), "1 mo"),
    (date(2025, 9, 30), date(2026, 9, 30), "1 yr"),
    (date(2026, 10, 1), date(2026, 9, 30), None),  # future acquisition: say nothing
])
def test_in_care_label(start, end, label):
    assert in_care_label(start, end) == label


@pytest.fixture(autouse=True)
def _r2_base(monkeypatch):
    from app.services.storage import storage_service
    monkeypatch.setattr(storage_service, "use_r2", True, raising=False)
    monkeypatch.setattr(storage_service, "public_url_base", "https://pub.example.r2.dev", raising=False)


# ── Field notes copy (the handwritten line) ──────────────────────────────────

from app.services.share_card import ordinal, read_defaults  # noqa: E402


@pytest.mark.parametrize("n,want", [
    (1, "1st"), (2, "2nd"), (3, "3rd"), (4, "4th"), (9, "9th"), (11, "11th"), (12, "12th"),
    (13, "13th"), (21, "21st"), (22, "22nd"), (23, "23rd"), (101, "101st"), (111, "111th"), (112, "112th"),
])
def test_ordinals(n, want):
    assert ordinal(n) == want


def molt9(**kw):
    base = dict(number=9, molted_on=date(2026, 9, 29), span_before=3.2, span_after=4.1)
    base.update(kw)
    return MoltFacts(**base)


def test_molt_notes_read_like_a_note():
    card = compose_card("molt", rosie(), ["name", "species", "size_change", "days_in_care"], molt=molt9(), today=TODAY)
    assert card["notes"] == {
        "headline": "Rosie, 9th molt",
        "species_line": "Brachypelma hamorii",
        "facts": ["3.2 → 4.1 in", "day 411 with me"],
    }


def test_molt_notes_without_a_name():
    card = compose_card("molt", rosie(), ["size_change"], molt=molt9(number=1), today=TODAY)
    assert card["notes"]["headline"] == "1st molt"
    assert card["notes"]["species_line"] is None


def test_tv_profile_notes_line():
    card = compose_card("profile", rosie(), list(FIELD_ALLOW[("tarantuverse", "profile")]), today=TODAY)
    assert card["notes"] == {
        "headline": "Rosie",
        "species_line": "Brachypelma hamorii · female",
        "facts": ["4.1 in", "9 molts", "1 yr, 1 mo with me"],
    }
    # The printed fact rows keep their old order.
    assert [f["label"] for f in card["facts"]] == ["In care", "Molts", "Leg span"]


def test_singular_molt_and_shed():
    card = compose_card("profile", rosie(molt_count=1), ["molts"], today=TODAY)
    assert card["notes"]["facts"] == ["1 molt"]
    hv = CardSubject(app="herpetoverse", taxon="lizard", name=None, scientific_name="Correlophus ciliatus",
                     common_name="Crested gecko", sex=None, date_acquired=None, photo_url=None, shed_count=1)
    assert compose_card("profile", hv, ["sheds"], today=TODAY)["notes"]["facts"] == ["1 shed"]


def test_hv_profile_notes_line():
    mango = CardSubject(app="herpetoverse", taxon="lizard", name="Mango", scientific_name="Correlophus ciliatus",
                        common_name="Crested gecko", sex="female", date_acquired=date(2024, 6, 1),
                        photo_url=None, weight_g=42, length_in=8, shed_count=14)
    card = compose_card("profile", mango, list(FIELD_ALLOW[("herpetoverse", "profile")]), today=TODAY)
    assert card["notes"]["facts"] == ["42 g", "8 in", "14 sheds", "2 yr, 3 mo with me"]


def test_no_name_moves_species_into_the_headline():
    card = compose_card("profile", rosie(), ["species", "sex"], today=TODAY)
    assert card["notes"]["headline"] == "Brachypelma hamorii"
    assert card["notes"]["species_line"] == "Mexican redknee · female"


def test_notes_never_carry_unchosen_fields():
    card = compose_card("profile", rosie(), ["photo"], today=TODAY)
    assert card["notes"] == {"headline": None, "species_line": None, "facts": []}


def test_read_defaults_shapes():
    assert read_defaults(None) == (None, "specimen")
    assert read_defaults(["name"]) == (["name"], "specimen")
    assert read_defaults({"fields": ["name"], "frame": "notes"}) == (["name"], "notes")
    assert read_defaults({"fields": ["name"], "frame": "bogus"}) == (["name"], "specimen")
