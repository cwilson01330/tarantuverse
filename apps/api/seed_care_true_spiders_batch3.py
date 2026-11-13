"""
Care guides - TRUE SPIDER batch 3 (jumping-spiders plan, Task 8).

Eight true spiders that keepers already have in their collections but the
catalog lacked. Candidates came from the plan; each was checked against the
live catalog (GET /api/v1/invert-species/search) on 2026-11-13:

  * Eresus balcanicus      - already in the catalog (seed_care_gap_batch_20261007), dropped
  * the other eight        - not in the catalog, seeded here

Names were checked against the World Spider Catalog through pages that cite
it (wsc.nmbe.ch itself could not be fetched): Spiders of Europe (araneae.nmbe.ch,
Natural History Museum Bern) for the European species, Wikipedia's WSC-cited
taxoboxes for the American and African ones. All eight names are current:

  * Platycryptus undatus (De Geer, 1778)
  * Maevia inclemens (Walckenaer, 1837)       - older names: M. vittata, Attus vittatus
  * Pelegrina proterva (Walckenaer, 1837)     - formerly in Metaphidippus (Maddison 1996)
  * Menemerus semilimbatus (Hahn, 1829)
  * Eresus ruficapillus C. L. Koch, 1846      - male not described; probably endemic to Sicily
  * Gandanameno echinata (Purcell, 1908)      - described as Eresus echinatus
  * Kukulcania arizonica Chamberlin & Ivie, 1935
  * Eratigena atrica (C. L. Koch, 1843)       - formerly Tegenaria atrica; E. duellica and
                                                E. saeva were split off again in 2018

HONESTY RULES (binding for this file)
  * Every filled field names its source in ``_sources`` (keys of SOURCES).
    tests/test_seed_true_spiders_batch3.py fails on a filled field without one.
  * A field no source states is left out of the row, so it is NULL. Where two
    species-specific sources disagree (Gandanameno humidity, water dish) the
    number is left NULL and the care guide says the sources disagree.
  * Nothing is borrowed from a related species. Where no care sheet exists
    (Platycryptus undatus, Pelegrina proterva, Kukulcania arizonica,
    Eratigena atrica) the row has
    natural history only and the guide says so.
  * The four flags the API returns as plain booleans (water_dish_required,
    communal_suitable, urticating_hairs, medically_significant_venom) take the
    column default False when no source speaks to them; they are set
    explicitly only when a source says so.
  * typical_instars_to_maturity: no source stated a molt count for any of
    these species, so it is NULL for all eight.
  * bantam.earth's care guides for Platycryptus undatus and Maevia inclemens
    were read and set aside: they contradict the museum and journal sources
    (groups living together, fruit as food, a water tray "pH", reaching adult
    size six weeks after hatching), so nothing here comes from them.

PHOTOS: none verified. Commons and the Wikipedia API could not be fetched from
this environment, so no licence was read off a file page. Candidates found by
search sit in docs/design/species_images_batch3.csv as ``license_pending``
(the upload and apply scripts skip them) until someone checks the licence.

Run (Render shell, from apps/api):
    python3 seed_care_true_spiders_batch3.py            # dry run: prints what it would add
    python3 seed_care_true_spiders_batch3.py --apply    # writes
Idempotent: matches on scientific_name_lower and never updates an existing row.
"""
import argparse
import os
import re
import sys
import uuid

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.models.invert_species import InvertSpecies


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower().strip()).strip("-")


