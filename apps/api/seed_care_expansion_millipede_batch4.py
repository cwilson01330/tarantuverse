"""
Care-guide expansion — MILLIPEDE batch 4 (BRIEF-care-guide-expansion §2).

6 net-new millipedes, verified absent from the live catalog and from millipede
batches 2 & 3. Single-table insert into `invert_species` (taxon='millipede').

Mix of round-backs (Spirostreptida/Spirobolida) and flat-backs (polydesmids:
Harpaphe, Coromus). All are detritivores → feeding_mode='detritivore',
venom_severity null, developmental_class 'anamorphic'.

Honesty-first: cited per row; conservative genus-typical husbandry; unknowns
null. Flat-backs (Harpaphe, Coromus) produce a defensive secretion — Harpaphe's
is hydrogen cyanide (almond/cherry smell) — flagged with a wash-hands /
no-handling note. Where hobby-inflated size figures circulate (e.g. Pelmatojulus
"13 in"), conservative genus-typical ranges are used and the uncertainty noted.
order_name + family overridden per species. image_url left null for the image
agent.

Caps (schemas/invert_species.py): adult_size ≤50, temperament ≤100,
native_region ≤200, type ≤60, substrate_type ≤200 — all rows respect these.

Run with: python3 seed_care_expansion_millipede_batch4.py   (idempotent)
"""
import os
import re
import sys
import uuid

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.invert_species import InvertSpecies


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower().strip()).strip("-")


def _milli(**kw):
    base = dict(
        taxon="millipede", order_name="Spirobolida", family="Pachybolidae",
        care_level="beginner", feeding_mode="detritivore", type="terrestrial",
        developmental_class="anamorphic", growth_rate="slow",
        urticating_hairs=False, medically_significant_venom=False, venom_severity=None,
        water_dish_required=False, communal_suitable=True, burrowing="heavy",
        temperament="docile, harmless detritivore",
        prey_size="n/a (detritivore)",
        feeding_frequency_adult="continuous — leaf litter, decaying hardwood, veg + calcium",
        enclosure_size_adult="terrestrial tank with deep substrate; good ventilation",
        substrate_depth="4-6 inches",
        substrate_type="deep coco/soil + decaying hardwood leaf litter & rotten wood; add calcium (cuttlebone)",
    )
    base.update(kw)
    return base


