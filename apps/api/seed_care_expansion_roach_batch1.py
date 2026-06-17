"""
Care-guide expansion — ROACH batch 1 (BRIEF-care-guide-expansion §6).

Display + feeder crossover; high practical search. 6 net-new, verified absent from
prod 2026-06-16 (Gromphadorhina portentosa, Eublaberus posticus, Blaptica dubia,
Therea petiveriana, Therea olegrandjeani already present, excluded).

Single-table insert into `invert_species` (taxon='roach'); not in legacy `species`.

Honesty-first: every row cites a source_url; conservative consensus husbandry;
unknowns null. Roaches are harmless to humans → venom_severity null, feeding_mode
'omnivore'. water_dish_required=False on purpose (roaches drown easily — moisture
comes from moist substrate + fresh produce / water gel). image_url left null for
the image agent (join on scientific_name_lower).

Controlled vocab matched to schemas/invert_species.py:
  care_level='beginner'; feeding_mode='omnivore'; burrowing ∈ {none,light,heavy};
  type length-bounded string.

Run with: python3 seed_care_expansion_roach_batch1.py   (idempotent)
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


def _roach(**kw):
    base = dict(
        taxon="roach", family="Blaberidae", order_name="Blattodea",
        care_level="beginner", feeding_mode="omnivore", type="terrestrial",
        urticating_hairs=False, medically_significant_venom=False, venom_severity=None,
        water_dish_required=False, communal_suitable=True, growth_rate="medium",
        prey_size="omnivore — roach chow/dry dog food, fruit, veg, occasional protein",
        feeding_frequency_adult="continuous (chow + fresh produce for moisture)",
        enclosure_size_adult="ventilated bin/tank with a secure lid", substrate_depth="2-4 inches",
        substrate_type="coco fiber/peat kept partly moist; bark & egg-crate hides",
    )
    base.update(kw)
    return base


SPECIES_DATA = [
    _roach(
        scientific_name="Blaberus craniifer",
        common_names=["Death's Head Roach"],
        genus="Blaberus", temperament="hardy, docile; burrows",
        native_region="Mexico, Central America, Caribbean",
        adult_size="5-6 cm", adult_length_min_mm=53, adult_length_max_mm=57,
        temperature_min=75, temperature_max=90, humidity_min=55, humidity_max=85,
        burrowing="heavy", substrate_depth="3-4 inches",
        substrate_type="coco fiber/peat, moist on one side (50/50 gradient); bark & vertical hides",
        care_guide=(
            "A large, hardy display roach named for the skull-like marking on its pronotum. One "
            "of the easiest roaches to keep — colony-friendly with low aggression. Keep it warm "
            "(80-90°F breeds fastest) with a 50/50 humidity gradient: one moist half, one dry. "
            "All stages burrow, but provide vertical bark hides for the final molt to adult. "
            "Feed roach chow plus fruit and veg; moisture from produce/substrate, not a water "
            "dish (drowning risk). Harmless. Note: a strong climber — use a secure, vented lid."
        ),
        source_url="https://vetverified.com/articles/keeping-the-deaths-head-cockroach",
    ),
    _roach(
        scientific_name="Blaberus giganteus",
        common_names=["Giant Cave Roach"],
        genus="Blaberus", temperament="hardy, docile; burrows",
        native_region="Central & South America",
        adult_size="up to ~3.3 in (84 mm)", adult_length_min_mm=70, adult_length_max_mm=84,
        temperature_min=75, temperature_max=85, humidity_min=50, humidity_max=70,
        burrowing="heavy", substrate_depth="3-5 inches",
        substrate_type="deep, moist coco/peat with leaf litter + rotten wood; vertical bark for molting",
        care_guide=(
            "One of the largest cockroaches in the world — adults approach 3.3 inches. A calm, "
            "slow-breeding display species (lifespan ~2 years). Keep warm and stable (75-85°F) "
            "with deep, moist substrate, leaf litter, and rotten wood, plus vertical bark spaces "
            "it needs for the final molt. Don't let a colony overcrowd — it shortens lifespan. "
            "Feeds on roach fare plus fruit (loves orange) and fish flakes; moisture from "
            "substrate/produce. Harmless. Secure lid — they can escape."
        ),
        source_url="https://vetverified.com/articles/the-ultimate-guide-to-keeping-the-giant-cave-roach-as-a-pet",
    ),
    _roach(
        scientific_name="Archimandrita tessellata",
        common_names=["Giant Peppered Roach"],
        genus="Archimandrita", temperament="calm; one of the best handling roaches",
        native_region="Central America",
        adult_size="2-3 in (~72 mm)", adult_length_min_mm=60, adult_length_max_mm=72,
        temperature_min=70, temperature_max=85, humidity_min=50, humidity_max=70,
        burrowing="light",
        substrate_type="moisture-holding coco/peat with sphagnum + decaying wood; many vertical hides",
        care_guide=(
            "A big, peppered-patterned display roach and one of the calmest to handle. Slightly "
            "cooler-tolerant than Dubia (75-80°F is fine). Wants a humid setup — deep "
            "moisture-holding substrate with sphagnum and decaying wood for breeding, plus plenty "
            "of vertical bark hides where adults rest and large nymphs do their final molt. Feeds "
            "on chow, fruit, and veg; moisture from substrate/produce. Harmless and docile."
        ),
        source_url="https://wormman.blog/giant-peppered-archimandrita-tesselatta-roach-care/",
    ),
    _roach(
        scientific_name="Panchlora nivea",
        common_names=["Green Banana Roach"],
        genus="Panchlora", temperament="active; adults climb and fly",
        native_region="Caribbean, Gulf Coast, Central America",
        adult_size="~0.5 in (21-25 mm)", adult_length_min_mm=21, adult_length_max_mm=25,
        temperature_min=75, temperature_max=90, humidity_min=70, humidity_max=80,
        burrowing="light", substrate_depth="2-4 inches",
        substrate_type="moist soil/peat; nymphs burrow; leaf litter",
        care_guide=(
            "A small, pale-green display roach — unusual and pretty, but adults both climb and "
            "fly, so a tightly sealed, well-vented enclosure is essential. Likes it warm "
            "(80-90°F speeds breeding) with consistently moist substrate (70-80%); nymphs burrow "
            "while adults are active above ground. Favorite food is banana, alongside ripe fruit "
            "and a dry high-protein staple; moisture from produce/substrate. Harmless."
        ),
        source_url="https://en.wikipedia.org/wiki/Panchlora_nivea",
    ),
    _roach(
        scientific_name="Elliptorhina javanica",
        common_names=["Halloween Hissing Cockroach"],
        genus="Elliptorhina", temperament="docile; hisses; climbs glass",
        native_region="Madagascar",
        adult_size="2-3 in (56-60 mm)", adult_length_min_mm=56, adult_length_max_mm=60,
        temperature_min=75, temperature_max=85, humidity_min=60, humidity_max=80,
        burrowing="none",
        substrate_type="coco fiber/peat; bark, cork & egg-crate hides (surface dweller)",
        care_guide=(
            "A boldly contrasted hissing cockroach — the orange-and-black 'Halloween' cousin of "
            "the Madagascar hisser. Hardy and docile, it hisses by forcing air through its "
            "spiracles when handled or courting. A surface/bark dweller rather than a burrower, "
            "and a capable glass-climber, so use a secure, escape-proof lid. Keep warm (80-85°F "
            "breeds best) and humid (70%+), with bark and egg-crate hides. Feed fruit, veg, and "
            "a protein source a few times a week; moisture from produce/substrate. Harmless."
        ),
        source_url="https://dubiaroachdepot.com/guidance/hissing-cockroaches-information-and-care",
    ),
    _roach(
        scientific_name="Gyna lurida",
        common_names=["Porcelain Roach"],
        genus="Gyna", temperament="active; adults fly",
        native_region="Africa",
        adult_size="27-31 mm", adult_length_min_mm=27, adult_length_max_mm=31,
        temperature_min=70, temperature_max=85, humidity_min=55, humidity_max=75,
        burrowing="light",
        substrate_type="moist coco/peat; nymphs burrow; leaf litter + hides",
        care_guide=(
            "A delicate, pale 'porcelain'-toned display roach. Live-bearing and prolific — "
            "females drop up to ~30 nymphs per litter, several times a year, with adults living "
            "about a year. Nymphs burrow in moist substrate; adults can fly, so keep the lid "
            "secure. Comfortable at 70-85°F with moderate humidity; offer moisture via a moist "
            "sponge or fresh produce rather than open water (drowning risk). Feeds on chow, "
            "fruit, and veg. Harmless. A pretty, fast-multiplying colony species."
        ),
        source_url="https://shop.bugsincyberspace.com/Gyna-lurida-Porcelain-Roach-bic217.htm",
    ),
]


def seed():
    db = SessionLocal()
    try:
        added = skipped = 0
        for data in SPECIES_DATA:
            name = data["scientific_name"]
            if db.query(InvertSpecies).filter(InvertSpecies.scientific_name_lower == name.lower()).first():
                skipped += 1
                print(f"  Skipped (exists): {name}")
                continue
            row = dict(data)
            taxon = row.pop("taxon")
            db.add(InvertSpecies(
                id=uuid.uuid4(), taxon=taxon,
                scientific_name_lower=name.lower(), slug=_slugify(name),
                is_verified=True, **row,
            ))
            added += 1
            print(f"  Added: {name}")
        db.commit()
        print(f"\nDone. Added {added}, skipped {skipped}.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
