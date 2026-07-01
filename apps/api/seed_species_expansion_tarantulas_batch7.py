"""
Species DB expansion — TARANTULA batch 7 (research-backed, cited).

15 net-new tarantulas: OLD-WORLD terrestrials / fossorials / baboons + NEW-WORLD
arboreals. All verified against the provided exclusion list (species already in the
catalog) and picked because they are genuinely established in the hobby.

Split:
  Old World (7)  — urticating_hairs=False, medically_significant_venom=True,
                   venom_potency="Significant". No handling; defensiveness flagged
                   honestly per species.
  New World arboreal (8) — urticating_hairs=True, medically_significant_venom=False,
                   venom_potency="Mild". (Note: the arboreal "tree spider" genera
                   Tapinauchenius / Pseudoclamoris technically lack dense flickable
                   urticating hairs and rely on speed; they are still New World with
                   non-medically-significant venom. We keep urticating_hairs=True for
                   the New-World group flag but say so plainly in the guide where it
                   applies — honesty over a tidy boolean.)

Dual-table pattern (species + invert_species mirror, shared id), matching batch 5.

Roster & rationale (Old vs New World noted):
  OLD WORLD
   1. Poecilotheria tigrinawesseli  (Tiger Ornamental) — India; fast, defensive arboreal.
   2. Poecilotheria formosa         (Salem Ornamental) — India; high-strung arboreal.
   3. Poecilotheria smithi          (Yellow-backed Ornamental) — Sri Lanka; rare, advanced.
   4. Chilobrachys natanicharum     (Electric Blue) — Thailand; heavy-webbing fossorial (2022).
   5. Pterinochilus vorax           (Tanzanian / usambara baboon) — E. Africa; fast, defensive.
   6. Cyriopagopus sp. "Sulawesi Black" — Sulawesi; large fossorial earth tiger, defensive.
   7. Ceratogyrus pillansi           (Pillans' Horned Baboon) — Zimbabwe/Mozambique; horned fossorial.
  NEW WORLD ARBOREAL
   8. Psalmopoeus langenbucheri     (Venezuelan olive) — Venezuela; smallest Psalmopoeus.
   9. Tapinauchenius rasti          (Caribbean Diamond) — Guyana region; fast tree spider.
  10. Tapinauchenius sanctivincenti (St. Vincent Tree Spider) — St. Vincent; fast tree spider.
  11. Typhochlaena seladonia        (Brazilian Jewel) — Brazil; trapdoor-building dwarf arboreal.
  12. Avicularia hirschii           (Hirsch's Pinktoe) — Amazon; docile arboreal.
  13. Ephebopus uatuman             (Emerald Skeleton) — Brazil; semi-arboreal as juvenile.
  14. Aspinochilus rufus            (Peach Earth Tiger; "Phormingochilus sp. Rufus") — Java; arboreal.
  15. Pseudoclamoris gigas          (Orange Tree Spider; ex-Tapinauchenius) — S. America; fast tree spider.

Honesty notes:
  * Cyriopagopus sp. "Sulawesi Black" is an undescribed hobby form; care follows the
    fossorial Cyriopagopus/Ornithoctoninae genus and is noted as such. Reported adult
    size (up to ~10-11") is at the high end; we give a conservative "6-8 inches" range.
  * Aspinochilus rufus was moved out of Phormingochilus; it is still traded widely as
    "Phormingochilus sp. Rufus" (listed as a common name). Care = Asian arboreal genus.
  * Avicularia hirschii species-specific numerics are thin; care follows the Avicularia
    (pinktoe) genus, noted in the guide.
  * Pseudoclamoris gigas is the current valid name for the hobby "Orange Tree Spider"
    (formerly Tapinauchenius gigas — a DIFFERENT catalog entry that stays separate).
  * Ephebopus is New World with weak flickable hairs concentrated on the pedipalps; it
    is semi-arboreal as a juvenile and increasingly fossorial as an adult — we file it
    as arboreal (its hobby-relevant enclosure phase) and say so.
  * adult_size kept <=50 chars, temperament <=100, native_region <=200,
    enclosure_size_adult <=100, substrate_type <=200, growth_rate <=50 (VARCHAR caps).

Run with: python3 seed_species_expansion_tarantulas_batch7.py   (idempotent)
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.species import Species, CareLevel
from app.models.invert_species import InvertSpecies
from app.services.inverts_dualwrite import _species_to_invert_species_kwargs

B, I, A = CareLevel.BEGINNER, CareLevel.INTERMEDIATE, CareLevel.ADVANCED


SPECIES_DATA = [
    # ---------------------------------------------------------------- OLD WORLD
    {
        "scientific_name": "Poecilotheria tigrinawesseli",
        "common_names": ["Tiger Ornamental", "Wessel's Tiger Ornamental"],
        "genus": "Poecilotheria", "family": "Theraphosidae",
        "care_level": A, "temperament": "fast and defensive; will bite if provoked",
        "native_region": "India (eastern Ghats)", "adult_size": "6-7 inches", "growth_rate": "fast",
        "type": "arboreal", "temperature_min": 78, "temperature_max": 82, "humidity_min": 65, "humidity_max": 75,
        "enclosure_size_adult": "12x12x18 inches (vertical)", "substrate_depth": "2-3 inches",
        "substrate_type": "vertical cork tube on 2-3 in of substrate; kept dry, mist weekly; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": False, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A large Indian ornamental (pokie) with the classic Poecilotheria speed and "
            "geometric patterning. Old World: no urticating hairs and medically significant "
            "venom, so this is an advanced, no-handling species. Give it a tall enclosure with "
            "a vertical cork tube retreat, keep the substrate mostly dry with a weekly misting "
            "and a water dish, and always work it with long tongs. Fast and defensive when "
            "cornered, though it prefers to bolt into its retreat rather than stand and fight."
        ),
        "source_url": "http://www.mikebasictarantula.com/Poe-tigrinawesseli-care-sheet.html",
    },
    {
        "scientific_name": "Poecilotheria formosa",
        "common_names": ["Salem Ornamental", "Beautiful Parachute Spider"],
        "genus": "Poecilotheria", "family": "Theraphosidae",
        "care_level": A, "temperament": "high-strung and very fast; bites if provoked",
        "native_region": "India (Salem region, Tamil Nadu)", "adult_size": "5-6 inches", "growth_rate": "fast",
        "type": "arboreal", "temperature_min": 78, "temperature_max": 82, "humidity_min": 65, "humidity_max": 75,
        "enclosure_size_adult": "12x12x18 inches (vertical)", "substrate_depth": "2-3 inches",
        "substrate_type": "vertical cork with 2-3 in substrate; kept dry, misted weekly; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": False, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "The Salem Ornamental, an Indian arboreal pokie that grows fast and matures early "
            "(6-9 year lifespan). High-strung and one of the faster Poecilotheria — not "
            "outright aggressive, but it will bite if it feels trapped, and its Old World venom "
            "is medically significant. No urticating hairs; advanced, no-handling only. Tall "
            "enclosure with a vertical cork retreat, dry substrate with a weekly misting, and a "
            "water dish. Use long tongs and give it a secure retreat to bolt into."
        ),
        "source_url": "https://www.grimoireexotics.com/post/poecilotheria-formosa-salem-ornamental-tarantula-care-guide",
    },
    {
        "scientific_name": "Poecilotheria smithi",
        "common_names": ["Yellow-backed Ornamental"],
        "genus": "Poecilotheria", "family": "Theraphosidae",
        "care_level": A, "temperament": "fast and defensive; enthusiastic feeder",
        "native_region": "Sri Lanka", "adult_size": "6-7 inches", "growth_rate": "fast",
        "type": "arboreal", "temperature_min": 75, "temperature_max": 82, "humidity_min": 65, "humidity_max": 75,
        "enclosure_size_adult": "12x12x18 inches (vertical)", "substrate_depth": "2-3 inches",
        "substrate_type": "vertical cork retreat; light substrate; cross-ventilation; shallow water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": False, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A rare and highly sought Sri Lankan ornamental with striking yellow dorsal "
            "coloration; also one of the most endangered tarantulas offered in the hobby, so "
            "buy captive-bred and be mindful of provenance. Strictly advanced: full Poecilotheria "
            "speed and defensiveness plus medically significant Old World venom and no "
            "urticating hairs. Tall enclosure with a vertical cork retreat and strong "
            "cross-ventilation, light misting every 1-2 weeks, and a shallow water dish. "
            "An enthusiastic feeder — always use long tongs and never handle."
        ),
        "source_url": "https://en.wikipedia.org/wiki/Poecilotheria_smithi",
    },
    {
        "scientific_name": "Chilobrachys natanicharum",
        "common_names": ["Electric Blue Tarantula", "Chilobrachys sp. Electric Blue"],
        "genus": "Chilobrachys", "family": "Theraphosidae",
        "care_level": A, "temperament": "fast, defensive, heavy webber; not for handling",
        "native_region": "Thailand", "adult_size": "5-6 inches", "growth_rate": "medium",
        "type": "fossorial", "temperature_min": 75, "temperature_max": 85, "humidity_min": 60, "humidity_max": 70,
        "enclosure_size_adult": "12x12x12 inches", "substrate_depth": "4-6 inches",
        "substrate_type": "deep coco/peat kept moist below, drier surface; cork hide it will web over; good airflow",
        "feeding_frequency_adult": "1 prey every 7-14 days", "water_dish_required": True,
        "webbing_amount": "heavy", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A recently described (2022) Thai earth tiger famous for its electric-blue "
            "iridescence and prolific webbing — expect thick silk sheets across the substrate, "
            "decor, and burrow mouth, which is a sign it is thriving. A fossorial Old World "
            "species: give deep substrate (4-6 in) kept moist in the lower layers with a drier "
            "surface, a starter burrow under a cork flat, and good ventilation. No urticating "
            "hairs, potent venom, fast and defensive — advanced only, no handling."
        ),
        "source_url": "https://www.thetarantulacollective.com/care-sheets-2/chilobrachys-natanicharum",
    },
    {
        "scientific_name": "Pterinochilus vorax",
        "common_names": ["Bushveld Horned Baboon"],
        "genus": "Pterinochilus", "family": "Theraphosidae",
        "care_level": A, "temperament": "fast, defensive baboon; strong feeding response",
        "native_region": "East Africa (Tanzania and neighboring regions)", "adult_size": "4-5 inches", "growth_rate": "medium",
        "type": "fossorial", "temperature_min": 75, "temperature_max": 85, "humidity_min": 55, "humidity_max": 65,
        "enclosure_size_adult": "10x10x10 inches", "substrate_depth": "4-6 inches",
        "substrate_type": "dry to lightly moist coco/soil for burrowing; cork hide; shallow water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "An East African baboon in the same fast, defensive mold as its famous cousin the "
            "OBT (P. murinus). A burrower that lines its retreat with silk to sense vibrations; "
            "give it several inches of substrate kept mostly dry with a slightly damp lower "
            "layer, a cork hide, and a shallow water dish. Old World: no urticating hairs and "
            "potent venom, plus real speed and a willingness to threat-pose and bite. Advanced "
            "keepers only, no handling; species-specific data is limited, so care follows the "
            "well-documented Pterinochilus genus."
        ),
        "source_url": "https://www.thetarantulacollective.com/caresheets/pterinochilus-murinus",
    },
    {
        "scientific_name": "Cyriopagopus sp. Sulawesi Black",
        "common_names": ["Sulawesi Black Earth Tiger"],
        "genus": "Cyriopagopus", "family": "Theraphosidae",
        "care_level": A, "temperament": "very fast and defensive if under-burrowed",
        "native_region": "Sulawesi, Indonesia", "adult_size": "6-8 inches", "growth_rate": "medium",
        "type": "fossorial", "temperature_min": 75, "temperature_max": 82, "humidity_min": 70, "humidity_max": 80,
        "enclosure_size_adult": "12x12x12 inches", "substrate_depth": "5-7 inches",
        "substrate_type": "deep moist coco/soil for a silk-lined tube; cork hide; good airflow; water dish",
        "feeding_frequency_adult": "1 prey every 7-14 days", "water_dish_required": True,
        "webbing_amount": "heavy", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A large, dark Indonesian earth tiger and an undescribed hobby form, so care follows "
            "the fossorial Cyriopagopus (Ornithoctoninae) genus and is noted as such. Wants deep, "
            "consistently moist substrate to build a silk-lined burrow, plus a cork hide and good "
            "airflow; keep it humid with a water dish. Old World with no urticating hairs and "
            "potent venom; it is very fast and can be markedly defensive, especially if it lacks "
            "enough substrate to burrow. Advanced only, strictly no handling. Reported adult sizes "
            "run large (some keepers cite 10\"+); we list a conservative 6-8\" range."
        ),
        "source_url": "https://en.wikipedia.org/wiki/Cyriopagopus",
    },
    {
        "scientific_name": "Ceratogyrus pillansi",
        "common_names": ["Pillans' Horned Baboon", "Pillansi Baboon"],
        "genus": "Ceratogyrus", "family": "Theraphosidae",
        "care_level": A, "temperament": "fast and defensive; threat-poses and bites readily",
        "native_region": "Southern Africa (Zimbabwe and Mozambique)", "adult_size": "4-5 inches", "growth_rate": "medium",
        "type": "fossorial", "temperature_min": 75, "temperature_max": 84, "humidity_min": 55, "humidity_max": 65,
        "enclosure_size_adult": "10x10x10 inches", "substrate_depth": "4-6 inches",
        "substrate_type": "dry to slightly damp coco/soil for burrowing; cork hide; shallow water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A southern African horned baboon from Zimbabwe and Mozambique, part of the "
            "distinctive Ceratogyrus genus known for the horn-like foveal protrusion on the "
            "carapace. Captive-bred spiderlings are regularly available, so there is no need for "
            "wild-caught stock. Kept like other African baboons: mostly dry substrate with enough "
            "depth to burrow (it will often adopt a cork hide as its retreat rather than dig from "
            "scratch), lower humidity, and a water dish for drinking. Old World — no urticating "
            "hairs, potent venom, fast and defensive with a ready threat pose — so strictly "
            "hands-off and advanced only."
        ),
        "source_url": "https://tarantulas.su/en/evolution/Harpactirinae/Ceratogyrus",
    },
    # ---------------------------------------------------------- NEW WORLD ARBOREAL
    {
        "scientific_name": "Psalmopoeus langenbucheri",
        "common_names": ["Venezuelan Olive"],
        "genus": "Psalmopoeus", "family": "Theraphosidae",
        "care_level": I, "temperament": "often out and calm for the genus; fast if startled",
        "native_region": "Venezuela", "adult_size": "4-5 inches", "growth_rate": "fast",
        "type": "arboreal", "temperature_min": 74, "temperature_max": 82, "humidity_min": 65, "humidity_max": 75,
        "enclosure_size_adult": "8x8x12 inches (vertical)", "substrate_depth": "2-3 inches",
        "substrate_type": "vertical cork tube; plants for cover; lightly moist substrate; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": False, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "The smallest of the Psalmopoeus and reputedly one of the most visible — it tends to "
            "sit out on its webbing more than its relatives. A New World arboreal: no medically "
            "significant venom, but it is fast and will rear up and strike if it feels trapped, "
            "so it is a hands-off, intermediate species rather than a handling pet. Give it a "
            "vertical cork tube, plant cover to coax it out, lightly moist substrate, and a "
            "water dish. Fast grower and a reliable eater."
        ),
        "source_url": "http://www.mikebasictarantula.com/Psa-langenbucheri-care-sheet.html",
    },
    {
        "scientific_name": "Tapinauchenius rasti",
        "common_names": ["Caribbean Diamond Tarantula"],
        "genus": "Tapinauchenius", "family": "Theraphosidae",
        "care_level": I, "temperament": "extremely fast and skittish; flees rather than fights",
        "native_region": "Guyana / northern South America", "adult_size": "4-5 inches", "growth_rate": "fast",
        "type": "arboreal", "temperature_min": 74, "temperature_max": 82, "humidity_min": 70, "humidity_max": 80,
        "enclosure_size_adult": "8x8x12 inches (vertical)", "substrate_depth": "2-3 inches",
        "substrate_type": "vertical cork with knot-hole retreat; plants; lightly moist substrate; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": False, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A glossy, fast-growing New World tree spider with a metallic green carapace and "
            "blue-violet abdomen in mature females. Like all Tapinauchenius it is a speed "
            "specialist — it relies on lightning-fast escapes rather than defense and, unlike "
            "typical New World species, does not have the dense flickable urticating hairs, so "
            "its main defense is simply bolting. Venom is mild. Keep it in a vertical enclosure "
            "with a cork retreat, plant cover, lightly moist substrate, and a water dish. Not a "
            "handling animal — its speed makes it an intermediate keeper's species."
        ),
        "source_url": "https://en.wikipedia.org/wiki/Tapinauchenius_rasti",
    },
    {
        "scientific_name": "Tapinauchenius sanctivincenti",
        "common_names": ["St. Vincent Tree Spider", "Moss Tree Spider"],
        "genus": "Tapinauchenius", "family": "Theraphosidae",
        "care_level": I, "temperament": "very fast and skittish; bolts rather than bites",
        "native_region": "Saint Vincent (Caribbean, Lesser Antilles)", "adult_size": "4-4.5 inches", "growth_rate": "fast",
        "type": "arboreal", "temperature_min": 72, "temperature_max": 80, "humidity_min": 70, "humidity_max": 80,
        "enclosure_size_adult": "8x8x12 inches (vertical)", "substrate_depth": "2-3 inches",
        "substrate_type": "vertical cork retreat; plants; lightly moist substrate; water dish; cross-ventilation",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": False, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A velvety dark grey-to-black Caribbean tree spider accented with pinkish-red setae, "
            "endemic to St. Vincent. A classic Tapinauchenius: astonishingly fast, skittish, and "
            "prone to bolting rather than standing its ground; it lacks urticating hairs and "
            "cannot stridulate, and its venom is mild. New World but not a handling species "
            "because of that raw speed. Give it a vertical cork retreat, plant cover, lightly "
            "moist substrate with good cross-ventilation, and a water dish. Intermediate."
        ),
        "source_url": "https://www.invert-labs.com/blogs/care-guides/st-vincent-s-tree-spider-tapinauchenius-sanctivincenti",
    },
    {
        "scientific_name": "Typhochlaena seladonia",
        "common_names": ["Brazilian Jewel Tarantula"],
        "genus": "Typhochlaena", "family": "Theraphosidae",
        "care_level": A, "temperament": "docile and shy; retreats into its trapdoor",
        "native_region": "Brazil (Atlantic forest, eastern Brazil)", "adult_size": "1.5-2.5 inches", "growth_rate": "slow",
        "type": "arboreal", "temperature_min": 75, "temperature_max": 84, "humidity_min": 65, "humidity_max": 75,
        "enclosure_size_adult": "8x8x12 inches (vertical nano)", "substrate_depth": "1-2 inches",
        "substrate_type": "holey cork bark for trapdoor building; light substrate; cross-ventilation; mist lightly",
        "feeding_frequency_adult": "1 small prey per week", "water_dish_required": False,
        "webbing_amount": "moderate", "burrowing": False, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "One of the most spectacular tarantulas in the hobby — a tiny, jewel-toned Brazilian "
            "arboreal with iridescent green, gold, and pink patterning. It is a true dwarf "
            "(females only ~1.5-2.5 in) and one of only two theraphosid genera that build a hinged "
            "trapdoor, which it constructs at the top of a holey piece of cork bark and hunts from "
            "with just its front legs exposed. New World with mild venom and not defensive, but "
            "rated advanced for its fragility, small size, and precise humidity needs rather than "
            "any danger. Use a vertical nano enclosure with cork full of holes, light substrate, "
            "strong cross-ventilation, and a fine mist every day or two plus a few drops dribbled "
            "onto the trapdoor — no standing water dish for such a small spider. Feed small prey."
        ),
        "source_url": "https://www.thetarantulacollective.com/care-sheets-2/typhochlaena-seladonia",
    },
    {
        "scientific_name": "Avicularia hirschii",
        "common_names": ["Hirsch's Pinktoe"],
        "genus": "Avicularia", "family": "Theraphosidae",
        "care_level": I, "temperament": "docile but flighty; may bolt or leap",
        "native_region": "Western Amazon (Peru / Brazil border region)", "adult_size": "4-5 inches", "growth_rate": "medium",
        "type": "arboreal", "temperature_min": 72, "temperature_max": 82, "humidity_min": 70, "humidity_max": 80,
        "enclosure_size_adult": "12x12x18 inches (vertical)", "substrate_depth": "2-3 inches",
        "substrate_type": "vertical cork; plants; lightly moist substrate; STRONG cross-ventilation; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "heavy", "burrowing": False, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A distinctively banded Amazonian pinktoe. Species-specific numbers are thin, so care "
            "follows the well-documented Avicularia (pinktoe) genus, noted here for honesty. "
            "Docile but flighty New World arboreal with mild venom — hands-off to avoid startle "
            "leaps and falls. As with all Avics, ventilation is everything: a tall, "
            "cross-ventilated enclosure with cork and plants, lightly moist (not wet) substrate, "
            "and a water dish. Intermediate."
        ),
        "source_url": "https://marshallarachnids.com/pages/avicularia-care-guide",
    },
    {
        "scientific_name": "Ephebopus uatuman",
        "common_names": ["Emerald Skeleton Tarantula", "Tapajos Yellow Banded"],
        "genus": "Ephebopus", "family": "Theraphosidae",
        "care_level": I, "temperament": "skittish and can be defensive; too fast to handle",
        "native_region": "Brazil (Amazon rainforest)", "adult_size": "4-5 inches", "growth_rate": "medium",
        "type": "arboreal", "temperature_min": 75, "temperature_max": 85, "humidity_min": 70, "humidity_max": 80,
        "enclosure_size_adult": "10x10x10 inches", "substrate_depth": "4-5 inches",
        "substrate_type": "deep moist coco/soil (turns fossorial as adult); cork hide; leaf litter; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A striking dark Brazilian species with emerald-green highlights and yellow leg "
            "banding. Ephebopus is unusual: it is New World but its urticating hairs are on the "
            "pedipalps (flicked toward a threat by rubbing the front legs), and its lifestyle "
            "shifts — slings and juveniles live semi-arboreally in silk retreats while adults dig "
            "deep burrows with a narrow, webbed entrance. Provide deep, moist substrate plus a "
            "cork hide and leaf litter, and a water dish. Skittish and quick to defend, and far "
            "too fast to handle; venom is not medically significant. Intermediate."
        ),
        "source_url": "https://en.wikipedia.org/wiki/Ephebopus_uatuman",
    },
    {
        "scientific_name": "Aspinochilus rufus",
        "common_names": ["Peach Earth Tiger", "Phormingochilus sp. Rufus"],
        "genus": "Aspinochilus", "family": "Theraphosidae",
        "care_level": A, "temperament": "fast and defensive; not for handling",
        "native_region": "Java, Indonesia", "adult_size": "5-6 inches", "growth_rate": "medium",
        "type": "arboreal", "temperature_min": 75, "temperature_max": 82, "humidity_min": 70, "humidity_max": 80,
        "enclosure_size_adult": "12x12x18 inches (vertical)", "substrate_depth": "3-4 inches",
        "substrate_type": "vertical cork plus a few inches of moist substrate (it will dig); plants; airflow; water dish",
        "feeding_frequency_adult": "1 prey every 7-14 days", "water_dish_required": True,
        "webbing_amount": "heavy", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A warm peach-toned Asian arboreal from Java, long traded as 'Phormingochilus sp. "
            "Rufus' and since moved to the genus Aspinochilus (both names kept here). Care "
            "follows the Asian arboreal (Ornithoctoninae) pattern: a vertical cork retreat plus "
            "a few inches of moist substrate — it will web heavily and often dig — with plant "
            "cover, good airflow, and a water dish. Old World: no urticating hairs, potent venom, "
            "fast and defensive, and it typically seals its retreat before molting. Advanced "
            "only, strictly no handling."
        ),
        "source_url": "https://marshallarachnids.com/pages/phormingochilus-care-guide",
    },
    {
        "scientific_name": "Pseudoclamoris gigas",
        "common_names": ["Orange Tree Spider", "Amazon Orange Tree Spider"],
        "genus": "Pseudoclamoris", "family": "Theraphosidae",
        "care_level": I, "temperament": "very fast and skittish; bolts rather than bites",
        "native_region": "Amazon basin, South America", "adult_size": "5-6 inches", "growth_rate": "fast",
        "type": "arboreal", "temperature_min": 74, "temperature_max": 82, "humidity_min": 65, "humidity_max": 75,
        "enclosure_size_adult": "10x10x14 inches (vertical)", "substrate_depth": "2-3 inches",
        "substrate_type": "vertical cork slab retreat; plants; lightly moist substrate; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": False, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "The hobby 'Orange Tree Spider' — a warm orange-brown New World arboreal, this is the "
            "current valid name for the species formerly placed in Tapinauchenius (kept separate "
            "in the catalog). It builds a silk-and-substrate retreat hung vertically on a cork "
            "slab and spends most of its time pressed against it. Like its tree-spider relatives "
            "it is extremely fast and skittish, bolting rather than fighting, with mild venom and "
            "no meaningful flickable hairs. Simple care: a vertical enclosure with a cork retreat "
            "and plants, lightly moist substrate, and a water dish kept full with a weekly light "
            "mist. Not a handling animal; intermediate for its speed."
        ),
        "source_url": "https://spidershoppe.com/products/pseudoclamoris-gigas-orange-tree-spider-0-5",
    },
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
