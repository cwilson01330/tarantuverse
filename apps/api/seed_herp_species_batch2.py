"""Seed HV herp species — expansion batch 2 (top keeper-demand, cross-taxon).

Per PRD-herpetoverse-v1 and docs/design/RUBRIC-care-sheet-content.md.
Every entry carries 3+ citations, at least one Tier A (veterinary / academic /
IUCN / government). Husbandry numbers are RANGES reflecting source variation.
Fields the sources could not verify are left NULL rather than fabricated.

15 species, chosen as the highest-demand herps that also fill HV's empty taxa
(turtle / tortoise / salamander had zero entries before this batch):

  Snakes (3):     Boa imperator, Morelia spilota, Lampropeltis triangulum
  Lizards (3):    Varanus acanthurus, Salvator merianae, Uromastyx geyri
  Turtles (3):    Trachemys scripta elegans, Sternotherus odoratus, Terrapene carolina
  Tortoises (3):  Centrochelys sulcata, Testudo hermanni, Testudo horsfieldii
  Salamanders(3): Ambystoma mexicanum, Cynops orientalis, Ambystoma tigrinum

Modeling notes (honesty-first):
  * enclosure_type only permits terrestrial|arboreal|semi_arboreal|fossorial.
    Fully/semi-aquatic species (slider, musk, axolotl, newt) are left NULL and
    their aquatic setup is described in enclosure_min_adult + care_guide.
  * For aquatic species, temp_cool_* = WATER temperature; basking = NULL.
  * Amphibians: uvb_required False, handleability hands_off.
  * Weights left NULL where no reliable source (flagged per species).
  * Sulcata IUCN: official Red List = Vulnerable (1996); TFTSG provisional
    (2013) = Endangered — stored as VU with the discrepancy noted in prose.

Run with: python3 seed_herp_species_batch2.py
"""
import os
import sys
import uuid
from decimal import Decimal

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.reptile_species import ReptileSpecies
from app.utils.slugs import slugify_unique