SPECIES_DATA = [
    _milli(
        scientific_name="Thyropygus allevatus",
        common_names=["Spike-Tail Millipede", "Thai Giant Millipede"],
        genus="Thyropygus", order_name="Spirostreptida", family="Harpagophoridae",
        care_level="beginner", burrowing="heavy",
        native_region="Southeast Asia (Thailand)",
        adult_size="up to ~9-12 in (230-300 mm)", adult_length_min_mm=200, adult_length_max_mm=300,
        temperature_min=70, temperature_max=82, humidity_min=70, humidity_max=90,
        substrate_type="deep coco/soil + oak leaf litter & rotten hardwood; keep humid; add calcium",
        care_guide=(
            "One of the giants of the hobby — a long, spike-tailed Thai millipede that can approach "
            "a foot in length. Wants a humid (70-90%), well-ventilated terrarium at room "
            "temperature (70-82°F) with deep, moisture-holding substrate topped by oak leaf litter "
            "and rotten hardwood, which forms the bulk of its diet. Substrate should be at least a "
            "couple of body-lengths deep for burrowing and molting. Offer occasional veg and a "
            "calcium source (cuttlebone). A docile, slow detritivore; wash hands after handling as "
            "with any millipede."
        ),
        source_url="https://bantam.earth/spike-tail-millipede-thyropygus-allevatus/",
    ),
    _milli(
        scientific_name="Narceus annularis",
        common_names=["American Giant Millipede", "Iron Worm"],
        genus="Narceus", family="Spirobolidae",
        care_level="beginner", burrowing="heavy",
        native_region="Central & eastern USA",
        adult_size="~4 in (100 mm)", adult_length_min_mm=75, adult_length_max_mm=100,
        temperature_min=68, temperature_max=80, humidity_min=65, humidity_max=80,
        substrate_type="moist hardwood-rich soil/compost + rotten wood & leaf litter; add calcium",
        care_guide=(
            "A hardy North American round-back, close cousin to Narceus americanus and kept "
            "identically — an excellent beginner millipede. Give 4-6 inches of moisture-retaining, "
            "hardwood-rich substrate (rotting wood is the single most important food), leaf litter, "
            "and a calcium source. Comfortable at 68-80°F and 65-80% humidity. Supplement with "
            "cucumber, other veg, and occasional fish flakes. Long-lived (up to ~10 years) and "
            "fine in small groups. Docile detritivore; wash hands after handling."
        ),
        source_url="https://www.bugguide.net/node/view/5709",
    ),
    _milli(
        scientific_name="Floridobolus penneri",
        common_names=["Florida Scrub Millipede"],
        genus="Floridobolus", family="Floridobolidae",
        care_level="intermediate", burrowing="heavy",
        native_region="Florida scrub (endemic; critically imperiled)",
        adult_size="3-3.6 in (75-92 mm)", adult_length_min_mm=75, adult_length_max_mm=92,
        temperature_min=70, temperature_max=85, humidity_min=55, humidity_max=75,
        substrate_type="sandy scrub mix (high sand content) + leaf litter, rotten wood & some fungi/mushroom",
        care_guide=(
            "A rare, chunky Florida-endemic round-back — critically imperiled in the wild, tied to "
            "sandy scrub habitat, so treat captive stock as conservation-sensitive. Unlike the "
            "moisture-loving giants, it comes from dry, high-sand soil, so use a sandier substrate "
            "and a drier, more ventilated setup (55-75% humidity, 70-85°F) with leaf litter and "
            "rotten wood. Research suggests it favors fungi and mushrooms over some plant matter. "
            "Slow to mature — patience required. Docile detritivore; wash hands after handling."
        ),
        source_url="https://bugguide.net/node/view/1174474",
    ),
    _milli(
        scientific_name="Pelmatojulus ligulatus",
        common_names=["Giant Fire Millipede", "Red African Millipede"],
        genus="Pelmatojulus", family="Pachybolidae",
        care_level="intermediate", burrowing="heavy",
        native_region="West Africa",
        adult_size="~5-6 in (130-160 mm)", adult_length_min_mm=100, adult_length_max_mm=160,
        temperature_min=75, temperature_max=82, humidity_min=75, humidity_max=90,
        substrate_type="deep organic-rich coco/soil + lots of rotting hardwood, dead leaves & lichen",
        care_guide=(
            "A vivid orange-red West African round-back — a beautiful but more demanding species "
            "because it is a rotting-wood specialist. It feeds almost exclusively on decaying "
            "hardwood, dead leaves, and lichen and often refuses standard produce, so a deep, "
            "well-decomposed woody substrate is essential. Keep warm (75-82°F) and very humid "
            "(75-90%) with frequent misting. Note: some vendor listings quote lengths up to ~13 in "
            "for the genus; ~5-6 in is a more realistic mature size. Docile; wash hands before and "
            "after handling."
        ),
        source_url="https://thespidershop.co.uk/product/pelmatojulus-ligulatus/",
    ),
    _milli(
        scientific_name="Harpaphe haydeniana",
        common_names=["Yellow-Spotted Millipede", "Almond-Scented Millipede", "Cyanide Millipede"],
        genus="Harpaphe", order_name="Polydesmida", family="Xystodesmidae",
        care_level="intermediate", burrowing="light", growth_rate="medium",
        native_region="Pacific coast North America (SE Alaska to California)",
        adult_size="1.6-2 in (40-50 mm)", adult_length_min_mm=40, adult_length_max_mm=50,
        temperature_min=55, temperature_max=70, humidity_min=75, humidity_max=90,
        substrate_depth="2-4 inches",
        substrate_type="mostly rotting wood (90-100%) + moist leaf litter; cool and humid",
        care_guide=(
            "A flat-backed Pacific-coast millipede — black with contrasting yellow-tipped keels "
            "that advertise its chemical defense. Like other polydesmids it exudes hydrogen cyanide "
            "when threatened (a strong almond scent); harmless to humans in the tiny amounts "
            "produced but it can irritate eyes, nose, and mouth, so avoid handling and don't keep "
            "it sealed airtight. A cool-forest species: 55-70°F, high humidity, and a substrate that "
            "is almost entirely rotting wood, which it breeds well in. Northern-Californian stock "
            "tends to do better in captivity than the Washington subspecies. Docile detritivore."
        ),
        source_url="https://en.wikipedia.org/wiki/Harpaphe_haydeniana",
    ),
    _milli(
        scientific_name="Coromus diaphorus",
        common_names=["Golden-Edged Banded Millipede", "African Flat-Backed Millipede"],
        genus="Coromus", order_name="Polydesmida", family="Oxydesmidae",
        care_level="beginner", burrowing="light", growth_rate="medium",
        native_region="West Africa (Nigeria, Togo, Ghana)",
        adult_size="~2-3 in (50-80 mm)", adult_length_min_mm=50, adult_length_max_mm=80,
        temperature_min=72, temperature_max=82, humidity_min=70, humidity_max=80,
        substrate_depth="3-4 inches",
        substrate_type="humus-rich soil + shredded leaves, white rotten wood, a little grit; add calcium",
        care_guide=(
            "A handsome, active West African flat-back — dark with golden-beige segment edges "
            "(juveniles start white and darken with age). Easy, prolific, and colony-forming, "
            "making it a good beginner polydesmid. Keep a deep, humus-rich substrate with shredded "
            "deciduous leaves, white rotten wood, a little grit, and cuttlebone for calcium at "
            "72-82°F and 70-80% humidity in a cross-ventilated enclosure. Most of its diet is the "
            "substrate itself; fruit, veg, and millipede food are taken occasionally. Like other "
            "flat-backs it can release a mild defensive secretion — wash hands after handling."
        ),
        source_url="https://ilyasinsects.com/products/coromus-diaphorus",
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