# Every source read for this batch. Keys are cited per field in ``_sources``.
SOURCES = {
    # Platycryptus undatus
    # (ExoPetGuides' tan jumper page was dropped in fix round 1: it says it was
    # drafted with AI help, so it is not used for any field.)
    "wp_platycryptus": "https://en.wikipedia.org/wiki/Platycryptus_undatus",
    # Maevia inclemens
    "wp_maevia": "https://en.wikipedia.org/wiki/Maevia_inclemens",
    "clark_2002": "https://www.americanarachnology.org/journal-joa/joa-all-volumes/detail/article/download/arac-30-03-511.pdf",
    # Pelegrina proterva
    "wp_pelegrina": "https://en.wikipedia.org/wiki/Pelegrina_proterva",
    "tol_pelegrina": "https://tolweb.org/Pelegrina_proterva",
    # Menemerus semilimbatus
    "araneae_menemerus": "https://araneae.nmbe.ch/data/2297",
    "wp_menemerus": "https://en.wikipedia.org/wiki/Menemerus_semilimbatus",
    "bic_menemerus": "https://bugsincyberspace.com/product/half-edged-wall-jumping-spider/",
    # Eresus ruficapillus
    "araneae_eresus": "https://araneae.nmbe.ch/data/1694",
    "jf_eresus": "https://joshsfrogs.com/sp/italian-ladybird-spider---eresus-ruficapillus-1-18--1-4-inch-captive-bred--jferesruf",
    # Gandanameno echinata
    "wp_gandanameno": "https://en.wikipedia.org/wiki/Gandanameno",
    "il_gandanameno": "https://insektenliebe.com/en/shop/product/gandanameno-echinata/",
    "ar_gandanameno": "https://www.arachnidrarities.com/inventory/p/grandanameno-echinata",
    # Kukulcania arizonica
    "wp_kukulcania": "https://en.wikipedia.org/wiki/Kukulcania_arizonica",
    "bcc_kukulcania": "https://bugcagecompany.com/product/kukulcania-arizonica-arizona-black-hole-spider/",
    # Eratigena atrica
    "araneae_eratigena": "https://araneae.nmbe.ch/data/241?lang=en",
    "usasp_eratigena": "https://usaspiders.com/eratigena-atrica-giant-house-spider/",
}


