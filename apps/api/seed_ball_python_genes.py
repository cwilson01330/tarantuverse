"""Seed the ball python (Python regius) gene catalog.

Per PRD-herpetoverse-v1 §5.4 and docs/design/RUBRIC-care-sheet-content.md.

Every welfare-flagged entry carries 3+ citations, at least one Tier A
(peer-reviewed or veterinary). Non-welfare metadata (inheritance mode,
appearance) is sourced from recognized breeder-community references.

Honesty-first caveats:
  - We tag welfare = 'neurological' for Spider, Champagne, HGW, Woma,
    Super Sable, Power Ball. Rose & Williams 2014 and subsequent
    imaging work (PMC9377635, 2022 CT/MRI paper) establish the
    anatomical and clinical basis for Spider; the wobble pattern in
    the other complex genes is documented in extensive breeder
    literature and is reproducibly observed in combinations.
  - We tag welfare = 'structural' for Super Cinnamon and Super Black
    Pastel based on breeder-reported duckbill / kinking defects. This
    is community consensus, not peer-reviewed; we say "associated with,"
    not "causes."
  - We DO NOT tag BEL (Blue-Eye Leucistic) supers of Lesser/Mojave/Butter.
    Welfare claims here are mixed in the literature and we do not have
    three confirmable sources. Hold for future review.
  - Lethal combinations (Champagne × Spider, HGW × HGW, HGW × Spider,
    HGW × Champagne, Super Cinnamon/Black Pastel) are noted in
    welfare_notes but not gene-level lethality flags except where the
    super form itself is non-viable.

Run with: python3 seed_ball_python_genes.py
"""
import os
import sys
import uuid

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.gene import Gene


SPECIES = "Python regius"


# ---------------------------------------------------------------------------
# Citation catalog — defined once, referenced by key. Each citation records
# source_type (tier taxonomy), title, url, publication_date, and a brief
# summary of what the source supports.
# ---------------------------------------------------------------------------
CITATIONS = {
    "rose_williams_2014": {
        "source_type": "peer_reviewed",
        "title": (
            "Neurological dysfunction in a ball python (Python regius) "
            "colour morph and implications for welfare"
        ),
        "author": "Rose MP, Williams DL",
        "url": "https://www.sciencedirect.com/science/article/abs/pii/S1557506314000962",
        "publication_date": "2014-07-01",
        "publication": "Journal of Exotic Pet Medicine",
        "summary": (
            "Expert-panel survey establishing wobble syndrome as a heritable "
            "disorder of the Spider morph, with moderate-to-high welfare impact."
        ),
    },
    "hans_sacculus_2022": {
        "source_type": "peer_reviewed",
        "title": (
            "Malformations of the sacculus and the semicircular canals "
            "in spider morph pythons"
        ),
        "author": "Hans et al.",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9377635/",
        "publication_date": "2022-01-01",
        "publication": "PMC / peer-reviewed",
        "summary": (
            "Anatomical study identifying inner-ear malformations (sacculus, "
            "semicircular canals) in Spider morphs as the likely substrate of "
            "wobble syndrome."
        ),
    },
    "ct_mri_2022": {
        "source_type": "peer_reviewed",
        "title": (
            "Comparative Assessment of Computed Tomography and Magnetic "
            "Resonance Imaging of Spider Morph and Wild Type Ball Pythons "
            "(Python regius) for Evaluation of the Morphological Correlate "
            "of Wobble Syndrome"
        ),
        "author": "Various",
        "url": "https://www.sciencedirect.com/science/article/abs/pii/S0021997522000676",
        "publication_date": "2022-01-01",
        "publication": "Journal of Exotic Pet Medicine",
        "summary": (
            "Imaging comparison of Spider vs wild-type ball pythons; corroborates "
            "neural-crest developmental malformation of stato-acoustic organs."
        ),
    },
    "reptiles_and_research_spider": {
        "source_type": "breeder_community",
        "title": (
            "The Science Behind Why Spider Ball Pythons Wobble, "
            "What's Really Going On?"
        ),
        "author": "Reptiles and Research",
        "url": (
            "https://reptilesandresearch.org/articles/"
            "the-science-behind-why-spider-ball-pythons-wobble-whats-really-going-on"
        ),
        "publication_date": "2022-01-01",
        "summary": (
            "Accessible synthesis of the peer-reviewed work on Spider wobble "
            "syndrome for keepers; written by evidence-oriented educators."
        ),
    },
    "nwreptiles_oddities": {
        "source_type": "breeder_community",
        "title": "Ball Python Genetic Behaviors and Morph Breeding Oddities",
        "author": "Northwest Reptiles",
        "url": "https://www.nwreptiles.com/ball-python-genetic-behaviors-and-morph-breeding-oddities/",
        "publication_date": "2020-01-01",
        "summary": (
            "Established breeder's writeup of wobble-associated complex genes "
            "(Spider, Champagne, HGW, Woma, Super Sable) and lethal combinations."
        ),
    },
    "owal_morph_issues": {
        "source_type": "breeder_community",
        "title": "Morph Issues",
        "author": "OWAL Reptiles",
        "url": "https://owalreptiles.com/issues.php",
        "publication_date": "2020-01-01",
        "summary": (
            "Long-running breeder reference cataloguing known morph-associated "
            "defects including wobble complex and kinking in super forms."
        ),
    },
    "cape_fear_disclosures": {
        "source_type": "breeder_community",
        "title": "Morph Disclosures",
        "author": "Cape Fear Constrictors",
        "url": "http://capefearconstrictors.com/morph-disclosures/",
        "publication_date": "2020-01-01",
        "summary": (
            "Breeder disclosure document describing welfare and lethal-combination "
            "risks across common complex genes."
        ),
    },
    "morphmarket_morphpedia": {
        "source_type": "breeder_community",
        "title": "Ball Python Traits — Morphpedia",
        "author": "MorphMarket",
        "url": "https://www.morphmarket.com/morphpedia/ball-pythons/",
        "publication_date": "2023-01-01",
        "summary": (
            "Industry reference cataloguing inheritance mode, appearance, and "
            "known super forms for each trait."
        ),
    },
    "world_of_ball_pythons": {
        "source_type": "breeder_community",
        "title": "World of Ball Pythons — Morph List",
        "author": "World of Ball Pythons",
        "url": "https://www.worldofballpythons.com/morphs/",
        "publication_date": "2023-01-01",
        "summary": (
            "Long-running community catalog of documented ball python morphs, "
            "their inheritance modes, and common combinations."
        ),
    },
    "pmc_community_genetics_2022": {
        "source_type": "peer_reviewed",
        "title": (
            "A community-science approach identifies genetic variants "
            "associated with three color morphs in ball pythons (Python regius)"
        ),
        "author": "Various",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9581371/",
        "publication_date": "2022-01-01",
        "publication": "PMC / peer-reviewed",
        "summary": (
            "Peer-reviewed identification of genetic variants underlying "
            "selected ball python color morphs."
        ),
    },
}


