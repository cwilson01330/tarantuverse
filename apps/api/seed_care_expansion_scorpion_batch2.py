"""
Care-guide expansion — SCORPION batch 2 (BRIEF-care-guide-expansion §2).

6 net-new pet scorpions, verified absent from the live catalog (36 species
checked). Single-table insert into `invert_species` (taxon='scorpion') — same
convention as scorpion batch 1 (scorpion care sheets read from invert_species).

Honesty-first: every row cites a source_url; venom_severity is the headline
safety field, tiered honestly (mild | moderate | medically_significant) with
venom_notes. None here is medically significant — the genuinely dangerous
buthids (Leiurus, Androctonus, Parabuthus villosus, Tityus serrulatus) are
already in the catalog. Reclassification notes where the hobby name differs
from the current valid genus (Javanimetrus cyaneus; Teruelius grandidieri).
Hoffmannihadrurus aztecus has thin species-specific data → care follows the
established giant-hairy (Hadrurus) genus, noted in the guide.

Controlled vocab matched to schemas/invert_species.py:
  care_level ∈ {beginner,intermediate,advanced}; feeding_mode='predator';
  burrowing ∈ {none,light,heavy}; venom_severity ∈ {mild,moderate,medically_significant}.

Run with: python3 seed_care_expansion_scorpion_batch2.py   (idempotent)
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


def _scorp(**kw):
    base = dict(
        taxon="scorpion", order_name="Scorpiones", feeding_mode="predator",
        urticating_hairs=False, growth_rate="slow",
        prey_size="crickets, roaches", feeding_frequency_adult="1 prey every 1-2 weeks",
        water_dish_required=True, communal_suitable=False,
        enclosure_size_adult="10-20 gal; deep substrate or rock stacks per type",
        substrate_depth="3-6 inches",
    )
    base.update(kw)
    return base


SPECIES_DATA = [
    _scorp(
        scientific_name="Heterometrus cyaneus", common_names=["Asian Blue Forest Scorpion"],
        genus="Heterometrus", family="Scorpionidae", care_level="beginner",
        temperament="more defensive than the emperor; bold",
        native_region="Borneo, the Philippines, Indonesia",
        adult_size="4.5-6 inches", adult_length_min_mm=120, adult_length_max_mm=150,
        type="fossorial", burrowing="heavy",
        temperature_min=75, temperature_max=85, humidity_min=70, humidity_max=80,
        substrate_type="deep moist coco/peat for burrowing; bark hides; water dish",
        venom_severity="mild",
        venom_notes="Mild (bee-sting class) but a sting can give moderate-to-severe local pain; more defensive than the emperor.",
        care_guide=(
            "A big, hardy Asian forest scorpion with a dark blue sheen — much like the common "
            "Asian forest, mild-venomed and beginner-friendly, but notably more defensive, so "
            "house it alone and skip handling. Keep warm and humid (70-80%) with deep moist "
            "substrate to burrow, bark hides, and a water dish. Now classified as Javanimetrus "
            "cyaneus. Glows under UV like all scorpions."
        ),
        source_url="https://en.wikipedia.org/wiki/Javanimetrus_cyaneus",
    ),
    _scorp(
        scientific_name="Rhopalurus junceus", common_names=["Cuban Blue Scorpion", "Cuban Red Scorpion"],
        genus="Rhopalurus", family="Buthidae", care_level="intermediate",
        temperament="active hunter; territorial and cannibalistic — house alone",
        native_region="Cuba",
        adult_size="2.5-3.5 inches", adult_length_min_mm=60, adult_length_max_mm=90,
        type="terrestrial", burrowing="light",
        temperature_min=77, temperature_max=86, humidity_min=50, humidity_max=65,
        substrate_depth="2-3 inches",
        substrate_type="soil/coco with bark hides; lightly moist; water dish",
        venom_severity="mild",
        venom_notes="Not dangerous to humans (no scorpionism reported in Cuba despite frequent stings); famed in venom/cancer research (Escozul).",
        care_guide=(
            "A slender Cuban buthid, reddish with a blue-tinged tail — famous as the source of "
            "the 'blue scorpion venom' studied in cancer research, yet its sting is not dangerous "
            "to people. An active, territorial hunter that's readily cannibalistic, so keep one "
            "per enclosure with hides and a water dish at warm temps and moderate humidity. "
            "Notoriously difficult to breed in captivity."
        ),
        source_url="https://en.wikipedia.org/wiki/Rhopalurus_junceus",
    ),
    _scorp(
        scientific_name="Opistophthalmus capensis", common_names=["Cape Burrowing Scorpion"],
        genus="Opistophthalmus", family="Scorpionidae", care_level="intermediate",
        temperament="defensive burrower; quick with its pincers",
        native_region="Western Cape, South Africa",
        adult_size="up to ~5 inches", adult_length_min_mm=100, adult_length_max_mm=130,
        type="fossorial", burrowing="heavy",
        temperature_min=72, temperature_max=86, humidity_min=40, humidity_max=60,
        substrate_type="deep sandy soil, dry on top and damp at the base for a stable burrow; hide; water dish",
        venom_severity="mild",
        venom_notes="Sting may be painful but is not medically important.",
        care_guide=(
            "A stout South African burrower from coastal-dune and semi-arid country. Care "
            "follows the Opistophthalmus genus: deep substrate it can dig and pack, kept dry on "
            "top with a damp base so it can maintain a humid burrow, plus a hide and a water "
            "dish. Defensive and quick with its big pincers, so keep it as a hands-off display "
            "animal. Venom is mild and not medically important."
        ),
        source_url="https://www.inaturalist.org/taxa/510190-Opistophthalmus-capensis",
    ),
    _scorp(
        scientific_name="Hoffmannihadrurus aztecus", common_names=["Aztec Giant Hairy Scorpion"],
        genus="Hoffmannihadrurus", family="Hadruridae", care_level="intermediate",
        temperament="defensive; nervous digger",
        native_region="Mexico",
        adult_size="up to ~4.5 inches", adult_length_min_mm=90, adult_length_max_mm=120,
        type="fossorial", burrowing="heavy",
        temperature_min=78, temperature_max=90, humidity_min=30, humidity_max=45,
        substrate_type="deep dry sand/soil to burrow; strong ventilation; small water dish",
        venom_severity="mild",
        venom_notes="Mild (giant-hairy class) — painful but not dangerous to healthy adults.",
        care_guide=(
            "A Mexican giant hairy scorpion, less common in the hobby than its US relatives. "
            "Species-specific husbandry is thin, so this follows the well-established giant-hairy "
            "(Hadrurus) genus care: deep, dry substrate to burrow, warmth, low humidity, strong "
            "ventilation, and a small water dish. Defensive and nervous — best not handled. "
            "Venom is mild, painful but not dangerous."
        ),
        source_url="https://www.thetarantulacollective.com/caresheets/desert-hairy-scorpion",
    ),
    _scorp(
        scientific_name="Centruroides bicolor", common_names=["Bicolor Bark Scorpion"],
        genus="Centruroides", family="Buthidae", care_level="intermediate",
        temperament="skittish, fast climber; easily irritated",
        native_region="Central America (Costa Rica, Panama)",
        adult_size="3-4 inches", adult_length_min_mm=70, adult_length_max_mm=100,
        type="scansorial", burrowing="none",
        temperature_min=75, temperature_max=85, humidity_min=65, humidity_max=75,
        substrate_depth="1-2 inches",
        substrate_type="vertical cork/bark to climb and molt on; lightly moist substrate; hides; water dish",
        venom_severity="moderate",
        venom_notes="Sharp local pain, swelling and burning for ~3-4 hours; occasionally nausea/tachycardia, but harmless to healthy mammals. No handling.",
        care_guide=(
            "A glossy black-and-amber Central American bark scorpion — a fast, agile climber that "
            "wants vertical cork/bark to scale and molt on rather than deep substrate, in a warm, "
            "humid, tall enclosure with plenty of hides (it's skittish). Slim-clawed, so it "
            "relies on venom: a sting brings sharp local pain and swelling for a few hours, "
            "occasionally with nausea — treat as moderate and keep it strictly hands-off."
        ),
        source_url="https://aquariumbreeder.com/centruroides-bicolor-detailed-guide-care-diet-and-breeding/",
    ),
    _scorp(
        scientific_name="Grosphus grandidieri", common_names=["Madagascan Black Scorpion", "Malagasy Scorpion"],
        genus="Grosphus", family="Buthidae", care_level="intermediate",
        temperament="active hunter; defensive",
        native_region="Southern Madagascar (drier regions)",
        adult_size="up to ~5 inches", adult_length_min_mm=100, adult_length_max_mm=130,
        type="terrestrial", burrowing="light",
        temperature_min=75, temperature_max=82, humidity_min=55, humidity_max=70,
        substrate_depth="3-4 inches",
        substrate_type="coco/soil with hides; moderately moist but tolerant of drying; water dish",
        venom_severity="mild",
        venom_notes="Buthid but not medically important — localized pain and redness; a large scorpion whose sting still hurts.",
        care_guide=(
            "A large Malagasy buthid (now also placed in the genus Teruelius) and an active "
            "hunter rather than an ambusher. From drier southern Madagascar but adaptable — keep "
            "moderately moist with hides and water always available, feeding every couple of "
            "weeks. Despite being a buthid it isn't medically important (localized pain and "
            "redness only), though a sting from a scorpion this size still hurts; house "
            "individually and don't handle."
        ),
        source_url="https://www.journeysandscorpions.com/scorpion-insight/biographys/grosphus-grandidieri-kraepelin-1900",
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
