"""
Care guide — Holconia murrayensis (Murray's banded huntsman).

Requested 2026-10-05: a keeper couldn't set her huntsman to this species because
it wasn't in the unified `invert_species` catalog (only three Heteropoda
huntsmen were).

Honesty-first, as with every catalog seed: values come from the sources below,
and fields the sources don't give are left NULL rather than guessed. In
particular there is no published humidity range for this species, only
consistent advice to keep it DRY, so humidity is NULL and the care guide
says "keep it dry" in words. Body length isn't published either, so the
adult length fields are NULL as well.

Sources:
  - Bug Frenzy (Australian breeder): legspan to ~170 mm; semi-arid SA, VIC, NSW.
    https://bugfrenzy.com.au/product/murray-banded-huntsman-holconia-murrayensis/
  - Arachnoboards thread, keeper who raised it to adulthood and bred it 4 times:
    keep dry; most hydration from prey; tiny spritz every 1-2 weeks, about weekly
    once ~2 in; calmer than other hobby huntsmen.
    https://arachnoboards.com/threads/is-all-holconia-species-care-the-same.367370/
  - Urban Tarantulas care notes: 70-85°F; drier side; sling vial ~4-5 in tall.
    https://www.urbantarantulas.com/products/holconia-murrayensis-murrays-banded-huntsman
  - Minibeast Wildlife care guide for the congener H. immanis (genus-level
    behaviour only: prey no larger than ~1/3 of the spider, needs height to
    molt, escape artist, siblings cannibalise once dispersed).
    https://shop.minibeastwildlife.com.au/content/Minibeast%20Wildlife%20Care%20Guide%20-%20Holconia%20immanis.pdf

Run (Render shell, from apps/api):  python3 seed_care_holconia_murrayensis.py   (idempotent)
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


SPECIES = dict(
    taxon="true_spider",
    scientific_name="Holconia murrayensis",
    common_names=["Murray's Banded Huntsman", "Murray Banded Huntsman"],
    genus="Holconia", family="Sparassidae", order_name="Araneae",
    care_level="intermediate",
    temperament=(
        "calmer and more deliberate than most hobby huntsmen, but still very fast "
        "when startled; bite mechanically painful, not medically significant"
    ),
    native_region="semi-arid south-eastern Australia (South Australia, Victoria, New South Wales)",
    adult_size="up to ~6.7 in (170 mm) leg span",
    type="arboreal (huntsman)",
    feeding_mode="predator", burrowing="none",
    webbing_amount="no prey web; silk retreat only",
    temperature_min=70, temperature_max=85,
    # humidity_min / humidity_max deliberately NULL — see module docstring.
    enclosure_size_sling="ventilated vial about 4-5 in tall and 2 in wide",
    enclosure_size_juvenile="ventilated container taller than wide, cork bark to grip and hide behind",
    enclosure_size_adult=(
        "tall, well-ventilated enclosure (taller than wide) with cork bark slabs; "
        "enough height to hang and molt"
    ),
    substrate_depth="thin layer (no deep substrate needed)",
    substrate_type="dry coco fiber or soil; vertical cork bark; strong ventilation",
    prey_size="no larger than about 1/3 of the spider — crickets, roaches, moths, flies",
    feeding_frequency_sling="small prey, more often",
    feeding_frequency_adult="about once or twice a week",
    water_dish_required=False,
    communal_suitable=False,
    urticating_hairs=False, medically_significant_venom=False, venom_severity="mild",
    care_guide=(
        "An Australian banded huntsman from dry scrubland, and the one thing every "
        "keeper who has raised it agrees on is: KEEP IT DRY. Unlike most huntsmen in the "
        "hobby, it does poorly when wet. Slings get almost all their water from prey; "
        "give only a tiny spritz on the far wall every week or two, and about weekly once "
        "the spider reaches roughly 2 inches. Never mist the spider itself. Strong "
        "ventilation matters more than moisture. Room temperature to warm (70-85°F) suits "
        "it. House it taller than wide with cork bark slabs to press behind, and leave "
        "enough height for it to hang and molt; a thin layer of dry substrate is plenty. "
        "Feed prey no larger than about a third of its size. It is noticeably calmer than "
        "Heteropoda huntsmen, but it is still a large, very fast spider with big fangs: "
        "the bite is painful but not medically significant. It is a flat-bodied escape "
        "artist, so check every gap around the lid. Keep one per enclosure."
    ),
    source_url="https://bugfrenzy.com.au/product/murray-banded-huntsman-holconia-murrayensis/",
)


def seed():
    db = SessionLocal()
    try:
        name = SPECIES["scientific_name"]
        if db.query(InvertSpecies).filter(InvertSpecies.scientific_name_lower == name.lower()).first():
            print(f"Skipped (exists): {name}")
            return
        row = dict(SPECIES)
        taxon = row.pop("taxon")
        db.add(InvertSpecies(
            id=uuid.uuid4(), taxon=taxon,
            scientific_name_lower=name.lower(), slug=_slugify(name),
            is_verified=True, **row,
        ))
        db.commit()
        print(f"Added: {taxon} {name}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
