"""Seed HV herp species: the Uromastyx that new keepers most often own.

The catalog had one uromastyx (Uromastyx geyri). This script adds five more.
It never creates a geyri row and never touches any geyri field except the diet
fields listed in DIET_UPDATE_FIELDS (see DIET_UPDATES below); it touches no
other row outside SPECIES_DATA:

  * Uromastyx ornata        - Ornate Uromastyx
  * Uromastyx dispar        - Mali Uromastyx (the Mali form is U. dispar maliensis)
  * Uromastyx ocellata      - Ocellated Uromastyx
  * Uromastyx aegyptia      - Egyptian Uromastyx
  * Uromastyx nigriventris  - Moroccan Uromastyx

TAXONOMY CALL - the "Mali uromastyx" is filed as Uromastyx dispar, with
"Mali Uromastyx" as its first common name. The Reptile Database lists
maliensis as a subspecies of U. dispar (U. d. maliensis Joger & Lambert 1996,
NW Mali and SW Algeria; the name U. maliensis is a synonym), and CITES
Species+ lists Uromastyx maliensis as a synonym of U. dispar. Tamar et al.
2017 could not fully resolve the subspecies (too few maliensis samples), so a
separate species row would claim more than the sources do. Keepers buy the
animal under U. dispar, U. maliensis or U. d. maliensis (Fife 2013).

HONESTY RUBRIC (binding for this file)
  * Every value comes from a source opened and read on 2026-11-17 (listed in
    SOURCES; each row cites the ones it uses by ref_key).
  * Genus-wide care sheets are used for a species only when the sheet names
    that species: ReptiFiles (names all five), Fife/Reptiles Magazine (names all
    five; nigriventris as U. acanthinura nigriventris), LafeberVet (names
    aegyptia, ornata as "U. ocellatus ornatus", the Mali form, and the Moroccan
    spiny-tailed lizard "U. acanthinurus", from which nigriventris was split in
    2013 per Species+). LafeberVet does not name U. ocellata, so nothing for
    ocellata comes from it.
  * Where sources give different numbers, the row holds the range across
    them. Where they disagree on a non-diet yes/no point (substrate depth for
    the Mali form), the text field says so.
  * DIET IS RECONCILED, NOT LISTED (2026-11-17). One genus-level diet text
    (_DIET_* below) is used for all five species and for the geyri diet-only
    update. Evidence was weighed in this order: field studies of wild
    Uromastyx diet and digestion (Al-Hazmi 2001, Foley et al. 1992, Dutta &
    Jhala 2007, the Qatar faecal study 2011, Bendami & Znari 2021); veterinary
    nutrition sources (Merck Veterinary Manual x4, LafeberVet, VCA, Mancinelli
    in Vet Times); then husbandry references (ReptiFiles; the Reptiles
    Magazine breeder articles). The calls: a high-fibre plant diet of varied
    greens and flowers; brassicas rotated (goitrogens), spinach/beet
    greens/chard occasional, iceberg/celery skipped; seeds and legumes a small
    pinch about weekly, never free-choice; no insects (wild uros eat them only
    opportunistically, and vet guidance advises against animal protein for
    herbivorous lizards); plain calcium 1-2x/week + multivitamin ~weekly, no
    D3 needed under strong UVB; a small shallow water dish is fine if humidity
    stays in range. The field studies are about other Uromastyx species (and
    U. hardwickii as named in that paper), so they are cited as genus
    evidence; nothing species-specific is taken from them except Bendami &
    Znari for U. nigriventris.
  * Not confirmed => NULL. care_level is NULL for all five (no source rates
    it); temp_warm_* and temp_night_* are NULL except for U. dispar (LafeberVet
    gives the night drop only as 10-15 F below day, no absolute figure);
    morph_complexity, uvb_distance_* and image_url are NULL; IUCN status for
    U. nigriventris is NULL (no assessment under that name in any page read).
  * The API returns uvb_required, bioactive_suitable, brumation_required and
    has_morph_market as plain booleans, so they cannot be NULL.
    bioactive_suitable=False (the care sheet then shows "Not ideal"): ReptiFiles
    says to replace the whole substrate every 3-4 months, which is not a
    bioactive setup. brumation_required=False: every source describes cooling
    only as a breeding cue.
  * Pages that could not be read: iucnredlist.org (client error) and cites.org
    (robots.txt). IUCN status is taken from the Reptile Database page, which
    shows the badge and links the assessment; CITES from Species+ (UNEP-WCMC's
    CITES database). The UV-Tool paper (Baines et al. 2016) was opened but its
    species table is in a separate zip, so it is not cited for any value here;
    the UV index figure comes from ReptiFiles.

SOURCES (all opened 2026-11-17)
  ReptiFiles Uromastyx care sheet ...... https://reptifiles.com/uromastyx
  LafeberVet basic information sheet ... https://lafeber.com/vet/basic-information-for-uromastyx/
  Fife, Reptiles Magazine 2013 ......... https://reptilesmagazine.com/uromastyx-lizard/
  Jones, Reptiles Magazine 2015 ........ https://reptilesmagazine.com/ornate-uromastyx-care-and-breeding-tips/
  Dix, Reptiles Magazine 2011 .......... https://reptilesmagazine.com/mali-uromastyx-breeding/
  The Reptile Database (x5) ............ https://reptile-database.reptarium.cz/species?genus=Uromastyx&species=...
  CITES Species+ (x5) .................. https://speciesplus.net/api/v1/taxon_concepts/<id>
  Diet (all opened 2026-11-17):
  Merck Vet Manual, Nutrition in Lizards ... https://www.merckvetmanual.com/management-and-nutrition/nutrition-exotic-and-zoo-animals/nutrition-in-lizards
  Merck Vet Manual, Nutrition in Reptiles .. https://www.merckvetmanual.com/management-and-nutrition/nutrition-exotic-and-zoo-animals/nutrition-in-reptiles
  Merck Vet Manual, Nutritional Diseases ... https://www.merckvetmanual.com/exotic-and-laboratory-animals/reptiles/nutritional-metabolic-and-endocrine-diseases-of-reptiles
  Merck Vet Manual, plant composition ...... https://www.merckvetmanual.com/multimedia/table/composition-of-plant-foods-that-may-be-offered-to-reptiles
  VCA, Feeding Iguanas ..................... https://vcahospitals.com/know-your-pet/iguanas-feeding
  Mancinelli, Vet Times 2015 ............... https://www.vettimes.co.uk/article/common-nutritional-disorders-of-captive-reptiles-cpdreptiles
  Al-Hazmi 2001 (U. microlepis) ............ https://qspace.qu.edu.qa/handle/10576/10234
  Foley et al. 1992 (U. aegyptius) ......... https://openresearch-repository.anu.edu.au/entities/publication/b5d09c3a-59f4-4155-9bac-e8350252ae43
  Dutta & Jhala 2007 (U. hardwickii) ....... https://archive.org/download/biostor-150915/biostor-150915.pdf
  Qatar faecal study 2011 .................. https://qscience.com/content/papers/10.5339/qfarf.2011.EVP7
  Bendami & Znari 2021 (U. nigriventris) ... https://www.salamandra-journal.com/index.php/contents/2021-vol-57/2029-bendami-s-m-znari

Run (Render shell, from apps/api):
    python seed_herp_uromastyx.py            # dry run: prints adds/updates (+ changed fields), rolls back
    python seed_herp_uromastyx.py --apply    # writes
Insert-or-update by scientific_name_lower. Sets content_last_reviewed_at to
2026-11-17. Leaves image_url NULL. DIET_UPDATES only ever updates an existing
row (a missing row is skipped, never created) and appends sources it does not
already hold (matched by ref_key or URL); the dry run prints that diff too.
"""
import argparse
import os
import sys
import uuid
from datetime import date
from decimal import Decimal

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

