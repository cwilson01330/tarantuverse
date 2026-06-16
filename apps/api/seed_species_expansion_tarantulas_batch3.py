"""
Species DB expansion — TARANTULAS, batch 3 (research-backed, cited).
User-requested species list.

Dual-table pattern (species + invert_species mirror, shared id), same as
batches 1-2. PLUS a rename: Pterinopelma sazimai -> Lasiocyano sazimai (the
species was moved to the monotypic genus Lasiocyano in 2023). That species
already exists in the DB, so we RENAME the existing rows in place (both tables,
shared id) rather than inserting a duplicate.

Honesty notes:
* Psalmopoeus emeraldus and Tapinauchenius sp. 'Yasuni' are New World but in
  Psalmopoeinae — NO urticating hairs (urticating_hairs=False).
* Avicularia geroldi (Aviculariinae) HAS urticating hairs (type II) but rarely
  kicks them.
* Old World (Haplocosmia himalayana, Omothymus sp. 'Valhalla') — no urticating
  hairs, potent venom -> medically_significant_venom=True.
* Omothymus sp. 'Valhalla' and Tapinauchenius sp. 'Yasuni' are UNDESCRIBED trade
  names (genus placement provisional). adult_size left null where unconfirmed.
* adult_size kept <=50 chars (VARCHAR cap).

Run with: python3 seed_species_expansion_tarantulas_batch3.py   (idempotent)
"""
import os
import sys
import uuid

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.species import Species, CareLevel
from app.models.invert_species import InvertSpecies
from app.services.inverts_dualwrite import _species_to_invert_species_kwargs

B, I, A = CareLevel.BEGINNER, CareLevel.INTERMEDIATE, CareLevel.ADVANCED


