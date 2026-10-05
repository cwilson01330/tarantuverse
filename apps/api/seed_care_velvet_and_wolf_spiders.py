"""
Care guides — Stegodyphus lineatus (desert velvet spider) and Hogna maderiana
(Madeira wolf spider).

Requested 2026-10-05: a keeper has both in her collection with no catalog match.

Honesty-first: values come from the sources below, and fields they don't give
are left NULL. The velvet spider gets NO humidity range on purpose: the most
detailed care guide is emphatic that it must be kept bone dry with no misting,
and a number would invite exactly the mistake that kills them.

Sources:
  Stegodyphus lineatus
    - The Tarantula Collective care guide (rev. March 2025): Mediterranean /
      Middle East; body to ~0.6 in; mild venom; moderate growth; beginner to
      intermediate; 68-76°F; NO misting, NO water dish (water from prey; humidity
      can be fatal); substrate 1/3-1/2 of the enclosure, dry; anchors for web
      tunnels; can be kept singly or communally; feeding schedule by stage.
      https://www.thetarantulacollective.com/care-sheets-2/stegodyphus-lineatus
  Hogna maderiana
    - Mantis House care sheet: endemic to Madeira; ~2-2.5 in leg span; 20-26°C;
      50-70% humidity with light misting, never waterlogged; shallow water dish or
      droplets; sand/soil 5-8 cm; hides; feed every 3-5 days; no prey web.
      https://www.mantishouse.co.uk/product-page/hogna-maderiana-madeira-wolf-spider
    - Buzzard Reptile: terrestrial; fast growth; intermediate; females 2-3 yrs,
      males 1+ yr.  https://buzzardreptile.co.uk/product/hogna-maderiana/
    - Arachnid Rarities: sold as "Hogna maderiana (ex schmitzi)".
      https://www.arachnidrarities.com/inventory/p/hogna-maderiana

Run (Render shell, from apps/api):  python3 seed_care_velvet_and_wolf_spiders.py   (idempotent)
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
        taxon="true_spider",
        scientific_name="Stegodyphus lineatus",
        common_names=["Desert Velvet Spider", "Lined Velvet Spider"],
        genus="Stegodyphus", family="Eresidae", order_name="Araneae",
        care_level="beginner",
        temperament="docile; rarely bites, retreats into its silk; not for handling",
        native_region="arid Mediterranean and Middle East (Spain, Israel, Turkey, North Africa)",
        adult_size="body up to ~0.6 in (15 mm)",
        adult_length_max_mm=15,
        growth_rate="medium",
        type="semi-arboreal (web)",
        feeding_mode="predator", burrowing="light",
        webbing_amount="dense silk retreat and web tunnels",
        temperature_min=68, temperature_max=76,
        # humidity deliberately NULL — keep bone dry; see module docstring.
        enclosure_size_sling="small, very well ventilated sling enclosure",
        enclosure_size_juvenile="medium enclosure, ventilation holes too small to escape",
        enclosure_size_adult="small square or wide enclosure (about 4-6 in cube)",
        substrate_depth="fill 1/3 to 1/2 of the enclosure, kept dry",
        substrate_type="dry substrate; twigs, excelsior or grapevine to anchor web tunnels",
        prey_size="fruit flies and pinheads as slings; crickets or small roaches later",
        feeding_frequency_sling="twice a week",
        feeding_frequency_juvenile="weekly, as the abdomen needs",
        feeding_frequency_adult="every 2-3 weeks, as the abdomen needs",
        water_dish_required=False,
        communal_suitable=True,
        urticating_hairs=False, medically_significant_venom=False, venom_severity="mild",
        care_guide=(
            "A small, social velvet spider from arid Mediterranean scrub that builds dense "
            "silk retreats and tunnels. The rule that matters most: keep it BONE DRY. Do not "
            "mist and do not give a water dish. It gets its water from prey, and humidity "
            "building up in the enclosure is the most common way these spiders die in "
            "captivity. Give strong ventilation, dry substrate filling a third to half of "
            "the enclosure, and twigs, excelsior or light grapevine to anchor its webbing. "
            "68-76°F suits it; it is more active toward the warmer end. Feed slings twice a "
            "week; for juveniles and adults, feed by the abdomen rather than the calendar, "
            "and hold off if it looks plump. It can live alone or in a small group (it is "
            "naturally communal; size up the enclosure and feed generously if grouped). "
            "Females famously feed their young with their own bodies (matriphagy). Docile, "
            "mild venom, not a handling spider."
        ),
        source_url="https://www.thetarantulacollective.com/care-sheets-2/stegodyphus-lineatus",
    ),
    dict(
        taxon="true_spider",
        scientific_name="Hogna maderiana",
        common_names=["Madeira Wolf Spider", "Orange-legged Wolf Spider"],
        genus="Hogna", family="Lycosidae", order_name="Araneae",
        care_level="intermediate",
        temperament="fast, active hunter and a keen feeder; not a handling spider",
        native_region="Madeira, Portugal",
        adult_size="~2-2.5 in leg span",
        growth_rate="fast",
        type="terrestrial",
        feeding_mode="predator",
        webbing_amount="no prey web; hunts on foot",
        temperature_min=68, temperature_max=79,
        humidity_min=50, humidity_max=70,
        enclosure_size_adult="terrestrial enclosure with a secure lid, rocks, bark and hides",
        substrate_depth="2-3 inches (5-8 cm)",
        substrate_type="sand and soil (or coco fiber) mix, on the drier side",
        prey_size="small locusts, crickets, roaches, mealworms",
        feeding_frequency_sling="more often than adults",
        feeding_frequency_adult="every 3-5 days",
        water_dish_required=True,
        communal_suitable=False,
        urticating_hairs=False, medically_significant_venom=False, venom_severity="mild",
        care_guide=(
            "An orange-legged wolf spider endemic to Madeira that stalks its prey instead of "
            "building a web, which makes it a busy, watchable display spider. Give a "
            "terrestrial enclosure with a secure lid and 2-3 inches of a sand and soil mix "
            "kept on the drier side, with rocks, bark and hides for cover. Room temperature "
            "is fine (about 68-79°F). Aim for 50-70% humidity with light misting, and never "
            "let it get waterlogged. Offer a shallow water dish or mist droplets to drink. "
            "It grows fast and eats eagerly: crickets, small roaches, locusts or mealworms "
            "every 3-5 days, and slings more often; remove uneaten prey after a day. "
            "Females live about 2-3 years, males about 1. You may also see it sold as "
            "Hogna schmitzi. Keep one per enclosure."
        ),
        source_url="https://www.mantishouse.co.uk/product-page/hogna-maderiana-madeira-wolf-spider",
    ),
]


def _check_lengths():
    """Fail before touching the database if any text is longer than its column."""
    cols = InvertSpecies.__table__.columns
    for data in SPECIES_DATA:
        for key, value in data.items():
            limit = getattr(cols[key].type, "length", None) if key in cols else None
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