REVIEWED_ON = date(2026, 11, 17)

# Never in this file's list; the script refuses to run if it ever is.
PROTECTED = {"uromastyx geyri"}


def _rd(species, summary):
    return {
        "source_type": "academic",
        "title": f"Uromastyx {species} - The Reptile Database",
        "author": "P. Uetz et al., The Reptile Database",
        "url": f"https://reptile-database.reptarium.cz/species?genus=Uromastyx&species={species}",
        "summary": summary,
    }


def _splus(species, tc_id, summary):
    return {
        "source_type": "government",
        "title": f"Uromastyx {species} - CITES Species+",
        "author": "UNEP-WCMC / CITES Secretariat",
        "url": f"https://speciesplus.net/api/v1/taxon_concepts/{tc_id}",
        "summary": summary,
    }


SOURCES = {
    "reptifiles_uromastyx": {
        "source_type": "breeder_community",
        "title": "Uromastyx Care Sheet",
        "author": "ReptiFiles (Mariah Healey)",
        "url": "https://reptifiles.com/uromastyx",
        "summary": (
            "Genus care sheet naming ornata, dispar (incl. maliensis), ocellata, aegyptia, nigriventris "
            "with max lengths. Basking 120-130F, cool ~85F, humidity 20-30%, T5 HO 14% UVB to UVI 4.5-6.0, "
            "4x2x2 ft min (aegyptia 8x4x4 ft), sand/sandy soil 4+ in deep, can live 25+ years. Diet: ~90% greens and "
            "flowers (safe-greens list; wild weeds best), ~5% hard veg/treats, ~5% dry foods incl. hay; seeds (lentils, "
            "white millet) a small amount at most 1x/week, obesity in excess; one insect only as a rare treat; fruit at "
            "most one piece a month; Ca + multivitamin 2x/week; juveniles daily, adults 4-5x/week; small water bowl "
            "always if well ventilated."
        ),
    },
    "lafeber_uromastyx": {
        "source_type": "veterinary",
        "title": "Basic Information Sheet: Uromastyx",
        "author": "LafeberVet (Christal Pollock DVM; reviewed by Susan Donoghue VMD)",
        "url": "https://lafeber.com/vet/basic-information-for-uromastyx/",
        "publication_date": "2012-05-30",
        "summary": (
            "Genus vet sheet naming aegyptia (to 30 in), ornate (10-14 in), Moroccan (15-17 in) and Mali forms. "
            "Gradient 80-100F, basking 120F, 10-15F night drop, humidity 10-40%, ~15-20 yr lifespan, usually mild "
            "tempered. Diet: dark leafy greens and grasses ~70%, plus vegetables, hay, birdseed, lentils and peas; "
            "insects occasionally; fruit and blossoms as treats; low-phosphorus Ca (Ca:P >= 2:1) weekly, multivitamin "
            "weekly; juveniles daily, adults every 1-3 days; offer a water dish if it does not raise humidity."
        ),
    },
    # ---- diet sources (veterinary) ----
    "merck_lizard_nutrition": {
        "source_type": "veterinary",
        "title": "Nutrition in Lizards",
        "author": "J. Nijboer & A. Fens, Merck Veterinary Manual (peer reviewed by J. Brandao DVM)",
        "url": "https://www.merckvetmanual.com/management-and-nutrition/nutrition-exotic-and-zoo-animals/nutrition-in-lizards",
        "publication_date": "2025-09-01",
        "summary": (
            "Herbivorous lizards ferment plant fibre in an enlarged hindgut and should get plant-based diets; insects, "
            "vertebrate prey or fruit-heavy diets are not advised (low fibre). Most lizards fed daily (juveniles) or at "
            "least every other day."
        ),
    },
    "merck_reptile_nutrition": {
        "source_type": "veterinary",
        "title": "Nutrition in Reptiles",
        "author": "J. Nijboer, Merck Veterinary Manual",
        "url": "https://www.merckvetmanual.com/management-and-nutrition/nutrition-exotic-and-zoo-animals/nutrition-in-reptiles",
        "summary": (
            "Diets high in protein may predispose reptiles to uric acid build-up and gout. Herbivores: feed "
            "low-oxalate vegetables (kidney stones), hay, fruit at most 5%, fresh water available. Dietary vitamin D "
            "is needed only when UVB synthesis is inadequate; UVB rather than dietary D3 was critical in iguanas."
        ),
    },
    "merck_reptile_diseases": {
        "source_type": "veterinary",
        "title": "Nutritional, Metabolic, and Endocrine Diseases of Reptiles",
        "author": "S. J. Divers & J. R. Comolli, Merck Veterinary Manual",
        "url": "https://www.merckvetmanual.com/exotic-and-laboratory-animals/reptiles/nutritional-metabolic-and-endocrine-diseases-of-reptiles",
        "publication_date": "2025-07-01",
        "summary": (
            "Primary visceral gout is generally caused by excessive dietary protein. Nutritional secondary "
            "hyperparathyroidism comes from a low Ca:P diet, lack of vitamin D3 or UVB, and mostly affects growing "
            "herbivorous and insectivorous lizards. Excess calories cause obesity and hepatic lipidosis."
        ),
    },
    "merck_plant_table": {
        "source_type": "veterinary",
        "title": "Composition of Plant Foods That May Be Offered to Reptiles",
        "author": "Merck Veterinary Manual",
        "url": "https://www.merckvetmanual.com/multimedia/table/composition-of-plant-foods-that-may-be-offered-to-reptiles",
        "summary": (
            "Ca:P ratios: collard 2.76, dandelion 2.4, endive 2.67, kale 2.9, watercress 4.23, spinach 1.69, "
            "iceberg lettuce 1.34 (only 0.03% calcium), lettuce 0.85, apple, banana, tomato and grape below 1 "
            "(flagged as poor staples)."
        ),
    },
    "vca_iguana_feeding": {
        "source_type": "veterinary",
        "title": "Feeding Iguanas",
        "author": "VCA Animal Hospitals",
        "url": "https://vcahospitals.com/know-your-pet/iguanas-feeding",
        "summary": (
            "Herbivorous-lizard (iguana) diet guidance used here as general herbivore nutrition: avoid iceberg lettuce "
            "and celery (mostly water); spinach, chard and beet greens should not be fed exclusively (they block "
            "calcium uptake); cabbage, kale and mustard greens contain goitrogens; animal protein is too high in "
            "protein for herbivores."
        ),
    },
    "mancinelli_vettimes": {
        "source_type": "veterinary",
        "title": "Common nutritional disorders of captive reptiles",
        "author": "Elisabetta Mancinelli, Vet Times",
        "url": "https://www.vettimes.co.uk/article/common-nutritional-disorders-of-captive-reptiles-cpdreptiles",
        "publication_date": "2015-09-21",
        "summary": (
            "Goitrogenic plants (broccoli, cabbage, cress, bok choy, kale, mustard, turnips) should be fed sparingly; "
            "metabolic bone disease from low calcium, reversed Ca:P or lack of UVB is the most common nutritional "
            "disorder in herbivorous lizards."
        ),
    },
    # ---- diet sources (field studies of wild Uromastyx) ----
    "alhazmi_2001": {
        "source_type": "academic",
        "title": "Feeding Behaviour and Food Selection of Dhab Uromastyx microlepis From Wild Vegetation",
        "author": "M. A. Al-Hazmi, Qatar University Science Journal 21",
        "url": "https://qspace.qu.edu.qa/handle/10576/10234",
        "publication_date": "2001-01-01",
        "summary": (
            "One-year field study in Saudi Arabia: herbivore preferring tender leaves, shoots, flowers, buds and fruits "
            "of shrubs (37 preferred of 54 plant species); stomach contents show insects and gravel only at times."
        ),
    },
    "foley_1992": {
        "source_type": "academic",
        "title": "Microbial digestion in the herbivorous lizard Uromastyx aegyptius (Agamidae)",
        "author": "W. J. Foley, A. Bouskila, A. Shkolnik & I. Choshniak, Journal of Zoology 226",
        "url": "https://openresearch-repository.anu.edu.au/entities/publication/b5d09c3a-59f4-4155-9bac-e8350252ae43",
        "publication_date": "1992-01-01",
        "summary": (
            "Wild spring diet in Israel almost entirely leaves and fruits of annual plants; hindgut microbes ferment "
            "fibre (69% cell-wall digestibility) and supply about half the digestible energy."
        ),
    },
    "dutta_jhala_2007": {
        "source_type": "academic",
        "title": "Ecological aspects of Indian spiny-tailed lizard Uromastyx hardwickii in Kutch",
        "author": "S. Dutta & Y. Jhala, Journal of the Bombay Natural History Society 104(3)",
        "url": "https://archive.org/download/biostor-150915/biostor-150915.pdf",
        "publication_date": "2007-09-01",
        "summary": (
            "Bite counts and pellets: summer (dry season) diet 78% grasses, 10% insects, 6% shrubs; monsoon diet herbs "
            "and grasses with insects under 1%. Insects read as dry-season protein supplementation; no shift from "
            "insect-eating juveniles to plant-eating adults was found."
        ),
    },
    "qatar_faecal_2011": {
        "source_type": "academic",
        "title": "Diet of the spiny-tailed lizard Uromastyx aegyptia microlepis in Qatar (QFARF abstract)",
        "author": "Qatar Foundation Annual Research Forum 2011 (EVP7)",
        "url": "https://qscience.com/content/papers/10.5339/qfarf.2011.EVP7",
        "publication_date": "2011-01-01",
        "summary": (
            "371 faecal samples: 34 plant taxa eaten in one month, up to 19 in a single dropping; animal remains in "
            "26% of faeces. Plants dominate; animal matter is opportunistic."
        ),
    },
    "bendami_znari_2021": {
        "source_type": "academic",
        "title": "Estimating food and water intakes by the herbivorous Moroccan Uromastyx nigriventris",
        "author": "S. Bendami & M. Znari, Salamandra 57",
        "url": "https://www.salamandra-journal.com/index.php/contents/2021-vol-57/2029-bendami-s-m-znari",
        "publication_date": "2021-01-01",
        "summary": (
            "Wild U. nigriventris from SE Morocco ate 18 plant species across the seasons; described as a herbivorous, "
            "non-drinking desert species whose water intake comes from the moisture in the plants it eats."
        ),
    },
    "fife_reptiles_mag": {
        "source_type": "breeder_community",
        "title": "Uromastyx Lizard",
        "author": "Jerry Fife, Reptiles Magazine",
        "url": "https://reptilesmagazine.com/uromastyx-lizard/",
        "publication_date": "2013-10-29",
        "summary": (
            "Genus article listing each species and range (incl. ocellata, dispar ssp., acanthinura "
            "nigriventris). Basking block 115-120F, rest 85-90F, pair needs 30x48 in+ (Egyptian more; ~3 ft), "
            "bird seed substrate, water dish not necessary, ~60-day winter cooling for breeding."
        ),
    },
    "jones_ornata": {
        "source_type": "breeder_community",
        "title": "Ornate Uromastyx Care and Breeding Tips",
        "author": "Troy Jones, Reptiles Magazine",
        "url": "https://reptilesmagazine.com/ornate-uromastyx-care-and-breeding-tips/",
        "publication_date": "2015-09-03",
        "summary": (
            "U. ornata: ~14 in adults, 4x2 ft min (also for hatchlings), basking 120-130F, cool 80-90F, "
            "UVB tubes replaced every 6-12 months, no calcium sand/walnut shell, no water dish needed, "
            "seed bowl only after 6 months, mostly kept singly."
        ),
    },
    "dix_mali": {
        "source_type": "breeder_community",
        "title": "Mali Uromastyx Breeding",
        "author": "Douglas Dix (Deer Fern Farms), Reptiles Magazine",
        "url": "https://reptilesmagazine.com/mali-uromastyx-breeding/",
        "publication_date": "2011-12-01",
        "summary": (
            "U. dispar maliensis: 11-15 in, 7-14 oz, 48x24x14 in min, basking 115+/-5F, floor 95-100F, "
            "cool hide 90+/-5F, nights above 70F, humidity below 30%, shallow millet or sand, no water bowl, "
            "soak every few weeks, fed daily (hatchlings twice daily), Ca daily + vitamins every 3rd day."
        ),
    },
    "rd_ornata": _rd("ornata", "Taxonomy (ssp. ornata, philbyi), common name Ornate Mastigure, range Egypt incl. Sinai, Israel, Saudi Arabia, Yemen; IUCN Least Concern badge linking assessment 198538/2531743."),
    "rd_dispar": _rd("dispar", "Subspecies dispar, flavifasciata, hodhensis, maliensis (U. maliensis a synonym); Tamar et al. 2017 could not resolve maliensis/hodhensis; range; IUCN Least Concern badge (198537/2531561)."),
    "rd_ocellata": _rd("ocellata", "Common name Ocellated Spinytail; NW Somalia, Djibouti, Eritrea, N Sudan, SE Egypt, Ethiopia; max length 30 cm; ornata now a full species; IUCN Least Concern badge (176223/21708775)."),
    "rd_aegyptia": _rd("aegyptia", "Subspecies aegyptia, microlepis, leptieni; Egyptian Mastigure; Egypt E of Nile incl. Sinai, Israel, Arabia, Iraq, Iran, Syria, Jordan; to 76 cm; IUCN Vulnerable badge (164729/115304711)."),
    "rd_nigriventris": _rd("nigriventris", "Moroccan Spiny-tailed Lizard; Morocco east and south of the Atlas, W Algeria; formerly U. acanthinura nigriventris. No IUCN badge shown."),
    "splus_ornata": _splus("ornata", 9934, "CITES Appendix II (genus listing Uromastyx spp., in force since 1977-02-04); EU Annex B."),
    "splus_dispar": _splus("dispar", 7353, "CITES Appendix II (genus listing); Uromastyx maliensis and U. flavifasciata listed as synonyms of U. dispar."),
    "splus_ocellata": _splus("ocellata", 5509, "CITES Appendix II (genus listing); names Eyed Dabb Lizard, Ocellated Mastigure, Ocellated spinytail."),
    "splus_aegyptia": _splus("aegyptia", 8371, "CITES Appendix II (genus listing); leptieni and microlepis lumped into aegyptia at CoP16 (2013); Dabb Lizard, Egyptian Mastigure."),
    "splus_nigriventris": _splus("nigriventris", 4161, "CITES Appendix II (genus listing); split from U. acanthinura at CoP16 (2013); Algeria, Morocco."),
}