SPECIES_DATA = [
    {
        "scientific_name": "Avicularia geroldi",
        "common_names": ["Brazilian Blue-Green Pinktoe"],
        "genus": "Avicularia", "family": "Theraphosidae",
        "care_level": B, "temperament": "docile but quick; prefers to flee",
        "native_region": "Brazil", "adult_size": "5-6 inches", "growth_rate": "medium-fast",
        "type": "arboreal", "temperature_min": 75, "temperature_max": 82, "humidity_min": 70, "humidity_max": 80,
        "enclosure_size_adult": "8x8x12 inches (vertical)", "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber, lightly moist; cork bark + foliage; excellent cross-ventilation",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": False, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A metallic blue-green pinktoe — a docile, beginner-friendly New World arboreal. "
            "Like all Avicularia it needs lots of cross-ventilation (stuffy, damp enclosures "
            "are the classic killer); keep lightly moist with a water dish, tall with cork "
            "bark and foliage to anchor web. Has urticating hairs but rarely kicks; flees "
            "rather than bites. Mild venom."
        ),
        "source_url": "https://beyondthetreat.com/avicularia-geroldi/",
    },
    {
        "scientific_name": "Thrixopelma cyaneolum",
        "common_names": ["Cobalt Red Rump"],
        "genus": "Thrixopelma", "family": "Theraphosidae",
        "care_level": B, "temperament": "exceptionally docile, slow-moving",
        "native_region": "Peru", "adult_size": "4-5 inches", "growth_rate": "medium",
        "type": "terrestrial", "temperature_min": 65, "temperature_max": 77, "humidity_min": 50, "humidity_max": 60,
        "enclosure_size_adult": "8x8x8 inches", "substrate_depth": "3-4 inches",
        "substrate_type": "coco fiber, mostly dry with a water dish; slightly moist lower layer",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A smoky cobalt-blue Peruvian terrestrial with red abdominal tones — one of the "
            "most docile tarantulas, almost never kicking hair. Adults tolerate dry-to-"
            "moderate humidity; keep dry with a water dish, cool room temps are fine. Slings "
            "want a bit more moisture. Mild venom; a great beginner/display species."
        ),
        "source_url": "https://www.invert-labs.com/blogs/care-guides/cobalt-red-rump-blue-tarantula-thrixopelma-cyaneolum",
    },
    {
        "scientific_name": "Phormictopus sp. 'Dominican Purple'",
        "common_names": ["Dominican Purple"],
        "genus": "Phormictopus", "family": "Theraphosidae",
        "care_level": I, "temperament": "bold, moderately defensive; fast grower",
        "native_region": "Dominican Republic (Hispaniola)", "adult_size": "7-8 inches", "growth_rate": "fast",
        "type": "terrestrial", "temperature_min": 72, "temperature_max": 82, "humidity_min": 65, "humidity_max": 75,
        "enclosure_size_adult": "14x14x12 inches", "substrate_depth": "5-6 inches",
        "substrate_type": "deep, slightly moist coco fiber (not soggy); water dish",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Moderate",
        "care_guide": (
            "A large, fast-growing Caribbean species with purple sheen on mature specimens. "
            "Bold and quick to throw a threat posture, bolt, or kick hair — best for "
            "intermediate+ keepers. Deep, slightly moist substrate it can burrow into, with "
            "a water dish. Hearty eater; urticating hairs; venom moderate for a New World."
        ),
        "source_url": "https://www.thedefiantforest.com/blogs/news/dominican-purple-tarantula-species-and-care-guide-phormictopus-sp-facts-husbandry",
    },
    {
        "scientific_name": "Psalmopoeus emeraldus",
        "common_names": ["Emerald Chevron"],
        "genus": "Psalmopoeus", "family": "Theraphosidae",
        "care_level": I, "temperament": "fast, skittish; relies on speed",
        "native_region": "Colombia", "adult_size": None, "growth_rate": "fast",
        "type": "arboreal", "temperature_min": 75, "temperature_max": 85, "humidity_min": 70, "humidity_max": 80,
        "enclosure_size_adult": "10x10x14 inches (vertical)", "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber lightly moist; cork bark verticals; good ventilation",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": False, "urticating_hairs": False,
        "medically_significant_venom": False, "venom_potency": "Moderate",
        "care_guide": (
            "A vivid green New World arboreal with chevron abdominal markings. Like all "
            "Psalmopoeus it has NO urticating hairs and is fast and skittish — not a first "
            "species. Tall, ventilated enclosure with cork bark; keep consistent humidity "
            "without saturating the substrate. Venom more notable than most New World, but "
            "not medically significant."
        ),
        "source_url": "https://www.urbantarantulas.com/products/psalmopoeus-emeraldus-emerald-chevron",
    },
    {
        "scientific_name": "Tapinauchenius sp. 'Yasuni'",
        "common_names": ["Yasuni"],
        "genus": "Tapinauchenius", "family": "Theraphosidae",
        "care_level": I, "temperament": "fast, skittish; heavy webber",
        "native_region": "Ecuador (Yasuni)", "adult_size": "4-5 inches", "growth_rate": "fast",
        "type": "arboreal", "temperature_min": 70, "temperature_max": 80, "humidity_min": 70, "humidity_max": 80,
        "enclosure_size_adult": "8x8x12 inches (semi-arboreal)", "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber with many web anchor points; moist when young, drier as adult",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "heavy", "burrowing": False, "urticating_hairs": False,
        "medically_significant_venom": False, "venom_potency": "Moderate",
        "care_guide": (
            "An undescribed green/gold Ecuadorian arboreal from the Yasuni region — a fast, "
            "skittish, prolific webber. Like all Tapinauchenius (Psalmopoeinae) it has NO "
            "urticating hairs and relies on speed. Semi-arboreal enclosure with lots of "
            "anchor points; humid substrate for young, drier with an overflowed water dish "
            "as it matures. Intermediate keepers."
        ),
        "source_url": "https://exoticsunlimitedusa.com/collections/new-world/products/theraphosinae-sp-yasuni-ecuadorian-crowned-tarantula-for-sale-spiderling",
    },
    {
        "scientific_name": "Haplocosmia himalayana",
        "common_names": ["Himalayan Earth Tiger"],
        "genus": "Haplocosmia", "family": "Theraphosidae",
        "care_level": A, "temperament": "skittish; threat displays; non-defensive but potent venom",
        "native_region": "Himalayas (India, Nepal)", "adult_size": None, "growth_rate": "medium",
        "type": "fossorial", "temperature_min": 70, "temperature_max": 82, "humidity_min": 60, "humidity_max": 70,
        "enclosure_size_adult": "10x10x12 inches (deep substrate)", "substrate_depth": "5-7 inches",
        "substrate_type": "peat/coco mix with sphagnum + a little vermiculite to hold humidity",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A hardy Old World fossorial from the Himalayan foothills — unusual in preferring "
            "cooler, room-ish temps. No urticating hairs; skittish rather than overtly "
            "defensive, but has significant venom, so experienced keepers only. An active "
            "webber/burrower that's often visible. Deep, slightly-damp peat/coco substrate; "
            "good feeding response."
        ),
        "source_url": "https://tarantulaforum.com/threads/haplocosmia-himalayana-care-sheet.28020/",
    },
    {
        "scientific_name": "Omothymus sp. 'Valhalla'",
        "common_names": ["Emerald Shadow"],
        "genus": "Omothymus", "family": "Theraphosidae",
        "care_level": A, "temperament": "fast, defensive",
        "native_region": "Southeast Asia (undescribed)", "adult_size": "6+ inches", "growth_rate": "fast",
        "type": "arboreal", "temperature_min": 75, "temperature_max": 82, "humidity_min": 70, "humidity_max": 80,
        "enclosure_size_adult": "12x12x18 inches (vertical)", "substrate_depth": "3-4 inches",
        "substrate_type": "coco fiber lightly moist; vertical cork bark; good ventilation",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": False, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A rare, undescribed Old World arboreal (jet-black legs, emerald carapace, orange "
            "setae) — genus placement is provisional (also traded as Cyriopagopus sp. "
            "'Valhalla'). No urticating hairs, fast and defensive with potent Old World "
            "venom: experienced keepers only. Tall, humid, well-ventilated enclosure with "
            "vertical cork bark. Not for handling."
        ),
        "source_url": "https://exoticsunlimitedusa.com/products/cyriopagopus-valhalla-tarantula-for-sale",
    },
]