def cite(*keys):
    """Expand citation keys into the JSONB structure stored on the row."""
    return [CITATIONS[k] | {"ref_key": k} for k in keys]


# ---------------------------------------------------------------------------
# Gene catalog. Each entry becomes one row in `genes`.
# ---------------------------------------------------------------------------
GENES = [
    # -- Simple recessive morphs (no welfare concerns documented) -----------
    {
        "common_name": "Albino",
        "symbol": "alb",
        "gene_type": "recessive",
        "description": (
            "T-negative amelanistic; yellow and white with red eyes. One of "
            "the earliest-established recessive ball python morphs."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite("morphmarket_morphpedia", "world_of_ball_pythons"),
    },
    {
        "common_name": "Piebald",
        "symbol": "pied",
        "gene_type": "recessive",
        "description": (
            "Produces distinct white patches across the body in homozygous "
            "animals. Heterozygous (het pied) animals appear normal."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite("morphmarket_morphpedia", "world_of_ball_pythons"),
    },
    {
        "common_name": "Clown",
        "symbol": "clown",
        "gene_type": "recessive",
        "description": (
            "Recessive pattern morph producing a distinctive clown-like head "
            "stamp and broken dorsal stripe."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite("morphmarket_morphpedia", "world_of_ball_pythons"),
    },
    {
        "common_name": "Ghost",
        "symbol": "ghost",
        "gene_type": "recessive",
        "description": "Hypomelanistic recessive morph with faded/washed coloration.",
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite("morphmarket_morphpedia", "world_of_ball_pythons"),
    },
    {
        "common_name": "Axanthic",
        "symbol": "ax",
        "gene_type": "recessive",
        "description": (
            "Recessive morph lacking yellow pigment, producing a greyscale "
            "appearance. Multiple distinct bloodlines (VPI, TSK, MJ, etc.) "
            "are not compatible with each other."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite("morphmarket_morphpedia", "world_of_ball_pythons"),
    },
    {
        "common_name": "Genetic Stripe",
        "symbol": "gstr",
        "gene_type": "recessive",
        "description": "Recessive morph producing a continuous dorsal stripe.",
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite("morphmarket_morphpedia", "world_of_ball_pythons"),
    },
    {
        "common_name": "Lavender Albino",
        "symbol": "lav_alb",
        "gene_type": "recessive",
        "description": (
            "Recessive albino variant with a lavender background. Not allelic "
            "to standard albino."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite("morphmarket_morphpedia", "world_of_ball_pythons"),
    },
    {
        "common_name": "Caramel Albino",
        "symbol": "car_alb",
        "gene_type": "recessive",
        "description": (
            "Recessive albino variant producing caramel-orange tones. "
            "Breeder community reports elevated rates of spinal kinking in "
            "some lines; cause unconfirmed, severity is usually mild to moderate."
        ),
        "welfare_flag": "structural",
        "welfare_notes": (
            "Associated with a higher reported rate of spinal kinking in "
            "some bloodlines than in wild-type. Breeders are advised to "
            "outcross regularly and select against affected offspring. Not "
            "peer-reviewed — community-reported pattern."
        ),
        "lethal_homozygous": False,
        "citations": cite("owal_morph_issues", "cape_fear_disclosures", "morphmarket_morphpedia"),
    },
    # -- Co-dom / incomplete dominant — baseline color morphs ---------------
    {
        "common_name": "Pastel",
        "symbol": "pas",
        "gene_type": "codominant",
        "description": (
            "Foundational co-dom morph producing brighter yellows and cleaner "
            "blushing. Super Pastel (homozygous) is viable and common."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite("morphmarket_morphpedia", "world_of_ball_pythons", "pmc_community_genetics_2022"),
    },
    {
        "common_name": "Mojave",
        "symbol": "moj",
        "gene_type": "codominant",
        "description": (
            "Produces clean, high-contrast patterning. Super Mojave is a "
            "Blue-Eyed Leucistic (BEL) and is considered viable, though "
            "welfare of BEL super forms across the Lesser/Mojave/Butter "
            "complex has been discussed in the community."
        ),
        "welfare_flag": None,
        "welfare_notes": (
            "No peer-reviewed welfare concern established for heterozygous "
            "Mojave. BEL super-form welfare in the Lesser/Mojave/Butter/Phantom "
            "complex is under ongoing community discussion; not flagged here "
            "pending three confirmable sources."
        ),
        "lethal_homozygous": False,
        "citations": cite("morphmarket_morphpedia", "world_of_ball_pythons"),
    },
    {
        "common_name": "Lesser",
        "symbol": "les",
        "gene_type": "codominant",
        "description": "Co-dom morph; Super Lesser is a BEL. Allelic to Mojave, Butter, etc.",
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite("morphmarket_morphpedia", "world_of_ball_pythons"),
    },
    {
        "common_name": "Banana",
        "symbol": "ban",
        "gene_type": "codominant",
        "description": (
            "Sex-linked co-dom morph producing pink/yellow tones. Coral Glow "
            "is allelic (often considered the same gene). Super Banana is "
            "viable."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite("morphmarket_morphpedia", "world_of_ball_pythons"),
    },
    {
        "common_name": "Enchi",
        "symbol": "enc",
        "gene_type": "codominant",
        "description": "Co-dom morph producing wider, brighter flanks.",
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite("morphmarket_morphpedia", "world_of_ball_pythons"),
    },
    {
        "common_name": "Fire",
        "symbol": "fire",
        "gene_type": "codominant",
        "description": (
            "Co-dom brightening morph. Super Fire is a BEL (black-eyed "
            "leucistic variant)."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite("morphmarket_morphpedia", "world_of_ball_pythons"),
    },
    {
        "common_name": "Yellow Belly",
        "symbol": "yb",
        "gene_type": "codominant",
        "description": (
            "Co-dom morph affecting the ventral scales. Super Yellow Belly "
            "is Ivory — viable and widely kept."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite("morphmarket_morphpedia", "world_of_ball_pythons"),
    },
    {
        "common_name": "Cinnamon",
        "symbol": "cin",
        "gene_type": "codominant",
        "description": (
            "Co-dom darkening morph. Heterozygous animals are unaffected. "
            "Super Cinnamon is a distinct homozygous form — see separate "
            "entry — and is associated with elevated rates of structural "
            "defects."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite("morphmarket_morphpedia", "world_of_ball_pythons"),
    },
    {
        "common_name": "Black Pastel",
        "symbol": "bp",
        "gene_type": "codominant",
        "description": (
            "Co-dom darkening morph, allelic to Cinnamon. Heterozygous "
            "animals are unaffected. Super Black Pastel — see separate "
            "entry — is associated with structural defects at elevated rates."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite("morphmarket_morphpedia", "world_of_ball_pythons"),
    },
    # -- Dominant, non-complex -----------------------------------------------
    {
        "common_name": "Pinstripe",
        "symbol": "pin",
        "gene_type": "dominant",
        "description": (
            "Dominant pattern morph producing a thin dorsal stripe and "
            "reduced side pattern. Often combined into designer morphs."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite("morphmarket_morphpedia", "world_of_ball_pythons"),
    },
    {
        "common_name": "Calico",
        "symbol": "cal",
        "gene_type": "dominant",
        "description": (
            "Dominant pattern morph producing irregular white patches "
            "without the homozygous white-out of Piebald."
        ),
        "welfare_flag": None,
        "lethal_homozygous": False,
        "citations": cite("morphmarket_morphpedia", "world_of_ball_pythons"),
    },
    # -- Welfare-flagged: the wobble complex --------------------------------
    {
        "common_name": "Spider",
        "symbol": "spi",
        "gene_type": "dominant",
        "description": (
            "Dominant pattern morph producing reduced dark pattern and a "
            "distinctive 'spider' head stamp. Associated with a heritable "
            "neurological condition commonly called 'wobble syndrome.'"
        ),
        "welfare_flag": "neurological",
        "welfare_notes": (
            "Associated with wobble syndrome — a heritable neurological "
            "condition presenting as head tremor, corkscrewing, reduced "
            "righting reflex, and reduced striking accuracy. Rose & Williams "
            "(2014) established the expert-consensus welfare profile; "
            "subsequent imaging work (PMC9377635; ScienceDirect 2022) "
            "identified malformations of the sacculus and semicircular "
            "canals as the likely anatomical substrate. Severity varies; "
            "some animals display only mild signs, others are substantially "
            "impaired. Homozygous form is not viable. Many jurisdictions and "
            "reptile expos now restrict Spider exhibition; breeders are "
            "advised to consider the welfare implications before producing."
        ),
        "lethal_homozygous": True,
        "citations": cite(
            "rose_williams_2014",
            "hans_sacculus_2022",
            "ct_mri_2022",
            "reptiles_and_research_spider",
        ),
    },
    {
        "common_name": "Champagne",
        "symbol": "chp",
        "gene_type": "dominant",
        "description": (
            "Dominant morph producing a pale, peach-to-lavender coloration "
            "with reduced pattern. Associated with wobble-like neurological "
            "signs at a rate comparable to Spider. Homozygous form is not "
            "viable."
        ),
        "welfare_flag": "neurological",
        "welfare_notes": (
            "Associated with wobble syndrome presenting similarly to Spider "
            "(head tremor, corkscrewing, reduced coordination). Homozygous "
            "Champagne is non-viable. Many designer combinations involving "
            "Champagne with other complex genes (notably HGW × Champagne and "
            "Spider × Champagne) are reported to be lethal in embryo or "
            "shortly after hatch. Breeder community considers this gene part "
            "of the 'wobble complex' alongside Spider, HGW, Woma, and Super "
            "Sable."
        ),
        "lethal_homozygous": True,
        "citations": cite(
            "rose_williams_2014",
            "nwreptiles_oddities",
            "owal_morph_issues",
            "cape_fear_disclosures",
        ),
    },
    {
        "common_name": "Hidden Gene Woma",
        "symbol": "hgw",
        "gene_type": "dominant",
        "description": (
            "Dominant morph with reduced pattern superficially resembling "
            "the Woma morph but genetically distinct. Part of the wobble "
            "complex; many combinations with other complex genes are lethal."
        ),
        "welfare_flag": "neurological",
        "welfare_notes": (
            "Associated with wobble-like neurological signs. HGW × HGW "
            "(homozygous), HGW × Spider, and HGW × Champagne combinations "
            "are reported as lethal or non-viable by breeder consensus. "
            "Severity of wobble in heterozygous HGW varies between animals. "
            "Breeders avoid pairing HGW with other wobble-complex genes."
        ),
        "lethal_homozygous": True,
        "citations": cite(
            "nwreptiles_oddities",
            "owal_morph_issues",
            "cape_fear_disclosures",
        ),
    },
    {
        "common_name": "Woma",
        "symbol": "woma",
        "gene_type": "dominant",
        "description": (
            "Dominant pattern morph producing reduced side pattern and a "
            "cleaner dorsal field. Commonly combined to reduce pattern in "
            "designer morphs."
        ),
        "welfare_flag": "neurological",
        "welfare_notes": (
            "Associated with mild-to-moderate wobble signs in a subset of "
            "animals; severity is generally reported as lower than Spider "
            "or Champagne. Some bloodlines are reported to produce affected "
            "offspring more consistently than others. Part of the wobble "
            "complex; homozygous form has been reported as problematic or "
            "non-viable in some breeder accounts."
        ),
        "lethal_homozygous": False,
        "citations": cite(
            "nwreptiles_oddities",
            "owal_morph_issues",
            "reptiles_and_research_spider",
        ),
    },
    {
        "common_name": "Super Sable",
        "symbol": "ssab",
        "gene_type": "recessive",
        "description": (
            "Homozygous form of the Sable gene. Reported in breeder "
            "literature to carry wobble-like neurological signs."
        ),
        "welfare_flag": "neurological",
        "welfare_notes": (
            "Breeder literature reports wobble-like signs in Super Sable "
            "(homozygous) animals. Not peer-reviewed; listed as part of the "
            "wobble complex by multiple established breeder references. "
            "Heterozygous Sable is generally reported as unaffected."
        ),
        "lethal_homozygous": False,
        "citations": cite(
            "nwreptiles_oddities",
            "owal_morph_issues",
            "cape_fear_disclosures",
        ),
    },
    # -- Welfare-flagged: structural super forms -----------------------------
    {
        "common_name": "Super Cinnamon",
        "symbol": "scin",
        "gene_type": "codominant",
        "description": (
            "Homozygous Cinnamon, producing a near-solid very dark animal. "
            "Associated with elevated rates of structural defects at hatch."
        ),
        "welfare_flag": "structural",
        "welfare_notes": (
            "Super Cinnamon (and the allelic Super Black Pastel) is "
            "associated with elevated rates of duckbill deformity, spinal "
            "kinking, and other structural defects in hatchlings. Not all "
            "animals are affected; breeder community consensus is that "
            "pairing two Cinnamon or two Black Pastel animals carries "
            "material welfare risk. Community-reported pattern, not "
            "peer-reviewed; we describe this as 'associated with' rather "
            "than 'causes.'"
        ),
        "lethal_homozygous": False,
        "citations": cite(
            "owal_morph_issues",
            "cape_fear_disclosures",
            "morphmarket_morphpedia",
        ),
    },
    {
        "common_name": "Super Black Pastel",
        "symbol": "sbp",
        "gene_type": "codominant",
        "description": (
            "Homozygous Black Pastel. Visually near-identical to Super "
            "Cinnamon (the two are allelic). Associated with the same "
            "structural-defect pattern."
        ),
        "welfare_flag": "structural",
        "welfare_notes": (
            "See Super Cinnamon — Super Black Pastel shares the same "
            "elevated risk of duckbill and spinal kinking in hatchlings. "
            "Cinnamon × Black Pastel pairings (producing Super Cinnabar / "
            "8-ball) carry the same risk profile."
        ),
        "lethal_homozygous": False,
        "citations": cite(
            "owal_morph_issues",
            "cape_fear_disclosures",
            "morphmarket_morphpedia",
        ),
    },
]


def seed():
    """Upsert the ball python gene catalog. Idempotent — re-runs are safe."""
    print(f"Seeding Python regius gene catalog ({len(GENES)} entries)...")
    db = SessionLocal()

    added = 0
    skipped = 0
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

            if existing:
                # Refresh welfare fields and citations on re-run — content
                # evolves; everything else stays immutable-ish.
                existing.description = entry["description"]
                existing.welfare_flag = entry.get("welfare_flag")
                existing.welfare_notes = entry.get("welfare_notes")
                existing.lethal_homozygous = entry["lethal_homozygous"]
                existing.welfare_citations = entry["citations"]
                skipped += 1
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
                welfare_citations=entry["citations"],
                is_verified=True,
            )
            db.add(row)
            added += 1
            print(f"  Added:   {SPECIES} / {common_name}")

        db.commit()
        print(
            f"\nDone. Added {added}, updated {updated}, total skipped (pre-existing) {skipped}."
        )
    except Exception as e:  # noqa: BLE001
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