def cite(*keys):
    return [SOURCES[k] | {"ref_key": k} for k in keys]


# ---- Reconciled genus-level diet (see HONESTY RUBRIC: "DIET IS RECONCILED") ----
# One text for all five species and the geyri diet-only update. Each claim's
# sources: staples + ~90% greens/flowers + weeds (ReptiFiles; Ca:P from the
# Merck plant table; field diets of leaves/flowers/fruit: Al-Hazmi, Foley);
# goitrogens (Mancinelli, VCA); spinach/chard/beet greens and iceberg/celery
# (VCA, Merck low-oxalate advice, Merck table); fruit (Merck <=5%, ReptiFiles);
# seeds (ReptiFiles; obesity: Merck diseases); no insects (Merck lizard
# nutrition, Merck gout; wild intake only opportunistic: Al-Hazmi, Dutta &
# Jhala, Qatar 2011); supplements (ReptiFiles, LafeberVet; vitamin D from UVB:
# Merck reptile nutrition).
_DIET_SUPP = (
    "Staples (about 90% of the diet): a varied mix of leafy greens and flowers - dandelion leaves and flowers, "
    "endive or escarole, collard greens, clover, hibiscus and prickly pear pad, plus some grass or herbal hay; "
    "pesticide-free weeds are best. Rotate kale, bok choy, cabbage, mustard and turnip greens rather than feeding "
    "them daily (goitrogens). Keep spinach, beet greens and chard occasional (they cut calcium uptake) and skip "
    "iceberg lettuce and celery (mostly water). Fruit only as a rare treat. Seeds and legumes (lentils, split peas, "
    "millet): a small pinch about once a week, not a free-choice bowl - they are rich in protein and fat and cause "
    "obesity in excess. No insects or other animal protein are needed: wild uromastyx eat them only now and then, "
    "and vet nutrition guidance advises against them for herbivorous lizards (excess protein is linked to gout). "
    "Supplements: dust the greens lightly with plain calcium once or twice a week and a reptile multivitamin about "
    "once a week; under strong UVB the lizard makes its own vitamin D, so calcium with D3 is not needed."
)
_DIET_WATER = (
    "A small, shallow water dish on the cool side is fine as long as humidity stays in range. Most water comes "
    "from fresh greens, so many uromastyx rarely drink from it."
)
_FREQ_JUVENILE = "Daily, as many fresh greens as it will eat"
# _parse_reptile_interval reads this first: "Every 1-2 days" -> 2 days.
# (Never write "per week" / "a week" here: the parser maps any such string to 7.)
_FREQ_ADULT = "Every 1-2 days (fresh greens and flowers)"
_DIET_SENTENCE = (
    "Feed mostly varied leafy greens and flowers, a small pinch of seeds or lentils about once a week, and no insects."
)

