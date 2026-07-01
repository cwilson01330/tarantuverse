"""
Care-guide expansion — ROACH batch 2 (BRIEF-care-guide-expansion §6).

8 net-new display/pet roaches, all genuinely kept in the hobby, verified absent
from batch 1 and the existing catalog. Single-table insert into `invert_species`
(taxon='roach'); not in legacy `species`.

Honesty-first: every row cites a source_url; conservative consensus husbandry;
unknowns null. Roaches are harmless to humans → venom_severity null,
urticating_hairs False. feeding_mode 'omnivore' (all here are opportunistic
detritivore/omnivores). water_dish_required=False on purpose (roaches drown
easily — moisture comes from moist substrate + fresh produce / water gel).
image_url left null for the image agent (join on scientific_name_lower).

Note on caps (schemas/invert_species.py): adult_size ≤50, temperament ≤100,
native_region ≤200, type ≤60, substrate_type ≤200 — all rows respect these.

Controlled vocab matched to schemas/invert_species.py:
  care_level='beginner' (or 'intermediate'); feeding_mode='omnivore';
  burrowing ∈ {none,light,heavy}; type length-bounded string.

Run with: python3 seed_care_expansion_roach_batch2.py   (idempotent)
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
        scientific_name="Gromphadorhina oblongonota",
        common_names=["Wide-Horned Hisser", "Wide-Horn Hissing Cockroach"],
        genus="Gromphadorhina", temperament="docile, hardy; hisses; climbs glass",
        native_region="Southern Madagascar",
        adult_size="up to ~3 in (~75 mm)", adult_length_min_mm=65, adult_length_max_mm=80,
        temperature_min=75, temperature_max=90, humidity_min=60, humidity_max=80,
        burrowing="none",
        substrate_type="barely-moist peat + rotted compost; stacked bark hides (surface dweller)",
        care_guide=(
            "The largest of the commonly kept hissing cockroaches — bigger and darker than the "
            "Madagascar hisser, with males sporting exaggerated 'triceratops' pronotal horns. "
            "Hardy, docile, and slow to mature (8-12 months). A surface/bark dweller and a capable "
            "glass-climber, so use a secure, vented lid. Keep on barely-moist peat and rotted "
            "compost with plenty of stacked bark for shelter; 75-90°F breeds fastest. Feeds on "
            "roach chow plus organic banana, orange, and zucchini; moisture from produce/substrate, "
            "not a water dish. Hisses by forcing air through its spiracles. Harmless. Lifespan 2-5 yr."
        ),
        source_url="https://limberlostexotics.com/wide-horn-hisser-gromphadorhina-oblongonota/",
    ),
    _roach(
        scientific_name="Princisia vanwaerebeki",
        common_names=["Vibrant Hisser", "Vibrant Hissing Cockroach"],
        genus="Princisia", temperament="docile; large males territorial; hisses; climbs",
        native_region="Southeastern Madagascar",
        adult_size="2.2-3 in (65-72 mm)", adult_length_min_mm=65, adult_length_max_mm=72,
        temperature_min=75, temperature_max=90, humidity_min=55, humidity_max=75,
        burrowing="none",
        substrate_type="barely-moist peat/coco; bark hides; keep half humid with high airflow",
        care_guide=(
            "A striking hissing cockroach — glossy black males skirted in golden yellow, with the "
            "pronounced pronotal horns of the group. Slow-breeding but drops large litters of "
            "fast-growing nymphs. Large males can be territorial, so provide space and many bark "
            "hides. Prefers at least half the enclosure kept humid but with very high airflow; "
            "75-90°F. A glass-climber — use a secure, vented lid. Feeds on chow, fruit, and veg "
            "(females especially like fruit); moisture from produce/substrate. Harmless. Hisses "
            "when handled or courting."
        ),
        source_url="https://en.wikipedia.org/wiki/Princisia_vanwaerebeki",
    ),
    _roach(
        scientific_name="Aeluropoda insignis",
        common_names=["Flat-Horn Hisser", "Flat-Horned Hissing Cockroach"],
        genus="Aeluropoda", temperament="calm, tames easily; hisses; climbs glass",
        native_region="Madagascar",
        adult_size="up to ~3 in (~75 mm)", adult_length_min_mm=55, adult_length_max_mm=75,
        temperature_min=70, temperature_max=85, humidity_min=55, humidity_max=75,
        burrowing="none",
        substrate_type="coco/peat; egg-crate, cork & wood hides (flat surface dweller)",
        care_guide=(
            "A distinctly flat hissing cockroach — its extreme flatness sets it apart from other "
            "hissers. Calm and easily tamed with regular handling despite an aggressive look. "
            "Comfortable at 70-85°F (upper end best for breeding), with plenty of dark space and "
            "egg-crate or bark to move over. A glass and smooth-plastic climber, so use a tight lid "
            "or a petroleum-jelly barrier at the rim. Feeds on carrots, apple, banana, squash, and "
            "roach chow; moisture from produce/substrate. Harmless. Males can live 3-5 years."
        ),
        source_url="https://dubiaroachdepot.com/shop/flat-horned-hisser",
    ),
    _roach(
        scientific_name="Eurycotis floridana",
        common_names=["Florida Woods Cockroach", "Florida Skunk Roach", "Palmetto Bug"],
        genus="Eurycotis", family="Ectobiidae",
        temperament="hardy; sprays a foul defensive musk when alarmed",
        native_region="Southeastern USA (Florida)",
        adult_size="1.2-1.6 in (30-40 mm)", adult_length_min_mm=30, adult_length_max_mm=40,
        temperature_min=70, temperature_max=85, humidity_min=50, humidity_max=70,
        burrowing="light",
        substrate_type="coco/peat with a humidity gradient (moist under hides, drier above); good airflow",
        care_guide=(
            "A large, hardy North American roach nicknamed the skunk roach: when alarmed adults "
            "eject an extremely foul, directional defensive spray up to about a metre — so it is a "
            "look-don't-provoke display species rather than a handling one. Keep semi-humid with a "
            "gradient (moist under hides, drier above) and moderate-to-high ventilation, 70-85°F. "
            "A protein-loving species — offer dog/cat/chick feed plus fruit and veg, and keep "
            "protein and moisture adequate or it may eat its own oothecae. Flightless. Harmless to "
            "humans aside from the odor and possible irritation from the spray."
        ),
        source_url="https://en.wikipedia.org/wiki/Florida_woods_cockroach",
    ),
    _roach(
        scientific_name="Byrsotria fumigata",
        common_names=["Cuban Burrowing Cockroach"],
        genus="Byrsotria", temperament="docile, hardy; burrows; flightless",
        native_region="Cuba",
        adult_size="~1.6-2 in (40-50 mm)", adult_length_min_mm=40, adult_length_max_mm=50,
        temperature_min=75, temperature_max=88, humidity_min=60, humidity_max=80,
        burrowing="heavy", substrate_depth="2-4 inches",
        substrate_type="moist coco fiber/peat/potting soil, ≥2 in deep for burrowing",
        care_guide=(
            "A stout, flightless burrowing roach that thrives on deep, moist substrate, high "
            "humidity, and steady warmth (75-88°F). Easy to keep and breed, which is why it is "
            "popular both as a display roach and as a feeder. Give at least two inches of moist "
            "coco/peat/soil to burrow in and a tight lid (it can squeeze through small gaps). "
            "Feeds on roach chow, fruit, and veg; moisture from produce/substrate, not open water. "
            "Harmless. Lifespan roughly 1-2 years."
        ),
        source_url="https://vetverified.com/articles/keeping-the-cuban-burrowing-cockroach",
    ),
    _roach(
        scientific_name="Lucihormetica verrucosa",
        common_names=["Warty Glowspot Roach"],
        genus="Lucihormetica", temperament="docile; climbs; flightless",
        native_region="South America (Colombia, Venezuela)",
        adult_size="~1.5-1.6 in (37-40 mm)", adult_length_min_mm=37, adult_length_max_mm=40,
        temperature_min=75, temperature_max=85, humidity_min=60, humidity_max=80,
        burrowing="light",
        substrate_type="barely-moist peat + rotted compost; bark hides; they form semi-permanent burrows",
        care_guide=(
            "A handsome display roach named for the two pale 'glowspots' on its pronotum — despite "
            "the name these are pigment spots, not light organs (interestingly, a carrot-rich diet "
            "deepens them toward orange-red). Keep on barely-moist peat and rotted compost at "
            "75-85°F with medium-high humidity; adults of both sexes climb but cannot fly, so use a "
            "secure lid. They dig semi-permanent burrows to shelter and raise young. Feeds on "
            "organic banana, orange, carrot, zucchini, and soaked high-protein dog food; moisture "
            "from produce/substrate. Harmless."
        ),
        source_url="https://en.wikipedia.org/wiki/Lucihormetica_verrucosa",
    ),
    _roach(
        scientific_name="Ergaula pilosa",
        common_names=["Black Beetle Mimic Roach", "Asian Rhino Roach"],
        genus="Ergaula", family="Corydiidae",
        temperament="docile; burrows; adults climb; flightless females",
        native_region="Southeast Asia",
        adult_size="~1-1.2 in (25-30 mm)", adult_length_min_mm=25, adult_length_max_mm=32,
        temperature_min=70, temperature_max=85, humidity_min=60, humidity_max=80,
        burrowing="heavy", substrate_depth="2-3 inches",
        substrate_type="2-3 in coco/peat/soil topped with decaying hardwood leaf litter (key nymph food)",
        care_guide=(
            "A round, glossy, beetle-mimicking roach — females are wingless and tank-like while "
            "males are winged. Keep 2-3 inches of coco/peat/soil topped with a layer of decaying "
            "hardwood leaf litter, which is an important part of the nymphs' diet, in a humid but "
            "well-ventilated enclosure at 75°F or warmer. Adults climb, so use a tight lid. Feeds "
            "on dog/cat/chick/fish feed plus leaf litter; moisture from substrate/produce. Females "
            "bury oothecae in the substrate; nymphs take 6-8 months to mature. Harmless."
        ),
        source_url="https://roach-ranch.com/product/ergaula-pilosa/",
    ),
    _roach(
        scientific_name="Simandoa conserfariam",
        common_names=["Simandoa Cave Roach", "Extinct-in-the-Wild Roach"],
        genus="Simandoa", temperament="docile, fast; climbs smooth surfaces; flightless",
        native_region="Guinea (cave endemic; extinct in the wild)",
        adult_size="1.6-1.9 in (42-47 mm)", adult_length_min_mm=42, adult_length_max_mm=47,
        temperature_min=70, temperature_max=85, humidity_min=50, humidity_max=65,
        burrowing="light",
        substrate_type="moist coco/peat; bark hides; a petroleum-jelly rim barrier (fast climber)",
        care_guide=(
            "A conservation story on six legs: known only from a single cave in Guinea that was "
            "destroyed by bauxite/iron-ore mining, this species now survives only in captivity — "
            "'extinct in the wild.' Keeping it genuinely helps preserve it. Adults are speckled "
            "olive-grey with yellow abdominal striping and red legs; nymphs darken then develop "
            "stripes. Keep on moist substrate at 70-85°F, 50-65% humidity. It runs fast and climbs "
            "smooth surfaces, so a tight lid or a petroleum-jelly barrier is essential. Feeds on "
            "carrot, potato, apple, and orange plus chow; moisture from produce/substrate. Harmless."
        ),
        source_url="https://en.wikipedia.org/wiki/Simandoa_conserfariam",
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
