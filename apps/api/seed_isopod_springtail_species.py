"""
Seed isopods and springtails into `invert_species` (taxon='other').

Run with: python3 seed_isopod_springtail_species.py  (idempotent — skips existing)

WHY THIS EXISTS
---------------
Colony mode (ADR-010) names isopods and springtails as its headline use case,
and the add flow is species-first — you pick a species, and only then does the
"One animal / A population" control appear. With zero isopod rows in the
catalog there was no species to pick, so the feature was unreachable for
exactly the keepers it was built for. Measured 2026-09-08: 0 rows matching
Porcellio / Armadillidium / Cubaris / Trichorhina / springtail, and taxon
'other' was empty entirely.

TAXON CHOICE
------------
Filed under 'other' rather than a dedicated `isopod` taxon. A real taxon would
need a migration widening the taxon CHECK on `inverts` + `invert_species` plus
the lockstep regex/registry updates CLAUDE.md lists, and it is a one-way door
for existing rows. 'other' is honest, works today, and these rows can be
re-pointed later if isopods earn their own taxon. Note this means they show as
"Other invertebrate" in the browser — a known cosmetic cost.

HONESTY NOTES
-------------
* All DETRITIVORES (feeding_mode='detritivore'), so no live-prey feeding
  cadence nudges. They eat decaying leaf litter and wood, supplemented with a
  calcium source and occasional protein.
* All harmless. No venom, no bite. venom_severity left None.
* `water_dish_required` is False for every one of these and that is a care
  fact, not an omission: standing water drowns isopods and springtails.
  Hydration comes from a damp substrate gradient.
* Springtails and dwarf whites double as clean-up crew inside other animals'
  enclosures. They're seeded here as keepable colonies in their own right;
  that dual use is mentioned in the care guide rather than modelled.
* Morph names (Powder Orange, Powder Blue, Dairy Cow) are trade names for
  colour forms, not species. They're listed as common names under the parent
  species instead of being invented as separate rows.
  BUT a trade name is not automatically a morph. "Panda King" was listed here
  as a Porcellio laevis morph and is in fact Cubaris sp. "Panda King" — its own
  animal, its own genus, roughly 3x the price. Corrected 2026-09-10. Check
  which genus a trade name belongs to before folding it into a common_names
  list; black-and-white species in particular get conflated constantly.
* Counts, temperatures and sizes are given only where confident. Where the
  hobby range is genuinely wide the field is left null rather than fabricated.
"""
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


# Shared care language. Isopod husbandry is genuinely similar across species;
# what differs is moisture tolerance, speed, and price.
_COMMON = {
    "taxon": "other",
    "order_name": "Isopoda",
    "type": "terrestrial",
    "feeding_mode": "detritivore",
    "prey_size": "n/a (detritivore)",
    "water_dish_required": False,
    "communal_suitable": True,
    "venom_severity": None,
    "burrowing": "light",
}