SPECIES_DATA = [
    # ------------------------------------------------------------------
    # Platycryptus undatus - tan jumping spider (Salticidae)
    # ------------------------------------------------------------------
    dict(
        taxon="true_spider",
        scientific_name="Platycryptus undatus",
        common_names=["Tan Jumping Spider", "Familiar Jumping Spider"],
        genus="Platycryptus", family="Salticidae", order_name="Araneae",
        feeding_mode="predator",
        temperament="not inclined to bite; may give a defensive bite if pinched or squeezed",
        native_region="Eastern United States and adjacent Canada, west to Texas and Wisconsin",
        adult_size="female 10-13 mm, male 8.5-9.5 mm (body)",
        adult_length_min_mm=8.5, adult_length_max_mm=13,
        type="scansorial (tree trunks and walls)",
        care_guide=(
            "A mottled tan jumping spider with a thin, flat body and a chevron pattern on the "
            "abdomen, found from the eastern United States and nearby Canada west to Texas and "
            "Wisconsin. It hunts on upright surfaces such as tree trunks and the walls of "
            "buildings, and its flat body lets it hide under loose bark and in other tight gaps. "
            "Females are 10-13 mm long, males 8.5-9.5 mm. It is not inclined to bite, though it "
            "can give a defensive bite if pinched or squeezed. Eggs are laid and hatch in summer, "
            "and spiders of all ages spend the winter in their own silk shelters; up to about fifty "
            "have been found packed side by side under the loose bark of one tree, each in its own "
            "shelter. We found no care sheet written by a keeper, breeder or university for this "
            "species, so this guide gives no temperature, humidity, enclosure or feeding figures "
            "rather than guess them from other jumping spiders."
        ),
        source_url=SOURCES["wp_platycryptus"],
        _sources=dict(
            common_names="wp_platycryptus", genus="wp_platycryptus", family="wp_platycryptus",
            order_name="wp_platycryptus", feeding_mode="wp_platycryptus",
            temperament="wp_platycryptus",
            native_region="wp_platycryptus",
            adult_size="wp_platycryptus", adult_length_min_mm="wp_platycryptus",
            adult_length_max_mm="wp_platycryptus",
            type="wp_platycryptus",
            care_guide="wp_platycryptus",
        ),
    ),
    # ------------------------------------------------------------------
    # Maevia inclemens - dimorphic jumping spider (Salticidae)
    # ------------------------------------------------------------------
    dict(
        taxon="true_spider",
        scientific_name="Maevia inclemens",
        common_names=["Dimorphic Jumping Spider"],
        genus="Maevia", family="Salticidae", order_name="Araneae",
        feeding_mode="predator",
        native_region="Eastern and midwestern USA and southeastern Canada",
        adult_size="female 6.5-8 mm, male 4.75-6.5 mm (body)",
        adult_length_min_mm=4.75, adult_length_max_mm=8,
        type="arboreal (plants, fences, sheds)",
        enclosure_size_adult="round deli cup about 12 cm across and 4 cm tall (university lab)",
        prey_size="house crickets and fruit flies (university lab)",
        feeding_frequency_adult="weekly (university lab)",
        care_guide=(
            "A small, common jumping spider of the eastern United States and southeastern Canada, "
            "often found on plants, fences and outbuildings. The males come in two forms that look "
            "and court differently: a 'tufted' male, black with three tufts on the head and pale "
            "legs, and a 'gray' male, striped black and white with orange palps. Each is about half "
            "of all males and both mate equally well. Females are larger, with a light brown "
            "carapace, pale legs and a rusty or chalky abdomen. No hobby care sheet we could trust "
            "exists for this species. What we do know comes from a university study that kept "
            "wild-caught adults in round deli cups about 12 cm across and 4 cm tall, fed house "
            "crickets and fruit flies once a week, with water always available. In that study every "
            "mated female made an egg sac, and about 25 spiderlings left each sac. Females usually "
            "lunge at the male as mating ends, but actually eating him was rare (about 2-3% of "
            "courting males in earlier studies). No temperature or humidity figures are given "
            "here because no source we found states them for this species."
        ),
        source_url=SOURCES["clark_2002"],
        _sources=dict(
            common_names="wp_maevia", genus="wp_maevia", family="wp_maevia",
            order_name="wp_maevia", feeding_mode="clark_2002",
            native_region=["wp_maevia", "clark_2002"],
            adult_size="wp_maevia", adult_length_min_mm="wp_maevia", adult_length_max_mm="wp_maevia",
            type="wp_maevia",
            enclosure_size_adult="clark_2002", prey_size="clark_2002",
            feeding_frequency_adult="clark_2002",
            care_guide=["wp_maevia", "clark_2002"],
        ),
    ),
    # ------------------------------------------------------------------
    # Pelegrina proterva (Salticidae)
    # ------------------------------------------------------------------
    dict(
        taxon="true_spider",
        scientific_name="Pelegrina proterva",
        genus="Pelegrina", family="Salticidae", order_name="Araneae",
        feeding_mode="predator",
        native_region="Much of Canada and the eastern USA, south to Florida and Texas; reported west to British Columbia and Montana",
        adult_size="female 4.4-5.6 mm, male 3.3-4.2 mm (body)",
        adult_length_min_mm=3.3, adult_length_max_mm=5.6,
        type="arboreal (trees and shrubs)",
        care_guide=(
            "A very small jumping spider (3-6 mm) that lives on trees and shrubs in and near "
            "woodland across much of Canada and the eastern United States. Males have a strongly "
            "marked white face; it is easily confused with Pelegrina galathea, and the two were "
            "long filed under one name, so a confident ID needs a close look or an expert. It was "
            "moved from Metaphidippus to Pelegrina in 1996. We found no care sheet for this species, "
            "so this guide gives no temperature, humidity, enclosure or feeding figures rather than "
            "guess them from other jumping spiders."
        ),
        source_url=SOURCES["tol_pelegrina"],
        _sources=dict(
            genus="wp_pelegrina", family="wp_pelegrina", order_name="wp_pelegrina",
            feeding_mode="wp_pelegrina",
            native_region=["tol_pelegrina", "wp_pelegrina"],
            adult_size="wp_pelegrina", adult_length_min_mm="wp_pelegrina",
            adult_length_max_mm="wp_pelegrina",
            type="tol_pelegrina",
            care_guide=["tol_pelegrina", "wp_pelegrina"],
        ),
    ),
    # ------------------------------------------------------------------
    # Menemerus semilimbatus - half-edged wall jumping spider (Salticidae)
    # ------------------------------------------------------------------
    dict(
        taxon="true_spider",
        scientific_name="Menemerus semilimbatus",
        common_names=["Half-edged Wall Jumping Spider"],
        genus="Menemerus", family="Salticidae", order_name="Araneae",
        feeding_mode="predator",
        native_region="Canary Islands, the Mediterranean, eastern Europe, Turkey, the Caucasus and Iran; introduced to Argentina, Chile and the USA",
        adult_size="female 6.5-8.4 mm, male 5.1-7.4 mm (body)",
        adult_length_min_mm=5.1, adult_length_max_mm=8.4,
        type="scansorial (walls of buildings)",
        prey_size="D. hydei fruit flies for juveniles",
        care_guide=(
            "A flat, gray-haired jumping spider from the Mediterranean that lives in gardens and "
            "on and in houses, stalking prey on walls, and has been carried to the Americas. Both sexes have a "
            "white band along the sides of the carapace; the male's palps are boldly black and "
            "white. One US breeder raises juveniles on D. hydei fruit flies. Beyond that we found no "
            "care sheet for this species, so this guide gives no temperature, humidity or enclosure "
            "figures rather than borrow them from its relative Menemerus bivittatus."
        ),
        source_url=SOURCES["araneae_menemerus"],
        _sources=dict(
            common_names="bic_menemerus",
            genus="araneae_menemerus", family="araneae_menemerus", order_name="araneae_menemerus",
            feeding_mode="wp_menemerus",
            native_region="araneae_menemerus",
            adult_size="araneae_menemerus", adult_length_min_mm="araneae_menemerus",
            adult_length_max_mm="araneae_menemerus",
            type="wp_menemerus",
            prey_size="bic_menemerus",
            care_guide=["araneae_menemerus", "wp_menemerus", "bic_menemerus"],
        ),
    ),
    # ------------------------------------------------------------------
    # Eresus ruficapillus - Italian ladybird spider (Eresidae)
    # ------------------------------------------------------------------
    dict(
        taxon="true_spider",
        scientific_name="Eresus ruficapillus",
        common_names=["Italian Ladybird Spider"],
        genus="Eresus", family="Eresidae", order_name="Araneae",
        feeding_mode="predator",
        native_region="Sicily (Italy); Spiders of Europe lists it as probably found only there",
        adult_size="female body 21 mm; leg span up to 1.5 in",
        adult_length_max_mm=21,
        type="semi-arboreal",
        temperature_min=75, temperature_max=85,
        humidity_min=30, humidity_max=50,
        enclosure_size_adult="floor at least 2x by 3x the leg span; no more than 2x leg span above the substrate",
        substrate_depth="1 in for slings, 2 in or more for adults",
        substrate_type="soil-based mix kept mostly dry; cork bark, wood and plants to climb and hide behind",
        prey_size="1/2 in crickets cut in half for young spiders",
        feeding_frequency_juvenile="once a week",
        communal_suitable=False,
        care_guide=(
            "A small velvet spider sold in the hobby as the Italian ladybird spider. Spiders of "
            "Europe (Natural History Museum Bern) lists it as probably found only on Sicily and "
            "describes only the female, about 21 mm long, with a light brown front half covered in "
            "orange hairs, dark red-brown legs and a black abdomen. The male is listed as unknown, "
            "so the red, "
            "black-spotted males seen in captive-bred lines have not been formally described. Care "
            "below is from a US breeder that raises it. Keep it arid: 30-50% humidity with the "
            "substrate mostly dry, and lightly spritz the sides and decor about twice a week so it "
            "can drink droplets, never spraying the spider itself. 75-85°F suits it; avoid below "
            "65°F or above 90°F. It is semi-arboreal but poor at climbing smooth walls, so give a "
            "floor area of at least two by three times its leg span, no more than twice its leg span "
            "of height above the substrate (falls can injure it), 1 inch of substrate for slings and "
            "2 inches or more for adults, plus cork bark, wood and plants. Young spiders take "
            "half-inch crickets cut in half once a week; take out uneaten prey after a day, and "
            "wait a week after a molt before feeding. Keep one per enclosure, since they eat each "
            "other. Males live about 2-3 years and females about 4-5."
        ),
        source_url=SOURCES["jf_eresus"],
        _sources=dict(
            common_names="jf_eresus",
            genus="araneae_eresus", family="araneae_eresus", order_name="araneae_eresus",
            feeding_mode="jf_eresus",
            native_region="araneae_eresus",
            adult_size=["araneae_eresus", "jf_eresus"],
            adult_length_max_mm="araneae_eresus",
            type="jf_eresus",
            temperature_min="jf_eresus", temperature_max="jf_eresus",
            humidity_min="jf_eresus", humidity_max="jf_eresus",
            enclosure_size_adult="jf_eresus",
            substrate_depth="jf_eresus", substrate_type="jf_eresus",
            prey_size="jf_eresus", feeding_frequency_juvenile="jf_eresus",
            communal_suitable="jf_eresus",
            care_guide=["araneae_eresus", "jf_eresus"],
        ),
    ),
    # ------------------------------------------------------------------
    # Gandanameno echinata - velvet spider (Eresidae)
    # ------------------------------------------------------------------
    dict(
        taxon="true_spider",
        scientific_name="Gandanameno echinata",
        common_names=["South African Velvet Spider", "Black Velvet Spider"],
        genus="Gandanameno", family="Eresidae", order_name="Araneae",
        feeding_mode="predator",
        temperament="calm and reserved; can be shy or defensive",
        native_region="Namibia (World Spider Catalog); sellers list Namibia or South Africa",
        adult_size="under 30 mm",
        type="burrowing web builder",
        temperature_min=75, temperature_max=82,
        substrate_depth="1-2 inches",
        substrate_type="clay and sand mix firm enough to dig in, or coco fiber topped with sphagnum; cork, stones or roots as retreats",
        prey_size="fruit flies for the first few molts, then 1/8-1/4 in crickets; later crickets or roaches",
        webbing_amount="silk-lined burrow and web retreat",
        burrowing="heavy",
        care_guide=(
            "A velvety black African velvet spider that digs a silk-lined burrow and waits in it by "
            "day, coming to the entrance at dusk to hunt. The World Spider Catalog lists the species "
            "from Namibia; sellers give Namibia or South Africa, and one US seller says its black "
            "stock is 'most likely' this species, so the identity of hobby animals is not certain. "
            "Keep it at about 75-82°F with good airflow. Give 1-2 inches of a firm clay and sand mix "
            "it can dig in, or coco fiber with sphagnum on top, and cork, stones or roots to build "
            "under. The two species-specific sources we read disagree on moisture: a German seller "
            "keeps it at 60-70% humidity with a water dish and a spray in one corner, but warns the "
            "substrate must not get wet; a US seller keeps it on the drier side with a few drops of "
            "water on the side once a week. Both keep the substrate from getting damp, so start on "
            "the dry side and watch your spider. Feed fruit flies for the first few molts, then "
            "small crickets, and later crickets or roaches; it is an eager feeder that will leave "
            "its burrow to hunt. Calm in the enclosure but shy, and it can be defensive. Mostly "
            "hidden, so more of a display of its burrow than of the spider."
        ),
        source_url=SOURCES["il_gandanameno"],
        _sources=dict(
            common_names=["ar_gandanameno", "il_gandanameno"],
            genus="wp_gandanameno", family="wp_gandanameno", order_name="wp_gandanameno",
            feeding_mode="il_gandanameno",
            temperament="il_gandanameno",
            native_region=["wp_gandanameno", "il_gandanameno", "ar_gandanameno"],
            adult_size="il_gandanameno",
            type="il_gandanameno",
            temperature_min="il_gandanameno", temperature_max="il_gandanameno",
            substrate_depth="ar_gandanameno",
            substrate_type=["il_gandanameno", "ar_gandanameno"],
            prey_size=["ar_gandanameno", "il_gandanameno"],
            webbing_amount=["il_gandanameno", "ar_gandanameno"],
            burrowing="il_gandanameno",
            care_guide=["wp_gandanameno", "il_gandanameno", "ar_gandanameno"],
        ),
    ),
    # ------------------------------------------------------------------
    # Kukulcania arizonica - Arizona black hole spider (Filistatidae)
    # ------------------------------------------------------------------
    dict(
        taxon="true_spider",
        scientific_name="Kukulcania arizonica",
        common_names=["Arizona Black Hole Spider"],
        genus="Kukulcania", family="Filistatidae", order_name="Araneae",
        feeding_mode="predator",
        temperament="docile; bites are rare and minor",
        native_region="Arizona, New Mexico, Nevada and California; also northern Mexico",
        adult_size="female about 13 mm body; leg span 2-3 in",
        type="crevice dweller (web)",
        webbing_amount="silk tube in a crevice with radiating threads",
        medically_significant_venom=False, venom_severity="mild",
        care_guide=(
            "A velvety black crevice weaver from the southwestern United States and northern Mexico. "
            "It spins a silk tube inside a crack in rock or a wall, with threads radiating from the "
            "entrance; the dark hole in the middle of that pattern gives it its name. The silk is not "
            "sticky: it is a combed, woolly silk that snags insect legs. Females are about 13 mm "
            "long (2-3 in across the legs) and long-lived, several years at least, with one seller "
            "reporting ten years or more; they keep molting as adults. Males look quite different, "
            "paler and thinner with much longer legs, and are sometimes mistaken for brown "
            "recluses. It is docile, and bites are rare and minor. We found no care sheet that gives "
            "temperature, humidity, enclosure or feeding figures for this species, so none are "
            "given here."
        ),
        source_url=SOURCES["bcc_kukulcania"],
        _sources=dict(
            common_names="wp_kukulcania",
            genus="wp_kukulcania", family="wp_kukulcania", order_name="wp_kukulcania",
            feeding_mode="bcc_kukulcania",
            temperament="bcc_kukulcania",
            native_region=["wp_kukulcania", "bcc_kukulcania"],
            adult_size=["wp_kukulcania", "bcc_kukulcania"],
            type="wp_kukulcania",
            webbing_amount="wp_kukulcania",
            medically_significant_venom="bcc_kukulcania", venom_severity="bcc_kukulcania",
            care_guide=["wp_kukulcania", "bcc_kukulcania"],
        ),
    ),
    # ------------------------------------------------------------------
    # Eratigena atrica - giant house spider (Agelenidae)
    # ------------------------------------------------------------------
    dict(
        taxon="true_spider",
        scientific_name="Eratigena atrica",
        # The old genus stays searchable: keepers still write "Tegenaria atrica".
        common_names=["Giant House Spider", "Tegenaria atrica"],
        genus="Eratigena", family="Agelenidae", order_name="Araneae",
        feeding_mode="predator",
        temperament="shy and very fast; runs rather than bites",
        native_region="Europe; giant house spiders introduced to Canada and the USA (Pacific Northwest, Great Lakes) may be this species or E. duellica",
        adult_size="female 11-16 mm, male 10-14 mm (body)",
        adult_length_min_mm=10, adult_length_max_mm=16,
        type="funnel weaver (ground, stones, buildings)",
        webbing_amount="sheet web with a funnel retreat",
        medically_significant_venom=False, venom_severity="mild",
        care_guide=(
            "A large, long-legged funnel weaver from Europe. Giant house spiders are now also "
            "common in the Pacific Northwest and around the Great Lakes, but since the 2018 split "
            "many of those North American records may be E. duellica rather than E. atrica. It lives under stones and in buildings, sitting "
            "at the mouth of a funnel at the edge of its sheet web and running out when prey lands. "
            "It is very fast and shy, and its first move is to run and hide. It can bite when "
            "grabbed by hand; the bite is not very painful and any swelling goes within a few "
            "hours. Note on the name: E. atrica, E. duellica and E. saeva were merged into one "
            "species in 2013 and split again in 2018, and they look alike, so a 'giant house "
            "spider' may be any of the three. Females "
            "usually live 2-3 years, some up to six. We found no care sheet we could trust for this "
            "species, so no temperature, humidity, enclosure or feeding figures are given here."
        ),
        source_url=SOURCES["araneae_eratigena"],
        _sources=dict(
            common_names="usasp_eratigena",
            genus="araneae_eratigena", family="araneae_eratigena", order_name="araneae_eratigena",
            feeding_mode="usasp_eratigena",
            temperament="usasp_eratigena",
            native_region=["araneae_eratigena", "usasp_eratigena"],
            adult_size="araneae_eratigena", adult_length_min_mm="araneae_eratigena",
            adult_length_max_mm="araneae_eratigena",
            type=["araneae_eratigena", "usasp_eratigena"],
            webbing_amount="usasp_eratigena",
            medically_significant_venom="araneae_eratigena", venom_severity="araneae_eratigena",
            care_guide=["araneae_eratigena", "usasp_eratigena"],
        ),
    ),
]


