"""
Care guides for the described species keepers actually keep that had no
catalog entry (2026-10-07, ranked by keepers/animals in production).

Researched per species with the same honesty rule as every seed: a field is
filled only when a source we read states it (or it is a hard taxonomic fact,
e.g. Old World tarantulas and Psalmopoeinae have no urticating hairs;
Theraphosinae do). Everything else is NULL. Thinly documented species say so
in their guide. Sources are listed above each entry.

Run (Render shell, from apps/api):  python3 seed_care_gap_batch_20261007.py   (idempotent)
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


SPECIES_DATA = [
    # Sources:
    #   https://joshsfrogs.com/sp/orange-tree-spider-amazonius-germani-ex-pseudoclamoris-gigas-1-2-inch-captive-bred-jftots0822
    #     -> Enclosure proportions, substrate depth and type, 75F ideal, humidity 75-80%, sling feeding, prey sizing, medium growth, not social, French Guiana range, former name Pseudoclamoris gigas
    #   https://tydyeexotic.com/products/amazonius-germani-orange-tree-spider
    #     -> Temperature 75-82F, humidity 70-80%, 5-6 in leg span, intermediate keepers, former name Pseudoclamoris gigas
    #   https://fearnottarantulas.com/products/pseudoclamoris-tapinauchenius-gigas-for-sale
    #     -> Arboreal, tall enclosure with cork and foliage, intermediate level, 5-6 in, lifespan, diet of crickets/roaches/mealworms, medium growth
    #   https://arachnoboards.com/threads/new-to-hobby-intro-amazonius-genus-question.376717/latest
    #     -> Keeper reports: hardy, fast, jumps, hits hard, settles with a hide, becomes visible around 3 in
    #   https://wsc.nmbe.ch/spec-data/66427
    #     -> Valid name (Cifuentes & Bertani 2022), distribution French Guiana and Brazil, misidentified as Tapinauchenius/Pseudoclamoris gigas
    #   https://en.wikipedia.org/wiki/Amazonius_germani
    #     -> Taxonomic history and family
    dict(**{'taxon': 'tarantula',
 'scientific_name': 'Amazonius germani',
 'common_names': ['Orange Tree Spider'],
 'genus': 'Amazonius',
 'family': 'Theraphosidae',
 'order_name': 'Araneae',
 'care_level': 'intermediate',
 'temperament': 'Fast, jumpy and defensive; hardy; settles if it has cover',
 'native_region': 'French Guiana and Brazil',
 'adult_size': '5-6 in leg span',
 'growth_rate': 'medium',
 'type': 'arboreal',
 'temperature_min': 75,
 'temperature_max': 82,
 'humidity_min': 70,
 'humidity_max': 80,
 'enclosure_size_sling': 'Tall: height at least 3x leg span, other dimensions at least 2x',
 'enclosure_size_juvenile': 'Tall: height at least 3x leg span, other dimensions at least 2x',
 'enclosure_size_adult': 'Tall: height at least 3x leg span, other dimensions at least 2x',
 'substrate_depth': '4-5 in',
 'substrate_type': 'ABG mix, coco fiber or similar; keep slightly moistened; add cork bark and foliage',
 'feeding_mode': 'predator',
 'prey_size': "Crickets, roaches, mealworms; keep prey no longer than the spider's head is wide",
 'feeding_frequency_sling': '3-6 hydei fruit flies once a week (about 1/2 in spiderlings)',
 'webbing_amount': 'Webs foliage and decor',
 'communal_suitable': False,
 'urticating_hairs': False,
 'care_guide': 'Amazonius germani is an orange New World arboreal from French Guiana and Brazil. Until 2022 '
               'it was sold as Pseudoclamoris gigas (and before that Tapinauchenius gigas), after a revision '
               'showed the hobby name had been misapplied, so older care notes may be filed under those '
               'names. Keepers describe it as hardy but quick, and it will jump, so rehouse with care and '
               'use a tall enclosure with cork bark and foliage for cover and webbing. Retailers suggest '
               'roughly 75 to 82 F, 70 to 80 percent humidity, 4 to 5 inches of slightly moist substrate and '
               'plenty of cross-ventilation. Females reach about 5 to 6 inches and can live well over a '
               'decade; males live only a few years. Documentation is thin and mostly from sellers and forum '
               'posts, so treat the numbers as starting points and watch how your animal responds. Not a '
               'good first tarantula, and do not house them together.',
 'source_url': 'https://joshsfrogs.com/sp/orange-tree-spider-amazonius-germani-ex-pseudoclamoris-gigas-1-2-inch-captive-bred-jftots0822'}),
    # Sources:
    #   https://tomsbigspiders.com/tag/phormictopus-atrichomatus/
    #     -> Fast growth, deep moist substrate for slings, drier with periodic soaking at juvenile stage, burrowing as slings, 3-4 crickets per feed for juveniles, defensive with size, not ideal beginner T
    #   https://www.thetarantulacollective.com/store/p/phormictopus-atrichomatus-red-island-birdeater-075-spiderling
    #     -> Common name Red Island Birdeater, Caribbean terrestrial, fast-growing, hardy, quick and defensive; comparable care guide is P. auratus
    #   https://arachnoboards.com/threads/phormictopus-atrichomatus.176342
    #     -> Keeper advice: 4-6 in substrate, hide, water dish; 4-5 in moist substrate; attitude and skittishness; one never built a burrow
    #   https://wsc.nmbe.ch/spec-data/44407
    #     -> Valid species (Schmidt 1991), distribution 'probably Hispaniola', original description title says Honduras
    #   https://arachnoboards.com/threads/phormictopus-atrichomatus-inquiry.371060
    #     -> Care guides for this species are scarce; keepers say all Phormictopus have broadly similar care
    dict(**{'taxon': 'tarantula',
 'scientific_name': 'Phormictopus atrichomatus',
 'common_names': ['Red Island Birdeater'],
 'genus': 'Phormictopus',
 'family': 'Theraphosidae',
 'order_name': 'Araneae',
 'care_level': 'intermediate',
 'temperament': 'Quick and defensive; skittish as slings, bold and spirited as it grows',
 'native_region': 'Probably Hispaniola (Caribbean); exact origin uncertain',
 'growth_rate': 'fast',
 'type': 'terrestrial',
 'substrate_depth': '4-6 in',
 'substrate_type': 'Deep substrate; kept moist for slings, then mostly dry with a periodic soak and a water '
                   'dish',
 'feeding_mode': 'predator',
 'prey_size': 'Crickets and roaches; juveniles take 3-4 crickets at a time',
 'water_dish_required': True,
 'burrowing': 'burrows as a sling; surface-dwelling when large',
 'urticating_hairs': True,
 'care_guide': 'Phormictopus atrichomatus is a fast-growing, heavy-bodied Caribbean terrestrial sold as the '
               'Red Island Birdeater; it shifts from a blue sling to reddish and bronze tones as it matures. '
               'The World Spider Catalog lists its distribution only as probably Hispaniola, and the '
               'original description is oddly titled as coming from Honduras, so treat the origin as '
               'unsettled. Documentation specific to this species is scarce. Keepers say it is hardy and '
               'cared for much like other Phormictopus, or like a Lasiodora: deep substrate (4 to 6 inches), '
               'a water dish, and moist substrate for slings that dries out somewhat as they grow, with a '
               'soaking every month or so. Expect a huge appetite and quick growth. Attitude increases with '
               'size, and big ones will stand their ground, so this is not a great first tarantula. Use long '
               'tongs and keep fingers out of the enclosure. Temperature and humidity targets are not well '
               'sourced for this species.',
 'source_url': 'https://tomsbigspiders.com/tag/phormictopus-atrichomatus/'}),
    # Sources:
    #   https://thetarantulacollective.com/care-sheets-2/orphnaecus-philippinus
    #     -> Temperature 70-78F, humidity 50-60%, enclosure and substrate fill by stage, feeding frequencies, advanced level, no urticating hairs, heavy webbing, obligate burrower, venom described as strong (potentially medically significant)
    #   https://fearnottarantulas.com/pages/orphnaecus-philippinus-philippine-tangerine-tarantula
    #     -> Name history (Selenobrachys/Orphnaecus), size around 6 in, medium growth, moist non-saturated substrate, shy and skittish but very fast, Tom's Big Spiders substrate mix, feeding about every 3 days for ~2 in animals
    #   https://en.wikipedia.org/wiki/Orphnaecus_philippinus
    #     -> Native to the Philippines, obligate burrower, 2025 revalidation of Selenobrachys, common names Philippine tangerine/orange/neon orange
    dict(**{'taxon': 'tarantula',
 'scientific_name': 'Orphnaecus philippinus',
 'common_names': ['Philippine Tangerine', 'Philippine Orange', 'Neon Orange Tarantula'],
 'genus': 'Orphnaecus',
 'family': 'Theraphosidae',
 'order_name': 'Araneae',
 'care_level': 'advanced',
 'temperament': 'Very fast, shy and defensive; will bite if provoked; do not handle',
 'native_region': 'Philippines',
 'adult_size': '5-6 in leg span',
 'growth_rate': 'medium to fast',
 'type': 'fossorial (obligate burrower)',
 'temperature_min': 70,
 'temperature_max': 78,
 'humidity_min': 50,
 'humidity_max': 60,
 'enclosure_size_sling': '3-4 in cube or sling crib, 2/3 filled with substrate',
 'enclosure_size_juvenile': '5-8 in cube or fossorial crib, 1/2 to 3/4 filled with substrate',
 'enclosure_size_adult': '8-18 in cube or 8 in fossorial crib, 1/2 to 3/4 filled with substrate',
 'substrate_depth': 'At least 1/2 to 2/3 of the enclosure height',
 'substrate_type': 'Coco fiber, peat and a little vermiculite, or Terra Aranea; slightly moist, never '
                   'swampy; add web anchors',
 'feeding_mode': 'predator',
 'prey_size': 'Appropriately sized crickets or roaches; fruit flies or tiny roach nymphs for slings',
 'feeding_frequency_sling': 'Twice a week',
 'feeding_frequency_juvenile': 'Every 7-10 days',
 'feeding_frequency_adult': 'Every 2-3 weeks',
 'water_dish_required': True,
 'webbing_amount': 'Heavy',
 'burrowing': 'Obligate burrower',
 'urticating_hairs': False,
 'care_guide': 'The Philippine Tangerine is a bright orange Old World burrower from the Philippines. Names '
               'are in flux: it was described as Selenobrachys philippinus, moved to Orphnaecus in 2012, and '
               'a 2025 paper revalidated Selenobrachys, so you will see all three in the hobby and '
               'literature. It is an obligate burrower that wants deep substrate, so fill the enclosure well '
               'over halfway and give it webbing anchors. Keep the substrate slightly moist but not swampy, '
               'with a water dish and a moisture gradient, at about 70 to 78 F and 50 to 60 percent humidity '
               'per one care sheet. Keepers call it shy and skittish rather than aggressive, but it is '
               'extremely fast and bites if provoked. Sources disagree on adult size and growth speed, and '
               'one rates its venom strong, so treat it as an advanced, hands-off species. It has no '
               'urticating hairs, so speed and venom are its defenses.',
 'source_url': 'https://thetarantulacollective.com/care-sheets-2/orphnaecus-philippinus'}),
    # Sources:
    #   https://wsc.nmbe.ch/spec-data/44032
    #     -> Valid name Phrixotrichus vulpinus (Karsch, 1880), synonyms Orthothrichus/Euathlus vulpinus, Ashantia/Euathlus latithorax; distribution Chile and Argentina; transferred back to Phrixotrichus in 2014
    #   https://tydyeexotic.com/products/phrixotrichus-vulpinus-chilean-ocelot-tarantula-stunning-south-american-species-live-arrival-guarantee
    #     -> Common name, 5-6 in leg span, slow to moderate growth, relatively docile (retailer claim), intermediate (retailer), urticating hairs, terrestrial
    #   https://arachnoboards.com/threads/questions-regarding-phrixotrichus.357452
    #     -> Seller reports: 1/3 to 1/2 substrate moist, ventilation, large water dish, tall enclosure with floor space, arboreal tendencies, feeding of small prey, deaths in captivity
    #   https://arachnoboards.com/threads/phrixotrichus-vulpinus.352090/
    #     -> Rare in the hobby, wild imports died, breeding attempts failed, frequent misidentification of Chilean species
    dict(**{'taxon': 'tarantula',
 'scientific_name': 'Phrixotrichus vulpinus',
 'common_names': ['Chilean Ocelot Tarantula'],
 'genus': 'Phrixotrichus',
 'family': 'Theraphosidae',
 'order_name': 'Araneae',
 'temperament': 'Described as fairly docile for a terrestrial (seller claim); skittish and roaming',
 'native_region': 'Chile and Argentina',
 'adult_size': '5-6 in leg span',
 'growth_rate': 'slow to moderate',
 'type': 'terrestrial (some keepers report climbing)',
 'substrate_type': 'Keep about 1/3 of the substrate moist (1/2 if no water dish); good ventilation',
 'feeding_mode': 'predator',
 'prey_size': 'Slings: newborn mealworms, newborn red runner nymphs, halved dubia',
 'urticating_hairs': True,
 'care_guide': 'Phrixotrichus vulpinus is a spotted brown tarantula from Chile and Argentina. The valid name '
               "comes from Karsch's 1880 Orthothrichus vulpinus; you may also see it as Euathlus vulpinus "
               '(and E. latithorax), because Phrixotrichus was only resurrected in 2014. This is one of the '
               'least documented species in this catalog. Wild-caught imports often died in captivity, '
               'breeding efforts have a poor record, and Chilean tarantulas are frequently misidentified, so '
               'be cautious about what you are actually buying. The few husbandry notes come from two '
               'sellers: good ventilation, a water dish if temperatures run warm, and roughly a third of the '
               'substrate kept moist. One reported a very active spiderling that roams, climbs and does best '
               'with height as well as floor space. Sellers rate it intermediate, but the forum record '
               'argues for caution. As a New World species it flicks urticating hairs. Verify any numbers '
               'with an experienced keeper of this species.',
 'source_url': 'https://wsc.nmbe.ch/spec-data/44032'}),
    # Sources:
    #   https://en.wikipedia.org/wiki/Grammostola_anthracina
    #     -> Taxonomy and synonyms, range (Uruguay, Paraguay, Brazil, Argentina), size, urticating hair types III and IV present
    #   https://arachnoboards.com/threads/help-with-care-for-a-few-species-that-doesnt-seem-to-have-info-on-them.368539
    #     -> Keepers say it is kept like other Grammostola; no species-specific parameters exist; genus is generally terrestrial
    dict(**{'taxon': 'tarantula',
 'scientific_name': 'Grammostola anthracina',
 'common_names': [],
 'genus': 'Grammostola',
 'family': 'Theraphosidae',
 'order_name': 'Araneae',
 'native_region': 'Uruguay, Paraguay, Brazil and Argentina',
 'adult_size': '~45 mm body length (female)',
 'type': 'terrestrial',
 'feeding_mode': 'predator',
 'urticating_hairs': True,
 'care_guide': 'Grammostola anthracina is an all-brown tarantula from Uruguay, Paraguay, Brazil and '
               'Argentina, and almost nothing has been published on keeping it. Its naming has been messy: '
               'C. L. Koch described it in 1842 as Mygale anthracina, it later sat in Eurypelma and '
               'Avicularia, and a 2011 re-examination of the holotype placed it in Grammostola. Older names '
               'include Eurypelma anthracinum and Phrixotrichus mollicomus. Because it is in Grammostola, it '
               'has urticating hairs on the abdomen. Keepers on Arachnoboards say to keep it like any other '
               'Grammostola, which are terrestrial, but no one in those threads gave species-specific '
               'temperatures, humidity, substrate or feeding schedules. We have not filled those fields '
               'rather than guess. Ask your seller what they have used, and compare with better-documented '
               'Grammostola such as G. pulchra.',
 'source_url': 'https://en.wikipedia.org/wiki/Grammostola_anthracina'}),
    # Sources:
    #   https://arachnoboards.com/threads/tliltocatl-epicureanus-care.375792/
    #     -> Keeper reports (2025): 75-80 F room temp, hides in burrow below 72 F, dry setup with damp corner via overflowed water dish, strong feeding response, good growth, care same as other Tliltocatl/Brachypelma, adult female ~4.6 in DLS
    #   https://en.wikipedia.org/wiki/Tliltocatl_epicureanus
    #     -> Taxonomy and synonyms (Brachypelma epicureanum, Eurypelma epicureana, Dugesiella epicureana); transfer to Tliltocatl in 2019; range in central Yucatan, moist forest and rainforest; type locality Chichen Itza
    dict(**{'taxon': 'tarantula',
 'scientific_name': 'Tliltocatl epicureanus',
 'common_names': [],
 'genus': 'Tliltocatl',
 'family': 'Theraphosidae',
 'order_name': 'Araneae',
 'care_level': 'beginner',
 'temperament': 'Strong feeding response; individuals vary',
 'native_region': 'Central Yucatan Peninsula, Mexico (type locality Chichen Itza); moist forest and '
                  'rainforest',
 'adult_size': 'Female ~4.6 in DLS (one keeper)',
 'growth_rate': 'Good (keeper report)',
 'type': 'terrestrial (burrows)',
 'temperature_min': 75,
 'temperature_max': 80,
 'substrate_type': 'Dry setup with one corner kept damp by overflowing the water dish; slings like slightly '
                   'moistened substrate',
 'feeding_mode': 'predator',
 'water_dish_required': True,
 'burrowing': 'Uses a burrow',
 'urticating_hairs': True,
 'care_guide': 'Tliltocatl epicureanus is a Yucatan Peninsula species that older books and some dealers '
               'still list as Brachypelma epicureanum. It looks a lot like its better-known relative T. '
               'vagans but is much less common in the hobby, so care information is mostly keeper experience '
               'rather than formal care sheets. Keepers describe it as hardy and simple: an essentially dry '
               'setup with one corner kept damp by overflowing the water dish, then letting that corner dry '
               'out and rotating it. Slings appreciate slightly moist substrate. One keeper holds an adult '
               'female at roughly 75 to 80 F and notes she retreats to her burrow below about 72 F. Expect a '
               'strong feeding response; that animal lunges at anything that moves, though individuals vary. '
               "As a New World species it has urticating hairs. Treat the numbers here as one keeper's "
               'practice, not a studied standard, and watch your own animal.',
 'source_url': 'https://arachnoboards.com/threads/tliltocatl-epicureanus-care.375792/'}),
    # Sources:
    #   https://tydyeexotic.com/products/selenocosmia-arndsti-new-guinea-rust-orange-tarantula-rare-asian-species-live-arrival-guarantee
    #     -> Dealer care notes: 6-7 in leg span, 4-5 in substrate, 75-82 F, 75-85% humidity, feeding once or twice weekly, defensive/fast, opportunistic burrower, advanced level, potent venom claim, fast growth. Single-vendor source; humidity figure seems high and is unverified
    #   https://www.thetarantulacollective.com/store/p/selenocosmia-arndsti-new-guinea-rust-orange-tarantula-025-spiderling
    #     -> Fossorial Old World species, deep burrow, fast and defensive; points to the Orphnaecus philippinus care guide as a comparable guide
    #   https://wsc.nmbe.ch/spec-data/44498
    #     -> Accepted name, author, synonyms (Selenotypus arndsti, Chilocosmia arndsti), distribution New Guinea (Indonesia or Papua New Guinea)
    dict(**{'taxon': 'tarantula',
 'scientific_name': 'Selenocosmia arndsti',
 'common_names': ['New Guinea Rust-Orange Tarantula', 'New Guinea Rust Orange Tarantula'],
 'genus': 'Selenocosmia',
 'family': 'Theraphosidae',
 'order_name': 'Araneae',
 'care_level': 'advanced',
 'temperament': 'Fast, defensive, aggressive feeding response',
 'native_region': 'New Guinea (Indonesia or Papua New Guinea; exact range unclear)',
 'adult_size': '6-7 in leg span (vendor)',
 'growth_rate': 'Fast (vendor)',
 'type': 'fossorial / opportunistic burrower',
 'temperature_min': 75,
 'temperature_max': 82,
 'humidity_min': 75,
 'humidity_max': 85,
 'substrate_depth': 'At least 4-5 inches (vendor)',
 'substrate_type': 'Deep burrowing substrate with a hide or cork bark; good ventilation to prevent mold',
 'feeding_mode': 'predator',
 'prey_size': 'Crickets, roaches or appropriately sized insects',
 'feeding_frequency_adult': 'Once or twice weekly (vendor; life stage unspecified)',
 'webbing_amount': 'Extensive (vendor report)',
 'burrowing': 'Deep burrower',
 'urticating_hairs': False,
 'care_guide': 'Selenocosmia arndsti, the New Guinea rust-orange tarantula, is an Old World species from New '
               'Guinea that you may also see under the older names Selenotypus arndsti or Chilocosmia '
               'arndsti. Published husbandry is thin, and most of what follows comes from two dealer pages, '
               'so treat it as a starting point rather than a settled standard. Sellers describe a fast, '
               'defensive, deep-burrowing spider with a very strong feeding response, reaching about 6 to 7 '
               'inches. One suggests a terrestrial setup with at least 4 to 5 inches of substrate, a hide, '
               '75 to 82 F and humid but well-ventilated conditions; another points to the Philippine '
               'tangerine care sheet as a comparable guide. Old World tarantulas lack urticating hairs, and '
               'the seller calls the venom potent, though we found no verified bite data. This is not a '
               'beginner animal: use a secure lid and long tools.',
 'source_url': 'https://tydyeexotic.com/products/selenocosmia-arndsti-new-guinea-rust-orange-tarantula-rare-asian-species-live-arrival-guarantee'}),
    # Sources:
    #   https://wsc.nmbe.ch/spec-data/43860
    #     -> Accepted name, author (Mendoza, 2012), distribution Mexico, original description reference (new species from Guerrero, Mexico)
    #   https://arachnoboards.com/threads/bonnetina-papalutlensis-hobby-form-is-actually-bonnetina-tanzeri-schmidt-2012.354070
    #     -> Hobby animals sold as B. papalutlensis identified as B. tanzeri; Type III urticating hairs found on the opisthosoma of examined exuviae, characteristic of the genus
    dict(**{'taxon': 'tarantula',
 'scientific_name': 'Bonnetina papalutlensis',
 'common_names': [],
 'genus': 'Bonnetina',
 'family': 'Theraphosidae',
 'order_name': 'Araneae',
 'native_region': 'Guerrero, Mexico',
 'feeding_mode': 'predator',
 'urticating_hairs': True,
 'care_guide': 'Bonnetina papalutlensis is a Mexican tarantula described by Mendoza in 2012 from Guerrero, '
               'Mexico. As far as we could find, there is no keeper care sheet for it. Be careful with hobby '
               'labels: tarantulas sold in Europe under this name were later examined by a research team and '
               'identified as Bonnetina tanzeri, so an animal sold as B. papalutlensis may not be the true '
               'species. What we can say with confidence is genus level: Bonnetina is a New World group, and '
               'the examined hobby specimens carried urticating hairs on the abdomen, so use the usual '
               'precautions. For husbandry, no sourced temperature, humidity, substrate or feeding figures '
               'exist, and we have deliberately left those blank rather than guess. If you keep one, your '
               'own observations are the most useful data there is.',
 'source_url': 'https://wsc.nmbe.ch/spec-data/43860'}),
    # Sources:
    #   https://species-id.net/wiki/Aphonopelma_vorhiesi
    #     -> Distribution (SE Arizona, S New Mexico; ecoregions), Type I urticating bristles, A. jungi and A. punzoi as junior synonyms (Hamilton et al. 2016, ZooKeys 560), common in the wild, male breeding season July-October
    #   https://tydyeexotic.com/products/aphonopelma-vorhiesi-madrean-red-rump-tarantula-for-sale-live-arrival-guarantee
    #     -> Dealer notes: Madrean Red Rump name, terrestrial burrower, dry setup with deep substrate, hide and shallow water dish, low humidity, warm, calm but may kick hairs, intermediate level. Dealer page; sold wild-caught
    #   https://hardcorearachnids.com/products/aphonopelma-vorhiesi
    #     -> About 4 in adult size, slow-growing desert species, not often available
    #   https://tarantulaforum.com/threads/an-observation-from-my-most-recent-adds.27658
    #     -> One keeper report: skittish, burrows extensively and is rarely seen
    #   https://en.wikipedia.org/wiki/Aphonopelma_vorhiesi
    #     -> Common names Tucson bronze / Madrean red rump (citation needed on Wikipedia), range, resemblance to A. chalcodes
    dict(**{'taxon': 'tarantula',
 'scientific_name': 'Aphonopelma vorhiesi',
 'common_names': ['Madrean Red Rump', 'Tucson Bronze'],
 'genus': 'Aphonopelma',
 'family': 'Theraphosidae',
 'order_name': 'Araneae',
 'care_level': 'intermediate',
 'temperament': 'Skittish to calm depending on keeper; may kick hairs',
 'native_region': 'Southeastern Arizona and southern New Mexico, USA (Madrean Archipelago, Sonoran and '
                  'Chihuahuan desert ecoregions)',
 'adult_size': 'About 4 in (dealer)',
 'growth_rate': 'Slow (dealer)',
 'type': 'terrestrial burrower',
 'substrate_depth': 'Deep (no figure given)',
 'substrate_type': 'Dry setup with deep substrate for digging, a hide and a shallow water dish',
 'feeding_mode': 'predator',
 'water_dish_required': True,
 'burrowing': 'Extensive',
 'urticating_hairs': True,
 'care_guide': 'Aphonopelma vorhiesi, sold as the Madrean red rump or Tucson bronze, lives across '
               'southeastern Arizona and southern New Mexico, from desert flats to sky-island mountains. Two '
               'names, A. jungi and A. punzoi, were folded into it in a 2016 revision, so you may meet them '
               'on older labels. It stays smaller than some relatives, around 4 inches, and is slow growing. '
               'Keepers and dealers describe a terrestrial burrower that likes a dry setup, deep digging '
               'substrate, a hide and a shallow water dish, with low humidity and warmth. Temperament '
               'reports vary: one keeper finds it skittish and a prolific burrower that you rarely see, '
               'while a dealer calls it calm. It has urticating hairs and may kick them. No published '
               'temperature or humidity figures or feeding schedule were found, so follow general '
               "Aphonopelma practice and your animal's cues.",
 'source_url': 'https://species-id.net/wiki/Aphonopelma_vorhiesi'}),
    # Sources:
    #   https://arachnoboards.com/threads/a-new-ornithoctoninae-genus-magnacrus-from-vietnam-is-described.374709/
    #     -> Authors' announcement: sp. 'Highland' and sp. 'Highland 2' = M. taynguyenensis; new genus in Ornithoctoninae from Central Highlands of Vietnam
    #   https://wsc.nmbe.ch/spec-data/72771
    #     -> Accepted name and authors (Hoang, Yu, Wendt, West & von Wirth, 2025), distribution Vietnam, both sexes described
    #   https://mapress.com/zt/article/view/zootaxa.5701.3.5
    #     -> Original description abstract (Zootaxa 5701(3): 351-381), genus Magnacrus and Central Highlands of Vietnam; full text paywalled so natural history notes were not read
    #   https://hardcorearachnids.com/products/ornithoctoninae-sp-vietnam-highland
    #     -> Dealer: fossorial, stout hind legs, robust; little info available; suspects cooler conditions (highlands)
    dict(**{'taxon': 'tarantula',
 'scientific_name': 'Magnacrus taynguyenensis',
 'common_names': ["Ornithoctoninae sp. 'Highland'", "Ornithoctoninae sp. 'Highland 2'", 'Vietnam Highland'],
 'genus': 'Magnacrus',
 'family': 'Theraphosidae',
 'order_name': 'Araneae',
 'native_region': 'Central Highlands (Tay Nguyen) of Vietnam',
 'type': 'fossorial',
 'feeding_mode': 'predator',
 'burrowing': 'Fossorial (dealer description)',
 'urticating_hairs': False,
 'care_guide': 'Magnacrus taynguyenensis was described in October 2025 from the Central Highlands of '
               'Vietnam, in a new genus that also holds M. tongmianensis. Hobbyists previously knew it as '
               "Ornithoctoninae sp. 'Highland' and sp. 'Highland 2'. Because the name is so new, there are "
               'no care sheets we could verify. A dealer describes a stout, robust, fossorial spider and '
               'suspects it prefers cooler conditions because it comes from the highlands, but says there '
               "isn't much information yet. As an Old World ornithoctonine it has no urticating hairs, and "
               'it is sensible to treat it with the caution you would give any Old World burrower. We have '
               'left temperature, humidity, substrate depth and feeding figures blank because no source we '
               'read gave them. If you keep one, your own records are real data worth sharing.',
 'source_url': 'https://arachnoboards.com/threads/a-new-ornithoctoninae-genus-magnacrus-from-vietnam-is-described.374709/'}),
    # Sources:
    #   https://fearnottarantulas.com/products/eresus-balcanicus-ladybird-velvet-spider-for-sale
    #     -> E. balcanicus specifically: keep dry, no water dish, no more than a drop or two of water, 15 dram vial for several molts, ~50 dram vial later, dry sphagnum/twigs/leaf litter, fruit flies for small spiders, females live ~5 years, range Eastern Mediterranean mainly Turkey, day/night cycle out of direct sun
    #   https://www.thetarantulacollective.com/care-sheets-2/eresus-walckenaeri
    #     -> Genus-level (E. walckenaeri, says it applies to other Eresidae): 68-76 F, no misting/water dish, substrate 1/3-1/2 of enclosure, feeding frequencies and prey, venom description, handling not recommended
    #   https://arachnoboards.com/goto/post?id=3348502
    #     -> Keeper reports on Eresus: do not mist, feed slings every 3-4 days, adult about weekly, juvenile about every 5 days, 4x4x7 in enclosure with many nooks, silk nest behaviour
    #   https://arachnoboards.com/threads/need-advice-velvet-spider.369351/
    #     -> Keeper disagreement about whether any water should be offered; one E. balcanicus died after 6 months with unknown cause
    dict(**{'taxon': 'true_spider',
 'scientific_name': 'Eresus balcanicus',
 'common_names': ['Turkish velvet spider', 'Ladybird velvet spider'],
 'genus': 'Eresus',
 'family': 'Eresidae',
 'order_name': 'Araneae',
 'care_level': 'intermediate',
 'temperament': 'Reclusive; stays in its silk nest',
 'native_region': 'Eastern Mediterranean, mainly Turkey',
 'type': 'Silk-tube dweller',
 'temperature_min': 68,
 'temperature_max': 76,
 'enclosure_size_sling': '15 dram vial for several molts',
 'enclosure_size_juvenile': 'About 50 dram vial with sticks and leaf litter',
 'enclosure_size_adult': 'Small box, e.g. 4x4x7 in (other Eresus); many nooks',
 'substrate_depth': '1/3 to 1/2 of enclosure (E. walckenaeri guide)',
 'substrate_type': 'Dry only: sphagnum moss or dry soil/sand mix, with twigs and leaf litter',
 'feeding_mode': 'predator',
 'prey_size': 'Flightless fruit flies for spiderlings; small to large crickets or Dubia roaches later',
 'feeding_frequency_sling': 'Every 3-4 days to twice weekly',
 'feeding_frequency_juvenile': 'About every 5 days to weekly, adjusted to abdomen size',
 'feeding_frequency_adult': 'About weekly to every 2-3 weeks, adjusted to abdomen size',
 'water_dish_required': False,
 'webbing_amount': 'Heavy (silk tubes and nest)',
 'burrowing': 'Light; builds tube retreats',
 'urticating_hairs': False,
 'venom_notes': 'No source read states the venom effects of E. balcanicus specifically. A Tarantula '
                'Collective guide for the related E. walckenaeri describes a painful bite with local pain '
                "and swelling and says it is not life-threatening (the same guide lists it as 'medically "
                "significant' in its snapshot and 'not considered medically significant' in the text, so it "
                'is internally inconsistent). Handling is not recommended.',
 'care_guide': 'Eresus balcanicus is a velvet spider from the eastern Mediterranean, mainly Turkey, and it '
               'asks for one thing above all: dryness. Keepers who have raised Eresus consistently say to '
               'keep the enclosure bone dry, skip the water dish, and avoid misting. The spider gets its '
               'moisture from its prey, and damp conditions are blamed for losses. Give it a small, '
               'well-ventilated home with twigs, leaf litter or dry sphagnum to anchor a silk tube, then '
               'leave it alone once it settles in. Spiderlings start on flightless fruit flies and move up '
               'to crickets or roaches, fed every few days when small and roughly weekly to every few weeks '
               'as adults. Females are reported to live about five years. Care data for this exact species '
               'is thin, so some of this comes from other Eresus; watch your own animal closely.',
 'source_url': 'https://fearnottarantulas.com/products/eresus-balcanicus-ladybird-velvet-spider-for-sale'}),
    # Sources:
    #   https://en.wikipedia.org/wiki/Cupiennius_salei
    #     -> Taxonomy (Trechaleidae), common name tiger bromeliad spider, range, size, arboreal nocturnal ambush behaviour, no capture web, diet incl. small frogs/lizards, fruit flies then crickets, 9-12 month life cycle, venom not medically significant
    #   https://arachnoboards.com/threads/h-immanis-and-c-salei.42546
    #     -> Keeper set-up of about 25 C and 70-80% humidity; venom effects only swelling/stiffness
    #   https://arachnoboards.com/threads/cupiennius-salei-feeding-habits.44337
    #     -> Feeding twice a week vs every other day; short-lived and fast growing; remove uneaten crickets
    #   https://arachnoboards.com/threads/keeping-heteropoda-sp-as-a-first-true-spider-species.273975
    #     -> Tolerant of room temps, good first true spider, no water dish with water dripped on cork, slightly moist substrate
    dict(**{'taxon': 'true_spider',
 'scientific_name': 'Cupiennius salei',
 'common_names': ['Central American wandering spider', 'Tiger wandering spider', 'Tiger bromeliad spider'],
 'genus': 'Cupiennius',
 'family': 'Trechaleidae',
 'order_name': 'Araneae',
 'care_level': 'beginner',
 'temperament': 'Sits still, but a fast runner when disturbed',
 'native_region': 'Southeastern Mexico and Central America (Guatemala to Nicaragua, possibly NW Costa Rica)',
 'adult_size': 'Female body to 3.5 cm, ~10 cm leg span',
 'growth_rate': 'Fast',
 'type': 'Arboreal',
 'temperature_min': 77,
 'temperature_max': 77,
 'humidity_min': 70,
 'humidity_max': 80,
 'substrate_type': 'Slightly moist substrate with cork bark and fake plants to climb',
 'feeding_mode': 'predator',
 'prey_size': 'Fruit flies for hatchlings, then crickets; adults take large prey',
 'feeding_frequency_adult': 'Twice weekly to every other day (keeper reports)',
 'water_dish_required': False,
 'webbing_amount': 'Minimal (no capture web)',
 'burrowing': 'None',
 'urticating_hairs': False,
 'medically_significant_venom': False,
 'venom_severity': 'mild',
 'venom_notes': 'Wikipedia states the bite is not medically significant to humans; the venom is a '
                'well-studied neurotoxic mix aimed at insect prey. A forum reply on Arachnoboards says bites '
                'from this and a huntsman cause only swelling and stiffness, without necrosis. Individual '
                'reactions can vary.',
 'care_guide': 'Cupiennius salei is a big, fast, largely arboreal wandering spider from southern Mexico and '
               'Central America. It does not build a capture web; it sits on leaves at night and ambushes '
               'prey. Keepers describe it as tolerant and a good first true spider. One experienced keeper '
               'uses about 25 C (77 F) with 70 to 80 percent humidity, a tall enclosure with cork bark and '
               'plants to climb, and slightly moist substrate. Many keepers skip the water dish and drip '
               'water onto the cork instead, which the spiders drink. Feed fruit flies to hatchlings, then '
               'crickets; one keeper feeds adults every other day, another twice a week. Never leave live '
               'crickets in with a spider that may molt. The bite is not considered medically significant, '
               'but expect a quick runner when it is disturbed, so open the enclosure carefully.',
 'source_url': 'https://en.wikipedia.org/wiki/Cupiennius_salei'}),
    # Sources:
    #   https://tydyeexotic.com/products/rhombodera-kirbyi-png-shield-mantis-papua-new-guinea-shield-mantis
    #     -> Vendor care for R. kirbyi: 75-85 F, 60-80% humidity, mist 3-4x/week, ventilated enclosure with vertical space, flying-insect prey, intermediate-advanced, 4-5 in size claim
    #   https://en.wikipedia.org/wiki/Rhombodera_kirbyi
    #     -> Taxonomy (Mantidae, Mantodea), found in Timor, size female ~10 cm / male 8-8.5 cm, 'low requirements' as a pet
    #   https://mantidforum.net/threads/rhombodera-questions.40471/post-309040
    #     -> Genus-level advice (not kirbyi-specific): terrarium or mesh popup acceptable, small heat lamp 72-76 F by day, extra humidity preferred
    dict(**{'taxon': 'mantis',
 'scientific_name': 'Rhombodera kirbyi',
 'common_names': ['Timor shield mantis', 'PNG shield mantis'],
 'genus': 'Rhombodera',
 'family': 'Mantidae',
 'order_name': 'Mantodea',
 'care_level': 'intermediate',
 'native_region': 'Timor (per Wikipedia); sold in the hobby as Papua New Guinea shield mantis',
 'adult_size': 'Female to ~10 cm, male 8-8.5 cm',
 'type': 'Arboreal',
 'temperature_min': 75,
 'temperature_max': 85,
 'humidity_min': 60,
 'humidity_max': 80,
 'enclosure_size_adult': 'Large ventilated enclosure with vertical space for molting',
 'feeding_mode': 'predator',
 'prey_size': 'Flying insects sized to the mantis: house flies, blue bottle flies, moths',
 'webbing_amount': 'None',
 'burrowing': 'None',
 'urticating_hairs': False,
 'medically_significant_venom': False,
 'venom_notes': 'Mantises are not venomous.',
 'care_guide': 'Rhombodera kirbyi is a large shield mantis, with females reaching about 10 cm. The published '
               'locality is Timor, though it is sold in the hobby as the PNG shield mantis, so treat its '
               'origin as uncertain. Care information for this exact species is mostly from vendors and from '
               'keepers of related Rhombodera, so use it as a starting point. One seller recommends 75 to 85 '
               'F, 60 to 80 percent humidity, misting three to four times a week, and a large ventilated '
               'enclosure with plenty of vertical room to hang for molts. Forum keepers of the genus say a '
               'terrarium suits them better than mesh because they want extra humidity, and that a small '
               'heat lamp helps in a cool house. Offer flying insects such as house flies, bluebottles and '
               'moths sized to the mantis. The seller rates it intermediate, while Wikipedia says low '
               'requirements, so that rating is contested.',
 'source_url': 'https://tydyeexotic.com/products/rhombodera-kirbyi-png-shield-mantis-papua-new-guinea-shield-mantis'}),
    # Sources:
    #   https://www.torontozoo.com/animals/Central%20American%20bark%20scorpion
    #     -> Taxonomy, size 7-9 cm, range, nocturnal climbing habit, habitat, diet, 'relatively mild' venom statement
    #   https://www.ntnu.no/ub/scorpion-files/medicallist.php
    #     -> C. margaritatus listed among scorpions documented to cause moderate to severe symptoms (Ward et al. 2018)
    #   https://arachnoboards.com/threads/centuroides-husbandry.292423/post-2603285
    #     -> Genus-level only: all bark scorpions need vertical surfaces and a water dish; warning that temperature/humidity vary by species (so no numbers used)
    #   https://thetarantulacollective.com/caresheets/centruroides-gracilis
    #     -> Genus-level context from C. gracilis: shallow water dish because scorpions can drown, cork bark, cricket prey (not used for numeric fields)
    dict(**{'taxon': 'scorpion',
 'scientific_name': 'Centruroides margaritatus',
 'common_names': ['Central American bark scorpion'],
 'genus': 'Centruroides',
 'family': 'Buthidae',
 'order_name': 'Scorpiones',
 'temperament': 'Nocturnal, agile; hides in crevices by day',
 'native_region': 'Central America and NW South America (e.g. Guatemala, Honduras, Nicaragua, Ecuador, '
                  'Colombia)',
 'adult_size': '7-9 cm long',
 'type': 'Arboreal / climbing',
 'feeding_mode': 'predator',
 'prey_size': 'Insects and small arthropods such as crickets, roaches, termites, spiders',
 'water_dish_required': True,
 'burrowing': 'Minimal; climbs bark and crevices',
 'urticating_hairs': False,
 'medically_significant_venom': True,
 'venom_severity': 'moderate',
 'venom_notes': 'Sources disagree. Toronto Zoo calls the venom relatively mild compared with other '
                'Centruroides and not dangerously toxic to healthy humans. The Scorpion Files (Rein and '
                'McWest, based on Ward et al. 2018) list C. margaritatus among species documented to cause '
                'moderate to severe symptoms in humans, with the caveat that Centruroides venoms vary a lot '
                'by species. Rated moderate and flagged medically significant to be cautious. No '
                'species-specific clinical figures were found.',
 'care_guide': 'Centruroides margaritatus, the Central American bark scorpion, is a slender, nocturnal '
               'climber from Central America and northwestern South America, found under bark, in leaf '
               'litter and in woodpiles. Good husbandry information specific to this species is scarce, so '
               'this is partly borrowed from other bark scorpions. Keepers of the genus describe tall '
               'enclosures with cork bark or rough vertical surfaces to climb, a shallow water dish a '
               'scorpion can climb out of, light weekly misting, and small insect prey such as crickets and '
               'roaches. Do not copy a single temperature or humidity number from another Centruroides, '
               'because keepers note these vary by species. Treat the sting seriously. Toronto Zoo calls the '
               'venom relatively mild for the genus, but the Scorpion Files lists the species among those '
               'reported to cause moderate to severe symptoms. Use long tools, never handle it, and keep the '
               'enclosure escape-proof, because it climbs well.',
 'source_url': 'https://www.torontozoo.com/animals/Central%20American%20bark%20scorpion'}),
    # Sources:
    #   https://www.ntnu.no/ub/scorpion-files/medicallist.php
    #     -> A. bicolor and Androctonus listed as medically significant (moderate to severe symptoms documented), range North Africa/Middle East
    #   https://en.wikipedia.org/wiki/Androctonus_bicolor
    #     -> Taxonomy, size up to 8 cm, arid habitat, nocturnal, scrapes under wood/rocks, neurotoxic venom, 10-20% envenoming rate, antivenom (secondary summary of Clinical Toxinology Resources)
    #   https://pubmed.ncbi.nlm.nih.gov/26254009
    #     -> Abstract describes A. bicolor as one of the most poisonous scorpion species; venom composition study
    #   https://arachnoboards.com/threads/a-bicolor.8782/latest
    #     -> Quotes the Nevo and Spirer Israeli case report of severe pediatric envenomation; keeper advice for dry sand/peat and small water dish
    #   https://arachnoboards.com/threads/fat-tail-androctonus-bicolor-habitat.328034
    #     -> Keeper husbandry: upper 80s to 90s F, 3-4 in decomposed granite, dry surface, burrows in corner, origin Egypt imports
    #   https://arachnoboards.com/threads/info-on-androctonus-bicolor.35718
    #     -> Keeper consensus that Androctonus is not a beginner scorpion
    dict(**{'taxon': 'scorpion',
 'scientific_name': 'Androctonus bicolor',
 'common_names': ['Black fat-tailed scorpion', 'Black fat-tail scorpion'],
 'genus': 'Androctonus',
 'family': 'Buthidae',
 'order_name': 'Scorpiones',
 'care_level': 'advanced',
 'temperament': 'Fast and aggressive; not for handling',
 'native_region': 'North Africa and the Middle East; arid and semi-arid sandy areas',
 'adult_size': 'Up to ~8 cm; typically 4-6 cm',
 'type': 'Desert, ground-dwelling',
 'temperature_min': 85,
 'temperature_max': 95,
 'substrate_depth': '3-4 inches (keeper report)',
 'substrate_type': 'Dry sand or decomposed granite; one keeper keeps the surface dry over a moist lower '
                   'layer',
 'feeding_mode': 'predator',
 'burrowing': 'Makes scrapes and burrows under wood and rocks',
 'urticating_hairs': False,
 'medically_significant_venom': True,
 'venom_severity': 'medically_significant',
 'venom_notes': 'A. bicolor is on the Scorpion Files list of scorpions documented to cause moderate to '
                'severe symptoms in humans (Ward et al. 2018), and Androctonus as a genus is medically '
                'significant. A case report from Israel (cited secondhand by a keeper on Arachnoboards, Nevo '
                'and Spirer, PMID 1885103) describes a 3-year-old with vomiting, agitation, hypotension, '
                'convulsions and myocardial involvement, recovering in 6 days; the authors call both the '
                'black and brown forms dangerous, especially to young children. Wikipedia, citing Clinical '
                'Toxinology Resources, describes a neurotoxic venom, a 10-20% envenoming rate and an '
                'available monovalent antivenom. Treat any sting as a medical emergency. This record is not '
                'a substitute for medical advice.',
 'care_guide': 'Androctonus bicolor is a small, black fat-tailed scorpion from North Africa and the Middle '
               'East, and it is medically significant. It does not belong in a beginner collection. Stings '
               'have caused severe systemic illness, including in a child treated in Israel, and the species '
               'is on the Scorpion Files list of scorpions with documented moderate to severe effects. Keep '
               'it only if you have scorpion experience, a secure lidded enclosure, long forceps, deep catch '
               'cups, and a plan for emergency care before the animal arrives. Keepers describe a desert '
               'setup: temperatures in the upper 80s to low 90s F, 3 to 4 inches of dry sand or decomposed '
               'granite, something to burrow under, and a dry surface. Desert scorpions are prone to fungal '
               'problems in damp substrate. Detailed feeding schedules and humidity figures are poorly '
               'documented in the sources we could find, so rely on an experienced Androctonus keeper for '
               'those.',
 'source_url': 'https://www.ntnu.no/ub/scorpion-files/medicallist.php'}),
]


def _check_lengths():
    """Fail before touching the database if any text is longer than its column."""
    cols = InvertSpecies.__table__.columns
    for data in SPECIES_DATA:
        for key, value in data.items():
            if key not in cols:
                raise SystemExit(f"{data['scientific_name']}: unknown column {key}")
            limit = getattr(cols[key].type, "length", None)
            if limit and isinstance(value, str) and len(value) > limit:
                raise SystemExit(f"{data['scientific_name']}: {key} is {len(value)} characters; the column allows {limit}")


def seed():
    _check_lengths()
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
            print(f"  Added: {taxon} {name}")
        db.commit()
        print(f"Done. Added {added}, skipped {skipped}.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