# Diet evidence cited on every row (LafeberVet is added only where it names the
# species, as with the other genus sheets).
_DIET_SOURCE_KEYS_GENUS = (
    "merck_lizard_nutrition", "merck_reptile_nutrition", "merck_reptile_diseases", "merck_plant_table",
    "vca_iguana_feeding", "mancinelli_vettimes",
    "alhazmi_2001", "foley_1992", "dutta_jhala_2007", "qatar_faecal_2011",
)
# Every source that supports some part of the diet text (tests use this).
DIET_SOURCE_KEYS = frozenset(_DIET_SOURCE_KEYS_GENUS) | {
    "reptifiles_uromastyx", "lafeber_uromastyx", "bendami_znari_2021",
}

_BRUMATION_FIFE = (
    "Optional, for breeding. Fife: in winter cut daylight to about 8 hours, let the enclosure fall to the 60s-low 70s F "
    "with a basking spot near 85 F; about 60 days is enough indoors. Do not cool a lizard that is not healthy."
)

_SUBSTRATE_SAFE = [
    "play sand",
    "sandy soil",
    "50/30/20 play sand / topsoil / excavator clay",
    "millet or bird seed",
]

SPECIES_DATA = [
    {
        "scientific_name": "Uromastyx ornata",
        "common_names": ["Ornate Uromastyx", "Ornate Mastigure", "Ornate Spiny-tailed Lizard"],
        "genus": "Uromastyx", "family": "Agamidae", "order_name": "Squamata", "taxon": "lizard",
        "care_level": None, "handleability": "docile", "activity_period": "diurnal",
        "native_region": "Egypt (incl. Sinai), Israel, Saudi Arabia and Yemen - rocky desert wadis, cliffs and crevices",
        "adult_length_min_in": Decimal("10"), "adult_length_max_in": Decimal("15"),
        "adult_weight_min_g": None, "adult_weight_max_g": None,
        "temp_cool_min": Decimal("80"), "temp_cool_max": Decimal("90"),
        "temp_warm_min": None, "temp_warm_max": None,
        "temp_basking_min": Decimal("115"), "temp_basking_max": Decimal("130"),
        "temp_night_min": None, "temp_night_max": None,
        "humidity_min": 20, "humidity_max": 30,
        "uvb_required": True, "uvb_type": "T5_HO", "uvb_replacement_months": 12,
        "enclosure_type": "terrestrial",
        "enclosure_min_hatchling": "4x2 ft floor (Jones raises hatchlings singly in 4x2 ft cages)",
        "enclosure_min_adult": "4x2x2 ft minimum, larger preferred; one lizard per enclosure",
        "bioactive_suitable": False,
        "substrate_safe_list": _SUBSTRATE_SAFE + ["newspaper"],
        "substrate_avoid_list": ["calcium sand", "crushed walnut shell"],
        "substrate_depth_min_in": Decimal("4"), "substrate_depth_max_in": None,
        "diet_type": "herbivore",
        "feeding_frequency_juvenile": _FREQ_JUVENILE,
        "feeding_frequency_adult": _FREQ_ADULT,
        "supplementation_notes": _DIET_SUPP,
        "water_bowl_description": _DIET_WATER,
        "soaking_behavior": "Fife: thin or newly imported lizards may be offered water or a warm soak.",
        "brumation_required": False,
        "brumation_notes": (
            _BRUMATION_FIFE + " Jones shortens the light to 4-6 hours over about three months to cue breeding."
        ),
        "lifespan_captivity_min_yrs": 15, "lifespan_captivity_max_yrs": 25,
        "cites_appendix": "II", "iucn_status": "LC",
        "wild_population_notes": (
            "IUCN Least Concern; CITES Appendix II (all Uromastyx since 1977). Jones notes that wild-caught "
            "ornates imported in the 1990s did poorly and that captive-bred lizards settle in fastest; males "
            "are more colourful than females."
        ),
        "has_morph_market": False, "morph_complexity": None,
        "care_guide": (
            "**Ornate Uromastyx (Uromastyx ornata)** - a desert herbivore from Egypt, Israel and Arabia that needs a "
            "very hot basking spot, strong UVB and dry air. " + _DIET_SENTENCE + " Plan on one lizard per "
            "enclosure; wild-caught ornates have often done poorly in captivity, so captive-bred animals are the "
            "better start."
        ),
        "source_url": "https://reptilesmagazine.com/ornate-uromastyx-care-and-breeding-tips/",
        "sources": cite("jones_ornata", "reptifiles_uromastyx", "lafeber_uromastyx", "fife_reptiles_mag",
                        "rd_ornata", "splus_ornata", *_DIET_SOURCE_KEYS_GENUS),
    },
    {
        "scientific_name": "Uromastyx dispar",
        "common_names": ["Mali Uromastyx", "Sudan Mastigure", "Southern Saharan Spiny-tailed Lizard",
                         "Mali Spiny-tailed Lizard"],
        "genus": "Uromastyx", "family": "Agamidae", "order_name": "Squamata", "taxon": "lizard",
        "care_level": None, "handleability": "docile", "activity_period": "diurnal",
        "native_region": (
            "Sahara and Sahel: Mauritania, W Sahara, Algeria, Mali, Morocco, Sudan, Chad. Mali form "
            "(maliensis): NW Mali and SW Algeria, rocky scrubland"
        ),
        "adult_length_min_in": Decimal("11"), "adult_length_max_in": Decimal("20"),
        "adult_weight_min_g": Decimal("198"), "adult_weight_max_g": Decimal("397"),
        "temp_cool_min": Decimal("85"), "temp_cool_max": Decimal("95"),
        "temp_warm_min": Decimal("95"), "temp_warm_max": Decimal("100"),
        "temp_basking_min": Decimal("110"), "temp_basking_max": Decimal("130"),
        "temp_night_min": Decimal("70"), "temp_night_max": None,
        "humidity_min": 20, "humidity_max": 30,
        "uvb_required": True, "uvb_type": "T5_HO", "uvb_replacement_months": None,
        "enclosure_type": "terrestrial",
        "enclosure_min_adult": "4x2 ft floor minimum (Dix: 48x24x14 in; ReptiFiles: 4x2x2 ft)",
        "bioactive_suitable": False,
        "substrate_safe_list": _SUBSTRATE_SAFE,
        "substrate_avoid_list": [],
        "substrate_depth_min_in": None, "substrate_depth_max_in": None,
        "diet_type": "herbivore",
        "feeding_frequency_hatchling": "Daily; Dix offers Mali hatchlings food twice a day",
        "feeding_frequency_juvenile": _FREQ_JUVENILE,
        "feeding_frequency_adult": _FREQ_ADULT,
        "supplementation_notes": _DIET_SUPP,
        "water_bowl_description": _DIET_WATER,
        "soaking_behavior": (
            "Dix gives a soak outside the enclosure every few weeks: under 1 inch of about 100 F water, so the "
            "lizard can drink and shed cleanly."
        ),
        "brumation_required": False,
        "brumation_notes": (
            "Optional, for breeding. Dix: pets can stay on 12-hour days all year. To breed, shorten the days "
            "gradually to 4-6 hours, cool to mid-80s F by day and high 60s F at night, then about 60 days without "
            "food before warming back up. " + _BRUMATION_FIFE.replace("Optional, for breeding. ", "")
        ),
        "lifespan_captivity_min_yrs": 15, "lifespan_captivity_max_yrs": 25,
        "cites_appendix": "II", "iucn_status": "LC",
        "wild_population_notes": (
            "IUCN Least Concern; CITES Appendix II (genus listing). The Mali uromastyx is U. dispar maliensis; "
            "it is sold as U. dispar, U. maliensis or U. d. maliensis. U. d. flavifasciata grows larger (to about "
            "20 in). Substrate depth is disputed: ReptiFiles wants 4+ in to dig in, Dix keeps loose bedding "
            "shallow and offers hides instead."
        ),
        "has_morph_market": False, "morph_complexity": None,
        "care_guide": (
            "**Mali Uromastyx (Uromastyx dispar)** - the Mali form (U. d. maliensis) is one of the uromastyx most "
            "often kept in the US and is described as hardy and relaxed with its keepers. It needs a basking spot "
            "of roughly 110-130 F, high-output UVB and dry air (below 30 percent). " + _DIET_SENTENCE
        ),
        "source_url": "https://reptilesmagazine.com/mali-uromastyx-breeding/",
        "sources": cite("dix_mali", "reptifiles_uromastyx", "lafeber_uromastyx", "fife_reptiles_mag",
                        "rd_dispar", "splus_dispar", *_DIET_SOURCE_KEYS_GENUS),
    },
    {
        "scientific_name": "Uromastyx ocellata",
        "common_names": ["Ocellated Uromastyx", "Ocellated Mastigure", "Ocellated Spinytail", "Eyed Dabb Lizard"],
        "genus": "Uromastyx", "family": "Agamidae", "order_name": "Squamata", "taxon": "lizard",
        "care_level": None, "handleability": None, "activity_period": "diurnal",
        "native_region": (
            "NW Somalia, Djibouti, Eritrea, N Sudan, SE Egypt and Ethiopia - rock and rubble desert with acacia"
        ),
        "adult_length_min_in": Decimal("11.0"), "adult_length_max_in": Decimal("11.8"),
        "adult_weight_min_g": None, "adult_weight_max_g": None,
        "temp_cool_min": Decimal("85"), "temp_cool_max": Decimal("90"),
        "temp_warm_min": None, "temp_warm_max": None,
        "temp_basking_min": Decimal("115"), "temp_basking_max": Decimal("130"),
        "temp_night_min": None, "temp_night_max": None,
        "humidity_min": 20, "humidity_max": 30,
        "uvb_required": True, "uvb_type": "T5_HO", "uvb_replacement_months": None,
        "enclosure_type": "terrestrial",
        "enclosure_min_adult": "4x2x2 ft minimum, larger preferred",
        "bioactive_suitable": False,
        "substrate_safe_list": _SUBSTRATE_SAFE,
        "substrate_avoid_list": [],
        "substrate_depth_min_in": Decimal("4"), "substrate_depth_max_in": None,
        "diet_type": "herbivore",
        "feeding_frequency_juvenile": _FREQ_JUVENILE,
        "feeding_frequency_adult": _FREQ_ADULT,
        "supplementation_notes": _DIET_SUPP,
        "water_bowl_description": _DIET_WATER,
        "soaking_behavior": "Fife: thin or newly imported lizards may be offered water or a warm soak.",
        "brumation_required": False,
        "brumation_notes": _BRUMATION_FIFE,
        "lifespan_captivity_min_yrs": None, "lifespan_captivity_max_yrs": None,
        "cites_appendix": "II", "iucn_status": "LC",
        "wild_population_notes": (
            "IUCN Least Concern; CITES Appendix II (genus listing). One of the smallest uromastyx (about 28-30 cm "
            "total). ReptiFiles notes that species other than the Mali, Saharan and ornate are more likely to be "
            "wild-caught in the US trade. Care data here are genus-level; no species-specific care sheet was found."
        ),
        "has_morph_market": False, "morph_complexity": None,
        "care_guide": (
            "**Ocellated Uromastyx (Uromastyx ocellata)** - a small uromastyx (about 11 inches) from the rocky "
            "deserts of NE Africa. No species-specific care sheet was found; genus care sheets that name it call "
            "for a very hot basking spot, strong UVB and dry air. " + _DIET_SENTENCE + " In the US trade it is "
            "more likely to be wild-caught than the Mali, Saharan or ornate uromastyx."
        ),
        "source_url": "https://reptifiles.com/uromastyx",
        "sources": cite("reptifiles_uromastyx", "fife_reptiles_mag", "rd_ocellata", "splus_ocellata",
                        *_DIET_SOURCE_KEYS_GENUS),
    },
    {
        "scientific_name": "Uromastyx aegyptia",
        "common_names": ["Egyptian Uromastyx", "Egyptian Mastigure", "Egyptian Spiny-tailed Lizard", "Dabb Lizard"],
        "genus": "Uromastyx", "family": "Agamidae", "order_name": "Squamata", "taxon": "lizard",
        "care_level": None, "handleability": "docile", "activity_period": "diurnal",
        "native_region": (
            "Egypt east of the Nile (incl. Sinai), Israel, Jordan, Syria, Iraq, Iran and the Arabian Peninsula - "
            "open sand and gravel desert"
        ),
        "adult_length_min_in": Decimal("20"), "adult_length_max_in": Decimal("30"),
        "adult_weight_min_g": None, "adult_weight_max_g": None,
        "temp_cool_min": Decimal("80"), "temp_cool_max": Decimal("90"),
        "temp_warm_min": None, "temp_warm_max": None,
        "temp_basking_min": Decimal("115"), "temp_basking_max": Decimal("130"),
        "temp_night_min": None, "temp_night_max": None,
        "humidity_min": 20, "humidity_max": 30,
        "uvb_required": True, "uvb_type": "T5_HO", "uvb_replacement_months": None,
        "enclosure_type": "terrestrial",
        "enclosure_min_adult": "8x4x4 ft minimum for adults (ReptiFiles)",
        "bioactive_suitable": False,
        "substrate_safe_list": _SUBSTRATE_SAFE,
        "substrate_avoid_list": [],
        "substrate_depth_min_in": Decimal("4"), "substrate_depth_max_in": None,
        "diet_type": "herbivore",
        "feeding_frequency_juvenile": _FREQ_JUVENILE,
        "feeding_frequency_adult": _FREQ_ADULT,
        "supplementation_notes": _DIET_SUPP,
        "water_bowl_description": _DIET_WATER,
        "soaking_behavior": "Fife: thin or newly imported lizards may be offered water or a warm soak.",
        "brumation_required": False,
        "brumation_notes": _BRUMATION_FIFE,
        "lifespan_captivity_min_yrs": 15, "lifespan_captivity_max_yrs": 25,
        "cites_appendix": "II", "iucn_status": "VU",
        "wild_population_notes": (
            "IUCN Vulnerable; CITES Appendix II (genus listing). The largest uromastyx: about 30 in (76 cm) total "
            "length; Fife puts it at about 3 ft. Species+ includes the former U. leptieni and U. microlepis "
            "in this species."
        ),
        "has_morph_market": False, "morph_complexity": None,
        "care_guide": (
            "**Egyptian Uromastyx (Uromastyx aegyptia)** - the giant of the genus, reaching about 30 inches, so it "
            "needs far more room than other uromastyx (8x4x4 ft minimum per ReptiFiles). Otherwise its needs "
            "match the genus: a very hot basking spot, strong UVB and dry air. " + _DIET_SENTENCE + " It is "
            "listed as Vulnerable by the IUCN."
        ),
        "source_url": "https://reptifiles.com/uromastyx",
        "sources": cite("reptifiles_uromastyx", "lafeber_uromastyx", "fife_reptiles_mag",
                        "rd_aegyptia", "splus_aegyptia", *_DIET_SOURCE_KEYS_GENUS),
    },
    {
        "scientific_name": "Uromastyx nigriventris",
        "common_names": ["Moroccan Uromastyx", "Moroccan Spiny-tailed Lizard"],
        "genus": "Uromastyx", "family": "Agamidae", "order_name": "Squamata", "taxon": "lizard",
        "care_level": None, "handleability": "docile", "activity_period": "diurnal",
        "native_region": (
            "Morocco east and south of the Atlas Mountains and western Algeria - desert, rocky steppe and boulders"
        ),
        "adult_length_min_in": Decimal("15"), "adult_length_max_in": Decimal("17"),
        "adult_weight_min_g": None, "adult_weight_max_g": None,
        "temp_cool_min": Decimal("80"), "temp_cool_max": Decimal("90"),
        "temp_warm_min": None, "temp_warm_max": None,
        "temp_basking_min": Decimal("115"), "temp_basking_max": Decimal("130"),
        "temp_night_min": None, "temp_night_max": None,
        "humidity_min": 20, "humidity_max": 30,
        "uvb_required": True, "uvb_type": "T5_HO", "uvb_replacement_months": None,
        "enclosure_type": "terrestrial",
        "enclosure_min_adult": "4x2x2 ft minimum, larger preferred",
        "bioactive_suitable": False,
        "substrate_safe_list": _SUBSTRATE_SAFE,
        "substrate_avoid_list": [],
        "substrate_depth_min_in": Decimal("4"), "substrate_depth_max_in": None,
        "diet_type": "herbivore",
        "feeding_frequency_juvenile": _FREQ_JUVENILE,
        "feeding_frequency_adult": _FREQ_ADULT,
        "supplementation_notes": _DIET_SUPP,
        "water_bowl_description": _DIET_WATER,
        "soaking_behavior": "Fife: thin or newly imported lizards may be offered water or a warm soak.",
        "brumation_required": False,
        "brumation_notes": _BRUMATION_FIFE,
        "lifespan_captivity_min_yrs": 15, "lifespan_captivity_max_yrs": 25,
        "cites_appendix": "II", "iucn_status": None,
        "wild_population_notes": (
            "CITES Appendix II (genus listing). Split from U. acanthinura (CITES adopted the split at CoP16, "
            "2013); older care texts call it U. acanthinura or the Moroccan spiny-tailed lizard. No IUCN "
            "assessment under this name was found. LafeberVet notes colourful pet-trade animals are often "
            "wild-caught in Morocco and Algeria."
        ),
        "has_morph_market": False, "morph_complexity": None,
        "care_guide": (
            "**Moroccan Uromastyx (Uromastyx nigriventris)** - a colourful uromastyx (red, orange, yellow or green) "
            "from Morocco and western Algeria, formerly treated as part of U. acanthinura. It needs a very hot "
            "basking spot, strong UVB and dry air. " + _DIET_SENTENCE + " Wild Moroccan uromastyx eat a wide "
            "range of desert plants and get their water from them; many in the trade are wild-caught, so ask for "
            "captive-bred animals."
        ),
        "source_url": "https://reptifiles.com/uromastyx",
        "sources": cite("reptifiles_uromastyx", "lafeber_uromastyx", "fife_reptiles_mag",
                        "rd_nigriventris", "splus_nigriventris", *_DIET_SOURCE_KEYS_GENUS,
                        "bendami_znari_2021"),
    },
]

