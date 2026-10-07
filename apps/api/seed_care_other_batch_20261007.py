"""
Care guides for species keepers had filed as "Other" or typed freehand with
no catalog match (2026-10-07): Cilantica psychedelicus, Lasiodora striatipes,
Avicularia variegata, Liphistius jarujini, Linothele sericata, Phidippus
arizonensis, Paraphidippus fartilis.

Honesty-first, as with every seed: values come from the sources listed per
species, and fields they don't give are left NULL. Several of these are
thinly documented in the hobby; their sheets say so instead of padding.

Classification notes (taxon is the app's bucket, not a phylogeny):
  - Liphistius (Liphistiidae, suborder Mesothelae) and Linothele (Dipluridae,
    a mygalomorph) are neither tarantulas nor "true" (araneomorph) spiders.
    The app's true_spider taxon is its bucket for every non-tarantula spider,
    and keepers already file Liphistius there, so they go there; each care
    guide says what the animal actually is.

Run (Render shell, from apps/api):  python3 seed_care_other_batch_20261007.py   (idempotent)
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
    dict(
        # Sources:
        #   Wikipedia, "Cilantica" (genus erected by Mirza 2024; C. psychedelicus
        #   was described as Thrigmopoeus psychedelicus and long sold as
        #   Haploclastus devamatha). https://en.wikipedia.org/wiki/Cilantica
        #   Arachnoboards, "Haploclastus devamatha Care?" (fossorial; mid-70s to
        #   low-80s °F; deep damp substrate; very reclusive).
        #   https://arachnoboards.com/threads/haploclastus-devamatha-care.317724/
        taxon="tarantula",
        scientific_name="Cilantica psychedelicus",
        common_names=["Psychedelic Earth Tiger"],
        genus="Cilantica", family="Theraphosidae", order_name="Araneae",
        native_region="Western Ghats, India",
        type="fossorial",
        feeding_mode="predator", burrowing="heavy",
        temperament="very reclusive; rarely seen out of its burrow",
        temperature_min=75, temperature_max=82,
        enclosure_size_adult="floor at least 2x by 3x the leg span, room for deep substrate",
        substrate_depth="2-3 in for slings; 5 in or more for adults",
        substrate_type="deep, damp substrate (e.g. coco fiber or ABG mix) with a hide",
        urticating_hairs=False,  # Old World (Asian) theraphosid: no urticating setae
        care_guide=(
            "An Indian fossorial tarantula from the Western Ghats, famous for its "
            "psychedelic blue-and-black pattern and for almost never being seen. It "
            "was sold for years as Haploclastus devamatha; since 2024 it is "
            "Cilantica psychedelicus (the genus name comes from the Tamil word for "
            "spider). Give it deep, damp substrate, at least 5 inches for an adult, "
            "with a starter hide so it can dig in, and keep it in the mid-70s to "
            "low-80s °F. Expect a burrow and very little else: it is the definition "
            "of a 'pet hole'. As an Old World species it has no urticating hairs, "
            "so its defence is speed and its bite; treat it as a look-don't-touch "
            "animal."
        ),
        source_url="https://arachnoboards.com/threads/haploclastus-devamatha-care.317724/",
    ),
    dict(
        # Source: Buzzard Reptile species sheet (terrestrial; Brazil; ~10 in DLS;
        # medium-fast growth; females ~15 yrs, males 3-5; 24-26 °C; ~75%
        # humidity; ~2 ft enclosure for adults; damp coir, hide, water bowl;
        # adults fed every 7-10 days; urticating hairs; heavy-bodied, falls fatal).
        # https://buzzardreptile.co.uk/product/lasiodora-stratipes/
        taxon="tarantula",
        scientific_name="Lasiodora striatipes",
        common_names=["Bahia Grey Birdeater"],
        genus="Lasiodora", family="Theraphosidae", order_name="Araneae",
        care_level="beginner",
        native_region="Brazil (Bahia)",
        adult_size="up to ~10 in leg span",
        growth_rate="medium-fast",
        type="terrestrial",
        feeding_mode="predator",
        temperament="docile, but a big spider that flicks urticating hairs",
        temperature_min=75, temperature_max=79,
        humidity_min=70, humidity_max=80,
        enclosure_size_adult="about 2 ft long, low and wide",
        substrate_type="damp-holding substrate such as coco fiber, with a hide",
        prey_size="crickets, roaches, locusts",
        feeding_frequency_adult="every 7-10 days; a greedy feeder, don't overfeed",
        water_dish_required=True,
        urticating_hairs=True, medically_significant_venom=False,
        care_guide=(
            "One of the Brazilian giant birdeaters, a close rival to L. parahybana in "
            "size at up to about 10 inches, plain grey with a little red on the "
            "abdomen. Females live around 15 years, males 3-5. House an adult in a "
            "low, wide enclosure about 2 feet long on a damp-holding substrate such "
            "as coco fiber, with a hide and a water dish, at about 75-79°F and "
            "around 75% humidity. It eats like a horse: feed adults no more than "
            "every 7-10 days. It is usually out in the open, which makes it a great "
            "display spider. It does flick urticating hairs, and it is heavy-bodied: "
            "a fall of only a few inches can burst the abdomen, so keep the "
            "enclosure low and handle only when you must."
        ),
        source_url="https://buzzardreptile.co.uk/product/lasiodora-stratipes/",
    ),
    dict(
        # Sources:
        #   Wikipedia, "Avicularia variegata" (Brazil).
        #   https://en.wikipedia.org/wiki/Avicularia_variegata
        #   Arachnoboards "Avicularia care" (current practice for the genus: dry
        #   substrate, water dish, strong cross-ventilation; misting/humidity
        #   targets are outdated and a stuffy enclosure kills Avicularia).
        #   https://arachnoboards.com/goto/post?id=3247609
        #   Arachnoboards keeper thread (variegata among the largest Avicularia;
        #   more reactive than A. avicularia).
        #   https://arachnoboards.com/goto/post?id=3462111
        taxon="tarantula",
        scientific_name="Avicularia variegata",
        common_names=[],
        genus="Avicularia", family="Theraphosidae", order_name="Araneae",
        native_region="Brazil",
        adult_size="among the largest Avicularia",
        type="arboreal",
        feeding_mode="predator",
        temperament="more reactive than A. avicularia",
        enclosure_size_adult="taller than wide, with strong cross-ventilation",
        substrate_type="dry substrate; cork bark or a branch to web up high",
        water_dish_required=True,
        urticating_hairs=True, medically_significant_venom=False,
        care_guide=(
            "A Brazilian pinktoe, among the largest of its genus, with a metallic "
            "teal carapace and blue legs. Keep it the way current keepers keep every "
            "Avicularia: dry substrate, a large water dish, cork bark or a branch "
            "for it to web in up high, and a lot of cross-ventilation. Old care "
            "sheets that call for high humidity and regular misting are behind a lot "
            "of dead Avicularia; a stuffy enclosure is the real danger, not a dry "
            "one. It is a little more reactive than A. avicularia. Like the rest of "
            "the genus it has urticating hairs that work on contact rather than "
            "being flicked."
        ),
        source_url="https://arachnoboards.com/goto/post?id=3247609",
    ),
    dict(
        # Source: Arachnoboards "Armored Trapdoor Spiders (Liphistius sp.)" and
        # linked threads (clay-based substrate, 25-40% clay in a mix with topsoil
        # and/or coco fiber, kept damp; must hold a burrow; provide starter holes,
        # they dig poorly and don't survive without a burrow; hardy once settled).
        # https://arachnoboards.com/threads/armored-trapdoor-spiders-liphistius-sp.358714/
        taxon="true_spider",
        scientific_name="Liphistius jarujini",
        common_names=["Armored trapdoor spider"],
        genus="Liphistius", family="Liphistiidae", order_name="Araneae",
        type="fossorial (trapdoor)",
        feeding_mode="predator", burrowing="obligate (trapdoor burrow)",
        substrate_depth="deep enough for a vertical burrow",
        substrate_type="damp mix with 25-40% clay (plus topsoil and/or coco fiber)",
        care_guide=(
            "A segmented trapdoor spider: Liphistius belongs to Mesothelae, the oldest "
            "living spider lineage, and is neither a tarantula nor a 'true' spider "
            "(it is filed with the true spiders in this app). Very little is "
            "published on keeping it, so this sheet sticks to what keepers report. "
            "The thing that matters is the substrate: a damp, clay-based mix (about "
            "25-40% clay with topsoil and/or coco fiber) that holds together well "
            "enough to take a burrow and a hinged door. They dig badly and do not "
            "survive without a burrow, so give several starter holes. Once settled "
            "in a good burrow they are hardy. Expect to see a door and silk "
            "tripwires, not the spider."
        ),
        source_url="https://arachnoboards.com/threads/armored-trapdoor-spiders-liphistius-sp.358714/",
    ),
    dict(
        # Sources:
        #   Plazi treatment, Linothele sericata (Karsch, 1879): type locality Bogotá,
        #   Colombia. https://tb.plazi.org/GgServer/html/0386CD35FF8AFFB7746EFC0B45BB90B9
        #   Fear Not Tarantulas, Linothele megatheloides sheet (genus-level husbandry:
        #   heavy webber of crevices and foliage; anchors such as cork bark and
        #   plants; fast, skittish, painful bite; crickets, roaches, mealworms).
        #   https://fearnottarantulas.com/pages/linothele-megatheloides-colombian-funnel-web-spider
        taxon="true_spider",
        scientific_name="Linothele sericata",
        common_names=["Colombian golden sheet web spider"],
        genus="Linothele", family="Dipluridae", order_name="Araneae",
        native_region="Colombia",
        type="web-builder (sheet/funnel)",
        feeding_mode="predator",
        webbing_amount="heavy: sheet webs and funnel tunnels",
        temperament="fast and skittish (genus); bite reported as painful",
        substrate_type="cork bark and plants as anchors for webbing",
        prey_size="crickets, roaches, mealworms",
        care_guide=(
            "A Colombian funnel-web mygalomorph (family Dipluridae): related to "
            "tarantulas but not one, and filed with the true spiders in this app. "
            "Species-level care data is scarce, so this follows what is reported "
            "for its genus (Linothele megatheloides is the commonly kept one). "
            "These are heavy webbers that build sheet webs running into silk "
            "tunnels in crevices and foliage, so give plenty of anchor points: cork "
            "bark, branches and broadleaf plants. They feel every movement on the "
            "web, are very fast and skittish, and the bite is reported as painful, "
            "so this is a watch-not-handle spider. Crickets, roaches and mealworms "
            "are all taken off the web."
        ),
        source_url="https://fearnottarantulas.com/pages/linothele-megatheloides-colombian-funnel-web-spider",
    ),
    dict(
        # Source: Bugs In Cyberspace listing (captive bred; juveniles feed on
        # D. hydei fruit flies or house flies; adult female colouring varies
        # widely; adult males slate blue to black with pale fuzzy front legs;
        # named by the Peckhams in 1883, likely after the Arizona Territory).
        # https://bugsincyberspace.com/product/phidippus-arizonensis-arizona-jumping-juvenile/
        taxon="true_spider",
        scientific_name="Phidippus arizonensis",
        common_names=["Arizona Jumping Spider"],
        genus="Phidippus", family="Salticidae", order_name="Araneae",
        type="arboreal (jumping spider)",
        feeding_mode="predator",
        enclosure_size_adult="taller than wide, with branches and foliage",
        prey_size="fruit flies (D. hydei) as juveniles; house flies",
        care_guide=(
            "A Phidippus jumping spider described by the Peckhams in 1883, probably "
            "named for the old Arizona Territory: there are no confirmed records of "
            "it in the state of Arizona itself. Adult females vary a lot, mixing "
            "black, white, brown, red and orange; adult males are slate blue to "
            "black, sometimes with a metallic sheen, with big pale fuzzy front legs. "
            "Keep it like other Phidippus: an enclosure taller than it is wide, "
            "with branches and foliage to climb and build a retreat in, and the "
            "door or vents placed so the silk nest at the top isn't disturbed. "
            "Juveniles take D. hydei fruit flies; larger spiders take house flies."
        ),
        source_url="https://bugsincyberspace.com/product/phidippus-arizonensis-arizona-jumping-juvenile/",
    ),
    dict(
        # Source: Bugs In Cyberspace sells it as the "Cloud Jumper" (captive bred).
        # https://bugsincyberspace.com/product/cloud-jumper-paraphidippus-fartilis-spiderling/
        # General jumping spider husbandry as for Phidippus above (same source's
        # care sheet). Little species-specific data exists; the sheet says so.
        taxon="true_spider",
        scientific_name="Paraphidippus fartilis",
        common_names=["Cloud Jumper", "Cloud jumping spider"],
        genus="Paraphidippus", family="Salticidae", order_name="Araneae",
        type="arboreal (jumping spider)",
        feeding_mode="predator",
        enclosure_size_adult="taller than wide, with branches and foliage",
        care_guide=(
            "A small jumping spider sold in the hobby as the Cloud Jumper. Little "
            "species-specific care information has been published, so keep it as "
            "you would other jumping spiders: an enclosure taller than it is wide, "
            "with branches and foliage to climb and nest in, ventilation that "
            "doesn't disturb the silk retreat at the top, and small flying prey "
            "sized to the spider (fruit flies for spiderlings)."
        ),
        source_url="https://bugsincyberspace.com/product/cloud-jumper-paraphidippus-fartilis-spiderling/",
    ),
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