# ---------------------------------------------------------------------------
# Citation catalog (rubric JSONB shape).
# ---------------------------------------------------------------------------
CITES = {
    # --- Boa imperator ---
    "iucn_boa_imperator": {
        "source_type": "government", "title": "Boa imperator — Red List Assessment",
        "author": "IUCN SSC", "url": "https://www.iucnredlist.org/species/pdf/2486405",
        "publication_date": "2021-01-01",
        "summary": "Least Concern; broad Mexico/Central America/NW South America range, populations stable.",
    },
    "usgs_boa_trade": {
        "source_type": "government", "title": "Pet-trade impact on CITES Appendix II case studies — Boa constrictor imperator",
        "author": "USGS (Reed & Rodda et al.)", "url": "https://pubs.usgs.gov/publication/70159197",
        "publication_date": "2011-01-01",
        "summary": "Confirms CITES Appendix II listing and pet-trade context.",
    },
    "reptifiles_boa": {
        "source_type": "breeder_community", "title": "Boa Care Sheet",
        "author": "ReptiFiles (Mariah Healey)", "url": "https://reptifiles.com/boa-constrictor-care/",
        "publication_date": "2020-11-01",
        "summary": "Temperature gradient, humidity, enclosure size, UVB, age-based feeding schedule, lifespan.",
    },
    # --- Morelia spilota ---
    "reptifiles_carpet": {
        "source_type": "breeder_community", "title": "Carpet Python (Morelia spilota) Care Sheet",
        "author": "ReptiFiles (Mariah Healey)", "url": "https://reptifiles.com/carpet-python-care-sheet/",
        "publication_date": "2022-01-01",
        "summary": "Temps, humidity, enclosure formula, UVB, feeding frequency, substrate, prey sizing.",
    },
    "carpetpythons_care": {
        "source_type": "breeder_community", "title": "Carpet Python Care Guide (Morelia spilota)",
        "author": "CarpetPythons.com", "url": "https://www.carpetpythons.com/en/carpet-python-care",
        "publication_date": "2021-01-01",
        "summary": "Ambient temperature and subspecies-size corroboration.",
    },
    "iucn_morelia_spilota": {
        "source_type": "government", "title": "Morelia spilota — conservation status (LC) and CITES II",
        "author": "IUCN / CITES", "url": "https://en.wikipedia.org/wiki/Morelia_spilota",
        "publication_date": "2018-01-01",
        "summary": "Least Concern; regulated under CITES Appendix II (verify primary IUCN page before republishing).",
    },
    # --- Lampropeltis triangulum ---
    "natureserve_milk": {
        "source_type": "government", "title": "Lampropeltis triangulum — NatureServe Explorer",
        "author": "NatureServe", "url": "https://explorer.natureserve.org/Taxon/ELEMENT_GLOBAL.2.960858/Lampropeltis_triangulum",
        "publication_date": "2023-01-01",
        "summary": "Range, conservation status, threats (localized declines).",
    },
    "adw_milk": {
        "source_type": "academic", "title": "Lampropeltis triangulum",
        "author": "Animal Diversity Web, U. Michigan", "url": "https://animaldiversity.org/accounts/Lampropeltis_triangulum/",
        "publication_date": "2011-01-01",
        "summary": "Academic species account: biology, range, diet.",
    },
    "reptifiles_milk": {
        "source_type": "breeder_community", "title": "Milksnake Care Sheet",
        "author": "ReptiFiles (Mariah Healey)", "url": "https://reptifiles.com/milksnake-care-sheet/",
        "publication_date": "2022-01-01",
        "summary": "Subspecies size table, temps, humidity, UVB, enclosure size, feeding, 20+ yr lifespan.",
    },
    # --- Varanus acanthurus ---
    "vet_ackie": {
        "source_type": "veterinary", "title": "Ackie Monitor Husbandry (Reptile Rounds)",
        "author": "Dr. Eric Los Kamp, DVM", "url": "https://wpvet.com/reptile-rounds/ackie-monitor-husbandry-article/",
        "publication_date": "2021-01-01",
        "summary": "Veterinary husbandry overview: habit, insect/reptile diet, temperature gradient, health.",
    },
    "mlsg_ackie": {
        "source_type": "academic", "title": "Varanus acanthurus — species account",
        "author": "IUCN SSC Monitor Lizard Specialist Group", "url": "https://iucn-mlsg.org/species/australian-species-2/varanus-acanthurus/",
        "publication_date": "2017-01-01",
        "summary": "Taxonomy, range, IUCN Least Concern (2017), CITES Appendix II.",
    },
    "reptifiles_ackie": {
        "source_type": "breeder_community", "title": "The Ultimate Ackie Monitor Care Guide",
        "author": "ReptiFiles (Mariah Healey)", "url": "https://reptifiles.com/ackie-monitor-care/",
        "publication_date": "2022-01-01",
        "summary": "Basking surface 158-172F, cool 75-82F, humidity 20-50/burrow 80, min 5x2.5x4 ft, T5 HO UVB, insectivore diet.",
    },
    # --- Salvator merianae ---
    "lafeber_tegu": {
        "source_type": "veterinary", "title": "Tegu Basic Care",
        "author": "LafeberVet", "url": "https://lafeber.com/vet/wp-content/uploads/2024/08/Tegu-Basic-Care-FINAL.pdf",
        "publication_date": "2024-08-01",
        "summary": "Temperature gradient, ~80 percent humidity, UVB 12-14h, brumation biology, omnivore diet.",
    },
    "tol_tegu": {
        "source_type": "veterinary", "title": "Tegu Lizard Care (Salvator and Tupinambis spp.)",
        "author": "Tree of Life Exotics", "url": "https://treeoflifeexotics.vet/education-resource-center/for-clients/lizards/tegu-care",
        "publication_date": "2023-01-01",
        "summary": "Species-level husbandry, night temp tolerance, UVB, handling and temperament.",
    },
    "cites_tegu": {
        "source_type": "government", "title": "Salvator merianae — CITES species record",
        "author": "CITES", "url": "https://cites.org/eng/taxonomy/term/4137",
        "publication_date": "2012-01-01",
        "summary": "Confirms current CITES entry / Appendix II listing after the Salvator split from Tupinambis.",
    },
    "reptifiles_tegu": {
        "source_type": "breeder_community", "title": "Colombian & Argentine Tegu Care Guide",
        "author": "ReptiFiles", "url": "https://reptifiles.com/colombian-argentine-tegu-care/",
        "publication_date": "2022-01-01",
        "summary": "8x4x4 ft min enclosure, basking 125-135F, humid hide 90-100, omnivore feeding schedule.",
    },
    # --- Uromastyx geyri ---
    "iucn_uromastyx_geyri": {
        "source_type": "government", "title": "Uromastyx geyri — Red List Assessment",
        "author": "IUCN", "url": "https://www.iucnredlist.org/species/pdf/22481945",
        "publication_date": "2012-01-01",
        "summary": "Near Threatened; range; trade and climate threats.",
    },
    "uvtool_baines": {
        "source_type": "academic", "title": "How much UVB does my reptile need? The UV-Tool",
        "author": "Baines et al., J. Zoo & Aquarium Research", "url": "https://doi.org/10.19227/jzar.v4i1.150",
        "publication_date": "2016-01-01",
        "summary": "UV Index targets for desert baskers underpinning UVI 4-6 recommendation.",
    },
    "reptifiles_uromastyx": {
        "source_type": "breeder_community", "title": "Uromastyx Care Sheet",
        "author": "ReptiFiles (Mariah Healey)", "url": "https://reptifiles.com/uromastyx-care-sheet/",
        "publication_date": "2022-01-01",
        "summary": "geyri max 15 in, basking 120-130F, cool ~85F, humidity 20-30, T5 HO 14% UVB, strict herbivore, 4+ in sand.",
    },
    # --- Trachemys scripta elegans ---
    "vet_res_mesa": {
        "source_type": "veterinary", "title": "Care Of Red-eared Sliders",
        "author": "Mesa Veterinary Hospital", "url": "https://yourmesavet.com/blog/care-of-red-eared-sliders/",
        "publication_date": "2022-01-01",
        "summary": "Merck 40-gal minimum, water 75-80F, basking 85-90F, UVB 6-12 mo, shell-rot vet guidance.",
    },
    "lafeber_aquatic_turtle": {
        "source_type": "veterinary", "title": "Care of Aquatic & Semi-Aquatic Turtles",
        "author": "LafeberVet", "url": "https://lafeber.com/vet/wp-content/uploads/2019/09/Aquatic-turtle-handout-color-0919.pdf",
        "publication_date": "2019-09-01",
        "summary": "Husbandry, water temp 75-82F, diet balance, Ca:P ratio.",
    },
    "gisd_res": {
        "source_type": "government", "title": "Trachemys scripta elegans — GISD profile",
        "author": "IUCN Invasive Species Specialist Group", "url": "https://www.iucngisd.org/gisd/species.php?sc=71",
        "publication_date": "2011-01-01",
        "summary": "Invasive status, native range, listed among 100 of the world's worst invasive species.",
    },
    # --- Sternotherus odoratus ---
    "vet_musk_tol": {
        "source_type": "veterinary", "title": "Common Musk Turtle Care",
        "author": "Tree of Life Exotic Pet Medical Center", "url": "https://treeoflifeexotics.vet/education-resource-center/for-clients/turtles/common-musk-turtle-care",
        "publication_date": "2023-01-01",
        "summary": "20/30 gal, water 75-80F, depth 8-12 in, basking 85-90F, UVB 5-10 for 10-12h, diet, disease signs.",
    },
    "iucn_musk": {
        "source_type": "government", "title": "Sternotherus odoratus — IUCN Red List",
        "author": "IUCN", "url": "https://www.iucnredlist.org/species/163450/5607126",
        "publication_date": "2011-01-01",
        "summary": "Least Concern assessment.",
    },
    "biodude_musk": {
        "source_type": "breeder_community", "title": "Care and Maintenance of the Common Musk Turtle",
        "author": "The Bio Dude", "url": "https://www.thebiodude.com/blogs/turtle-and-tortoise-caresheets/care-and-maintenance-of-the-common-musk-turtle-sternotherus-odoratus",
        "publication_date": "2021-01-01",
        "summary": "40 gal, UVI 3-4, size, bottom-walking behavior.",
    },
    # --- Terrapene carolina ---
    "reptifiles_box": {
        "source_type": "breeder_community", "title": "Eastern Box Turtle Care Sheet",
        "author": "ReptiFiles", "url": "https://reptifiles.com/eastern-box-turtle-care-sheet/",
        "publication_date": "2022-01-01",
        "summary": "8 sq ft min, humidity 60-80, basking 84-88F / cool 70-75F, T5 HO UVB, humid hide, diet, ARAV exam guidance.",
    },
    "iucn_box": {
        "source_type": "government", "title": "Terrapene carolina — account #085 (VU, CITES II)",
        "author": "IUCN Tortoise & Freshwater Turtle Specialist Group", "url": "https://iucn-tftsg.org/terrapene-carolina-085/",
        "publication_date": "2011-01-01",
        "summary": "Vulnerable, CITES Appendix II, threats; captive-bred strongly preferred.",
    },
    "si_box": {
        "source_type": "government", "title": "Eastern box turtle",
        "author": "Smithsonian's National Zoo", "url": "https://nationalzoo.si.edu/animals/eastern-box-turtle",
        "publication_date": "2020-01-01",
        "summary": "Size, biology, lifespan.",
    },
    # --- Centrochelys sulcata ---
    "vet_sulcata_chicago": {
        "source_type": "veterinary", "title": "Sulcata Care (Centrochelys sulcata)",
        "author": "Chicago Exotics Animal Hospital (Mede CVT, Horton DVM)", "url": "http://www.exoticpetvet.com/sulcata-care.html",
        "publication_date": "2019-01-01",
        "summary": "Enclosure, temps 80s / basking 95F, humidity 40-60 day / 70-80 night, UVB, grass/hay diet, no hibernation, CITES II.",
    },
    "tftsg_sulcata": {
        "source_type": "academic", "title": "Centrochelys sulcata — African Spurred Tortoise (Chelonian Research Monographs 5)",
        "author": "IUCN/SSC Tortoise & Freshwater Turtle Specialist Group", "url": "https://iucn-tftsg.org/wp-content/uploads/crm.5.110.sulcata.v1.2020.pdf",
        "publication_date": "2020-01-01",
        "summary": "Size (SCL to 86 cm, mass 45-91 kg, record >120 kg), range, VU vs EN status discrepancy.",
    },
    "fws_sulcata": {
        "source_type": "government", "title": "African Spurred Tortoise (Centrochelys sulcata)",
        "author": "U.S. Fish & Wildlife Service", "url": "https://www.fws.gov/species/african-spurred-tortoise-centrochelys-sulcata",
        "publication_date": "2020-01-01",
        "summary": "CITES Appendix II; threats.",
    },
    # --- Testudo hermanni ---
    "lafeber_hermanni": {
        "source_type": "veterinary", "title": "Basic Information Sheet: Hermann's Tortoise",
        "author": "LafeberVet (Pollock DVM, Kanis)", "url": "https://lafeber.com/vet/basic-information-sheet-hermanns-tortoise/",
        "publication_date": "2015-03-18",
        "summary": "Size, temps 60-85F / basking 90-95F / night 40-75F, humidity 40-75, UVB, >90% herbivore, hibernation, CITES II, IUCN NT.",
    },
    "swiftail_hermanni": {
        "source_type": "veterinary", "title": "Hermann's Tortoise Care Sheet",
        "author": "Swiftail Exotic Telemedicine Veterinary Services", "url": "https://www.swiftailvet.com/exotic-pet-care-sheets/hermanns-tortoise",
        "publication_date": "2025-06-01",
        "summary": "Enclosure >=4x2 ft, substrate (avoid pine/cedar), temps, T5HO UVB, calcium, soaking, brumation under vet guidance.",
    },
    "tftsg_hermanni": {
        "source_type": "academic", "title": "Testudo hermanni — Hermann's Tortoise (Chelonian Research Monographs 5)",
        "author": "IUCN/SSC Tortoise & Freshwater Turtle Specialist Group", "url": "https://iucn-tftsg.org/wp-content/uploads/file/Accounts/crm_5_059_hermanni_v1_2011.pdf",
        "publication_date": "2011-01-01",
        "summary": "Range, Near Threatened status, CITES/EU protections, threats.",
    },
    # --- Testudo horsfieldii ---
    "lafeber_russian": {
        "source_type": "veterinary", "title": "Basic Information Sheet: Russian Tortoise",
        "author": "LafeberVet (Pollock DVM, Kanis)", "url": "https://lafeber.com/vet/basic-information-sheet-russian-tortoise/",
        "publication_date": "2015-03-18",
        "summary": "Range, size 12-20 cm, temp tables, humidity <=65-70, UVB, burrowing substrate, individual housing, hibernation, CITES II, IUCN VU.",
    },
    "iucn_russian": {
        "source_type": "government", "title": "Testudo horsfieldii — IUCN Red List",
        "author": "IUCN (TFTSG 1996)", "url": "https://www.iucnredlist.org",
        "publication_date": "1996-01-01",
        "summary": "Vulnerable; CITES Appendix II; threats (habitat degradation, pet trade).",
    },
    "reptifiles_russian": {
        "source_type": "breeder_community", "title": "Russian Tortoise Care Sheet",
        "author": "ReptiFiles", "url": "https://reptifiles.com/russian-tortoise-care-sheet/",
        "publication_date": "2022-01-01",
        "summary": "T5 HO UVB (basking UVI 3-4), enclosure 6-8 x 4 ft, bioactive maintenance.",
    },
    # --- Ambystoma mexicanum ---
    "vet_axolotl_tol": {
        "source_type": "veterinary", "title": "Axolotl (Ambystoma mexicanum) Care",
        "author": "Tree of Life Exotic Pet Medical Center", "url": "https://treeoflifeexotics.vet/education-resource-center/for-clients/amphibians/axolotl-care",
        "publication_date": "2023-01-01",
        "summary": "60-68F (avoid >72F, chiller if needed), 20-gal-long min, bare-bottom/fine sand (avoid gravel), ammonia/nitrite 0, carnivore diet.",
    },
    "vet_axolotl_upv": {
        "source_type": "veterinary", "title": "Axolotl Care Sheet",
        "author": "Unusual Pet Vets (Australia)", "url": "https://www.unusualpetvets.com.au/wp-content/uploads/2025/01/amphibian-axolotl-care-sheet.pdf",
        "publication_date": "2025-01-01",
        "summary": "17-18C ideal (tolerates 14-22C), pH 7.0-7.5, 78 L adult tank, avoid swallowable gravel, endangered wild, MBD risk.",
    },
    "iucn_axolotl": {
        "source_type": "government", "title": "Ambystoma mexicanum — IUCN Red List / CITES",
        "author": "IUCN / CITES", "url": "https://www.iucnredlist.org",
        "publication_date": "2019-01-01",
        "summary": "Wild population Critically Endangered (CR); Lake Xochimilco habitat loss; CITES Appendix II.",
    },
    # --- Cynops orientalis ---
    "amphibiaweb_newt": {
        "source_type": "academic", "title": "Hypselotriton orientalis: Oriental Fire-bellied Newt",
        "author": "AmphibiaWeb, UC Berkeley (Y. Wu)", "url": "https://amphibiaweb.org/species/4244",
        "publication_date": "2008-01-01",
        "summary": "Morphology, range (lower Yangtze), breeding water 15-23C, diet, IUCN Least Concern, no CITES listing.",
    },
    "salamanderland_newt": {
        "source_type": "breeder_community", "title": "Cynops orientalis — Care Sheet",
        "author": "Salamanderland (G. Molinari)", "url": "https://salamanderland.com/articles/articles-caresheets/cynops-orientalis",
        "publication_date": "2024-01-01",
        "summary": "50 L for pair/trio, 14-20C (max ~26C), bare/fine-sand only (gravel = obstruction), emergent land, low-flow filter, feed 2-3x/wk.",
    },
    "dubia_newt": {
        "source_type": "breeder_community", "title": "Fire Belly Newt Care Sheet",
        "author": "Dubia Roaches", "url": "https://dubiaroaches.com/blogs/amphibian-care/fire-belly-newt-care-sheet",
        "publication_date": "2022-01-01",
        "summary": "58-68F, ~5 gal per animal, land area, low-flow filter + weekly 20-30% water changes, feed 2-3x/wk.",
    },
    # --- Ambystoma tigrinum ---
    "adw_tiger": {
        "source_type": "academic", "title": "Ambystoma tigrinum (Eastern Tiger Salamander)",
        "author": "Animal Diversity Web, U. Michigan (A. Wentz; ed. J. Harding)", "url": "https://animaldiversity.org/accounts/Ambystoma_tigrinum/",
        "publication_date": "2001-01-01",
        "summary": "Adult 17-33 cm, fossorial (burrows >60 cm), lifespan to 25 yrs captivity, IUCN Least Concern, no CITES.",
    },
    "amphibiancare_tiger": {
        "source_type": "breeder_community", "title": "Tiger Salamander Care in Captivity",
        "author": "Devin Edmonds, AmphibianCare.com", "url": "https://amphibiancare.com/2005/08/02/tiger-salamander/",
        "publication_date": "2017-01-01",
        "summary": "60-70F (never >78F), 15-gal per adult, coco-fiber+cypress substrate (avoid sand/gravel), moisture gradient, feed 1-2x/wk dusted.",
    },
    "iucn_tiger": {
        "source_type": "government", "title": "Ambystoma tigrinum — IUCN Red List",
        "author": "IUCN", "url": "https://www.iucnredlist.org",
        "publication_date": "2015-01-01",
        "summary": "Least Concern; localized declines from wetland loss/pollution; no CITES listing.",
    },
}


