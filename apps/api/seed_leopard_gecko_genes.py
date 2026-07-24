"""Seed the leopard gecko (Eublepharis macularius) gene catalog.

Per PRD-herpetoverse-v1 §5.4 and docs/design/RUBRIC-care-sheet-content.md.
Second species for the morph calculator after Python regius.

Honesty-first caveats — read before extending:

  - THREE NON-COMPLEMENTARY ALBINO STRAINS. Tremper, Bell, and Rainwater
    albinism are three independent recessive mutations at three different
    loci. They do NOT complement: Tremper x Bell produces normal-looking
    offspring that are het for both, never visual albinos. They are seeded
    as three separate genes precisely so the calculator gets this right —
    naive calculators that treat "albino" as one trait give wrong answers
    here. Never merge them.

  - LEMON FROST is welfare-flagged 'viability'. Guo et al. 2021 (PLOS
    Genetics) mapped the trait to SPINT1, a tumour-suppressor implicated in
    human melanoma, and documented a high incidence of iridophoroma (white
    pigment-cell tumours). A later histopathology paper characterises the
    clinical course. Homozygous ("Super Lemon Frost") animals are the most
    severely affected. This is the strongest peer-reviewed welfare finding
    in the entire morph hobby — do not soften it.

  - ENIGMA is welfare-flagged 'neurological' (Enigma Syndrome: head tilt,
    star-gazing, circling, seizures). ES is exhaustively documented in care
    and breeder literature and is not seriously disputed, but we found NO
    dedicated peer-reviewed paper. So this flag rests on three strong
    community/care sources rather than a Tier A source, and the notes say
    "associated with" rather than asserting a proven mechanism. Same posture
    the ball python seed takes for community-consensus flags. Upgrade the
    citations if a paper appears.

  - WHITE & YELLOW (W&Y) is NOT welfare-flagged. There are scattered reports
    of ES-like wobble in some W&Y lines, but we could not find three
    confirmable sources. Held for future review rather than flagged on
    anecdote — same call the ball python seed made for BEL supers.

  - HOMOZYGOUS ENIGMA is unconfirmed. No verified "super Enigma" is
    established, and whether the homozygous form is viable is unsettled.
    We therefore do NOT set lethal_homozygous; we say so in the notes
    instead of guessing.

  - POLYGENIC / LINE-BRED TRAITS ARE DELIBERATELY EXCLUDED. Tangerine,
    Carrot Tail, Hypo / Super Hypo / SHTCT, Baldy, Bold Stripe, Emerine and
    similar are selectively bred polygenic traits, not single-locus genes.
    A Punnett square would produce confident, wrong odds for them. They do
    not belong in this table until the calculator can express "line-bred,
    not predictable". Combos (RAPTOR, Radar, Typhoon, Diablo Blanco) are
    also excluded — they are stacks of the genes below, not genes.

Run with: python3 seed_leopard_gecko_genes.py
"""
import os
import sys
import uuid

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.gene import Gene


SPECIES = "Eublepharis macularius"