SPECIES_DATA = [
    {
        **_COMMON,
        "scientific_name": "Trichorhina tomentosa",
        "common_names": ["Dwarf White Isopod", "Dwarf White"],
        "genus": "Trichorhina", "family": "Platyarthridae",
        "care_level": "beginner", "temperament": "harmless, reclusive",
        "native_region": "Neotropical; established worldwide in culture",
        "adult_size": "0.2 inches", "growth_rate": "fast",
        "temperature_min": 70, "temperature_max": 80,
        "humidity_min": 80, "humidity_max": 90,
        "enclosure_size_adult": "shoebox tub or larger",
        "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber kept damp throughout, with leaf litter and rotting wood",
        "feeding_frequency_adult": "leaf litter always available; supplement weekly",
        "care_guide": (
            "The default clean-up crew of the hobby and the easiest isopod to keep. "
            "Tiny, blind-white, and entirely harmless. They are PARTHENOGENETIC — "
            "populations are all-female and reproduce without males, so a culture "
            "started from a dozen animals will establish on its own. Unlike most "
            "isopods they want the substrate damp throughout rather than a wet-to-dry "
            "gradient, and they tolerate less ventilation. Feed decaying leaf litter "
            "and rotting hardwood continuously, with a calcium source (cuttlebone or "
            "eggshell) and an occasional protein supplement such as fish flake. "
            "DETRITIVORE: no live prey, and they should never be offered any. They "
            "also live inside other animals' bioactive enclosures, where they eat mold "
            "and waste — keeping them as their own colony simply means tracking a "
            "population you feed deliberately."
        ),
    },
    {
        **_COMMON,
        "scientific_name": "Porcellio laevis",
        # NOT "Panda King" — that is Cubaris sp. "Panda King", a different
        # genus at roughly 3x the price. Both are black and white, which is how
        # this got in here. Corrected 2026-09-10; see fix_isopod_species_ids.py.
        "common_names": ["Dairy Cow Isopod", "Milkback"],
        "genus": "Porcellio", "family": "Porcellionidae",
        "care_level": "beginner", "temperament": "harmless, fast-moving",
        "native_region": "Europe; introduced worldwide",
        "adult_size": "0.6-0.8 inches", "growth_rate": "fast",
        "temperature_min": 68, "temperature_max": 80,
        "humidity_min": 50, "humidity_max": 70,
        "enclosure_size_adult": "shoebox tub or larger, cross-ventilated",
        "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber and topsoil with a damp end and a dry end; leaf litter",
        "feeding_frequency_adult": "leaf litter always available; protein 1-2x/week",
        "care_guide": (
            "Large, fast, prolific, and the usual recommendation for a first isopod "
            "colony you actually watch rather than just use as clean-up crew. Dairy "
            "Cow and Milkback are colour morphs of this species, not separate "
            "species. Do not confuse it with Cubaris sp. \"Panda King\", which is a "
            "different genus with different care and a much higher price — the two "
            "are both black and white and are regularly mixed up. "
            "Give a clear moisture gradient — one end damp, one end "
            "dry — with good cross-ventilation; laevis is more prone to crashing in "
            "stagnant, uniformly wet setups than Armadillidium. They are hungry for "
            "protein compared with most isopods, and an underfed colony will scavenge "
            "weak or moulting animals, so keep fish flake or a similar supplement "
            "available. DETRITIVORE. Harmless: no venom, no bite. They cannot roll "
            "into a ball and rely on speed instead."
        ),
    },
    {
        **_COMMON,
        "scientific_name": "Porcellionides pruinosus",
        "common_names": ["Powder Orange Isopod", "Powder Blue Isopod", "Powder Isopod"],
        "genus": "Porcellionides", "family": "Porcellionidae",
        "care_level": "beginner", "temperament": "harmless, very fast",
        "native_region": "Cosmopolitan",
        "adult_size": "0.4 inches", "growth_rate": "fast",
        "temperature_min": 70, "temperature_max": 82,
        "humidity_min": 50, "humidity_max": 70,
        "enclosure_size_adult": "shoebox tub or larger, well ventilated",
        "substrate_depth": "2 inches",
        "substrate_type": "coco fiber with a moisture gradient; leaf litter and bark",
        "feeding_frequency_adult": "leaf litter always available; protein weekly",
        "care_guide": (
            "Among the fastest-breeding isopods in culture, which makes them the usual "
            "choice when a colony needs to establish quickly. Powder Orange and Powder "
            "Blue are colour forms of the same species. They are quick, climb well, and "
            "tolerate drier and warmer conditions than most — a well-ventilated tub with "
            "a damp corner suits them. Their speed makes them harder to count than "
            "Armadillidium, so a headcount here is honestly an estimate; record it as "
            "one. DETRITIVORE, harmless, cannot roll into a ball."
        ),
    },
    {
        **_COMMON,
        "scientific_name": "Armadillidium vulgare",
        "common_names": ["Common Pill Bug", "Roly Poly", "Potato Bug"],
        "genus": "Armadillidium", "family": "Armadillidiidae",
        "care_level": "beginner", "temperament": "harmless, slow",
        "native_region": "Europe; introduced worldwide",
        "adult_size": "0.5-0.7 inches", "growth_rate": "medium",
        "temperature_min": 65, "temperature_max": 78,
        "humidity_min": 50, "humidity_max": 65,
        "enclosure_size_adult": "shoebox tub or larger",
        "substrate_depth": "2-3 inches",
        "substrate_type": "topsoil and coco fiber with a moisture gradient; limestone or cuttlebone",
        "feeding_frequency_adult": "leaf litter always available; protein every 1-2 weeks",
        "care_guide": (
            "The pill bug most people already know from under a garden paving slab, and "
            "a forgiving first colony. Rolls into a tight ball when disturbed, which "
            "makes it slower and considerably easier to count than the Porcellio "
            "species. Wants a drier, better-ventilated setup than dwarf whites, with a "
            "reliably damp end. Calcium matters more here than for most — limestone "
            "chips or cuttlebone should be permanently available or the exoskeleton "
            "suffers. Many colour morphs exist in the trade under this species. "
            "DETRITIVORE, harmless."
        ),
    },
    {
        **_COMMON,
        "scientific_name": "Armadillidium maculatum",
        "common_names": ["Zebra Isopod"],
        "genus": "Armadillidium", "family": "Armadillidiidae",
        "care_level": "beginner", "temperament": "harmless, slow",
        "native_region": "Southern France",
        "adult_size": "0.6-0.8 inches", "growth_rate": "slow",
        "temperature_min": 65, "temperature_max": 78,
        "humidity_min": 55, "humidity_max": 70,
        "enclosure_size_adult": "shoebox tub or larger",
        "substrate_depth": "2-3 inches",
        "substrate_type": "topsoil and coco fiber with a moisture gradient; limestone, leaf litter",
        "feeding_frequency_adult": "leaf litter always available; protein every 1-2 weeks",
        "care_guide": (
            "Striking black-and-white banding and one of the most popular display "
            "isopods. Care matches Armadillidium vulgare, but growth and reproduction "
            "are noticeably SLOWER — a new colony can look static for months before it "
            "takes off, and that is normal rather than a sign of failure. Keep calcium "
            "permanently available. Rolls into a ball, so counts are reasonably "
            "accurate. DETRITIVORE, harmless."
        ),
    },
    {
        **_COMMON,
        "scientific_name": "Armadillidium klugii",
        "common_names": ["Montenegro Clown Isopod", "Clown Isopod"],
        "genus": "Armadillidium", "family": "Armadillidiidae",
        "care_level": "intermediate", "temperament": "harmless, slow",
        "native_region": "Balkans (Montenegro, Croatia)",
        "adult_size": "0.5-0.7 inches", "growth_rate": "slow",
        "temperature_min": 68, "temperature_max": 78,
        "humidity_min": 60, "humidity_max": 75,
        "enclosure_size_adult": "shoebox tub or larger",
        "substrate_depth": "2-3 inches",
        "substrate_type": "topsoil and coco fiber, damp end maintained; limestone, leaf litter",
        "feeding_frequency_adult": "leaf litter always available; protein every 1-2 weeks",
        "care_guide": (
            "The 'clown' — deep red-brown with bold yellow spotting, and one of the most "
            "sought-after display isopods. Rated intermediate not because daily care is "
            "hard but because klugii is slow to reproduce and less forgiving of a "
            "colony that dries out completely, so mistakes are expensive and take a "
            "long time to recover from. Maintain a genuinely damp end at all times and "
            "keep limestone available. DETRITIVORE, harmless."
        ),
    },
    {
        **_COMMON,
        "scientific_name": "Cubaris sp. \"Rubber Ducky\"",
        "common_names": ["Rubber Ducky Isopod", "Rubber Duck Isopod"],
        "genus": "Cubaris", "family": "Armadillidae",
        "care_level": "advanced", "temperament": "harmless, secretive",
        "native_region": "Thailand (limestone cave systems)",
        "adult_size": "0.4-0.5 inches", "growth_rate": "slow",
        "temperature_min": 70, "temperature_max": 80,
        "humidity_min": 75, "humidity_max": 90,
        "enclosure_size_adult": "small tub; deep substrate matters more than floor space",
        "substrate_depth": "3-4 inches",
        "substrate_type": "coco fiber and topsoil over a damp base; limestone essential, leaf litter",
        "feeding_frequency_adult": "leaf litter and rotting wood always available; protein sparingly",
        "care_guide": (
            "The species that made isopods a collector's hobby, named for a face marking "
            "that resembles a rubber duck. It is genuinely demanding and genuinely "
            "expensive, which is why it is rated advanced: it comes from limestone caves, "
            "wants consistently high humidity with deep substrate and permanent access to "
            "limestone, reproduces slowly, and reacts badly to drying out or to being "
            "disturbed. Expect to see very little of them — they stay buried. This is "
            "still an undescribed Cubaris species sold under a trade name, so care "
            "information across sources varies and some of it is guesswork; treat "
            "confident-sounding numbers elsewhere with suspicion. DETRITIVORE, harmless."
        ),
    },
    {
        **_COMMON,
        "order_name": "Entomobryomorpha",
        "scientific_name": "Folsomia candida",
        "common_names": ["Temperate White Springtail", "Springtail"],
        "genus": "Folsomia", "family": "Isotomidae",
        "care_level": "beginner", "temperament": "harmless",
        "native_region": "Cosmopolitan; established worldwide in culture",
        "adult_size": "under 0.1 inches", "growth_rate": "fast",
        "temperature_min": 65, "temperature_max": 78,
        "humidity_min": 90, "humidity_max": 100,
        "enclosure_size_adult": "small lidded tub; charcoal or coco fiber culture",
        "substrate_depth": "1-2 inches",
        "substrate_type": "horticultural charcoal with standing water, or permanently wet coco fiber",
        "feeding_frequency_adult": "a few grains of rice or brewer's yeast weekly",
        "care_guide": (
            "Not an isopod and not an insect — springtails are hexapods in their own "
            "group, named for the furcula, a tail-like appendage they release to flick "
            "themselves into the air. The standard bioactive clean-up organism and about "
            "the simplest living thing in the hobby to culture: a lidded tub of "
            "horticultural charcoal sitting in water, or permanently wet coco fiber, fed "
            "a few grains of uncooked rice or a pinch of brewer's yeast. PARTHENOGENETIC, "
            "so a culture rebuilds itself from a handful of animals. Unlike almost "
            "everything else in this catalog they want it wet, not merely damp. "
            "Population is counted by eye at best — record any headcount as an estimate. "
            "DETRITIVORE and fungivore; harmless to animals and to people."
        ),
    },
]


def seed():
    db = SessionLocal()
    try:
        added = 0
        skipped = 0
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
            species = InvertSpecies(
                id=uuid.uuid4(),
                taxon=taxon,
                scientific_name_lower=name.lower(),
                slug=_slugify(name),
                **row,
            )
            db.add(species)
            added += 1
            print(f"  Added [{taxon}]: {name}")
        db.commit()
        print(f"\nDone. Added {added}, skipped {skipped}.")
        print(
            "All seeded with communal_suitable=True, so colony mode is offered "
            "for every one of them in the add flow."
        )
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