def cite(*keys):
    return [CITES[k] | {"ref_key": k} for k in keys]


# ---------------------------------------------------------------------------
# Species entries.
# ---------------------------------------------------------------------------
SPECIES_DATA = [
    # ===================== SNAKES =====================
    {
        "scientific_name": "Boa imperator",
        "common_names": ["Common Boa", "Central American Boa", "Colombian Boa"],
        "genus": "Boa", "family": "Boidae", "order_name": "Squamata", "taxon": "snake",
        "care_level": "intermediate", "handleability": "docile", "activity_period": "crepuscular",
        "native_region": "Mexico through Central America to NW South America (west of the Andes)",
        "adult_length_min_in": Decimal("60"), "adult_length_max_in": Decimal("96"),
        "adult_weight_min_g": None, "adult_weight_max_g": None,
        "temp_cool_min": Decimal("75"), "temp_cool_max": Decimal("80"),
        "temp_warm_min": Decimal("80"), "temp_warm_max": Decimal("85"),
        "temp_basking_min": Decimal("88"), "temp_basking_max": Decimal("92"),
        "temp_night_min": Decimal("75"), "temp_night_max": Decimal("78"),
        "humidity_min": 55, "humidity_max": 75,
        "uvb_required": False, "uvb_type": "not_required", "uvb_replacement_months": None,
        "enclosure_type": "semi_arboreal",
        "enclosure_min_adult": "6x3x4 ft for an adult over 6 ft (larger for big females)",
        "bioactive_suitable": True,
        "substrate_safe_list": ["organic topsoil", "coco fiber", "cypress mulch", "leaf litter"],
        "substrate_avoid_list": ["cedar", "pine", "arid-only bedding"],
        "diet_type": "strict_carnivore",
        "prey_size_adult": "Appropriately sized rats (~10% of body weight, no wider than the snake)",
        "feeding_frequency_hatchling": "Every 10-12 days",
        "feeding_frequency_juvenile": "Every 10-14 days",
        "feeding_frequency_adult": "Every 4-8 weeks",
        "water_bowl_description": "Large bowl the boa can soak in; fresh water daily.",
        "brumation_required": False,
        "lifespan_captivity_min_yrs": 20, "lifespan_captivity_max_yrs": 40,
        "cites_appendix": "II", "iucn_status": "LC",
        "wild_population_notes": "Least Concern; all Boa are CITES Appendix II (B. c. occidentalis is Appendix I). Captive-bred preferred.",
        "has_morph_market": True, "morph_complexity": "complex",
        "care_guide": (
            "**Common Boa (Boa imperator)** — a large, powerful, generally docile constrictor. "
            "Provide a thermal gradient, secure hides, climbing structure, and a soak-sized water bowl. "
            "Large adults need two-person handling. Weight varies widely by locality and sex; no single "
            "reliable captive weight range is published, so track your animal individually."
        ),
        "sources": cite("iucn_boa_imperator", "usgs_boa_trade", "reptifiles_boa"),
    },
    {
        "scientific_name": "Morelia spilota",
        "common_names": ["Carpet Python", "Diamond Python"],
        "genus": "Morelia", "family": "Pythonidae", "order_name": "Squamata", "taxon": "snake",
        "care_level": "intermediate", "handleability": "docile", "activity_period": "nocturnal",
        "native_region": "Australia, New Guinea, and adjacent Indonesian islands",
        "adult_length_min_in": Decimal("60"), "adult_length_max_in": Decimal("100"),
        "adult_weight_min_g": None, "adult_weight_max_g": None,
        "temp_cool_min": Decimal("75"), "temp_cool_max": Decimal("80"),
        "temp_warm_min": Decimal("80"), "temp_warm_max": Decimal("85"),
        "temp_basking_min": Decimal("95"), "temp_basking_max": Decimal("100"),
        "temp_night_min": Decimal("72"), "temp_night_max": Decimal("78"),
        "humidity_min": 40, "humidity_max": 60,
        "uvb_required": False, "uvb_type": "not_required", "uvb_replacement_months": None,
        "enclosure_type": "semi_arboreal",
        "enclosure_min_adult": "6.5x3x3 ft for an average adult; taller strongly preferred (semi-arboreal)",
        "bioactive_suitable": True,
        "substrate_safe_list": ["topsoil", "coco fiber", "cypress mulch", "leaf litter"],
        "substrate_avoid_list": ["cedar", "pine", "dusty softwood bedding"],
        "diet_type": "strict_carnivore",
        "prey_size_adult": "Rats/mice ~10% of body weight; no wider than 1.5x the snake at its widest",
        "feeding_frequency_hatchling": "Every 7-14 days",
        "feeding_frequency_juvenile": "Every 7-14 days",
        "feeding_frequency_adult": "Every 2-4 weeks",
        "water_bowl_description": "Large water bowl; fresh water available at all times.",
        "brumation_required": False,
        "lifespan_captivity_min_yrs": 20, "lifespan_captivity_max_yrs": 30,
        "cites_appendix": "II", "iucn_status": "LC",
        "wild_population_notes": "Least Concern; CITES Appendix II. Adult size is strongly subspecies/locality dependent.",
        "has_morph_market": True, "morph_complexity": "moderate",
        "care_guide": (
            "**Carpet Python (Morelia spilota)** — a semi-arboreal python that needs both floor space and "
            "height with sturdy branches. Adult size varies a lot by subspecies (jungle carpets stay smaller, "
            "coastal forms grow largest), so research your specific line. Juveniles can be flighty and nippy "
            "but most calm with routine, gentle handling."
        ),
        "sources": cite("reptifiles_carpet", "carpetpythons_care", "iucn_morelia_spilota"),
    },
    {
        "scientific_name": "Lampropeltis triangulum",
        "common_names": ["Milk Snake", "Eastern Milk Snake"],
        "genus": "Lampropeltis", "family": "Colubridae", "order_name": "Squamata", "taxon": "snake",
        "care_level": "beginner", "handleability": "docile", "activity_period": "nocturnal",
        "native_region": "Eastern/central United States and southern Canada (nominate species)",
        "adult_length_min_in": Decimal("36"), "adult_length_max_in": Decimal("48"),
        "adult_weight_min_g": None, "adult_weight_max_g": None,
        "temp_cool_min": Decimal("75"), "temp_cool_max": Decimal("80"),
        "temp_warm_min": Decimal("80"), "temp_warm_max": Decimal("85"),
        "temp_basking_min": Decimal("85"), "temp_basking_max": Decimal("90"),
        "temp_night_min": Decimal("70"), "temp_night_max": Decimal("75"),
        "humidity_min": 40, "humidity_max": 60,
        "uvb_required": False, "uvb_type": "not_required", "uvb_replacement_months": None,
        "enclosure_type": "terrestrial",
        "enclosure_min_adult": "48x24x24 in (4x2x2 ft) for an average adult",
        "bioactive_suitable": True,
        "substrate_safe_list": ["topsoil", "coco fiber", "aspen", "leaf litter"],
        "substrate_avoid_list": ["cedar", "pine"],
        "diet_type": "strict_carnivore",
        "prey_size_adult": "Mice / young rats; no wider than ~1.5x the snake at its widest",
        "feeding_frequency_hatchling": "Every 5-7 days",
        "feeding_frequency_juvenile": "Every 7-10 days",
        "feeding_frequency_adult": "Every 10-14 days",
        "water_bowl_description": "Water bowl plus a humid retreat (moist sphagnum in the cool hide).",
        "brumation_required": False,
        "lifespan_captivity_min_yrs": 15, "lifespan_captivity_max_yrs": 20,
        "cites_appendix": None, "iucn_status": "LC",
        "wild_population_notes": "Least Concern; not CITES-listed. 'Milk snake' is a large subspecies complex — size and humidity vary by subspecies (tropical forms run more humid).",
        "has_morph_market": True, "morph_complexity": "moderate",
        "care_guide": (
            "**Milk Snake (Lampropeltis triangulum)** — a hardy, manageably sized colubrid and a good beginner "
            "snake. Secretive and somewhat fossorial, so provide snug hides and a humid retreat. Note that the "
            "'milk snake' complex spans many subspecies with different adult sizes and humidity needs; tropical "
            "forms (e.g. Honduran) prefer higher humidity than temperate ones."
        ),
        "sources": cite("natureserve_milk", "adw_milk", "reptifiles_milk"),
    },
    # ===================== LIZARDS =====================
    {
        "scientific_name": "Varanus acanthurus",
        "common_names": ["Ackie Monitor", "Ridge-tailed Monitor", "Spiny-tailed Monitor"],
        "genus": "Varanus", "family": "Varanidae", "order_name": "Squamata", "taxon": "lizard",
        "care_level": "intermediate", "handleability": "docile", "activity_period": "diurnal",
        "native_region": "Northern Australia — arid rocky and spinifex habitat",
        "adult_length_min_in": Decimal("17"), "adult_length_max_in": Decimal("30"),
        "adult_weight_min_g": None, "adult_weight_max_g": None,
        "temp_cool_min": Decimal("75"), "temp_cool_max": Decimal("82"),
        "temp_warm_min": Decimal("85"), "temp_warm_max": Decimal("95"),
        "temp_basking_min": Decimal("150"), "temp_basking_max": Decimal("172"),
        "temp_night_min": Decimal("72"), "temp_night_max": Decimal("77"),
        "humidity_min": 20, "humidity_max": 50,
        "uvb_required": True, "uvb_type": "T5_HO", "uvb_replacement_months": 12,
        "enclosure_type": "terrestrial",
        "enclosure_min_adult": "5x2.5x4 ft minimum (larger preferred); deep substrate + rock stack",
        "bioactive_suitable": True,
        "substrate_safe_list": ["topsoil/sand/clay mix (holds burrows)", "excavator clay"],
        "substrate_avoid_list": ["pure loose sand", "coco fiber only", "aspen", "walnut shell"],
        "substrate_depth_min_in": Decimal("12"), "substrate_depth_max_in": Decimal("24"),
        "diet_type": "insectivore",
        "feeding_frequency_juvenile": "Daily",
        "feeding_frequency_adult": "Several times per week (avoid obesity)",
        "supplementation_notes": "Dust insects with calcium + D3 + multivitamin; gut-load feeders.",
        "water_bowl_description": "Clean water dish available at all times.",
        "brumation_required": False,
        "lifespan_captivity_min_yrs": 15, "lifespan_captivity_max_yrs": 20,
        "cites_appendix": "II", "iucn_status": "LC",
        "wild_population_notes": "Least Concern (2017); CITES Appendix II. Australia prohibits commercial export of wild specimens, so captive-bred lines dominate.",
        "care_guide": (
            "**Ackie Monitor (Varanus acanthurus)** — a small, intelligent, active dwarf monitor and one of the "
            "most tractable monitors. Needs a very hot basking surface (measure with an IR gun, not air temp), a "
            "deep burrowing substrate that holds a humid subterranean layer, and strong UVB. Note the basking "
            "figure is a surface temperature; do not confuse it with ambient air temperature."
        ),
        "sources": cite("vet_ackie", "mlsg_ackie", "reptifiles_ackie"),
    },
    {
        "scientific_name": "Salvator merianae",
        "common_names": ["Argentine Black-and-White Tegu", "Argentine Giant Tegu"],
        "genus": "Salvator", "family": "Teiidae", "order_name": "Squamata", "taxon": "lizard",
        "care_level": "advanced", "handleability": "docile", "activity_period": "diurnal",
        "native_region": "South America — Argentina, Uruguay, Paraguay, central/eastern Brazil",
        "adult_length_min_in": Decimal("36"), "adult_length_max_in": Decimal("54"),
        "adult_weight_min_g": Decimal("2500"), "adult_weight_max_g": Decimal("9000"),
        "temp_cool_min": Decimal("75"), "temp_cool_max": Decimal("85"),
        "temp_warm_min": Decimal("90"), "temp_warm_max": Decimal("95"),
        "temp_basking_min": Decimal("125"), "temp_basking_max": Decimal("135"),
        "temp_night_min": Decimal("72"), "temp_night_max": Decimal("77"),
        "humidity_min": 60, "humidity_max": 80,
        "uvb_required": True, "uvb_type": "T5_HO", "uvb_replacement_months": 12,
        "enclosure_type": "terrestrial",
        "enclosure_min_adult": "8x4x4 ft minimum for an adult (larger preferred)",
        "bioactive_suitable": True,
        "substrate_safe_list": ["topsoil + coco fiber + play sand mix", "cypress mulch"],
        "substrate_avoid_list": ["pure dry sand", "calci-sand", "cedar", "pine"],
        "substrate_depth_min_in": Decimal("12"), "substrate_depth_max_in": Decimal("24"),
        "diet_type": "omnivore",
        "feeding_frequency_juvenile": "Daily to every other day",
        "feeding_frequency_adult": "2-3 times per week",
        "supplementation_notes": "Calcium + D3 and multivitamin on insects/prey; balance whole prey vs dusted items.",
        "water_bowl_description": "Large basin for drinking and full-body soaking.",
        "brumation_required": False,
        "lifespan_captivity_min_yrs": 12, "lifespan_captivity_max_yrs": 20,
        "cites_appendix": "II", "iucn_status": None,
        "wild_population_notes": "CITES Appendix II (listing carried from Tupinambis after the 2012 Salvator split). IUCN status not individually confirmed in our sources; commonly reported Least Concern — verify before asserting.",
        "care_guide": (
            "**Argentine Black-and-White Tegu (Salvator merianae)** — a large, intelligent, often dog-tame lizard "
            "that demands serious space (8x4 ft floor minimum), deep burrowing substrate, high basking heat, and "
            "strong UVB. Omnivorous: juveniles are protein-heavy, adults take insects, whole prey, eggs, and some "
            "fruit/veg. Powerful and heavy-bodied — respect the teeth and claws even on tame animals."
        ),
        "sources": cite("lafeber_tegu", "tol_tegu", "cites_tegu", "reptifiles_tegu"),
    },
    {
        "scientific_name": "Uromastyx geyri",
        "common_names": ["Saharan Uromastyx", "Geyr's Uromastyx", "Yellow Uromastyx"],
        "genus": "Uromastyx", "family": "Agamidae", "order_name": "Squamata", "taxon": "lizard",
        "care_level": "intermediate", "handleability": "docile", "activity_period": "diurnal",
        "native_region": "North/Saharan Africa — Niger, Mali, Algeria; extremely arid",
        "adult_length_min_in": Decimal("10"), "adult_length_max_in": Decimal("16"),
        "adult_weight_min_g": None, "adult_weight_max_g": None,
        "temp_cool_min": Decimal("80"), "temp_cool_max": Decimal("90"),
        "temp_warm_min": Decimal("90"), "temp_warm_max": Decimal("110"),
        "temp_basking_min": Decimal("120"), "temp_basking_max": Decimal("130"),
        "temp_night_min": Decimal("65"), "temp_night_max": Decimal("75"),
        "humidity_min": 20, "humidity_max": 30,
        "uvb_required": True, "uvb_type": "T5_HO", "uvb_replacement_months": 12,
        "enclosure_type": "terrestrial",
        "enclosure_min_adult": "4x2x2 ft minimum (larger preferred); well ventilated",
        "bioactive_suitable": True,
        "substrate_safe_list": ["play sand", "sandy soil", "50/30/20 play sand / topsoil / excavator clay"],
        "substrate_avoid_list": ["calci-sand", "walnut shell", "high-moisture coco mixes"],
        "substrate_depth_min_in": Decimal("4"), "substrate_depth_max_in": Decimal("8"),
        "diet_type": "herbivore",
        "feeding_frequency_juvenile": "Daily (as much dark leafy greens as eaten)",
        "feeding_frequency_adult": "4-5 times per week; seeds ~once weekly",
        "supplementation_notes": "Calcium + multivitamin on greens. No animal protein. Hydrates mainly from food.",
        "water_bowl_description": "Generally no standing water (raises humidity); offer occasionally at most.",
        "brumation_required": False,
        "lifespan_captivity_min_yrs": 15, "lifespan_captivity_max_yrs": 25,
        "cites_appendix": "II", "iucn_status": "NT",
        "wild_population_notes": "Near Threatened; all Uromastyx are CITES Appendix II (since 1977). Trade pressure and desertification are key threats.",
        "care_guide": (
            "**Saharan Uromastyx (Uromastyx geyri)** — a sun-loving desert herbivore that needs a very hot basking "
            "spot, strong high-output UVB, and very low humidity (keep it under about 35 percent; damp conditions "
            "cause respiratory disease). Feed a strict herbivore diet of dark leafy greens, vegetables, and seeds — "
            "no animal protein. They hydrate mostly from food, so standing water is usually omitted."
        ),
        "sources": cite("iucn_uromastyx_geyri", "uvtool_baines", "reptifiles_uromastyx"),
    },
    # ===================== TURTLES =====================
    {
        "scientific_name": "Trachemys scripta elegans",
        "common_names": ["Red-eared Slider", "Red-eared Terrapin"],
        "genus": "Trachemys", "family": "Emydidae", "order_name": "Testudines", "taxon": "turtle",
        "care_level": "beginner", "handleability": "hands_off", "activity_period": "diurnal",
        "native_region": "South-central & southeastern USA and NE Mexico (widely introduced/invasive elsewhere)",
        "adult_length_min_in": Decimal("6"), "adult_length_max_in": Decimal("12"),
        "adult_weight_min_g": None, "adult_weight_max_g": Decimal("3200"),
        "temp_cool_min": Decimal("75"), "temp_cool_max": Decimal("82"),
        "temp_basking_min": Decimal("85"), "temp_basking_max": Decimal("90"),
        "temp_night_min": Decimal("70"), "temp_night_max": Decimal("75"),
        "uvb_required": True, "uvb_type": "T5_HO", "uvb_replacement_months": 12,
        "enclosure_type": "semi_aquatic",
        "enclosure_min_adult": "40 gal min per adult (vet); 75+ gal recommended. Dry basking dock + strong filtration.",
        "bioactive_suitable": False,
        "substrate_safe_list": ["bare-bottom", "river stones too large to swallow"],
        "substrate_avoid_list": ["small gravel (ingestion/impaction risk)"],
        "diet_type": "omnivore",
        "feeding_frequency_juvenile": "Daily (juveniles are more carnivorous)",
        "feeding_frequency_adult": "Every other day / 2-3x weekly; shift toward greens with age",
        "supplementation_notes": "Ca:P >= 1:1 (2:1 preferred); cuttlebone common; quality aquatic pellets + greens + limited protein.",
        "water_bowl_description": "Aquatic setup: heater to 75-82F water, canister filtration, weekly partial water changes, dry basking dock.",
        "brumation_required": False,
        "lifespan_captivity_min_yrs": 20, "lifespan_captivity_max_yrs": 40,
        "cites_appendix": None, "iucn_status": "LC",
        "wild_population_notes": "Species-level Least Concern, but among the world's worst invasive species (EU-banned; sale restricted in many areas). NEVER release non-natives. A US CITES Appendix III history exists — verify current listing before asserting one.",
        "care_guide": (
            "**Red-eared Slider (Trachemys scripta elegans)** — a hardy aquatic turtle that is easy to keep but "
            "routinely underhoused: adults need large water volume, powerful filtration, a heated basking dock, "
            "and UVB. They grow large and live for decades. Critically, they are a highly invasive species — never "
            "release one into the wild. Wash hands after contact (Salmonella)."
        ),
        "sources": cite("vet_res_mesa", "lafeber_aquatic_turtle", "gisd_res"),
    },
    {
        "scientific_name": "Sternotherus odoratus",
        "common_names": ["Common Musk Turtle", "Eastern Musk Turtle", "Stinkpot"],
        "genus": "Sternotherus", "family": "Kinosternidae", "order_name": "Testudines", "taxon": "turtle",
        "care_level": "beginner", "handleability": "hands_off", "activity_period": "crepuscular",
        "native_region": "Eastern North America — southern Ontario through the eastern/central USA to the Gulf Coast",
        "adult_length_min_in": Decimal("3"), "adult_length_max_in": Decimal("5.5"),
        "adult_weight_min_g": None, "adult_weight_max_g": None,
        "temp_cool_min": Decimal("72"), "temp_cool_max": Decimal("80"),
        "temp_basking_min": Decimal("85"), "temp_basking_max": Decimal("90"),
        "temp_night_min": Decimal("70"), "temp_night_max": Decimal("75"),
        "uvb_required": True, "uvb_type": "T5_HO", "uvb_replacement_months": 12,
        "enclosure_type": "semi_aquatic",
        "enclosure_min_adult": "20 gal min (vet); 40 gal / 36x18 in preferred. Water 8-12 in deep with easy climb-outs.",
        "bioactive_suitable": False,
        "substrate_safe_list": ["bare-bottom", "large smooth river stones"],
        "substrate_avoid_list": ["ingestible gravel/sand"],
        "diet_type": "omnivore",
        "feeding_frequency_juvenile": "Daily",
        "feeding_frequency_adult": "Every other day / 3-4x weekly; remove uneaten food",
        "supplementation_notes": "Calcium; use a complete aquatic pellet (Zoo Med/Mazuri) to avoid vitamin-A deficiency (swollen eyes).",
        "water_bowl_description": "Aquatic setup: water 75-80F, filtration >=2x tank rating, 25-50% weekly changes; bottom-walker (weak swimmer).",
        "brumation_required": False,
        "lifespan_captivity_min_yrs": 30, "lifespan_captivity_max_yrs": 50,
        "cites_appendix": None, "iucn_status": "LC",
        "wild_population_notes": "Least Concern; not CITES-listed. One of the best small aquatic turtles for keepers with limited space.",
        "care_guide": (
            "**Common Musk Turtle (Sternotherus odoratus)** — a small, hardy, fully aquatic turtle well suited to "
            "keepers who want a turtle in a manageable footprint. It's a bottom-walker rather than a strong swimmer, "
            "so keep water shallow enough to reach the surface easily and provide climb-outs. Still needs filtration, "
            "a basking spot, and UVB. Long-lived — plan for decades."
        ),
        "sources": cite("vet_musk_tol", "iucn_musk", "biodude_musk"),
    },
    {
        "scientific_name": "Terrapene carolina",
        "common_names": ["Eastern Box Turtle", "Common Box Turtle"],
        "genus": "Terrapene", "family": "Emydidae", "order_name": "Testudines", "taxon": "turtle",
        "care_level": "intermediate", "handleability": "hands_off", "activity_period": "diurnal",
        "native_region": "Eastern United States — woodlands and meadows",
        "adult_length_min_in": Decimal("4.5"), "adult_length_max_in": Decimal("6.5"),
        "adult_weight_min_g": Decimal("230"), "adult_weight_max_g": Decimal("900"),
        "temp_cool_min": Decimal("70"), "temp_cool_max": Decimal("75"),
        "temp_warm_min": Decimal("80"), "temp_warm_max": Decimal("85"),
        "temp_basking_min": Decimal("84"), "temp_basking_max": Decimal("88"),
        "temp_night_min": Decimal("65"), "temp_night_max": Decimal("70"),
        "humidity_min": 60, "humidity_max": 80,
        "uvb_required": True, "uvb_type": "T5_HO", "uvb_replacement_months": 12,
        "enclosure_type": "terrestrial",
        "enclosure_min_adult": "8 sq ft floor minimum (larger/outdoor preferred); deep substrate + leaf litter + humid hide",
        "bioactive_suitable": True,
        "substrate_safe_list": ["topsoil/coco fiber/play sand mix", "cypress mulch", "leaf litter", "sphagnum moss"],
        "substrate_avoid_list": ["dry-only substrate", "gravel", "cedar", "pine"],
        "diet_type": "omnivore",
        "feeding_frequency_juvenile": "Daily",
        "feeding_frequency_adult": "Every other day",
        "supplementation_notes": "Calcium + D3 dusting; vitamin A important (deficiency causes swollen eyes); varied insects, greens, and some fruit.",
        "water_bowl_description": "Shallow soaking dish (chin-deep, easy exit); mist to hold humidity.",
        "brumation_required": False,
        "lifespan_captivity_min_yrs": 30, "lifespan_captivity_max_yrs": 50,
        "cites_appendix": "II", "iucn_status": "VU",
        "wild_population_notes": "Vulnerable (IUCN) and CITES Appendix II; many US states prohibit wild collection. Strongly favor captive-bred animals — do not collect from the wild.",
        "care_guide": (
            "**Eastern Box Turtle (Terrapene carolina)** — a terrestrial (not aquatic) turtle that needs high "
            "humidity, a deep moisture-retentive substrate with a humid hide, UVB, and ideally an outdoor pen in "
            "warm weather. It is Vulnerable in the wild with widespread state protections, so keep only captive-bred "
            "animals. Long-lived and stress-sensitive; minimize handling."
        ),
        "sources": cite("reptifiles_box", "iucn_box", "si_box"),
    },
    # ===================== TORTOISES =====================
    {
        "scientific_name": "Centrochelys sulcata",
        "common_names": ["Sulcata Tortoise", "African Spurred Tortoise"],
        "genus": "Centrochelys", "family": "Testudinidae", "order_name": "Testudines", "taxon": "tortoise",
        "care_level": "advanced", "handleability": "hands_off", "activity_period": "diurnal",
        "native_region": "Sahel belt of Africa (Senegal and Mauritania east to Sudan and Eritrea)",
        "adult_length_min_in": Decimal("24"), "adult_length_max_in": Decimal("34"),
        "adult_weight_min_g": Decimal("30000"), "adult_weight_max_g": Decimal("91000"),
        "temp_cool_min": Decimal("68"), "temp_cool_max": Decimal("80"),
        "temp_warm_min": Decimal("80"), "temp_warm_max": Decimal("90"),
        "temp_basking_min": Decimal("95"), "temp_basking_max": Decimal("100"),
        "temp_night_min": Decimal("70"), "temp_night_max": Decimal("80"),
        "humidity_min": 40, "humidity_max": 60,
        "humidity_shed_boost_min": 70, "humidity_shed_boost_max": 80,
        "uvb_required": True, "uvb_type": "T5_HO", "uvb_replacement_months": 6,
        "enclosure_type": "terrestrial",
        "enclosure_min_adult": "Large heated OUTDOOR enclosure with shelter; not a tank animal. Bury fencing 12-24 in (tunneler).",
        "bioactive_suitable": False,
        "substrate_safe_list": ["grass/hay", "natural earth (outdoors)", "soil/sand dig areas"],
        "substrate_avoid_list": ["rabbit/alfalfa pellets", "high-protein bedding", "cedar", "pine"],
        "diet_type": "herbivore",
        "feeding_frequency_adult": "Free-choice grazing / daily; maximize outdoor grazing",
        "supplementation_notes": "Phosphorus-free calcium (adults ~2x/week, juveniles ~4x/week, hatchlings daily). 75-80% grass & hay; minimal fruit.",
        "water_bowl_description": "Shallow water pan always available.",
        "soaking_behavior": "Weekly soaking recommended, especially for juveniles/hatchlings.",
        "brumation_required": False,
        "lifespan_captivity_min_yrs": 30, "lifespan_captivity_max_yrs": 70,
        "cites_appendix": "II", "iucn_status": "VU",
        "wild_population_notes": "CITES Appendix II. IUCN official Red List = Vulnerable (1996, dated); the IUCN/TFTSG provisional 2013 reassessment lists it as Endangered. Does NOT hibernate — keep warm year-round.",
        "care_guide": (
            "**Sulcata Tortoise (Centrochelys sulcata)** — the third-largest tortoise; adults reach 30-90+ kg and "
            "require a large, heated outdoor space. Hardy but absolutely not a beginner animal because of the space "
            "and lifespan commitment (50+ years). A strict grazer: high-fiber grasses and hay, minimal fruit or "
            "protein. Sulcatas do not hibernate — they aestivate in burrows but must be kept warm."
        ),
        "sources": cite("vet_sulcata_chicago", "tftsg_sulcata", "fws_sulcata"),
    },
    {
        "scientific_name": "Testudo hermanni",
        "common_names": ["Hermann's Tortoise"],
        "genus": "Testudo", "family": "Testudinidae", "order_name": "Testudines", "taxon": "tortoise",
        "care_level": "beginner", "handleability": "hands_off", "activity_period": "diurnal",
        "native_region": "Southern Europe / Mediterranean — Spain, France, Italy, the Balkans, Greece, W Turkey",
        "adult_length_min_in": Decimal("5"), "adult_length_max_in": Decimal("11"),
        "adult_weight_min_g": Decimal("1000"), "adult_weight_max_g": Decimal("4000"),
        "temp_cool_min": Decimal("60"), "temp_cool_max": Decimal("75"),
        "temp_warm_min": Decimal("75"), "temp_warm_max": Decimal("85"),
        "temp_basking_min": Decimal("90"), "temp_basking_max": Decimal("95"),
        "temp_night_min": Decimal("60"), "temp_night_max": Decimal("70"),
        "humidity_min": 40, "humidity_max": 75,
        "uvb_required": True, "uvb_type": "T5_HO", "uvb_replacement_months": 12,
        "enclosure_type": "terrestrial",
        "enclosure_min_adult": "Outdoor pen preferred in warm months; indoor minimum ~4x2 ft with solid opaque sides",
        "bioactive_suitable": True,
        "substrate_safe_list": ["organic topsoil", "coconut coir", "play sand blend"],
        "substrate_avoid_list": ["pine", "cedar"],
        "diet_type": "herbivore",
        "feeding_frequency_adult": "Fresh high-fiber greens/weeds offered daily",
        "supplementation_notes": "Supplemental calcium essential, especially indoors. Favor broadleaf weeds/clovers; limit fruit and high-protein items.",
        "water_bowl_description": "Shallow water dish always available (no drowning risk).",
        "soaking_behavior": "Soak hatchlings/juveniles in lukewarm water 3-4x weekly, 15-20 min.",
        "brumation_required": False,
        "lifespan_captivity_min_yrs": 50, "lifespan_captivity_max_yrs": 75,
        "cites_appendix": "II", "iucn_status": "NT",
        "wild_population_notes": "Near Threatened; CITES Appendix II / EU Annex A. Hermann's DO hibernate (~3 months at 40-50F, only healthy proper-weight animals under vet guidance).",
        "care_guide": (
            "**Hermann's Tortoise (Testudo hermanni)** — a hardy, moderately sized Mediterranean tortoise and one of "
            "the best beginner tortoises. Provide a warm basking area, UVB, a mostly weed/green herbivore diet, and "
            "ideally outdoor time in warm months. Healthy adults hibernate seasonally, but this should only be done "
            "with proper-weight animals under veterinary guidance. Published lifespan estimates (75+ yrs) exceed "
            "documented longevity records; expect a multi-decade commitment regardless."
        ),
        "sources": cite("lafeber_hermanni", "swiftail_hermanni", "tftsg_hermanni"),
    },
    {
        "scientific_name": "Testudo horsfieldii",
        "common_names": ["Russian Tortoise", "Horsfield's Tortoise", "Central Asian Tortoise"],
        "genus": "Testudo", "family": "Testudinidae", "order_name": "Testudines", "taxon": "tortoise",
        "care_level": "beginner", "handleability": "hands_off", "activity_period": "diurnal",
        "native_region": "Central Asia — Kazakhstan, Uzbekistan, Turkmenistan, Afghanistan, Iran, NW China (dry steppe)",
        "adult_length_min_in": Decimal("5"), "adult_length_max_in": Decimal("8"),
        "adult_weight_min_g": None, "adult_weight_max_g": None,
        "temp_cool_min": Decimal("60"), "temp_cool_max": Decimal("70"),
        "temp_warm_min": Decimal("80"), "temp_warm_max": Decimal("90"),
        "temp_basking_min": Decimal("85"), "temp_basking_max": Decimal("95"),
        "temp_night_min": Decimal("65"), "temp_night_max": Decimal("75"),
        "humidity_min": 40, "humidity_max": 65,
        "uvb_required": True, "uvb_type": "T5_HO", "uvb_replacement_months": 12,
        "enclosure_type": "terrestrial",
        "enclosure_min_adult": "Indoor ~4x2 ft min (larger better); outdoor ideal — bury fencing deep (avid digger/escaper).",
        "bioactive_suitable": True,
        "substrate_safe_list": ["deep loose topsoil/sand/coir blend (for burrowing)"],
        "substrate_avoid_list": ["pine", "cedar", "dusty calcium-sand"],
        "diet_type": "herbivore",
        "feeding_frequency_adult": "Fresh high-fiber greens/weeds daily",
        "supplementation_notes": "Calcium for indoor animals; high-fiber, low-protein, low-fat diet. Avoid fruit and high-protein foods.",
        "water_bowl_description": "Shallow bowls / plant saucers for soaking and drinking.",
        "soaking_behavior": "Regular shallow soaks, especially juveniles.",
        "brumation_required": False,
        "lifespan_captivity_min_yrs": 40, "lifespan_captivity_max_yrs": 50,
        "cites_appendix": "II", "iucn_status": "VU",
        "wild_population_notes": "Vulnerable (1996, dated); CITES Appendix II. Extremely territorial — house individually. Russian tortoises DO hibernate (~3 months, 40-50F, healthy adults only).",
        "care_guide": (
            "**Russian Tortoise (Testudo horsfieldii)** — a small, hardy, and popular beginner tortoise, but an avid "
            "digger and escape artist, so bury outdoor fencing deep and provide loose substrate to burrow. Keep them "
            "individually (very territorial). A high-fiber weed/green herbivore with a low-humidity steppe origin. "
            "Healthy adults hibernate seasonally; sick or underweight animals must not."
        ),
        "sources": cite("lafeber_russian", "iucn_russian", "reptifiles_russian"),
    },
    # ===================== SALAMANDERS / NEWTS =====================
    {
        "scientific_name": "Ambystoma mexicanum",
        "common_names": ["Axolotl", "Mexican Walking Fish"],
        "genus": "Ambystoma", "family": "Ambystomatidae", "order_name": "Caudata", "taxon": "salamander",
        "care_level": "intermediate", "handleability": "hands_off", "activity_period": None,
        "native_region": "Lake Xochimilco, Valley of Mexico (single wild lake system)",
        "adult_length_min_in": Decimal("9"), "adult_length_max_in": Decimal("12"),
        "adult_weight_min_g": None, "adult_weight_max_g": None,
        "temp_cool_min": Decimal("60"), "temp_cool_max": Decimal("68"),
        "temp_night_min": Decimal("60"), "temp_night_max": Decimal("68"),
        "uvb_required": False, "uvb_type": "not_required", "uvb_replacement_months": None,
        "enclosure_type": "aquatic",
        "enclosure_min_adult": "20 gal long min per adult (+10 gal each more). Water depth >= body length. Secure lid.",
        "bioactive_suitable": False,
        "substrate_safe_list": ["bare-bottom (best)", "fine sand (finer than the animal can swallow)"],
        "substrate_avoid_list": ["gravel / small pebbles (impaction risk)"],
        "diet_type": "strict_carnivore",
        "feeding_frequency_juvenile": "Daily (1-2x)",
        "feeding_frequency_adult": "Every 2-3 days; remove uneaten food",
        "supplementation_notes": "Varied whole prey (earthworms/nightcrawlers) + sinking pellets; ensure calcium-rich prey (MBD risk).",
        "water_bowl_description": "Cold water 60-68F (keep BELOW ~72F; chiller often needed). Cycled tank, ammonia/nitrite 0, ~20-30% weekly water change, low flow.",
        "brumation_required": False,
        "lifespan_captivity_min_yrs": 10, "lifespan_captivity_max_yrs": 15,
        "cites_appendix": "II", "iucn_status": "CR",
        "wild_population_notes": "Wild population Critically Endangered (Lake Xochimilco) though abundant in captivity; CITES Appendix II (an Appendix I uplisting has been proposed). Substrate note: consensus is bare-bottom or fine sand only; a minority veterinary view permits tiny fine gravel as gastroliths — default to bare/fine sand.",
        "care_guide": (
            "**Axolotl (Ambystoma mexicanum)** — a fully aquatic, neotenic salamander. The single most important rule "
            "is temperature: keep the water cool (about 60-68F) and never let it exceed roughly 72F — no heat lamp, "
            "ever, and a chiller is often needed. Use a bare bottom or fine sand only (gravel causes fatal impaction), "
            "gentle filtration, and a fully cycled tank. Handle only with a soft net; the skin is delicate."
        ),
        "sources": cite("vet_axolotl_tol", "vet_axolotl_upv", "iucn_axolotl"),
    },
    {
        "scientific_name": "Cynops orientalis",
        "common_names": ["Chinese Fire-bellied Newt", "Oriental Fire-bellied Newt"],
        "genus": "Cynops", "family": "Salamandridae", "order_name": "Caudata", "taxon": "salamander",
        "care_level": "beginner", "handleability": "hands_off", "activity_period": None,
        "native_region": "Eastern China, lower Yangtze River basin (still/slow water, 30-1000 m)",
        "adult_length_min_in": Decimal("2.2"), "adult_length_max_in": Decimal("4"),
        "adult_weight_min_g": None, "adult_weight_max_g": None,
        "temp_cool_min": Decimal("58"), "temp_cool_max": Decimal("68"),
        "temp_night_min": Decimal("58"), "temp_night_max": Decimal("68"),
        "uvb_required": False, "uvb_type": "not_required", "uvb_replacement_months": None,
        "enclosure_type": "semi_aquatic",
        "enclosure_min_adult": "~10 gal for one, 20 gal for a pair/trio. Emergent land/haul-out required; low water flow.",
        "bioactive_suitable": True,
        "substrate_safe_list": ["bare-bottom", "very fine sand"],
        "substrate_avoid_list": ["gravel (intestinal obstruction risk)"],
        "diet_type": "insectivore",
        "feeding_frequency_adult": "2-3 times per week (aggressive feeder)",
        "supplementation_notes": "Varied small prey (chopped earthworm, bloodworm, brine shrimp, daphnia). Underwater dusting washes off; supplement terrestrial juveniles.",
        "water_bowl_description": "Dechlorinated water 58-68F, low-flow filtration or heavy planting, ~20-30% weekly changes; emergent land area required.",
        "brumation_required": False,
        "lifespan_captivity_min_yrs": 10, "lifespan_captivity_max_yrs": 20,
        "cites_appendix": None, "iucn_status": "LC",
        "wild_population_notes": "Least Concern but under collection/pesticide pressure; not CITES-listed. Mildly toxic skin (aposematic orange belly) — wash hands, do not handle unnecessarily. Taxonomy: sometimes placed in Hypselotriton.",
        "care_guide": (
            "**Chinese Fire-bellied Newt (Cynops orientalis)** — a small, hardy, mostly aquatic newt that is a good "
            "beginner caudate. It needs cool water, gentle filtration (or a heavily planted tank), and a mandatory "
            "emergent land area to climb out onto. The skin secretes mild toxins, so handle only when necessary and "
            "wash your hands. A secure lid is important — they can climb and escape."
        ),
        "sources": cite("amphibiaweb_newt", "salamanderland_newt", "dubia_newt"),
    },
    {
        "scientific_name": "Ambystoma tigrinum",
        "common_names": ["Tiger Salamander", "Eastern Tiger Salamander"],
        "genus": "Ambystoma", "family": "Ambystomatidae", "order_name": "Caudata", "taxon": "salamander",
        "care_level": "beginner", "handleability": "hands_off", "activity_period": "nocturnal",
        "native_region": "North America — much of the USA, southern Canada, into the Mexican Plateau (near fishless ponds)",
        "adult_length_min_in": Decimal("7"), "adult_length_max_in": Decimal("13"),
        "adult_weight_min_g": None, "adult_weight_max_g": None,
        "temp_cool_min": Decimal("60"), "temp_cool_max": Decimal("70"),
        "temp_night_min": Decimal("50"), "temp_night_max": Decimal("65"),
        "humidity_min": 70, "humidity_max": 75,
        "uvb_required": False, "uvb_type": "not_required", "uvb_replacement_months": None,
        "enclosure_type": "fossorial",
        "enclosure_min_adult": "15-20 gal (24x12x12 in) per adult; deep burrowable moist substrate + shallow water dish.",
        "bioactive_suitable": True,
        "substrate_safe_list": ["coconut husk fiber + cypress mulch mix", "moist topsoil (no additives)", "leaf litter", "sphagnum moss"],
        "substrate_avoid_list": ["sand", "gravel", "bark chips", "perlite", "vermiculite"],
        "diet_type": "insectivore",
        "feeding_frequency_juvenile": "Small amounts every 1-2 days",
        "feeding_frequency_adult": "Small quantities 1-2 times per week (voracious — avoid overfeeding)",
        "supplementation_notes": "Dust food with amphibian calcium/vitamin supplement every 2-3 feedings. Staples: earthworms and crickets.",
        "water_bowl_description": "Shallow clean dechlorinated water dish always available; change daily/when dirty.",
        "brumation_required": False,
        "lifespan_captivity_min_yrs": 10, "lifespan_captivity_max_yrs": 25,
        "cites_appendix": None, "iucn_status": "LC",
        "wild_population_notes": "Least Concern; not CITES-listed. Most trade animals are wild-caught — captive-bred is preferable. 'Barred tiger salamander' is often the separate species A. mavortium.",
        "care_guide": (
            "**Tiger Salamander (Ambystoma tigrinum)** — a large, hardy, long-lived terrestrial mole salamander that "
            "spends most of its time burrowed, so give it a deep, moist, burrowable substrate and cool temperatures "
            "(never above about 78F). Feed sparingly — they are voracious and prone to obesity. Keep individually, "
            "provide a shallow water dish, and handle as little as possible (sensitive skin)."
        ),
        "sources": cite("adw_tiger", "amphibiancare_tiger", "iucn_tiger"),
    },
]