for _row in SPECIES_DATA:
    _row["content_last_reviewed_at"] = REVIEWED_ON
    _row["image_url"] = None


# ---- Diet-only updates of EXISTING rows --------------------------------------
# The only fields a diet-only update may write. "sources" is never replaced:
# new entries are appended after the row's existing ones.
DIET_UPDATE_FIELDS = frozenset({
    "diet_type",
    "feeding_frequency_hatchling", "feeding_frequency_juvenile", "feeding_frequency_adult",
    "supplementation_notes", "water_bowl_description", "care_guide",
    "content_last_reviewed_at", "sources",
})

DIET_UPDATES = [
    {
        # The keeper-owned production row (owner's own animal). Its non-diet
        # facts are kept word for word in care_guide; its three existing
        # sources (IUCN, UV-Tool, ReptiFiles) are kept and the diet sources are
        # appended. ReptiFiles is already there (same ref_key), so it is not
        # added twice.
        "scientific_name": "Uromastyx geyri",
        "fields": {
            "diet_type": "herbivore",
            "feeding_frequency_juvenile": _FREQ_JUVENILE,
            "feeding_frequency_adult": _FREQ_ADULT,
            "supplementation_notes": _DIET_SUPP,
            "water_bowl_description": _DIET_WATER,
            "care_guide": (
                "**Saharan Uromastyx (Uromastyx geyri)** — a sun-loving desert herbivore that needs a very hot "
                "basking spot, strong high-output UVB, and very low humidity (keep it under about 35 percent; damp "
                "conditions cause respiratory disease). " + _DIET_SENTENCE + " Most of its water comes from fresh "
                "greens, but a small, shallow water dish is fine as long as humidity stays low."
            ),
            "content_last_reviewed_at": REVIEWED_ON,
        },
        "append_sources": cite("reptifiles_uromastyx", *_DIET_SOURCE_KEYS_GENUS),
    },
]


