"""Sitter care cards — services/sitter_card.py.

Covers the PRD's card rules: source priority (keeper → records → species,
omit when unknown), safety always first and never inferred from a False flag,
private fields never leaking, the today-decision, and per-taxon wording.
Pure functions — no database.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace as NS

import pytest

from app.services import sitter_card as sc
from app.services.sitter_card import (
    DEFAULT,
    KEEPER,
    RECORD,
    SAFETY,
    SPECIES,
    FeedingFacts,
    compose_animal_card,
    compose_colony_card,
    compose_invert_card,
    compose_routine,
    summarise_meals,
)

NOW = datetime(2026, 10, 10, 15, 0, tzinfo=timezone.utc)
SENTINEL = "PRIVATE-SENTINEL-7f3a"


def invert(**kw):
    base = dict(
        id="11111111-1111-1111-1111-111111111111", name="Juno", common_name="Mexican red knee",
        scientific_name="Brachypelma hamorii", taxon="tarantula", photo_url=None,
        life_stage="adult", feeding_paused_reason=None, feeding_paused_until=None,
        water_dish=None, misting_schedule=None, target_humidity_min=None, target_humidity_max=None,
        target_temp_min=None, target_temp_max=None, sitter_note=None,
        # private fields — must never surface
        notes=SENTINEL, enclosure_notes=SENTINEL, price_paid=SENTINEL, source=SENTINEL,
        provenance=SENTINEL, origin_keeper_name=SENTINEL, death_notes=SENTINEL,
        death_cause=SENTINEL,
    )
    base.update(kw)
    return NS(**base)


def species(**kw):
    base = dict(
        feeding_mode="predator", prey_size=None, feeding_frequency_sling=None,
        feeding_frequency_juvenile=None, feeding_frequency_adult=None,
        water_dish_required=False, humidity_min=None, humidity_max=None,
        temperature_min=None, temperature_max=None, urticating_hairs=False,
        medically_significant_venom=False, venom_severity=None, defensive_secretion=None,
        can_fly=None, can_climb_smooth=None, supplemental_calcium_required=None,
        moisture_gradient_required=None,
    )
    base.update(kw)
    return NS(**base)


def lines(card, key=None):
    out = []
    for s in card["sections"]:
        if key is None or s["key"] == key:
            out.extend(s["lines"])
    return out


def texts(card, key=None):
    return [l["text"] for l in lines(card, key)]


def card_for(inv=None, sp=None, facts=None, premolt=False, tz=None):
    return compose_invert_card(
        inv or invert(), sp if sp is not None else species(),
        facts=facts or FeedingFacts(), premolt_likely=premolt,
        keeper_name="Cory", now=NOW, tz_offset_minutes=tz,
    )


# ── privacy ──────────────────────────────────────────────────────────────────

class TestPrivateFieldsNeverLeak:
    def test_invert_card(self):
        c = card_for(inv=invert(sitter_note="shy"), facts=FeedingFacts(
            last_fed_at=NOW - timedelta(days=3), usual_meal="2 medium crickets",
            interval_days=7, interval_source=KEEPER))
        assert SENTINEL not in json.dumps(c)

    def test_colony_card(self):
        col = NS(id="c1", name="Dairy cows", common_name=None, scientific_name="Porcellio laevis",
                 taxon="isopod", photo_url=None, water_dish=True, target_humidity_min=70,
                 target_humidity_max=80, target_temp_min=None, target_temp_max=None,
                 sitter_note=None, notes=SENTINEL, source=SENTINEL, stage_counts=SENTINEL)
        assert SENTINEL not in json.dumps(compose_colony_card(col, species(), keeper_name="Cory"))

    def test_reptile_card(self):
        a = NS(id="a1", name="Mango", common_name="Crested gecko", scientific_name="Correlophus ciliatus",
               taxon="lizard", photo_url=None, feeding_paused_reason=None, feeding_paused_until=None,
               brumation_active=False, sitter_note=None, notes=SENTINEL, price_paid=SENTINEL,
               source=SENTINEL, source_breeder=SENTINEL, provenance=SENTINEL, death_notes=SENTINEL)
        c = compose_animal_card(a, None, facts=FeedingFacts(), enclosure=None, feeds_on_cgd=True,
                                keeper_name="Cory", now=NOW)
        assert SENTINEL not in json.dumps(c)

    def test_identity_is_an_exact_allowlist(self):
        """Adding a field to a card is a privacy decision; this makes it a visible one."""
        c = card_for()
        identity = {k for k in c if k not in ("feeding", "sections")}
        assert identity == {"kind", "id", "name", "common_name", "scientific_name", "taxon", "photo_url"}


# ── safety ───────────────────────────────────────────────────────────────────

class TestSafety:
    def test_safety_is_always_the_first_section(self):
        c = card_for(sp=species(urticating_hairs=True))
        assert c["sections"][0]["key"] == "safety"

    def test_medically_significant_venom(self):
        c = card_for(sp=species(medically_significant_venom=True))
        first = lines(c, "safety")[0]
        assert first["source"] == SAFETY and "Medically significant" in first["text"]

    def test_scorpion_moderate_venom(self):
        c = card_for(inv=invert(taxon="scorpion"), sp=species(venom_severity="moderate"))
        assert any("Painful sting" in t for t in texts(c, "safety"))

    def test_centipede_severity_alone_is_enough(self):
        c = card_for(inv=invert(taxon="centipede"), sp=species(venom_severity="medically_significant"))
        assert any("Medically significant" in t for t in texts(c, "safety"))

    def test_urticating_hairs(self):
        assert any("irritating hairs" in t for t in texts(card_for(sp=species(urticating_hairs=True)), "safety"))

    def test_millipede_secretion(self):
        c = card_for(inv=invert(taxon="millipede"), sp=species(defensive_secretion="benzoquinone"))
        assert any("stains skin" in t for t in texts(c, "safety"))

    def test_secretion_none_says_nothing(self):
        c = card_for(sp=species(defensive_secretion="none"))
        assert not any("chemical" in t for t in texts(c, "safety"))

    def test_mantis_flies_and_roach_climbs(self):
        assert any("Can fly" in t for t in texts(card_for(sp=species(can_fly=True)), "safety"))
        assert any("climb glass" in t for t in texts(card_for(sp=species(can_climb_smooth=True)), "safety"))

    def test_false_flags_never_claim_harmless(self):
        """False can mean 'not recorded' in this schema — so it asserts nothing."""
        all_text = " ".join(texts(card_for(sp=species()), "safety")).lower()
        for word in ("harmless", "safe to handle", "no venom", "not venomous"):
            assert word not in all_text
        # Only the universal default remains.
        assert [l["source"] for l in lines(card_for(sp=species()), "safety")] == [DEFAULT]

    def test_no_species_still_says_dont_handle(self):
        assert texts(card_for(sp=None), "safety") == ["Please don't handle — watch only."]


# ── today ────────────────────────────────────────────────────────────────────

class TestToday:
    def test_keeper_pause_wins_and_names_the_reason(self):
        c = card_for(inv=invert(feeding_paused_reason="premolt", feeding_paused_until=date(2026, 10, 20)),
                     facts=FeedingFacts(last_fed_at=NOW - timedelta(days=30), interval_days=7,
                                        interval_source=KEEPER))
        assert c["feeding"]["state"] == sc.DONT_FEED
        assert "premolt" in c["feeding"]["headline"] and "20 Oct" in c["feeding"]["headline"]

    def test_expired_pause_no_longer_applies(self):
        c = card_for(inv=invert(feeding_paused_reason="rehoused", feeding_paused_until=date(2026, 10, 1)),
                     facts=FeedingFacts(last_fed_at=NOW - timedelta(days=10), interval_days=7,
                                        interval_source=KEEPER))
        assert c["feeding"]["state"] == sc.FEED

    def test_premolt_signal_stops_feeding_for_tarantulas(self):
        c = card_for(premolt=True, facts=FeedingFacts(last_fed_at=NOW - timedelta(days=30),
                                                      interval_days=7, interval_source=KEEPER))
        assert c["feeding"]["state"] == sc.DONT_FEED
        assert "premolt" in c["feeding"]["headline"]

    def test_premolt_signal_ignored_for_other_taxa(self):
        c = card_for(inv=invert(taxon="scorpion"), premolt=True,
                     facts=FeedingFacts(last_fed_at=NOW - timedelta(days=30), interval_days=7,
                                        interval_source=KEEPER))
        assert c["feeding"]["state"] == sc.FEED

    def test_due_and_not_due(self):
        due = card_for(facts=FeedingFacts(last_fed_at=NOW - timedelta(days=7), interval_days=7,
                                          interval_source=KEEPER))
        assert due["feeding"]["state"] == sc.FEED
        later = card_for(facts=FeedingFacts(last_fed_at=NOW - timedelta(days=2), interval_days=7,
                                            interval_source=KEEPER))
        assert later["feeding"]["state"] == sc.NOT_DUE
        assert later["feeding"]["next_due_on"] == "2026-10-15"

    def test_never_fed_asks_rather_than_guessing(self):
        c = card_for(facts=FeedingFacts(interval_days=7, interval_source=KEEPER))
        assert c["feeding"]["state"] == sc.ASK

    def test_no_schedule_asks(self):
        c = card_for(facts=FeedingFacts(last_fed_at=NOW - timedelta(days=40)))
        assert c["feeding"]["state"] == sc.ASK

    def test_detritivore_grazes(self):
        c = card_for(inv=invert(taxon="millipede"), sp=species(feeding_mode="detritivore"))
        assert c["feeding"]["state"] == sc.GRAZE
        assert any("leaf litter" in t for t in texts(c, "feeding"))
        assert not any("live prey" in t for t in texts(c, "feeding"))

    def test_day_boundary_uses_the_sitters_timezone(self):
        # Fed 01:00 UTC on the 3rd = the evening of the 2nd in UTC-6.
        facts = FeedingFacts(last_fed_at=datetime(2026, 10, 3, 1, 0, tzinfo=timezone.utc),
                             interval_days=7, interval_source=KEEPER)
        assert card_for(facts=facts, tz=None)["feeding"]["last_fed_on"] == "2026-10-03"
        assert card_for(facts=facts, tz=360)["feeding"]["last_fed_on"] == "2026-10-02"


# ── source priority ──────────────────────────────────────────────────────────

class TestSourcePriority:
    def test_keeper_interval_beats_species_frequency(self):
        c = card_for(sp=species(feeding_frequency_adult="every 2–3 weeks"),
                     facts=FeedingFacts(interval_days=10, interval_source=KEEPER))
        feeding = lines(c, "feeding")
        assert {"text": "Every 10 days.", "source": KEEPER} in feeding
        assert not any("2–3 weeks" in l["text"] for l in feeding)

    def test_species_frequency_is_the_labelled_fallback(self):
        c = card_for(sp=species(feeding_frequency_adult="every 2–3 weeks"))
        assert {"text": "How often: every 2–3 weeks.", "source": SPECIES} in lines(c, "feeding")

    def test_record_humidity_beats_species(self):
        c = card_for(inv=invert(target_humidity_min=60, target_humidity_max=70),
                     sp=species(humidity_min=40, humidity_max=50))
        assert lines(c, "water") == [{"text": "Humidity: 60–70%.", "source": RECORD}]

    def test_species_humidity_fallback(self):
        c = card_for(sp=species(humidity_min=40, humidity_max=50))
        assert {"text": "Humidity: 40–50%.", "source": SPECIES} in lines(c, "water")

    def test_unknown_facts_are_omitted_not_guessed(self):
        c = card_for(sp=species())
        keys = {s["key"] for s in c["sections"]}
        assert "heat" not in keys          # no temps anywhere
        assert "water" not in keys         # no dish, humidity or misting anywhere
        assert not any("Usually eats" in t for t in texts(c))

    def test_keeper_saying_no_water_dish_is_respected(self):
        c = card_for(inv=invert(water_dish=False), sp=species(water_dish_required=True))
        assert not any("water dish" in t for t in texts(c, "water"))

    def test_keeper_note_is_its_own_section(self):
        c = card_for(inv=invert(sitter_note="Food at the burrow entrance, then step back."))
        assert lines(c, "note") == [{"text": "Food at the burrow entrance, then step back.", "source": KEEPER}]

    def test_misting_schedule_is_the_keepers_words(self):
        c = card_for(inv=invert(misting_schedule="one side, twice a week"))
        assert {"text": "Misting: one side, twice a week.", "source": KEEPER} in lines(c, "water")


# ── meals ────────────────────────────────────────────────────────────────────

class TestMeals:
    def f(self, days, food, size=None, qty=None, accepted=True):
        return NS(fed_at=NOW - timedelta(days=days), food_type=food, food_size=size,
                  quantity=qty, accepted=accepted)

    def test_most_common_accepted_meal(self):
        meals = [self.f(1, "cricket", "medium", 2), self.f(8, "cricket", "medium", 2),
                 self.f(15, "dubia roach", "large", 1)]
        assert summarise_meals(meals) == "2 medium cricket"

    def test_refusals_are_not_what_it_eats(self):
        meals = [self.f(1, "superworm", accepted=False), self.f(2, "superworm", accepted=False),
                 self.f(9, "cricket", "small")]
        assert summarise_meals(meals) == "small cricket"

    def test_nothing_recorded(self):
        assert summarise_meals([]) is None
        assert summarise_meals([self.f(1, "", accepted=True)]) is None


# ── per taxon ────────────────────────────────────────────────────────────────

class TestPerTaxon:
    def test_isopod_colony(self):
        col = NS(id="c1", name="Dairy cows", common_name=None, scientific_name="Porcellio laevis",
                 taxon="isopod", photo_url=None, water_dish=None, target_humidity_min=None,
                 target_humidity_max=None, target_temp_min=None, target_temp_max=None,
                 sitter_note=None)
        c = compose_colony_card(col, species(supplemental_calcium_required=True,
                                             moisture_gradient_required=True, can_climb_smooth=True),
                                keeper_name="Cory")
        all_text = " ".join(texts(c))
        assert "calcium" in all_text and "damp" in all_text and "climb glass" in all_text
        assert any("count them" in t for t in texts(c, "leave_alone"))

    def test_crested_gecko_cgd_and_supplements(self):
        a = NS(id="a1", name="Mango", common_name=None, scientific_name=None, taxon="lizard",
               photo_url=None, feeding_paused_reason=None, feeding_paused_until=None,
               brumation_active=False, sitter_note=None)
        sp = NS(handleability="docile", supplementation_notes="Dust insects with calcium + D3.",
                feeding_frequency_adult="every 2–3 days", water_bowl_description=None,
                humidity_min=60, humidity_max=80, temp_basking_min=None, temp_basking_max=None,
                temp_warm_min=None, temp_warm_max=None, temp_cool_min=72, temp_cool_max=78,
                temp_night_min=None, temp_night_max=None, uvb_required=False)
        c = compose_animal_card(a, sp, facts=FeedingFacts(), enclosure=None, feeds_on_cgd=True,
                                keeper_name="Cory", now=NOW)
        feeding = texts(c, "feeding")
        assert any("CGD" in t for t in feeding)
        assert any("calcium + D3" in t for t in feeding)
        assert {"text": "Cool side: 72–78°F.", "source": SPECIES} in lines(c, "heat")

    def test_snake_hands_off_and_brumating(self):
        a = NS(id="a2", name="Noodle", common_name=None, scientific_name=None, taxon="snake",
               photo_url=None, feeding_paused_reason=None, feeding_paused_until=None,
               brumation_active=True, sitter_note=None)
        sp = NS(handleability="hands_off", supplementation_notes=None, feeding_frequency_adult=None,
                water_bowl_description=None, humidity_min=None, humidity_max=None,
                temp_basking_min=None, temp_basking_max=None, temp_warm_min=None, temp_warm_max=None,
                temp_cool_min=None, temp_cool_max=None, temp_night_min=None, temp_night_max=None,
                uvb_required=True)
        c = compose_animal_card(a, sp, facts=FeedingFacts(last_fed_at=NOW - timedelta(days=40),
                                                          interval_days=14, interval_source=KEEPER),
                                enclosure=None, feeds_on_cgd=False, keeper_name="Cory", now=NOW)
        assert texts(c, "safety")[0] == "Don't handle."
        assert c["feeding"]["state"] == sc.DONT_FEED and "brumating" in c["feeding"]["headline"]
        assert any("UVB" in t for t in texts(c, "heat"))

    def test_enclosure_targets_beat_the_reptile_sheet(self):
        a = NS(id="a3", name="Rex", common_name=None, scientific_name=None, taxon="lizard",
               photo_url=None, feeding_paused_reason=None, feeding_paused_until=None,
               brumation_active=False, sitter_note=None)
        enc = NS(water_dish=True, misting_schedule=None, target_humidity_min=30,
                 target_humidity_max=40, target_temp_min=75, target_temp_max=95)
        sp = NS(handleability=None, supplementation_notes=None, feeding_frequency_adult=None,
                water_bowl_description=None, humidity_min=10, humidity_max=20,
                temp_basking_min=100, temp_basking_max=110, temp_warm_min=None, temp_warm_max=None,
                temp_cool_min=None, temp_cool_max=None, temp_night_min=None, temp_night_max=None,
                uvb_required=False)
        c = compose_animal_card(a, sp, facts=FeedingFacts(), enclosure=enc, feeds_on_cgd=False,
                                keeper_name="Cory", now=NOW)
        assert lines(c, "heat") == [{"text": "Enclosure should read 75–95°F.", "source": RECORD}]
        assert {"text": "Humidity: 30–40%.", "source": RECORD} in lines(c, "water")


# ── routine ──────────────────────────────────────────────────────────────────

class TestRoutine:
    def test_defaults_when_the_keeper_never_wrote_any(self):
        r = compose_routine(None, [])
        assert len(r["emergency"]) == len(sc.DEFAULT_EMERGENCY)
        assert all(e["source"] == DEFAULT for e in r["emergency"])

    def test_keeper_emergency_text_replaces_defaults(self):
        g = NS(routine_steps=["Feeders are in the garage bin.", "  "], emergency_text="Call Sam first.",
               contact_line="Text me: 555-0100", vet_contact=None)
        r = compose_routine(g, [])
        assert r["steps"] == [{"text": "Feeders are in the garage bin.", "source": KEEPER}]
        assert r["emergency"] == [{"text": "Call Sam first.", "source": KEEPER}]
        assert r["contact_line"] == "Text me: 555-0100"

    def test_cleared_emergency_text_means_none_not_defaults(self):
        g = NS(routine_steps=[], emergency_text="", contact_line=None, vet_contact=None)
        assert compose_routine(g, [])["emergency"] == []

    def test_summary_counts(self):
        cards = [
            card_for(facts=FeedingFacts(last_fed_at=NOW - timedelta(days=9), interval_days=7, interval_source=KEEPER)),
            card_for(facts=FeedingFacts(last_fed_at=NOW - timedelta(days=1), interval_days=7, interval_source=KEEPER)),
            card_for(premolt=True, facts=FeedingFacts(last_fed_at=NOW - timedelta(days=9), interval_days=7, interval_source=KEEPER)),
        ]
        s = compose_routine(None, cards)["summary"]
        assert (s["feed_today"], s["not_due"], s["dont_feed"], s["total"]) == (1, 1, 1, 3)


def test_deterministic():
    facts = FeedingFacts(last_fed_at=NOW - timedelta(days=3), usual_meal="1 large dubia",
                         interval_days=7, interval_source=KEEPER)
    assert card_for(facts=facts) == card_for(facts=facts)