def row_for_insert(data: dict) -> dict:
    """The row as it goes into the table: everything except the source notes."""
    return {k: v for k, v in data.items() if not k.startswith("_")}


def _check_lengths():
    """Fail before touching the database if any text is longer than its column."""
    cols = InvertSpecies.__table__.columns
    for data in SPECIES_DATA:
        for key, value in row_for_insert(data).items():
            if key not in cols:
                raise SystemExit(f"{data['scientific_name']}: {key} is not a column")
            limit = getattr(cols[key].type, "length", None)
            if limit and isinstance(value, str) and len(value) > limit:
                raise SystemExit(f"{data['scientific_name']}: {key} is {len(value)} characters; the column allows {limit}")
            if limit and isinstance(value, list):
                for item in value:
                    if isinstance(item, str) and len(item) > limit:
                        raise SystemExit(f"{data['scientific_name']}: {key} item is {len(item)} characters; the column allows {limit}")


def seed(apply: bool = False, db=None, commit: bool = True) -> dict:
    """Add the species that aren't in the catalog yet.

    Dry run (default) only reports. Existing rows (matched on the lower-cased
    scientific name) are never changed, whoever made them.
    """
    _check_lengths()
    own_session = db is None
    if own_session:
        from app.database import SessionLocal
        db = SessionLocal()
    result = dict(added=0, would_add=0, skipped=0)
    try:
        for data in SPECIES_DATA:
            name = data["scientific_name"]
            exists = db.query(InvertSpecies).filter(
                InvertSpecies.scientific_name_lower == name.lower()
            ).first()
            if exists:
                result["skipped"] += 1
                print(f"  Skipped (already in the catalog): {name}")
                continue
            row = row_for_insert(data)
            filled = sorted(k for k, v in row.items() if v is not None and k not in ("taxon", "scientific_name"))
            if not apply:
                result["would_add"] += 1
                print(f"  Would add: {name}  ({len(filled)} fields; source {row['source_url']})")
                continue
            taxon = row.pop("taxon")
            db.add(InvertSpecies(
                id=uuid.uuid4(), taxon=taxon,
                scientific_name_lower=name.lower(), slug=_slugify(name),
                is_verified=True, **row,
            ))
            result["added"] += 1
            print(f"  Added: {name}")
        if apply:
            if commit:
                db.commit()
            else:
                db.flush()
        if apply:
            print(f"\nDone. Added {result['added']}, skipped {result['skipped']}.")
        else:
            print(f"\nDry run. Would add {result['would_add']}, skipped {result['skipped']}. "
                  "Run again with --apply to write.")
        return result
    except Exception:
        db.rollback()
        raise
    finally:
        if own_session:
            db.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="write the new rows")
    mode.add_argument("--dry-run", action="store_true", help="only report (the default)")
    args = parser.parse_args(argv)
    seed(apply=args.apply)


if __name__ == "__main__":
    main()