# ── Rename: Pterinopelma sazimai -> Lasiocyano sazimai (2023 reclassification) ──
RENAME = {
    "old_name": "Pterinopelma sazimai",
    "new_name": "Lasiocyano sazimai",
    "new_genus": "Lasiocyano",
    "new_slug": "lasiocyano-sazimai",
    # add the old name as a common-name alias so search still finds it
    "alias": "Pterinopelma sazimai",
}


def _apply_rename(db):
    old = db.query(Species).filter(
        Species.scientific_name_lower == RENAME["old_name"].lower()
    ).first()
    already = db.query(Species).filter(
        Species.scientific_name_lower == RENAME["new_name"].lower()
    ).first()
    if already:
        print(f"  Rename skipped — {RENAME['new_name']} already present.")
        return 0
    if not old:
        print(f"  Rename skipped — {RENAME['old_name']} not found (nothing to rename).")
        return 0
    names = list(old.common_names or [])
    if RENAME["alias"] not in names:
        names.append(RENAME["alias"])
    old.scientific_name = RENAME["new_name"]
    old.scientific_name_lower = RENAME["new_name"].lower()
    old.genus = RENAME["new_genus"]
    old.common_names = names
    # Mirror row shares the same id.
    mirror = db.query(InvertSpecies).filter(InvertSpecies.id == old.id).first()
    if mirror:
        mirror.scientific_name = RENAME["new_name"]
        mirror.scientific_name_lower = RENAME["new_name"].lower()
        mirror.genus = RENAME["new_genus"]
        mirror.slug = RENAME["new_slug"]
        mirror.common_names = names
    print(f"  Renamed: {RENAME['old_name']} -> {RENAME['new_name']}")
    return 1


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
        renamed = _apply_rename(db)
        db.commit()
        print(f"\nDone. Added {added} species, mirrored {mirrored}, renamed {renamed}, skipped {skipped}.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