def _norm_url(url):
    return (url or "").strip().rstrip("/").lower()


def _diet_update_changes(existing, update):
    """Changes a diet-only update would make to `existing` (pure; no DB).

    Returns {field: (old, new)}. Only DIET_UPDATE_FIELDS can appear. Sources
    are appended, never replaced or reordered: an entry is skipped when the row
    already holds one with the same ref_key or the same URL.
    """
    fields = update["fields"]
    if "sources" in fields:
        raise SystemExit("Refusing: diet updates append sources via append_sources, never replace them")
    bad = set(fields) - DIET_UPDATE_FIELDS
    if bad:
        raise SystemExit(f"Refusing: diet update for {update['scientific_name']} touches non-diet fields {bad}")

    changes = {}
    for field, value in fields.items():
        old = getattr(existing, field, None)
        if old != value:
            changes[field] = (old, value)

    old_sources = list(getattr(existing, "sources", None) or [])
    held_keys = {s.get("ref_key") for s in old_sources if isinstance(s, dict) and s.get("ref_key")}
    held_urls = {_norm_url(s.get("url")) for s in old_sources if isinstance(s, dict)}
    added = []
    for s in update["append_sources"]:
        if s["ref_key"] in held_keys or _norm_url(s["url"]) in held_urls:
            continue
        added.append(s)
        held_keys.add(s["ref_key"])
        held_urls.add(_norm_url(s["url"]))
    if added:
        changes["sources"] = (old_sources, old_sources + added)
    return changes