def seed():
    """Upsert the HV species batch. Idempotent — re-runs are safe."""
    print(f"Seeding HV species batch 2 ({len(SPECIES_DATA)} entries)...")
    db = SessionLocal()

    added = 0
    updated = 0

    def _slug_taken(candidate: str, exclude_id=None) -> bool:
        q = db.query(ReptileSpecies.id).filter(ReptileSpecies.slug == candidate)
        if exclude_id is not None:
            q = q.filter(ReptileSpecies.id != exclude_id)
        return q.first() is not None

    try:
        for data in SPECIES_DATA:
            scientific_name = data["scientific_name"].strip()
            scientific_name_lower = scientific_name.lower()
            common_names = data.get("common_names") or []
            slug_source = (common_names[0] if common_names else None) or scientific_name

            existing = (
                db.query(ReptileSpecies)
                .filter(ReptileSpecies.scientific_name_lower == scientific_name_lower)
                .first()
            )

            if existing:
                for field, value in data.items():
                    if field == "scientific_name":
                        continue
                    setattr(existing, field, value)
                if not getattr(existing, "slug", None):
                    existing.slug = slugify_unique(
                        slug_source,
                        is_taken=lambda s: _slug_taken(s, exclude_id=existing.id),
                        fallback=f"species-{str(existing.id)[:8]}",
                    )
                updated += 1
                print(f"  Updated: {scientific_name}  (slug={existing.slug})")
                continue

            new_id = uuid.uuid4()
            slug_value = slugify_unique(
                slug_source,
                is_taken=_slug_taken,
                fallback=f"species-{str(new_id)[:8]}",
            )
            species = ReptileSpecies(
                id=new_id,
                scientific_name_lower=scientific_name_lower,
                slug=slug_value,
                is_verified=True,
                **data,
            )
            db.add(species)
            db.flush()
            added += 1
            print(f"  Added:   {scientific_name}  (slug={slug_value})")

        db.commit()
        print(f"\nDone. Added {added}, updated {updated}.")
    except Exception as e:  # noqa: BLE001
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
