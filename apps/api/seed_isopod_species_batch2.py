"""
Six more isopods for the care guides (2026-11-02).

Run with:
    python3 seed_isopod_species_batch2.py          # dry run: prints what it would add
    python3 seed_isopod_species_batch2.py --apply  # write

Idempotent: a species whose scientific name is already in the catalog is skipped.

WHAT AND WHY
------------
Cory started a Cristarmadillidium muricatum colony and asked for it in the care
guides, plus a few more so it isn't a lone entry. The catalog already holds nine
isopods (seed_isopod_springtail_species.py, fix_isopod_species_ids.py); these six
are popular hobby species it was missing.

Research notes with every source and a confidence level per value:
docs/research/2026-11-02-isopod-care-research.md

HONESTY NOTES
-------------
* Taxonomy (names, authorities, families) is from WoRMS + GBIF. Husbandry
  numbers are hobby consensus from breeders and care sites, not studies — the
  guides say so where sellers disagree, and a field is left NULL rather than
  picking a side when the spread is wide (Titan humidity, Armadillo size).
* Cristarmadillidium is in ARMADILLIDIIDAE (two databases). Some sellers write
  "Armadillidae"; that is a different family.
* "Ember Bee" is an undescribed species sold under a trade name. Sellers moved it
  from Merulanella to Ardentiella after Kästle & Regalado Fernández (2025); no
  source names Ember Bee in that paper, so the guide says the placement is the
  trade's, not a published one. The old name stays in common_names so searches
  still find it.
* Porcellio hoffmannseggii is spelled with a double "i" (WoRMS, GBIF). The
  trade's single-"i" spelling is kept as a common name for search. It is NOT
  Platyarthrus hoffmannseggii, the tiny ant woodlouse.
* Morph and locale names (Dalmatian, Orange Crush, Pink, Israel …) are listed as
  common names / guide text under the parent species, never as their own rows —
  the same rule as the first isopod seed.
* No photos: no openly licensed image could be verified for any of the six.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import uuid

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.invert_species import InvertSpecies


def _slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


# Shared isopod facts. The per-taxon facts (calcium, moisture gradient, no
# chemical defence, no stage scheme) match seed_per_taxon_care_facts.py so this
# batch doesn't need that script re-run.
_COMMON = {
    "taxon": "isopod",
    "order_name": "Isopoda",
    "type": "terrestrial",
    "feeding_mode": "detritivore",
    "prey_size": "n/a (detritivore)",
    "water_dish_required": False,
    "communal_suitable": True,
    "venom_severity": None,
    "burrowing": "light",
    "supplemental_calcium_required": True,
    "moisture_gradient_required": True,
    "defensive_secretion": "none",
    "stage_scheme": "none",
}


SPECIES_DATA = [
    {
        **_COMMON,
        "scientific_name": "Cristarmadillidium muricatum",
        "common_names": ["Pineapple Spiky Isopod", "Crystal Pineapple Isopod", "Spiny Pill Isopod"],
        "genus": "Cristarmadillidium", "family": "Armadillidiidae",
        "care_level": "intermediate", "temperament": "harmless, shy, mostly nocturnal",
        "native_region": "Spain, including Mallorca (dry Mediterranean habitat)",
        "adult_size": "0.25-0.3 inches",
        "adult_length_min_mm": 6, "adult_length_max_mm": 8,
        "growth_rate": "slow",
        "temperature_min": 65, "temperature_max": 78,
        "humidity_min": 50, "humidity_max": 70,
        "enclosure_size_adult": "small to shoebox tub, well ventilated",
        "substrate_depth": "2 inches",
        "substrate_type": "topsoil and coco fiber, about half kept moist with moss and leaf litter, the rest dry",
        "feeding_frequency_adult": "leaf litter and rotting hardwood always available; protein sparingly, remove leftovers",
        "source_url": "https://www.marinespecies.org/aphia.php?p=taxdetails&id=259924",
        "care_guide": (
            "A small spiny pill isopod from Spain — the rows of pale spikes along its back are "
            "why the trade calls it Pineapple or Crystal Pineapple. It rolls into a ball when "
            "disturbed. Think dry woodland floor, not rainforest: keep roughly half the tub "
            "moist (sphagnum, moss, leaf litter) and the rest dry, with good airflow. Stagnant, "
            "wet-throughout tubs are the usual way colonies fail. One seller describes it as a "
            "humid tropical species; that contradicts its Spanish range and the other care "
            "sheets, so treat high-humidity advice for it with suspicion. It is a light eater: "
            "keep leaf litter and rotting white wood available, offer protein (fish flake, "
            "dried shrimp) in small amounts, and take uneaten food out before it molds. Calcium "
            "(cuttlebone or limestone) should always be in the tub. Growth and breeding are "
            "steady but slow, so a new colony can look quiet for months — that is normal. "
            "A display species rather than clean-up crew. DETRITIVORE, harmless."
        ),
    },
    {
        **_COMMON,
        "scientific_name": "Porcellio scaber",
        "common_names": ["Common Rough Woodlouse", "Rough Woodlouse", "Scaber Isopod"],
        "genus": "Porcellio", "family": "Porcellionidae",
        "care_level": "beginner", "temperament": "harmless, active",
        "native_region": "Central and Western Europe; now established worldwide",
        "adult_size": "up to 0.8 inches",
        "adult_length_max_mm": 20,
        "growth_rate": "fast",
        "temperature_min": 65, "temperature_max": 80,
        "humidity_min": 50, "humidity_max": 70,
        "enclosure_size_adult": "shoebox tub or larger, ventilated",
        "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber and topsoil with a moist end and a dry end; leaf litter, rotting wood, bark hides",
        "feeding_frequency_adult": "leaf litter always available; protein 1-2x/week",
        "source_url": "https://www.marinespecies.org/aphia.php?p=taxdetails&id=262440",
        "bioactive_suitable": True,
        "care_guide": (
            "The common rough woodlouse, and one of the hardiest isopods in the hobby — a good "
            "first colony and a dependable clean-up crew. It copes with drier air than most, but "
            "still needs a damp corner: it has no waxy coating and dries out in a tub that is "
            "dry end to end. It does NOT roll into a ball; it clings and freezes when disturbed. "
            "Scaber is protein-hungry — offer fish flake, dried shrimp or similar once or twice "
            "a week alongside leaf litter and rotting wood, with calcium always available. Well "
            "fed, a colony grows fast and can outgrow its tub. The trade sells many colour morphs "
            "of this one species (Dalmatian, Calico, Orange, Ghost and others). A bright BLUE "
            "scaber is not a morph — the colour comes from an iridovirus infection, and the "
            "animal should be removed. DETRITIVORE, harmless."
        ),
    },
    {
        **_COMMON,
        "scientific_name": "Porcellio dilatatus",
        "common_names": ["Giant Canyon Isopod", "Giant Canyon", "Canyon Isopod"],
        "genus": "Porcellio", "family": "Porcellionidae",
        "care_level": "beginner", "temperament": "harmless, mostly nocturnal",
        "native_region": "Western Europe and the Mediterranean; introduced elsewhere, including North America",
        "adult_size": "0.6-0.8 inches",
        "adult_length_min_mm": 15, "adult_length_max_mm": 20,
        "growth_rate": "medium",
        "temperature_min": 65, "temperature_max": 82,
        "humidity_min": 40, "humidity_max": 70,
        "enclosure_size_adult": "shoebox tub or larger, ventilated",
        "substrate_depth": "2-4 inches",
        "substrate_type": "deep topsoil and coco fiber, about a third kept moist; leaf litter and cork bark",
        "feeding_frequency_adult": "leaf litter always available; protein about twice a week",
        "burrowing": "moderate",
        "source_url": "https://www.marinespecies.org/aphia.php?p=taxdetails&id=262272",
        "bioactive_suitable": True,
        "care_guide": (
            "A big, hardy Porcellio — \"Giant Canyon\" is a trade name for the species itself, not "
            "a locale or morph, and the animal is European, not from American canyons. It "
            "tolerates drier conditions than most isopods, which makes it a good clean-up crew "
            "for drier enclosures. Give a deep substrate it can dig into, keep about a third of "
            "it moist, and ventilate well. It has a large appetite: protein about twice a week "
            "and calcium always available. Breeding is steady rather than explosive. Like other "
            "Porcellio it is a clinger rather than a roller. Sellers rate it anywhere from easy "
            "to intermediate; the main demands are space and food. DETRITIVORE, harmless."
        ),
    },
    {
        **_COMMON,
        "scientific_name": "Armadillo officinalis",
        "common_names": ["Spanish Pill Bug", "Hissing Isopod"],
        "genus": "Armadillo", "family": "Armadillidae",
        "care_level": "beginner", "temperament": "harmless, slow, mostly nocturnal",
        "native_region": "Mediterranean region",
        # Sources disagree on size (about 10-12 mm in a redescription, about 20 mm
        # from a breeder), so no mm figures are stored.
        "adult_size": "about 0.4-0.8 inches (sources vary)",
        "growth_rate": "slow",
        "temperature_min": 64, "temperature_max": 80,
        "humidity_min": 55, "humidity_max": 70,
        "enclosure_size_adult": "shoebox tub or larger",
        "substrate_depth": "2-3 inches",
        "substrate_type": "topsoil and coco fiber, about two thirds kept moist; moss, bark and leaf litter",
        "feeding_frequency_adult": "leaf litter always available; protein about twice a week",
        "source_url": "https://www.marinespecies.org/aphia.php?p=taxdetails&id=259095",
        "care_guide": (
            "A Mediterranean pill bug that rolls into an almost perfect ball. Keepers report a "
            "faint hissing sound when one is disturbed — the source of the \"Hissing Isopod\" "
            "trade name. Care is straightforward: keep about two thirds of the substrate moist "
            "with moss, bark and leaf litter, and the rest drier. It likes a little more protein "
            "than most (about twice a week) and needs calcium always available. Growth is slow. "
            "The trade sells cultivated colour morphs of this species (Orange Crush, Pink, Pink "
            "Dalmatian, white forms) and wild locales (Israel, Sicily, Tamarix). Keep locales "
            "and morphs separate and labelled — mixed colonies can't be told apart later. "
            "DETRITIVORE, harmless."
        ),
    },
    {
        **_COMMON,
        "scientific_name": 'Ardentiella sp. "Ember Bee"',
        "common_names": ["Ember Bee Isopod", "Ember Bee", 'Merulanella sp. "Ember Bee"'],
        "genus": "Ardentiella", "family": "Armadillidae",
        "care_level": "intermediate", "temperament": "harmless, active, climbs",
        "native_region": "Vietnam (per breeders)",
        "adult_size": "up to about 0.9 inches",
        "growth_rate": "slow",
        "temperature_min": 66, "temperature_max": 75,
        "humidity_min": 60, "humidity_max": 75,
        "enclosure_size_adult": "taller tub with climbing space and a tight, escape-proof lid",
        "substrate_depth": "2-3 inches",
        "substrate_type": "decaying leaves, forest moss and rotting white wood over damp substrate; cork bark; strong ventilation",
        "feeding_frequency_adult": "leaf litter, moss and rotting wood always available; vegetables and a little protein weekly",
        "can_climb_smooth": True,
        "care_guide": (
            "A striking, undescribed species sold under the trade name \"Ember Bee\". It was "
            "sold as Merulanella until 2025; breeders now file it under Ardentiella after a "
            "2025 revision of the group (Kästle & Regalado Fernández), though no published "
            "description names this form yet. Unlike most isopods it climbs, and young animals "
            "can walk up smooth plastic, so use a taller tub with a tight lid. It wants damp, "
            "layered forest litter — leaves, moss, lichen-covered twigs, rotting white wood — "
            "together with strong airflow; humid AND stagnant is what kills cultures. Feed "
            "litter continuously, plus vegetables, a little protein and calcium. Buy CAPTIVE-"
            "BRED animals: wild-caught imports often die early, and the 2025 paper notes that "
            "some species in this group are considered at risk from collection for the pet "
            "trade. Care figures come from a small number of breeders, so treat numbers as a "
            "starting point. DETRITIVORE, harmless."
        ),
    },
    {
        **_COMMON,
        "scientific_name": "Porcellio hoffmannseggii",
        "common_names": ["Titan Isopod", "Titan", "Porcellio hoffmannseggi"],
        "genus": "Porcellio", "family": "Porcellionidae",
        "care_level": "intermediate", "temperament": "slow; adults can be territorial with each other",
        "native_region": "Southern Iberian Peninsula, Morocco and the Balearic Islands",
        "adult_size": "up to about 1.5 inches",
        "adult_length_max_mm": 40,
        "growth_rate": None,
        "temperature_min": 68, "temperature_max": None,
        # Keepers disagree (dry-kept with a damp corner vs ordinary humid setups),
        # so no humidity numbers are stored. The guide explains the split.
        "humidity_min": None, "humidity_max": None,
        "enclosure_size_adult": "roomy, well-ventilated tub; many separate hides",
        "substrate_depth": "2-3 inches",
        "substrate_type": "mostly dry topsoil and coco fiber with a damp sphagnum corner; rotting wood, bark, branches",
        "feeding_frequency_adult": "rotting wood and leaf litter always available; protein and calcium regularly",
        "source_url": "https://www.marinespecies.org/aphia.php?p=taxdetails&id=262325",
        "care_guide": (
            "The Titan — the largest Porcellio in the hobby, reaching about 1.5 inches. The "
            "correct spelling is hoffmannseggii (double i); do not confuse it with Platyarthrus "
            "hoffmannseggii, a tiny ant woodlouse with completely different care. It does not "
            "roll into a ball. Adults can be territorial and injure each other, which is the "
            "leading suspected reason cultures fail: give plenty of floor space and many "
            "separate hides, and split colonies into smaller groups. Keepers disagree on "
            "moisture — some keep them dry with one damp sphagnum corner, others in ordinary "
            "humid setups — so no humidity range is given here; either way keep strong "
            "ventilation and a damp retreat. They prefer rotting wood to leaf litter and feed "
            "slowly, so they make poor clean-up crew. Calcium and some protein regularly. "
            "Females are reported to stay with their young for the first months. DETRITIVORE."
        ),
    },
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write (default is a dry run)")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        added = skipped = 0
        for data in SPECIES_DATA:
            name = data["scientific_name"]
            if db.query(InvertSpecies).filter(
                InvertSpecies.scientific_name_lower == name.lower()
            ).first():
                skipped += 1
                print(f"  Skipped (exists): {name}")
                continue
            row = dict(data)
            taxon = row.pop("taxon")
            db.add(InvertSpecies(
                id=uuid.uuid4(),
                taxon=taxon,
                scientific_name_lower=name.lower(),
                slug=_slugify(name),
                **row,
            ))
            added += 1
            print(f"  {'Added' if args.apply else 'Would add'} [{taxon}]: {name}")
        if args.apply:
            db.commit()
            print(f"\nDone. Added {added}, skipped {skipped}.")
        else:
            db.rollback()
            print(f"\nDry run. Would add {added}, skipped {skipped}. Re-run with --apply to write.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
