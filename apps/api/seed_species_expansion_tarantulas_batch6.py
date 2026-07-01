"""
Species DB expansion — TARANTULA batch 6 (research-backed, cited).

15 net-new New World tarantulas, verified absent from the live catalog and from
the do-not-duplicate exclusion list supplied for this batch. All are genuinely in
the hobby (US natives, Mexican/Central American showpieces, South American
terrestrials, and a few dwarfs).

Dual-table pattern (species + invert_species mirror, shared id), as batches 1-5.

New World rule (applies to every row here):
* urticating_hairs = True
* medically_significant_venom = False
* venom_potency = "Mild"
* type = terrestrial (all 15 are ground-dwellers/burrowers)

Honesty notes:
* Species-specific numerics are thin for several of these; where so, care follows
  genus-typical values (its well-documented congeners) and the care_guide says so
  explicitly. No invented figures.
* Aphonopelma crinirufum: little published species data; care follows the
  Aphonopelma genus (Costa Rican, moisture-tolerant like A. seemanni) — noted.
* Cyclosternum schmardae: uncommon, little published; care follows the small
  Central/South American terrestrials it resembles (opportunistic burrower) — noted.
* Cyriocosmus bertae: rare dwarf; care follows the Cyriocosmus genus
  (as for C. elegans) — noted.
* Tliltocatl schroederi: formerly Brachypelma; care follows the Tliltocatl
  red-rump group (dry, hardy, hair-flicker) — noted.
* Homoeomma orellanai is the ex-"Euathlus sp. yellow" — distinct from the excluded
  Homoeomma chilensis (ex "Euathlus sp. red"); the naming history is noted.
* adult_size kept <=50 chars; native_region <=200; temperament <=100;
  enclosure_size_adult <=100; substrate_type <=200; growth_rate <=50 (VARCHAR caps).

Run with: python3 seed_species_expansion_tarantulas_batch6.py   (idempotent)
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
    {
        "scientific_name": "Aphonopelma moderatum",
        "common_names": ["Rio Grande Gold"],
        "genus": "Aphonopelma", "family": "Theraphosidae",
        "care_level": B, "temperament": "docile but skittish; quick to retreat when startled",
        "native_region": "Southern Texas, USA (Rio Grande region)", "adult_size": "~5 inches", "growth_rate": "slow",
        "type": "terrestrial", "temperature_min": 70, "temperature_max": 80, "humidity_min": 50, "humidity_max": 65,
        "enclosure_size_adult": "10x10x8 inches", "substrate_depth": "4-5 inches",
        "substrate_type": "dry coco/soil, deep enough to burrow; hide; water dish",
        "feeding_frequency_adult": "1 prey every 10-18 days", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A striking US-native from southern Texas with a golden carapace over darker legs. "
            "A slow-growing, hardy, and very long-lived (females 22-40 years) display species that "
            "spends a good deal of time out of its hide. Not typically defensive but can be skittish "
            "and quick to bolt. Keep on deep, dry, well-draining substrate with a hide and a water "
            "dish at low-to-medium humidity. New World: urticating hairs are its main defense; venom "
            "is not medically significant."
        ),
        "source_url": "https://www.thetarantulacollective.com/caresheets/aphonopelma-moderatum",
    },
    {
        "scientific_name": "Aphonopelma bicoloratum",
        "common_names": ["Mexican Blood Leg", "Mexican Bloodleg"],
        "genus": "Aphonopelma", "family": "Theraphosidae",
        "care_level": B, "temperament": "docile and calm as an adult; slings skittish",
        "native_region": "Mexico", "adult_size": "4.5-5 inches", "growth_rate": "very slow",
        "type": "terrestrial", "temperature_min": 70, "temperature_max": 80, "humidity_min": 50, "humidity_max": 65,
        "enclosure_size_adult": "10x10x8 inches", "substrate_depth": "4-5 inches",
        "substrate_type": "dry, well-draining coco/soil; hide; water dish",
        "feeding_frequency_adult": "1 prey every 7-10 days", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A sought-after Mexican dwarf/mid-size species with deep red legs — sometimes called a "
            "'holy grail' of Mexican tarantulas. Very slow-growing but extremely hardy and long-lived "
            "(females 22-40+ years); calm and confident as an adult, spending much of its time on "
            "display, though juveniles are skittish. Deep, dry, well-draining substrate for burrowing, "
            "a hide, and a water dish at low-to-medium humidity. Wait 5-10 days after a molt before "
            "feeding. New World: urticating hairs, non-medically-significant venom."
        ),
        "source_url": "https://www.thetarantulacollective.com/caresheets/aphonopelma-bicoloratum",
    },
    {
        "scientific_name": "Aphonopelma mooreae",
        "common_names": ["Mexican Jade Fuego"],
        "genus": "Aphonopelma", "family": "Theraphosidae",
        "care_level": I, "temperament": "docile and slow-moving; will retreat rather than fight",
        "native_region": "Jalisco, Mexico (semi-arid scrubland)", "adult_size": "~6 inches", "growth_rate": "slow",
        "type": "terrestrial", "temperature_min": 70, "temperature_max": 80, "humidity_min": 50, "humidity_max": 65,
        "enclosure_size_adult": "12x12x10 inches", "substrate_depth": "5-6 inches",
        "substrate_type": "deep, loose, well-draining coco/soil for burrowing; hide; water dish",
        "feeding_frequency_adult": "1 prey every 10-14 days", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A rare, prized Mexican species with striking blue-green iridescence. Docile and "
            "slow-moving; more reclusive as a spiderling, becoming confident with age, and prefers "
            "to retreat rather than act defensively (though it may flick hairs). From semi-arid "
            "Jalisco scrubland where it digs deep burrows, so give it loose, well-draining substrate "
            "several inches deep, a hide, and a water dish at low-to-medium humidity. Slow growth "
            "demands patience. Intermediate mostly for its price and slow, deliberate keeping — care "
            "itself is straightforward New World terrestrial. Urticating hairs; venom not "
            "medically significant."
        ),
        "source_url": "https://www.thetarantulacollective.com/care-sheets-2/aphonopelma-mooreae",
    },
    {
        "scientific_name": "Aphonopelma marxi",
        "common_names": ["Grand Canyon Black"],
        "genus": "Aphonopelma", "family": "Theraphosidae",
        "care_level": B, "temperament": "docile; not observed to kick hair or threat-pose",
        "native_region": "Arizona, New Mexico, Colorado, Utah, USA", "adult_size": "~4 inches", "growth_rate": "slow",
        "type": "terrestrial", "temperature_min": 70, "temperature_max": 85, "humidity_min": 55, "humidity_max": 70,
        "enclosure_size_adult": "8x8x6 inches", "substrate_depth": "4 inches",
        "substrate_type": "peat/coco/vermiculite mix packed firm; bark hide or starter burrow; water dish",
        "feeding_frequency_adult": "2 prey weekly", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A dark US-native from the Four Corners high country (AZ, NM, CO, UT), reaching about 4 "
            "inches. Slow-growing (roughly five years to 3 inches at low-80s temps) and notably "
            "docile — keepers report no hair-kicking or threat displays. Keep on about 4 inches of "
            "firm peat/coco/vermiculite substrate with a bark hide or starter burrow and a water "
            "dish; tolerates a wide temperature range. Hardy classic-New-World beginner care. "
            "Urticating hairs; venom not medically significant."
        ),
        "source_url": "https://www.inaturalist.org/taxa/492144-Aphonopelma-marxi",
    },
    {
        "scientific_name": "Aphonopelma crinirufum",
        "common_names": ["Costa Rican Orangemouth"],
        "genus": "Aphonopelma", "family": "Theraphosidae",
        "care_level": B, "temperament": "generally docile terrestrial; may retreat or flick hairs",
        "native_region": "Costa Rica", "adult_size": "~5 inches", "growth_rate": "medium",
        "type": "terrestrial", "temperature_min": 72, "temperature_max": 82, "humidity_min": 60, "humidity_max": 75,
        "enclosure_size_adult": "10x10x8 inches", "substrate_depth": "4-5 inches",
        "substrate_type": "coco/soil kept lightly moist on one side, dry on the other; hide; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A Costa Rican Aphonopelma that is uncommon in the hobby, so species-specific data is "
            "thin — care here follows the Aphonopelma genus and its moisture-tolerant Central "
            "American relatives (such as A. seemanni): a spacious terrestrial setup with a few "
            "inches of substrate, a hide, and a water dish, kept with a moist/dry gradient rather "
            "than uniformly wet. Generally a hardy, docile beginner-friendly ground-dweller. New "
            "World: urticating hairs, non-medically-significant venom."
        ),
        "source_url": "https://www.petproducts.org/aphonopelma-crinirufum/",
    },
    {
        "scientific_name": "Grammostola grossa",
        "common_names": ["Pampas Tawny Red", "Guarani Giant"],
        "genus": "Grammostola", "family": "Theraphosidae",
        "care_level": B, "temperament": "very docile and hardy; usually out in the open",
        "native_region": "Brazil, Paraguay, Uruguay, Argentina", "adult_size": "5-6 inches", "growth_rate": "slow",
        "type": "terrestrial", "temperature_min": 70, "temperature_max": 82, "humidity_min": 55, "humidity_max": 70,
        "enclosure_size_adult": "12x12x10 inches", "substrate_depth": "4-5 inches",
        "substrate_type": "coco/soil, mostly dry with a slightly damp corner; hide; water dish",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A large, calm South American ground-dweller and one of the better beginner Grammostola. "
            "Most individuals are very docile and hardy, and they tend to sit out in the open — a "
            "good display species. Can go long stretches without food. Keep on mostly dry substrate "
            "with a slightly damp corner, a hide, and a water dish at room temperature. Slow growth "
            "and a long life. New World: urticating hairs, non-medically-significant venom."
        ),
        "source_url": "https://www.tarantupedia.com/theraphosinae/grammostola/grammostola-grossa",
    },
    {
        "scientific_name": "Grammostola vachoni",
        "common_names": ["Argentine Fossor", "Vachon's Tarantula"],
        "genus": "Grammostola", "family": "Theraphosidae",
        "care_level": B, "temperament": "very docile and calm; often out in the open",
        "native_region": "Central Argentina (mountain grasslands)", "adult_size": "~5 inches", "growth_rate": "medium",
        "type": "terrestrial", "temperature_min": 68, "temperature_max": 80, "humidity_min": 55, "humidity_max": 70,
        "enclosure_size_adult": "10x10x8 inches", "substrate_depth": "4-5 inches",
        "substrate_type": "coco/soil, mostly dry; hide or starter burrow; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A docile, hardy Grammostola endemic to the grasslands of central Argentina. Calm and "
            "usually out in the open, making a nice display animal; a so-so eater that copes well "
            "with long fasts. Keep on mostly dry substrate with a hide and a water dish at room "
            "temperature. Note: the species is IUCN-listed as Vulnerable in the wild, so favor "
            "captive-bred stock. New World: urticating hairs, non-medically-significant venom. Easy "
            "beginner care."
        ),
        "source_url": "https://www.tarantupedia.com/theraphosinae/grammostola/grammostola-vachoni",
    },
    {
        "scientific_name": "Phrixotrichus scrofa",
        "common_names": ["Chilean Copper", "Chilean Pink Burst"],
        "genus": "Phrixotrichus", "family": "Theraphosidae",
        "care_level": B, "temperament": "very laid-back and tolerant; rarely kicks hair",
        "native_region": "Chile and Argentina (arid forest)", "adult_size": "~4 inches", "growth_rate": "slow",
        "type": "terrestrial", "temperature_min": 65, "temperature_max": 78, "humidity_min": 50, "humidity_max": 65,
        "enclosure_size_adult": "8x8x6 inches", "substrate_depth": "3-4 inches",
        "substrate_type": "dry coco/soil; hide; water dish",
        "feeding_frequency_adult": "1 prey every 1-2 weeks", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A small, mellow tarantula from arid Chile and Argentina, formerly placed in Paraphysa. "
            "Displays a shimmering burgundy/copper carapace and stays out in the open — an excellent "
            "display species. Very tolerant and slow-moving, rarely if ever kicking hair. Needs no "
            "extra heat in a normal household and prefers dry substrate with a water dish; a slow "
            "eater that only refuses food near a molt. New World: urticating hairs, "
            "non-medically-significant venom. Easy beginner care; females can live 25+ years."
        ),
        "source_url": "https://en.wikipedia.org/wiki/Phrixotrichus_scrofa",
    },
    {
        "scientific_name": "Bumba horrida",
        "common_names": ["Brazilian Redhead"],
        "genus": "Bumba", "family": "Theraphosidae",
        "care_level": B, "temperament": "generally docile; skittish as a juvenile, bolder with age",
        "native_region": "Amazonian Brazil", "adult_size": "4-5 inches", "growth_rate": "medium-fast",
        "type": "terrestrial", "temperature_min": 72, "temperature_max": 82, "humidity_min": 65, "humidity_max": 80,
        "enclosure_size_adult": "10x10x8 inches", "substrate_depth": "4 inches",
        "substrate_type": "coco/soil with half kept damp (not swampy); hide; water dish",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A small, attractive Amazonian ground-dweller with a reddish carapace. Generally docile "
            "and stays out in the open once grown, though fairly skittish as a youngster. Likes a "
            "somewhat humid setup — keep about half the substrate damp (never swampy) with a hide "
            "and a water dish. Must be housed singly (cohabitation leads to cannibalism). New World: "
            "urticating hairs, non-medically-significant venom. A good, hardy beginner species."
        ),
        "source_url": "https://fearnottarantulas.com/pages/bumba-cabocla-tarantula",
    },
    {
        "scientific_name": "Cyriocosmus bertae",
        "common_names": ["Peruvian Dwarf Beauty"],
        "genus": "Cyriocosmus", "family": "Theraphosidae",
        "care_level": B, "temperament": "docile; does not bolt for the burrow when disturbed",
        "native_region": "Brazil / western Amazon", "adult_size": "2.5-3 inches", "growth_rate": "medium",
        "type": "terrestrial", "temperature_min": 74, "temperature_max": 84, "humidity_min": 65, "humidity_max": 80,
        "enclosure_size_adult": "6x6x6 inches", "substrate_depth": "3-4 inches",
        "substrate_type": "coco/soil for burrowing, lightly moist; hide; small water dish",
        "feeding_frequency_adult": "1-2 small prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A tiny, jewel-like dwarf with a golden-bronze heart-shaped abdominal marking. Rare in "
            "the hobby, so species-specific data is thin — care follows the Cyriocosmus genus (as "
            "for the well-known C. elegans): a small terrestrial/burrowing setup with lightly moist "
            "substrate, a hide, and a small water dish, warm (low-to-mid 80s) to grow it out in "
            "about two years. Docile and confident, not prone to bolting. New World: urticating "
            "hairs, non-medically-significant venom. A great dwarf for beginners short on space."
        ),
        "source_url": "https://fearnottarantulas.com/pages/cyriocosmus-bertae-peruvian-dwarf-beauty-tarantula",
    },
    {
        "scientific_name": "Cyclosternum schmardae",
        "common_names": ["Colombian Dwarf"],
        "genus": "Cyclosternum", "family": "Theraphosidae",
        "care_level": I, "temperament": "skittish and can be fast; opportunistic burrower",
        "native_region": "Colombia / northern South America", "adult_size": "~4 inches", "growth_rate": "medium",
        "type": "terrestrial", "temperature_min": 72, "temperature_max": 82, "humidity_min": 65, "humidity_max": 80,
        "enclosure_size_adult": "8x8x8 inches", "substrate_depth": "5-6 inches",
        "substrate_type": "deep coco husk for burrowing, lightly moist; hide; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "An uncommon small Central/South American terrestrial with little published husbandry, so "
            "care follows the small opportunistic-burrowing New World terrestrials it resembles: "
            "deep (5-6 inch) lightly-moist coco husk to dig in, a hide, and a water dish, kept warm "
            "and moderately humid. Skittish and quick to bolt, so keep it hands-off — hence the "
            "intermediate rating despite otherwise simple care. New World: urticating hairs, "
            "non-medically-significant venom."
        ),
        "source_url": "https://www.petproducts.org/cyclosternum-schmardae/",
    },
    {
        "scientific_name": "Sericopelma angustum",
        "common_names": ["Costa Rican Red-rump", "Guatemalan Redrump"],
        "genus": "Sericopelma", "family": "Theraphosidae",
        "care_level": I, "temperament": "docile display animal once grown; opportunistic burrower",
        "native_region": "Costa Rica and Central America", "adult_size": "~5 inches", "growth_rate": "medium",
        "type": "terrestrial", "temperature_min": 70, "temperature_max": 85, "humidity_min": 65, "humidity_max": 80,
        "enclosure_size_adult": "10x10x8 inches", "substrate_depth": "4-5 inches",
        "substrate_type": "peat/coco/vermiculite mix packed firm; wet one half, let it dry; hide; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A hardy Central American red-rumped ground-dweller. An opportunistic burrower that, once "
            "it reaches about 3 inches, stays out in the open and makes a good display animal. Keep "
            "on 4-5 inches of firm peat/coco/vermiculite substrate; wet one half near the water dish "
            "and let it dry out to give a moisture gradient. Docile, with no notable hair-kicking or "
            "threat displays reported, but a fast mover — intermediate is a conservative rating. New "
            "World: urticating hairs, non-medically-significant venom."
        ),
        "source_url": "https://www.inaturalist.org/taxa/485641-Sericopelma-angustum",
    },
    {
        "scientific_name": "Homoeomma orellanai",
        "common_names": ["Chilean Yellow Flame", "Chilean Orange Flame"],
        "genus": "Homoeomma", "family": "Theraphosidae",
        "care_level": B, "temperament": "exceptionally docile and calm dwarf",
        "native_region": "Chile", "adult_size": "3-3.5 inches", "growth_rate": "very slow",
        "type": "terrestrial", "temperature_min": 65, "temperature_max": 78, "humidity_min": 55, "humidity_max": 70,
        "enclosure_size_adult": "6x6x6 inches", "substrate_depth": "3-4 inches",
        "substrate_type": "coco/soil, dry with a water dish (or a lightly damp corner); hide",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A small, exceptionally docile Chilean dwarf — the ex-'Euathlus sp. yellow', distinct "
            "from the ex-'Euathlus sp. red' (now Homoeomma chilensis). Famous for an almost "
            "curious, handleable temperament, though hands-off keeping is still recommended for the "
            "spider's safety. A notoriously slow grower (often 7-10 years to a full ~3.5 inches). "
            "Happy at room temperature on dry substrate with a water dish (or one lightly damp "
            "corner) and a hide. New World: urticating hairs, non-medically-significant venom. Great "
            "beginner dwarf."
        ),
        "source_url": "https://exoticsunlimitedusa.com/products/homoeomma-orellanai-chilean-yellow-flame-0-25",
    },
    {
        "scientific_name": "Tliltocatl schroederi",
        "common_names": ["Mexican Black Velvet"],
        "genus": "Tliltocatl", "family": "Theraphosidae",
        "care_level": B, "temperament": "generally docile but a ready hair-kicker if disturbed",
        "native_region": "Mexico", "adult_size": "5-6 inches", "growth_rate": "slow",
        "type": "terrestrial", "temperature_min": 70, "temperature_max": 82, "humidity_min": 55, "humidity_max": 70,
        "enclosure_size_adult": "12x12x10 inches", "substrate_depth": "4-5 inches",
        "substrate_type": "dry coco/soil with a slightly damp corner; hide; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A velvety all-black Mexican terrestrial, formerly in Brachypelma and moved to Tliltocatl "
            "in the 2020 red-rump revision. Species-specific data is limited, so care follows the "
            "Tliltocatl group (as for T. vagans/T. albopilosus): dry, well-draining substrate with a "
            "slightly damp corner, a hide, and a water dish at room temperature. Hardy and generally "
            "docile but quick to flick urticating hairs when bothered, so keep it hands-off. Slow "
            "growth and a long life. New World: urticating hairs, non-medically-significant venom."
        ),
        "source_url": "https://beyondthetreat.com/nhandu-chromatus/",
    },
    {
        "scientific_name": "Hapalopus formosus",
        "common_names": ["Colombian Pumpkin Patch", "Pumpkin Patch"],
        "genus": "Hapalopus", "family": "Theraphosidae",
        "care_level": B, "temperament": "docile but fast and skittish; prefers to retreat",
        "native_region": "Colombia", "adult_size": "2-3 inches", "growth_rate": "fast",
        "type": "terrestrial", "temperature_min": 76, "temperature_max": 84, "humidity_min": 65, "humidity_max": 80,
        "enclosure_size_adult": "8x8x8 inches", "substrate_depth": "3-4 inches",
        "substrate_type": "coco/soil for burrowing, one corner kept moist; hide; small water dish; heavy webber",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "heavy", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A vividly orange-and-black dwarf from Colombia — the true 'pumpkin patch' (the hobby "
            "also uses undescribed Hapalopus sp. Colombia forms). Fast-growing (mature in ~2 years) "
            "and a heavy webber that also burrows, so give it a few inches of substrate, cork/anchor "
            "points for webbing, a hide, and a small water dish; keep one corner moist and warm. "
            "Docile but fast and skittish — hands-off. New World: urticating hairs, "
            "non-medically-significant venom. A colorful, hardy beginner dwarf."
        ),
        "source_url": "https://www.thetarantulacollective.com/caresheets/hapolopus-sp-colombia",
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