def _changed_fields(existing, data):
    """Fields whose stored value differs from the seed value."""
    changes = {}
    for field, value in data.items():
        if field == "scientific_name":
            continue
        old = getattr(existing, field, None)
        if old != value:
            changes[field] = (old, value)
    return changes


def seed(apply: bool = False):
    from app.database import SessionLocal
    from app.models.reptile_species import ReptileSpecies
    from app.utils.slugs import slugify_unique

    names = {d["scientific_name"].strip().lower() for d in SPECIES_DATA}
    if names & PROTECTED:
        raise SystemExit(f"Refusing to run: list contains a protected species {names & PROTECTED}")
    diet_names = {u["scientific_name"].strip().lower() for u in DIET_UPDATES}
    if diet_names & names:
        raise SystemExit(f"Refusing to run: {diet_names & names} is in both SPECIES_DATA and DIET_UPDATES")

    db = SessionLocal()
    added = updated = unchanged = 0
    diet_updated = diet_unchanged = diet_missing = 0

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
                changes = _changed_fields(existing, data)
                if not changes:
                    unchanged += 1
                    print(f"  Unchanged: {scientific_name}")
                    continue
                for field, (_old, new) in changes.items():
                    setattr(existing, field, new)
                if not getattr(existing, "slug", None):
                    existing.slug = slugify_unique(
                        slug_source,
                        is_taken=lambda s: _slug_taken(s, exclude_id=existing.id),
                        fallback=f"species-{str(existing.id)[:8]}",
                    )
                db.flush()
                updated += 1
                print(f"  Update:  {scientific_name}  (slug={existing.slug})")
                for field, (old, new) in changes.items():
                    print(f"      {field}: {old!r} -> {new!r}")
                continue

            new_id = uuid.uuid4()
            slug_value = slugify_unique(
                slug_source,
                is_taken=_slug_taken,
                fallback=f"species-{str(new_id)[:8]}",
            )
            db.add(ReptileSpecies(
                id=new_id,
                scientific_name_lower=scientific_name_lower,
                slug=slug_value,
                is_verified=True,
                **data,
            ))
            db.flush()
            added += 1
            print(f"  Add:     {scientific_name}  (slug={slug_value})")

        # Diet-only updates: existing rows only, diet fields only, never create.
        for upd in DIET_UPDATES:
            scientific_name = upd["scientific_name"].strip()
            existing = (
                db.query(ReptileSpecies)
                .filter(ReptileSpecies.scientific_name_lower == scientific_name.lower())
                .first()
            )
            if existing is None:
                diet_missing += 1
                print(f"  Skip (diet-only, row not found; never created): {scientific_name}")
                continue
            changes = _diet_update_changes(existing, upd)
            if not changes:
                diet_unchanged += 1
                print(f"  Diet unchanged: {scientific_name}")
                continue
            for field, (_old, new) in changes.items():
                setattr(existing, field, new)
            db.flush()
            diet_updated += 1
            print(f"  Diet-only update: {scientific_name}")
            for field, (old, new) in changes.items():
                if field == "sources":
                    kept = len(old)
                    print(f"      sources: keep {kept} existing, append {len(new) - kept}:")
                    for s in new[kept:]:
                        print(f"        + {s['ref_key']}: {s['title']} <{s['url']}>")
                else:
                    print(f"      {field}: {old!r} -> {new!r}")

        diet_summary = (
            f"Diet-only: updated {diet_updated}, unchanged {diet_unchanged}, not found {diet_missing}."
        )
        if apply:
            db.commit()
            print(f"\nApplied. Added {added}, updated {updated}, unchanged {unchanged}. {diet_summary}")
        else:
            db.rollback()
            print(f"\nDry run (rolled back). Would add {added}, update {updated}; unchanged {unchanged}. "
                  f"{diet_summary}")
            print("Re-run with --apply to write.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    args = parser.parse_args()
    seed(apply=args.apply)
