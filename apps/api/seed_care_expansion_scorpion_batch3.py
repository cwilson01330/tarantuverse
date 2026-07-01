"""
Care-guide expansion — SCORPION batch 3 (BRIEF-care-guide-expansion §2: double the genus).

10 net-new popular pet scorpions, verified absent from prod (existing coverage spans
Androctonus, Centruroides x2, Hadrurus x2, Heterometrus x4, Hottentotta, Leiurus,
Pandinus, Parabuthus, Scorpio, Tityus, Euscorpius, Hadogenes + others across
batches 1-2). Single-table insert into `invert_species`.

Honesty-first: every row cites a source_url; venom_severity is the headline safety
field, tiered honestly (mild | moderate | medically_significant) with venom_notes.
Three genuinely hot buthids are flagged medically_significant — Androctonus amoreuxi
(Sahara fat-tail), Tityus obscurus (Amazonian black), and Parabuthus raudus (a
venom-spraying African thick-tail). Reclassification / biology notes where the hobby
name differs (Liocheles is parthenogenetic; Isometrus maculatus is pantropical and
now cosmopolitan). image_url left null for the sourcer (join on scientific_name_lower).

Controlled vocab matched to schemas/invert_species.py:
  care_level ∈ {beginner,intermediate,advanced}; feeding_mode='predator';
  burrowing ∈ {none,light,heavy}; venom_severity ∈ {mild,moderate,medically_significant}.

Run with: python3 seed_care_expansion_scorpion_batch3.py   (idempotent)
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
        scientific_name="Androctonus amoreuxi", common_names=["Egyptian Yellow Fat-tailed Scorpion", "Sahara Fat-tail"],
        genus="Androctonus", family="Buthidae", care_level="advanced",
        temperament="nervous, fast, defensive; stings readily",
        native_region="North Africa and the Middle East (Sahara, Sinai, Arabia)",
        adult_size="3-4 inches", adult_length_min_mm=80, adult_length_max_mm=110,
        type="fossorial", burrowing="light", water_dish_required=False,
        temperature_min=80, temperature_max=95, humidity_min=20, humidity_max=40,
        substrate_type="dry sand/soil mix, a few inches deep with flat rocks and bark to shelter under; light misting of one corner only",
        venom_severity="medically_significant", medically_significant_venom=True,
        venom_notes="MEDICALLY SIGNIFICANT — a potent 'fat-tail' buthid with serious neurotoxic venom; documented severe human envenomations. Less toxic than A. australis but still hot. Expert keepers only, escape-proof housing, sting protocol, no handling.",
        care_guide=(
            "A classic desert fat-tail — sandy-yellow, thick-tailed, and one of the most "
            "commonly traded Androctonus, but a genuinely dangerous animal. Keep it hot (up to "
            "95°F) and arid (20-40%) with a few inches of dry substrate and flat rocks or bark "
            "to shelter under; it can go months without food and needs very little water. "
            "Nervous, fast, and quick to sting, with potent neurotoxic venom that has caused "
            "serious human envenomations — expert keepers only, escape-proof housing, a sting "
            "protocol in place, and strictly no handling."
        ),
        source_url="https://en.wikipedia.org/wiki/Androctonus_amoreuxi",
    ),
    _scorp(
        scientific_name="Bothriurus bonariensis", common_names=["Argentine Black Scorpion", "Pampas Scorpion"],
        genus="Bothriurus", family="Bothriuridae", care_level="beginner",
        temperament="calm, shy; rarely stings",
        native_region="Southern South America (Argentina, Uruguay, southern Brazil, Chile)",
        adult_size="2-3 inches", adult_length_min_mm=45, adult_length_max_mm=70,
        type="fossorial", burrowing="light",
        temperature_min=68, temperature_max=82, humidity_min=45, humidity_max=65,
        substrate_depth="2-3 inches",
        substrate_type="lightly moist soil/sand mix with flat rocks and bark to shelter under; water dish",
        venom_severity="moderate",
        venom_notes="Not deadly, but the commonest cause of scorpion stings in southern Brazil — a sting brings local pain and swelling; venom acts on sodium channels in lab studies but human cases are typically mild/moderate. No handling.",
        care_guide=(
            "A hardy dark scorpion of the South American pampas that shelters under stones and "
            "bark, tolerating cooler, temperate conditions (upper-60s to low-80s°F) better than "
            "most hobby scorpions. Give it a couple of inches of lightly moist soil/sand, flat "
            "hides to tuck beneath, and a water dish. Calm and reluctant to sting — though it is "
            "the most frequent cause of scorpion stings in southern Brazil simply by being "
            "common, a sting is painful but not dangerous. An easygoing beginner, kept hands-off."
        ),
        source_url="https://pubmed.ncbi.nlm.nih.gov/27544632/",
    ),
    _scorp(
        scientific_name="Liocheles australasiae", common_names=["Dwarf Wood Scorpion"],
        genus="Liocheles", family="Hormuridae", care_level="beginner",
        temperament="shy, secretive; harmless",
        native_region="Southeast Asia, Australasia, Pacific",
        adult_size="~1.5 inches", adult_length_min_mm=22, adult_length_max_mm=36,
        type="scansorial", burrowing="none", communal_suitable=True,
        temperature_min=75, temperature_max=90, humidity_min=60, humidity_max=90,
        substrate_depth="2 inches",
        substrate_type="moist coco/topsoil with bark and driftwood hides; water dish",
        venom_severity="mild",
        venom_notes="Harmless to humans — venom studied and found insect-specific; rarely stings, uses pincers.",
        care_guide=(
            "A tiny, secretive rainforest scorpion famous for being parthenogenetic — females "
            "clone themselves, so a single animal can found a colony without a mate. Hides under "
            "bark and driftwood in moist substrate; give plenty of flat hides, warm humid "
            "conditions, and a small water dish. Its venom is insect-specific and harmless to "
            "people, and it prefers its pincers to its tail — an easy, communal-friendly beginner "
            "dwarf. Now placed in family Hormuridae."
        ),
        source_url="https://en.wikipedia.org/wiki/Liocheles_australasiae",
    ),
    _scorp(
        scientific_name="Isometrus maculatus", common_names=["Lesser Brown Scorpion", "Slender Brown Scorpion"],
        genus="Isometrus", family="Buthidae", care_level="intermediate",
        temperament="secretive, non-aggressive; stings only if disturbed",
        native_region="Pantropical (originally Indo-Pacific, now spread worldwide)",
        adult_size="1.5-3 inches", adult_length_min_mm=30, adult_length_max_mm=75,
        type="scansorial", burrowing="none", communal_suitable=True,
        temperature_min=75, temperature_max=88, humidity_min=50, humidity_max=70,
        substrate_depth="2 inches",
        substrate_type="half-humid/half-dry setup with vertical cork bark to climb, hide, and molt on; water dish",
        venom_severity="mild",
        venom_notes="Mild — venom is not fatal to humans and a sting is compared to a bee, with mild, self-limiting effects. Non-aggressive; stings only when threatened. No handling.",
        care_guide=(
            "A slim, long-tailed tropical bark scorpion that has spread around the world, often "
            "living on and around buildings. It's a climber that wants vertical cork bark to "
            "scale, hide behind, and molt on rather than deep substrate. Keep it warm with a "
            "half-humid/half-dry enclosure — adults tolerate drier conditions, young need more "
            "moisture — and a water dish. Communal-tolerant if well fed. Venom is mild (bee-sting "
            "class) and it's non-aggressive, but its speed and climbing put it just past beginner; "
            "kept hands-off."
        ),
        source_url="https://en.wikipedia.org/wiki/Isometrus_maculatus",
    ),
    _scorp(
        scientific_name="Vaejovis carolinianus", common_names=["Southern Devil Scorpion", "Southern Unstriped Scorpion"],
        genus="Vaejovis", family="Vaejovidae", care_level="beginner",
        temperament="prone to sting for its size; otherwise unassuming",
        native_region="Southeastern United States (Appalachian region)",
        adult_size="~1.5 inches", adult_length_min_mm=25, adult_length_max_mm=45,
        type="scansorial", burrowing="light", communal_suitable=True,
        temperature_min=65, temperature_max=80, humidity_min=50, humidity_max=70,
        substrate_depth="2 inches",
        substrate_type="lightly moist soil/leaf-litter with flat rocks and bark to hide under; small water dish",
        venom_severity="mild",
        venom_notes="Mild — the sting is moderately painful but not life-threatening or medically serious (barring allergy). It is, however, one of the more sting-prone species in the pet trade. No handling.",
        care_guide=(
            "A small, dark, cool-climate scorpion native to the southeastern U.S. Appalachians — "
            "hardy, undemanding, and comfortable at ordinary room temperatures (mid-60s to "
            "low-80s°F), which makes it one of the easier beginner scorpions. Give it a couple of "
            "inches of lightly moist soil and leaf litter with flat rocks and bark to hide under "
            "and a small water dish; it takes crickets, mealworms, and termites. Communal-tolerant "
            "with space, though it may cannibalize smaller specimens. Venom is mild, but it's "
            "quicker to sting than most hobby species — kept hands-off."
        ),
        source_url="https://en.wikipedia.org/wiki/Vaejovis_carolinianus",
    ),
    _scorp(
        scientific_name="Parabuthus raudus", common_names=["Rough Thick-tailed Scorpion"],
        genus="Parabuthus", family="Buthidae", care_level="advanced",
        temperament="defensive; can stridulate and spray venom when provoked",
        native_region="Southern Africa (Namibia, Botswana, South Africa)",
        adult_size="3-5 inches", adult_length_min_mm=80, adult_length_max_mm=120,
        type="fossorial", burrowing="light", water_dish_required=False,
        temperature_min=77, temperature_max=95, humidity_min=25, humidity_max=45,
        substrate_type="dry sand/clay mix it can pack into shallow burrows; roots, bark and stones for hides; light water only",
        venom_severity="medically_significant", medically_significant_venom=True,
        venom_notes="MEDICALLY SIGNIFICANT — a Parabuthus 'thick-tail', a genus with recorded human fatalities; venom is strong and a sting can have serious consequences. Can also SPRAY venom when heavily provoked (eye protection advised). Expert keepers only, no handling.",
        care_guide=(
            "A large southern-African thick-tail — a robust, sandy-colored buthid that packs "
            "shallow burrows into firm desert substrate and shelters among roots and stones. Keep "
            "it hot (up to 95°F) and dry (25-45%) with a sand/clay mix it can tunnel into; it "
            "needs very little water. This is a hot species: venom is strong, a sting can have "
            "serious consequences, and when heavily provoked it can spray venom, so eye protection "
            "and long forceps are a must. Experienced keepers only, escape-proof housing, and "
            "absolutely no handling."
        ),
        source_url="https://en.wikipedia.org/wiki/Parabuthus",
    ),
    _scorp(
        scientific_name="Uroplectes olivaceus", common_names=["Olive Lesser Thick-tailed Scorpion"],
        genus="Uroplectes", family="Buthidae", care_level="advanced",
        temperament="aggressive; stings readily",
        native_region="Southern Africa",
        adult_size="~2 inches", adult_length_min_mm=40, adult_length_max_mm=60,
        type="scansorial", burrowing="light",
        temperature_min=77, temperature_max=90, humidity_min=40, humidity_max=55,
        substrate_depth="2 inches",
        substrate_type="dry sand/soil with flat rocks and bark crevices to shelter under; small water dish",
        venom_severity="moderate",
        venom_notes="Not deadly, but stings readily and the venom causes severe burning pain for 24-48 hours followed by a lingering ache. Fast and defensive — strictly no handling.",
        care_guide=(
            "A small, quick southern-African buthid that shelters under rocks and bark and, unlike "
            "the docile forest scorpions, is genuinely aggressive and stings readily. Keep it warm "
            "and fairly dry with flat hides to hide beneath and a small water dish. The venom "
            "isn't deadly but it hurts a lot — severe burning pain for a day or two, then a dull "
            "ache for a week. Its size, speed, and readiness to sting make it an advanced, "
            "hands-off species best housed alone."
        ),
        source_url="https://en.wikipedia.org/wiki/Uroplectes_olivaceus",
    ),
    _scorp(
        scientific_name="Nebo hierichonticus", common_names=["Israeli Black Scorpion", "Jericho Scorpion"],
        genus="Nebo", family="Diplocentridae", care_level="advanced",
        temperament="reclusive, defensive; deep burrower",
        native_region="Middle East (Levant), Sinai",
        adult_size="up to 5.5 inches", adult_length_min_mm=110, adult_length_max_mm=140,
        type="fossorial", burrowing="heavy",
        temperature_min=77, temperature_max=90, humidity_min=30, humidity_max=45,
        substrate_type="deep firm sand/soil for deep burrows; rock stacks; water dish",
        venom_severity="moderate",
        venom_notes="Human stings are reported as surprisingly mild despite tissue-damaging (hemorrhagic/necrotic) venom in lab animals; caution warranted and some keepers treat it as potentially significant. Experienced keepers only, no handling.",
        care_guide=(
            "The largest scorpion in the Middle East — a heavy-bodied, dark diplocentrid that digs "
            "deep burrows and caves under rocks in arid country. Give it deep firm substrate to "
            "tunnel, rock stacks, low humidity, warmth, and a water dish; it's reclusive and "
            "rarely seen by day. Its venom is tissue-damaging in lab animals, yet reported human "
            "stings have been surprisingly mild — the picture isn't fully settled, so it's treated "
            "with caution as an experienced-keeper, strictly hands-off species."
        ),
        source_url="https://en.wikipedia.org/wiki/Nebo_hierichonticus",
    ),
    _scorp(
        scientific_name="Tityus obscurus", common_names=["Amazonian Black Scorpion", "Brazilian Black Scorpion"],
        genus="Tityus", family="Buthidae", care_level="advanced",
        temperament="secretive, defensive; hides by day",
        native_region="Amazon basin of northern South America (Brazil, French Guiana, Suriname)",
        adult_size="2.5-4 inches", adult_length_min_mm=65, adult_length_max_mm=100,
        type="scansorial", burrowing="light", communal_suitable=True,
        temperature_min=77, temperature_max=86, humidity_min=70, humidity_max=85,
        substrate_depth="2-3 inches",
        substrate_type="moist coco/topsoil with leaf litter, bark and loose wood to hide under; shallow water dish",
        venom_severity="medically_significant", medically_significant_venom=True,
        venom_notes="MEDICALLY SIGNIFICANT — one of the larger Tityus, with excitatory neurotoxins and cardiotoxins; documented mild-to-severe human envenomations (severe pain, sweating, nausea, vomiting, numbness, twitching) that can persist ~30 hours, and recorded fatalities in the region. Expert keepers only, escape-proof housing, sting protocol, no handling.",
        care_guide=(
            "A large, dark, flattened Amazonian buthid that hides under logs and bark by day in "
            "humid rainforest and hunts at night. Keep it warm and humid (70-85%) with a couple "
            "of inches of moist substrate, leaf litter, and plenty of flat wood and bark to "
            "shelter beneath, plus a shallow water dish. This is a genuinely dangerous species — "
            "its venom carries neurotoxins and cardiotoxins, human envenomations range from mild "
            "to severe and can last over a day, and fatalities are on record in its native range. "
            "Expert keepers only, escape-proof housing, a sting protocol in place, and no handling."
        ),
        source_url="https://en.wikipedia.org/wiki/Tityus_obscurus",
    ),
    _scorp(
        scientific_name="Chaerilus celebensis", common_names=["Asian Bush Scorpion", "Speckled Bush Scorpion"],
        genus="Chaerilus", family="Chaerilidae", care_level="beginner",
        temperament="shy, calm; rarely stings",
        native_region="Sulawesi (Celebes), Indonesia",
        adult_size="~1.5 inches", adult_length_min_mm=30, adult_length_max_mm=38,
        type="fossorial", burrowing="light",
        temperature_min=66, temperature_max=78, humidity_min=70, humidity_max=85,
        substrate_depth="2-3 inches",
        substrate_type="moist coco/topsoil topped with moss; shallow hides and bark; water dish",
        venom_severity="mild",
        venom_notes="Venom of little or no medical significance; rarely stings — mild in both toxicity and temperament.",
        care_guide=(
            "A small, stocky, speckled forest-floor scorpion from Sulawesi — mild in both venom "
            "and temperament, and one of the more beginner-friendly dwarfs. Unusually, it prefers "
            "things cool (mid-60s to upper-70s°F) and moist; give it a couple of inches of damp "
            "substrate topped with moss, shallow hides to tuck under, and a water dish. It's not "
            "a climber. Rarely stings and its venom is of little medical significance — a mellow, "
            "low-risk display scorpion."
        ),
        source_url="https://en.wikipedia.org/wiki/Chaerilus_celebensis",
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