# ---------------------------------------------------------------------------
# Citation catalog — defined once, referenced by key.
# ---------------------------------------------------------------------------
CITATIONS = {
    # ---- Tier A: peer-reviewed ----
    "guo_2021_lemon_frost": {
        "source_type": "peer_reviewed",
        "title": (
            "Genetics of white color and iridophoroma in "
            "“Lemon Frost” leopard geckos"
        ),
        "author": (
            "Guo L, Bloom J, Sykes S, Huang E, Kashif Z, Pham E, Ho K, "
            "Alcaraz A, Xiao XG, Duarte-Vogel S, Kruglyak L"
        ),
        "url": "https://journals.plos.org/plosgenetics/article?id=10.1371/journal.pgen.1009580",
        "publication_date": "2021-06-24",
        "publication": "PLOS Genetics",
        "summary": (
            "Maps the Lemon Frost trait to a single locus containing SPINT1, a "
            "tumour suppressor implicated in human cutaneous melanoma, and "
            "documents high incidence of iridophoroma in affected geckos."
        ),
    },
    "iridophoroma_histopathology": {
        "source_type": "peer_reviewed",
        "title": (
            "Iridophoroma in Leopard Geckos (Eublepharis macularius): "
            "Clinical Complications and Histopathology"
        ),
        "author": "Various",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC12694337/",
        "publication_date": "2025-01-01",
        "publication": "PMC / peer-reviewed",
        "summary": (
            "Histopathological characterisation of iridophoroma in leopard "
            "geckos, describing clinical progression and complications."
        ),
    },
    # ---- Science communication on the Lemon Frost finding ----
    "reptiles_magazine_lemon_frost": {
        "source_type": "breeder_community",
        "title": "Lemon Frost Leopard Gecko Morph Spurs Cancer Clues",
        "author": "Reptiles Magazine",
        "url": "https://reptilesmagazine.com/lemon-frost-leopard-gecko-morph-spurs-cancer-clues/",
        "publication_date": "2021-07-01",
        "summary": (
            "Plain-language summary of the SPINT1 / iridophoroma finding and "
            "its implications for keepers and breeders."
        ),
    },
    # ---- Enigma Syndrome (community/care consensus; no Tier A found) ----
    "reptifiles_enigma": {
        "source_type": "breeder_community",
        "title": "Leopard Gecko Enigma Syndrome",
        "author": "ReptiFiles (Mariah Healey)",
        "url": "https://reptifiles.com/leopard-gecko-care/leopard-gecko-diseases-health/leopard-gecko-enigma-syndrome/",
        "publication_date": "2022-01-01",
        "summary": (
            "Care-resource overview of Enigma Syndrome: symptoms, severity "
            "range, absence of a cure, and supportive-care guidance."
        ),
    },
    "geckotime_enigma": {
        "source_type": "breeder_community",
        "title": "Enigma Syndrome in Leopard Geckos: An Autosomal Dominant Disorder",
        "author": "Gecko Time",
        "url": "https://geckotime.com/enigma-syndrome/",
        "publication_date": "2015-01-01",
        "summary": (
            "Describes the autosomal dominant inheritance pattern of the "
            "Enigma trait and the associated neurological syndrome."
        ),
    },
    "morphpedia_enigma": {
        "source_type": "breeder_community",
        "title": "Enigma — Leopard Gecko Traits (Morphpedia)",
        "author": "MorphMarket Morphpedia",
        "url": "https://www.morphmarket.com/morphpedia/leopard-geckos/enigma/",
        "publication_date": "2023-01-01",
        "summary": (
            "Trait reference: dominant inheritance, appearance, and the "
            "neurological issues associated with the line."
        ),
    },
    # ---- General morph / inheritance references ----
    "morphpedia_leopard_index": {
        "source_type": "breeder_community",
        "title": "Leopard Gecko Traits — Morphpedia",
        "author": "MorphMarket Morphpedia",
        "url": "https://www.morphmarket.com/morphpedia/leopard-geckos/",
        "publication_date": "2024-01-01",
        "summary": (
            "Community-maintained trait index for leopard geckos: inheritance "
            "mode and appearance per morph."
        ),
    },
    "morphpedia_albino_tremper": {
        "source_type": "breeder_community",
        "title": "Albino (Tremper) — Leopard Gecko Traits (Morphpedia)",
        "author": "MorphMarket Morphpedia",
        "url": "https://www.morphmarket.com/morphpedia/leopard-geckos/albino-tremper/",
        "publication_date": "2023-01-01",
        "summary": (
            "Reference page for the Tremper albino strain, including its "
            "independence from the Bell and Rainwater strains."
        ),
    },
    "reptidex_leopard_genetics": {
        "source_type": "breeder_community",
        "title": "Leopard Gecko Morph Guide: Alleles & Morphs",
        "author": "ReptiDex",
        "url": "https://reptidex.com/genetics/leopard-gecko",
        "publication_date": "2024-01-01",
        "summary": (
            "Allele-level breakdown of leopard gecko morphs, distinguishing "
            "single-locus genes from line-bred polygenic traits."
        ),
    },
    "geckopia_albino_strains": {
        "source_type": "breeder_community",
        "title": (
            "Albino Leopard Gecko 101: What's the Difference Between "
            "Tremper, Bell and Rainwater"
        ),
        "author": "The Geckopia",
        "url": "https://thegeckopia.com/blogs/news/albino-leopard-gecko-101-what-s-the-difference-between-tremper-bell-and-rainwater",
        "publication_date": "2023-01-01",
        "summary": (
            "Side-by-side comparison of the three albino strains and an "
            "explanation of why crossing them yields normal-looking double hets."
        ),
    },
    "scalypal_leopard_genetics": {
        "source_type": "breeder_community",
        "title": (
            "Leopard Gecko Genetics & Morph Breeding: Dominant, Recessive "
            "& Combo Traits"
        ),
        "author": "ScalyPal",
        "url": "https://scalypal.com/articles/leopard-gecko-genetics-and-morph-breeding-guide-dominant-vs-recessive-traits-al",
        "publication_date": "2024-01-01",
        "summary": (
            "Breeding-oriented guide covering inheritance modes and the "
            "non-complementation of the three albino lines."
        ),
    },
}


def cite(*keys):
    """Expand citation keys into the JSONB structure stored on the row."""
    return [CITATIONS[k] | {"ref_key": k} for k in keys]


