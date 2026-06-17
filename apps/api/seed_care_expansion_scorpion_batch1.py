"""
Care-guide expansion — SCORPION batch 1 (BRIEF-care-guide-expansion §2: double the genus).

10 net-new popular pet scorpions, verified absent from prod (existing 26 cover
Androctonus x3, Centruroides x2, Hadrurus x2, Heterometrus x4, Hottentotta x2,
Leiurus x2, Tityus x2 + singles). Single-table insert into `invert_species`.

Honesty-first: every row cites a source_url; venom_severity is the headline safety
field, tiered honestly (mild | moderate | medically_significant) with venom_notes.
Parabuthus villosus is genuinely dangerous (medically_significant, can spray venom)
— flagged accordingly. Reclassification notes where the hobby name differs from the
current valid genus (Gigantometrus swammerdami; Tetratrichobothrius flavicaudis).
image_url left null for the sourcer (join on scientific_name_lower).

Controlled vocab matched to schemas/invert_species.py:
  care_level ∈ {beginner,intermediate,advanced}; feeding_mode='predator';
  burrowing ∈ {none,light,heavy}; venom_severity ∈ {mild,moderate,medically_significant}.

Run with: python3 seed_care_expansion_scorpion_batch1.py   (idempotent)
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
        scientific_name="Pandinus dictator", common_names=["Dictator Scorpion", "Giant Emperor Scorpion"],
        genus="Pandinus", family="Scorpionidae", care_level="intermediate",
        temperament="docile, calm despite size", native_region="West/Central Africa",
        adult_size="up to 8 inches", adult_length_min_mm=150, adult_length_max_mm=200,
        type="fossorial", burrowing="heavy", communal_suitable=True,
        temperature_min=80, temperature_max=85, humidity_min=75, humidity_max=80,
        substrate_type="deep moist coco/soil for burrowing; bark hides; water dish",
        venom_severity="mild", venom_notes="Mild venom (bee-sting class); relies on its powerful pincers.",
        care_guide=(
            "A giant forest scorpion — like the emperor but bigger, reaching up to 8 inches — "
            "and similarly docile, relying on its massive pincers rather than venom. Keep it "
            "warm (80-85°F) and humid (75-80%) with deep moist substrate to burrow, hides, and a "
            "water dish. Tolerates communal housing with space. Mild, bee-sting-class venom. "
            "Note: like the emperor, Pandinus are CITES-listed — buy captive-bred."
        ),
        source_url="https://backwaterreptilesblog.com/dictator-scorpion-care-pandinus-dictator/",
    ),
    _scorp(
        scientific_name="Pandinus cavimanus", common_names=["Tanzanian Red Claw Scorpion"],
        genus="Pandinus", family="Scorpionidae", care_level="intermediate",
        temperament="more defensive than the emperor; easily agitated",
        native_region="Tanzania, East Africa",
        adult_size="4-5 inches", adult_length_min_mm=100, adult_length_max_mm=130,
        type="fossorial", burrowing="heavy",
        temperature_min=75, temperature_max=82, humidity_min=70, humidity_max=80,
        substrate_type="deep moist coco/peat with bark; water dish",
        venom_severity="mild", venom_notes="Mild venom (bee-sting class), but quick to defend — not for novices.",
        care_guide=(
            "A reddish-clawed African forest scorpion (often listed as Pandinoides cavimanus "
            "after reclassification). Care mirrors the emperor — warm, humid (70-80%), deep "
            "moist substrate to burrow, water dish — but it's notably more defensive and easily "
            "agitated, so house individually and skip handling. Venom is mild (bee-sting class); "
            "the bigger risk is a pinch."
        ),
        source_url="https://aquariumbreeder.com/red-clawed-scorpion-detailed-guide-care-diet-and-breeding/",
    ),
    _scorp(
        scientific_name="Heterometrus swammerdami", common_names=["Giant Forest Scorpion", "Indian Giant Forest Scorpion"],
        genus="Heterometrus", family="Scorpionidae", care_level="intermediate",
        temperament="docile for its size; best not handled",
        native_region="India, Sri Lanka",
        adult_size="up to 9 inches", adult_length_min_mm=180, adult_length_max_mm=230,
        type="fossorial", burrowing="heavy", communal_suitable=True,
        temperature_min=75, temperature_max=85, humidity_min=70, humidity_max=80,
        substrate_type="deep moist coco/soil for burrowing; bark hides; water dish",
        venom_severity="mild",
        venom_notes="Mild venom (subdues prey by crushing); a sting causes painful swelling/fever — respect, no handling.",
        care_guide=(
            "The largest scorpion in the world, reaching ~9 inches — and, for its size, fairly "
            "docile, since it kills by crushing with huge pincers rather than venom. Keep warm "
            "(75-85°F), humid (70-80%), with deep moist substrate to burrow and a water dish. "
            "Avid digger. Recently reclassified as Gigantometrus swammerdami. Venom is mild but "
            "a sting still causes painful swelling — best left unhandled."
        ),
        source_url="https://en.wikipedia.org/wiki/Gigantometrus_swammerdami",
    ),
    _scorp(
        scientific_name="Heterometrus petersii", common_names=["Asian Forest Scorpion"],
        genus="Heterometrus", family="Scorpionidae", care_level="beginner",
        temperament="defensive display over stinging; docile-ish",
        native_region="Southeast Asia",
        adult_size="4-5 inches", adult_length_min_mm=100, adult_length_max_mm=130,
        type="fossorial", burrowing="heavy", communal_suitable=True,
        temperature_min=75, temperature_max=85, humidity_min=70, humidity_max=80,
        substrate_type="deep moist coco/peat for burrowing; bark hides; water dish",
        venom_severity="mild", venom_notes="Mild venom (bee-sting class); prefers to threaten with raised claws.",
        care_guide=(
            "The classic pet 'Asian forest scorpion' and the most common in stores — big, hardy, "
            "mild-venomed, and more inclined to a claws-up threat display than a sting. A good "
            "beginner scorpion. Keep warm and humid (70-80%) with damp deep substrate to burrow "
            "and a water dish; tolerates communal setups with space. Glows under UV like all "
            "scorpions."
        ),
        source_url="https://dubiaroaches.com/blogs/invert-care/asian-forest-scorpion-care-sheet",
    ),
    _scorp(
        scientific_name="Scorpio maurus", common_names=["Large-clawed Scorpion", "Israeli Gold Scorpion"],
        genus="Scorpio", family="Scorpionidae", care_level="intermediate",
        temperament="reclusive deep burrower; defensive if cornered",
        native_region="North Africa, Middle East",
        adult_size="~3 inches", adult_length_min_mm=50, adult_length_max_mm=80,
        type="fossorial", burrowing="heavy",
        temperature_min=77, temperature_max=86, humidity_min=55, humidity_max=70,
        substrate_type="deep sand/soil mix, damp at the bottom (digs deep burrows); water dish",
        venom_severity="mild", venom_notes="Mild venom (weak neurotoxin, maurotoxin); not dangerous to humans.",
        care_guide=(
            "A stout, big-clawed desert burrower that digs remarkably deep tunnels (a metre in "
            "the wild). Give it deep substrate kept dry on top and slightly damp below so it can "
            "build a humid burrow; a water dish too. A reclusive 'pet hole' that's rarely seen by "
            "day. Venom is mild and not dangerous to people. Solitary — house individually."
        ),
        source_url="https://aquariumbreeder.com/large-clawed-scorpion-detailed-guide-care-diet-and-breeding/",
    ),
    _scorp(
        scientific_name="Centruroides vittatus", common_names=["Striped Bark Scorpion"],
        genus="Centruroides", family="Buthidae", care_level="intermediate",
        temperament="skittish, fast; climbs",
        native_region="Southern USA, Mexico",
        adult_size="2-2.5 inches", adult_length_min_mm=50, adult_length_max_mm=70,
        type="scansorial", burrowing="none",
        temperature_min=75, temperature_max=82, humidity_min=40, humidity_max=50,
        substrate_depth="1-2 inches",
        substrate_type="dry substrate with bark/vertical surfaces to climb and molt; small water dish",
        venom_severity="moderate",
        venom_notes="Intense localized pain lasting ~15-20 min; rarely serious for healthy adults. No handling.",
        care_guide=(
            "A small, common North American bark scorpion — slim-clawed, fast, and a climber, so "
            "give it vertical bark/cork to scale and molt on rather than deep substrate. Keep on "
            "the dry side (40-50%) at room warmth with a small water dish. Its sting brings sharp "
            "local pain for a while but is rarely serious in healthy adults; it's skittish and "
            "best not handled."
        ),
        source_url="https://www.thetarantulacollective.com/caresheets/centruroides-vittatus",
    ),
    _scorp(
        scientific_name="Euscorpius flavicaudis", common_names=["European Yellow-tailed Scorpion"],
        genus="Euscorpius", family="Euscorpiidae", care_level="beginner",
        temperament="shy, secretive; harmless",
        native_region="Southern Europe, NW Africa",
        adult_size="1.5-2 inches", adult_length_min_mm=35, adult_length_max_mm=50,
        type="scansorial", burrowing="none",
        temperature_min=65, temperature_max=82, humidity_min=60, humidity_max=75,
        substrate_depth="2 inches",
        substrate_type="peat/soil with flat rocks & bark crevices to hide in; water dish",
        venom_severity="mild", venom_notes="Harmless to humans — sting likened to a pinprick or mild bee sting.",
        care_guide=(
            "A tiny, hardy European scorpion that hides in rock and bark crevices — one of the "
            "easiest, most beginner-friendly scorpions and tolerant of cool room temperatures "
            "(it even lives wild in southern England). Give it flat hides, modest humidity, and a "
            "water dish. Harmless venom (pinprick-class). Solitary. Now also classified as "
            "Tetratrichobothrius flavicaudis."
        ),
        source_url="https://animaldiversity.org/accounts/Euscorpius_flavicaudis/",
    ),
    _scorp(
        scientific_name="Hadogenes paucidens", common_names=["Olive Keeled Flat Rock Scorpion", "Banded Flat Rock Scorpion"],
        genus="Hadogenes", family="Hormuridae", care_level="beginner",
        temperament="shy, calm; flees rather than stings", native_region="Southern Africa",
        adult_size="4-5 inches", adult_length_min_mm=90, adult_length_max_mm=130,
        type="scansorial", burrowing="none", growth_rate="slow",
        temperature_min=78, temperature_max=90, humidity_min=30, humidity_max=40,
        substrate_depth="1-2 inches",
        feeding_frequency_adult="1 prey every 2-3 weeks",
        substrate_type="dry sandy substrate with tightly stacked flat rocks/slate for crevices; water dish",
        venom_severity="mild",
        venom_notes="Among the weakest scorpion venoms — sting ranges from nothing to a nettle-like prick.",
        care_guide=(
            "A flattened, crevice-dwelling scorpion built for living between rocks — calm, shy, "
            "and famously reluctant to sting (its venom is among the weakest of any scorpion; it "
            "uses its long pincers instead). Keep it dry (30-40%) and warm with stacked flat "
            "slate for tight horizontal crevices and a small water dish. Extremely slow-growing "
            "and long-lived (years to mature). An excellent, low-risk beginner display scorpion."
        ),
        source_url="https://aquariumbreeder.com/flat-rock-scorpion-detailed-guide-care-diet-and-breeding/",
    ),
    _scorp(
        scientific_name="Hottentotta trilineatus", common_names=["Three-lined Hottentotta"],
        genus="Hottentotta", family="Buthidae", care_level="advanced",
        temperament="semi-aggressive, fast", native_region="Southeast Africa",
        adult_size="~3 inches", adult_length_min_mm=60, adult_length_max_mm=80,
        type="terrestrial", burrowing="light",
        temperature_min=85, temperature_max=95, humidity_min=40, humidity_max=50,
        substrate_depth="2-3 inches",
        substrate_type="dry sand/peat mix with a cork bark hide; small water dish",
        venom_severity="moderate", water_dish_required=True,
        venom_notes="Venom roughly mid-tier — a sting hurts for hours; fast and defensive. No handling.",
        care_guide=(
            "A fast, slender desert buthid for experienced keepers — hot and dry conditions "
            "(85-95°F, 40-50%), a sand/peat substrate, and a cork hide. Semi-aggressive and "
            "quick, with a sting that's genuinely painful for hours (mid-tier venom, not usually "
            "hospital-grade but respect it). Strictly hands-off."
        ),
        source_url="https://arachnoboards.com/threads/hottentotta-trilineatus-care.326295/",
    ),
    _scorp(
        scientific_name="Parabuthus villosus", common_names=["Black Hairy Thick-tail Scorpion"],
        genus="Parabuthus", family="Buthidae", care_level="advanced",
        temperament="bold, fast; can spray venom", native_region="Namibia, South Africa",
        adult_size="up to 7 inches", adult_length_min_mm=120, adult_length_max_mm=180,
        type="fossorial", burrowing="heavy", water_dish_required=False,
        temperature_min=77, temperature_max=90, humidity_min=30, humidity_max=40,
        substrate_type="deep dry sand/soil it can burrow into; hide",
        venom_severity="medically_significant", medically_significant_venom=True,
        venom_notes="MEDICALLY SIGNIFICANT — potent venom, potentially dangerous; can SPRAY venom (eye protection). Antivenom limited. Expert keepers only; seek medical care if stung.",
        care_guide=(
            "The largest buthid in the world (~7 inches) and a genuinely dangerous animal — "
            "potent, medically significant venom and the ability to SPRAY it defensively, so eye "
            "protection is a must and handling is out of the question. Diurnal and bold for a "
            "scorpion. Arid setup: deep dry substrate to burrow, a hide, low humidity. Expert "
            "keepers only, housed individually, with a sting protocol in place."
        ),
        source_url="https://en.wikipedia.org/wiki/Parabuthus_villosus",
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
