"""
Species DB expansion — TARANTULA DWARFS & LOCALITIES batch 8
(BRIEF-care-guide-expansion §2: deeper genus cuts, not the covered beginners).

6 net-new, dual-table (tarantula → legacy `species` + `invert_species` mirror,
shared id), as batches 4-7. Verified absent from prod (existing covers Cyriocosmus
elegans, Dolichothele diamantinensis, Hapalopus Colombia/guerreroi, Pamphobeteus
antinous/machala/platyomma, etc.).

Honesty-first: every row cites a source_url; conservative consensus husbandry;
unknowns null. All New World → urticating_hairs=True, mild venom. Dropped
Hapalotremus martinorum (taxonomic description only, no care data) and Cyclosternum
schmardae (data resolves to the taxonomically tangled C. fasciatum / Davus
fasciatus). adult_size kept <=50 chars.

Run with: python3 seed_species_expansion_dwarfs_batch8.py   (idempotent)
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.species import Species, CareLevel
from app.models.invert_species import InvertSpecies
from app.services.inverts_dualwrite import _species_to_invert_species_kwargs

B, I = CareLevel.BEGINNER, CareLevel.INTERMEDIATE


def _nw(**kw):
    base = dict(
        family="Theraphosidae", growth_rate="medium", type="terrestrial",
        water_dish_required=True, webbing_amount="light", burrowing=True,
        urticating_hairs=True, medically_significant_venom=False, venom_potency="Mild",
        feeding_frequency_adult="1-2 prey per week",
        enclosure_size_adult="8x8x8 inches", substrate_depth="3-4 inches",
        substrate_type="coco fiber, partly damp with a dry surface; hide; water dish",
    )
    base.update(kw)
    return base


SPECIES_DATA = [
    _nw(
        scientific_name="Cyriocosmus ritae",
        common_names=["Peruvian Dwarf Tiger"], genus="Cyriocosmus",
        care_level=B, temperament="docile; fast, retreats to burrow",
        native_region="Peru", adult_size="~2 inches (dwarf)", growth_rate="medium-fast",
        temperature_min=72, temperature_max=82, humidity_min=65, humidity_max=75,
        enclosure_size_adult="6x6x6 inches",
        care_guide=(
            "A tiny (~2 inch) Peruvian dwarf with the genus's intricate black-and-white "
            "patterning and a heart-shaped abdominal mark. Docile and rarely defensive — if "
            "startled it bolts for its burrow rather than posturing. Unusually for a dwarf it "
            "both burrows and climbs, so add a little cork. Keep warm with damp-not-saturated "
            "substrate (65-75%) and a water dish once grown. Fast but harmless — urticating "
            "hairs, mild venom. A charming display dwarf."
        ),
        source_url="https://www.thetarantulacollective.com/caresheets/cyriocosmus-ritae",
    ),
    _nw(
        scientific_name="Cyriocosmus leetzi",
        common_names=["Colombian Dwarf Beauty"], genus="Cyriocosmus",
        care_level=B, temperament="reclusive, skittish; bold feeder",
        native_region="Colombia", adult_size="~2 inches (dwarf)",
        temperature_min=74, temperature_max=80, humidity_min=65, humidity_max=75,
        enclosure_size_adult="6x6x6 inches",
        care_guide=(
            "A jewel-like 2-inch Colombian dwarf — reclusive, often tucked in webbing or its "
            "burrow, but a confident eater. Give it a small, mostly-terrestrial enclosure with a "
            "hide, lightly mist half of it every week or two (65-75%), and add a water dish once "
            "it passes ~1 inch. Quick and tiny, so it's a display rather than a handling species. "
            "Urticating hairs, mild venom."
        ),
        source_url="https://www.thetarantulacollective.com/caresheets/cyriocosmus-leetzi",
    ),
    _nw(
        scientific_name="Cyriocosmus perezmilesi",
        common_names=["Bolivian Dwarf Beauty"], genus="Cyriocosmus",
        care_level=B, temperament="docile, bold; often out in the open",
        native_region="Bolivia", adult_size="~2-2.5 inches (dwarf)",
        temperature_min=75, temperature_max=82, humidity_min=60, humidity_max=70,
        enclosure_size_adult="6x6x6 inches",
        care_guide=(
            "One of the best dwarf tarantulas for beginners — unlike most dwarfs it's bold and "
            "confident, frequently sitting out in the open rather than hiding. ~2-2.5 inches, "
            "richly patterned. An opportunistic burrower: give thick substrate kept half-moist, "
            "a hide, and a water dish once over an inch. Calm and low-maintenance, with no real "
            "defensive behavior; urticating hairs, mild venom."
        ),
        source_url="https://www.thetarantulacollective.com/caresheets/cyriocosmus-perezmilesi",
    ),
    _nw(
        scientific_name="Kochiana brunnipes",
        common_names=["Brazilian Dwarf Pink Leg"], genus="Kochiana",
        care_level=I, temperament="docile but very fast; obligate burrower",
        native_region="Brazil", adult_size="2-3 inches (dwarf)",
        type="fossorial", substrate_depth="4 inches",
        temperature_min=74, temperature_max=80, humidity_min=60, humidity_max=70,
        enclosure_size_adult="8x8x8 inches (deep substrate)",
        care_guide=(
            "A small Brazilian dwarf (2-3 inches) with subtle pink-toned legs — docile and "
            "reluctant to bite, but extremely fast and prone to bolting, so treat it as a display "
            "animal and work carefully. An obligate burrower: give it ~10 cm of substrate to dig, "
            "a hide, and a water dish, at moderate humidity (60-70%). Reclusive but rewarding. "
            "Urticating hairs, mild venom."
        ),
        source_url="https://www.grimoireexotics.com/post/kochiana-brunnipes-dwarf-pink-leg-care-guide",
    ),
    _nw(
        scientific_name="Pamphobeteus fortis",
        common_names=["Bolivian Blue Leg", "Colombian Giant Copperhead"], genus="Pamphobeteus",
        care_level=I, temperament="skittish but usually calm; threat pose or kicks hair",
        native_region="Colombia, Bolivia", adult_size="up to 8-10 inches", growth_rate="fast",
        temperature_min=70, temperature_max=80, humidity_min=70, humidity_max=80,
        enclosure_size_adult="12x12x12 inches", substrate_depth="5-6 inches",
        care_guide=(
            "A giant Pamphobeteus — slings flash electric blue, adults mature into dark velvety "
            "brown with copper sheen, females reaching 8-10 inches. Usually calm but skittish; it "
            "will throw a threat pose or kick hair and can give a painful bite, so handling is "
            "minimal. Keep humid (70-80%) with deep substrate to burrow, a hide, and a water "
            "dish, on a warm/cool gradient. Fast-growing. Urticating hairs, mild (but stout) venom."
        ),
        source_url="https://www.grimoireexotics.com/post/pamphobeteus-fortis-colombian-giant-copperhead-care-guide",
    ),
    _nw(
        scientific_name="Pamphobeteus vespertinus",
        common_names=["Ecuadorian Red Bloom"], genus="Pamphobeteus",
        care_level=I, temperament="nervous, easily irritated; no handling",
        native_region="Ecuador", adult_size="7-8 inches", growth_rate="fast",
        temperature_min=68, temperature_max=78, humidity_min=70, humidity_max=80,
        enclosure_size_adult="12x12x12 inches", substrate_depth="5-6 inches",
        care_guide=(
            "A large Ecuadorian Pamphobeteus, mature males blooming reddish-purple. Nervous and "
            "easily irritated — a look-don't-handle giant. Comfortable at cooler room "
            "temperatures (it's a montane species) with humid, damp-not-saturated substrate "
            "(70-80%), deep enough to burrow, plus a hide and water dish. Fast-growing. "
            "Urticating hairs, mild venom."
        ),
        source_url="https://www.petproducts.org/pamphobeteus-vespertinus/",
    ),
]


def seed():
    db = SessionLocal()
    try:
        added = skipped = mirrored = 0
        existing_invert_ids = {row[0] for row in db.query(InvertSpecies.id).all()}
        for data in SPECIES_DATA:
            row = dict(data)
            name = row["scientific_name"]
            if db.query(Species).filter(Species.scientific_name_lower == name.lower()).first():
                skipped += 1
                print(f"  Skipped (exists): {name}")
                continue
            sp = Species(scientific_name_lower=name.lower(), **row)
            db.add(sp)
            db.flush()
            added += 1
            if sp.id not in existing_invert_ids:
                db.add(InvertSpecies(**_species_to_invert_species_kwargs(sp)))
                mirrored += 1
            print(f"  Added + mirrored: {name}")
        db.commit()
        print(f"\nDone. Added {added} species, mirrored {mirrored}, skipped {skipped}.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