# ---------------------------------------------------------------------------
# Gene catalog. Single-locus genes only — see module docstring on exclusions.
# ---------------------------------------------------------------------------
GENES = [
    # ===================== RECESSIVE =====================
    # The three albino strains. Separate loci, non-complementary. Order
    # matters only for display; the calculator treats each independently.
    {
        "common_name": "Tremper Albino",
        "symbol": "alb-T",
        "gene_type": "recessive",
        "description": (
            "T-negative amelanistic strain isolated by Ron Tremper. Greyish-pink "
            "eyes with cooler lavender and yellow tones. One of three separate, "
            "NON-COMPATIBLE albino genes — breeding Tremper to Bell or "
            "Rainwater produces normal-looking offspring that are het for both, "
            "never visual albinos."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite(
            "morphpedia_albino_tremper",
            "geckopia_albino_strains",
            "scalypal_leopard_genetics",
        ),
    },
    {
        "common_name": "Bell Albino",
        "symbol": "alb-B",
        "gene_type": "recessive",
        "description": (
            "T-negative amelanistic strain isolated by Mark Bell. Pinkish eyes "
            "with warm yellow and pink tones. A separate locus from Tremper and "
            "Rainwater albinism — the three strains do not complement."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite(
            "geckopia_albino_strains",
            "morphpedia_leopard_index",
            "scalypal_leopard_genetics",
        ),
    },
    {
        "common_name": "Rainwater Albino",
        "symbol": "alb-R",
        "gene_type": "recessive",
        "description": (
            "T-negative amelanistic strain isolated by Tim Rainwater, also called "
            "Las Vegas albino. Pale pink eyes with soft cream and yellow tones; "
            "typically the lightest of the three strains. A separate locus from "
            "Tremper and Bell — the three strains do not complement."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite(
            "geckopia_albino_strains",
            "morphpedia_leopard_index",
            "reptidex_leopard_genetics",
        ),
    },
    {
        "common_name": "Blizzard",
        "symbol": "blz",
        "gene_type": "recessive",
        "description": (
            "Patternless recessive producing solid animals ranging from near-white "
            "to grey to yellow ('Banana Blizzard'). Eyes are normal-coloured, "
            "distinguishing it from Murphy Patternless."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite(
            "morphpedia_leopard_index",
            "reptidex_leopard_genetics",
            "scalypal_leopard_genetics",
        ),
    },
    {
        "common_name": "Murphy Patternless",
        "symbol": "pat",
        "gene_type": "recessive",
        "description": (
            "Recessive patternless trait; hatchlings show faint pattern that fades "
            "to uniform grey, green or yellow adults. Historically mislabelled "
            "'Leucistic' in older literature, which it is not."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite(
            "morphpedia_leopard_index",
            "reptidex_leopard_genetics",
            "scalypal_leopard_genetics",
        ),
    },
    {
        "common_name": "Eclipse",
        "symbol": "ecl",
        "gene_type": "recessive",
        "description": (
            "Recessive eye trait producing solid black ('snake') eyes, often with "
            "white feet and a snowy nose. A component gene of several well-known "
            "combos rather than a colour morph in its own right."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite(
            "morphpedia_leopard_index",
            "reptidex_leopard_genetics",
            "scalypal_leopard_genetics",
        ),
    },
    {
        "common_name": "Marble Eye",
        "symbol": "me",
        "gene_type": "recessive",
        "description": (
            "Recessive trait producing marbled, veined irises. Expression varies "
            "considerably between individuals and can change as the animal matures."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite(
            "morphpedia_leopard_index",
            "reptidex_leopard_genetics",
        ),
    },
    # ===================== INCOMPLETE DOMINANT =====================
    {
        "common_name": "Mack Snow",
        "symbol": "snow-M",
        "gene_type": "incomplete_dominant",
        "description": (
            "Incomplete dominant reducing yellow pigment. One copy gives a "
            "black-and-white hatchling that develops some yellow with age; two "
            "copies give 'Super Snow' — white-and-black with solid black eyes."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite(
            "morphpedia_leopard_index",
            "reptidex_leopard_genetics",
            "scalypal_leopard_genetics",
        ),
    },
    {
        "common_name": "Giant",
        "symbol": "gi",
        "gene_type": "incomplete_dominant",
        "description": (
            "Incomplete dominant size trait. One copy produces a 'Giant'; two "
            "copies produce a 'Super Giant', the largest form. Affects adult mass "
            "and length rather than colour or pattern."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite(
            "morphpedia_leopard_index",
            "reptidex_leopard_genetics",
            "scalypal_leopard_genetics",
        ),
    },
    {
        "common_name": "Lemon Frost",
        "symbol": "lf",
        "gene_type": "incomplete_dominant",
        "description": (
            "Incomplete dominant producing brightened yellow and white with "
            "increased white body coverage. Two copies ('Super Lemon Frost') give "
            "the most extreme appearance and the most severe disease burden. "
            "Associated with a documented tumour risk — see welfare notes."
        ),
        "welfare_flag": "viability",
        "welfare_notes": (
            "Lemon Frost carries a documented, peer-reviewed cancer risk. Guo et "
            "al. (2021, PLOS Genetics) mapped the trait to a locus containing "
            "SPINT1, a tumour suppressor also implicated in human cutaneous "
            "melanoma, and reported a high incidence of iridophoroma — "
            "tumours of the white iridophore pigment cells. Lesions typically "
            "appear as raised white nodules on the skin and can progress and "
            "recur; subsequent histopathology work describes the clinical course. "
            "Homozygous 'Super Lemon Frost' animals are the most severely "
            "affected. Prospective keepers should expect the possibility of "
            "tumours and veterinary care over the animal's life, and breeders "
            "should weigh whether to propagate the line at all."
        ),
        "lethal_homozygous": False,
        "citations": cite(
            "guo_2021_lemon_frost",
            "iridophoroma_histopathology",
            "reptiles_magazine_lemon_frost",
        ),
    },
    {
        "common_name": "White & Yellow",
        "symbol": "w&y",
        "gene_type": "incomplete_dominant",
        "description": (
            "Incomplete dominant that lightens the animal and alters pattern, with "
            "a more extreme homozygous 'Super' form. Scattered reports associate "
            "some W&Y lines with Enigma-like wobble, but we did not find enough "
            "confirmable sources to flag it — see the seeder docstring."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite(
            "morphpedia_leopard_index",
            "reptidex_leopard_genetics",
        ),
    },
    # ===================== DOMINANT =====================
    {
        "common_name": "Enigma",
        "symbol": "enig",
        "gene_type": "dominant",
        "description": (
            "Dominant trait producing speckled, blotchy patterning and a bright "
            "appearance. First produced by Mark Bell in 2006. Strongly associated "
            "with a neurological syndrome — see welfare notes before "
            "acquiring or breeding."
        ),
        "welfare_flag": "neurological",
        "welfare_notes": (
            "The Enigma trait is associated with Enigma Syndrome (ES), a "
            "neurological condition affecting balance and coordination. Reported "
            "signs range from mild — 'star-gazing', head tilting, occasional "
            "circling — to severe: incessant circling, 'death rolls', "
            "seizures, extreme light sensitivity, and difficulty feeding. Because "
            "the trait is dominant, a single copy is enough for signs to appear, "
            "and severity varies widely between individuals and over time. There "
            "is no cure; management means reducing stressors and, in bad cases, "
            "assist-feeding for life. NOTE ON EVIDENCE: ES is consistently "
            "documented across care and breeder literature but we found no "
            "dedicated peer-reviewed study, so this flag rests on community and "
            "care-resource consensus rather than a Tier A source. Whether a "
            "homozygous 'super Enigma' is viable is unconfirmed, so no lethality "
            "flag is set."
        ),
        "lethal_homozygous": False,
        "citations": cite(
            "reptifiles_enigma",
            "geckotime_enigma",
            "morphpedia_enigma",
        ),
    },
]


def seed():
    """Upsert the leopard gecko gene catalog. Idempotent — re-runs are safe."""
    print(f"Seeding {SPECIES} gene catalog ({len(GENES)} entries)...")
    db = SessionLocal()

    added = 0
    updated = 0

    try:
        for entry in GENES:
            common_name = entry["common_name"]

            existing = (
                db.query(Gene)
                .filter(
                    Gene.species_scientific_name == SPECIES,
                    Gene.common_name == common_name,
                )
                .first()
            )

            citations = entry["citations"]

            if existing:
                # Refresh content fields on re-run — welfare data evolves.
                existing.symbol = entry.get("symbol")
                existing.description = entry["description"]
                existing.gene_type = entry["gene_type"]
                existing.welfare_flag = entry.get("welfare_flag")
                existing.welfare_notes = entry.get("welfare_notes")
                existing.lethal_homozygous = entry["lethal_homozygous"]
                existing.welfare_citations = citations
                updated += 1
                print(f"  Updated: {SPECIES} / {common_name}")
                continue

            row = Gene(
                id=uuid.uuid4(),
                species_scientific_name=SPECIES,
                common_name=common_name,
                symbol=entry.get("symbol"),
                description=entry["description"],
                gene_type=entry["gene_type"],
                welfare_flag=entry.get("welfare_flag"),
                welfare_notes=entry.get("welfare_notes"),
                lethal_homozygous=entry["lethal_homozygous"],
                welfare_citations=citations,
                is_verified=True,
            )
            db.add(row)
            added += 1
            print(f"  Added:   {SPECIES} / {common_name}")

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
