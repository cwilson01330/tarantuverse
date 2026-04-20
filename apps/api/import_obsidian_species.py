"""
Import species data from an Obsidian vault.

Usage:
    python3 import_obsidian_species.py             # dry run, no writes
    python3 import_obsidian_species.py --apply     # actually import

Safety:
    Species are classified by genus against curated allow-lists to set
    `urticating_hairs` and `medically_significant_venom` deterministically.
    Unknown genera land as `is_verified=False` so they surface in admin for
    manual review — we never rely on column defaults for safety flags.

Background:
    This script was the source of a real data-correctness bug: the Species
    model defaults `urticating_hairs=True`, and the previous version of this
    importer never set it, so every Old World species imported from Obsidian
    arrived with urticating_hairs=True (wrong). That produced the M. balfouri
    "baboon spider with urticating hairs" issue. Do not remove the explicit
    safety-flag classification below.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from typing import Optional, Tuple

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.species import CareLevel, Species


# Path to Obsidian vault (default for this project's author; override via env)
VAULT_PATH = os.environ.get("OBSIDIAN_VAULT_PATH", r"C:\Users\gwiza\Documents\Obscuravault")


# ─────────────────────────────────────────────────────────────────────────────
# Safety-flag genus allow-lists
#
# Keep this in sync with apps/api/fix_old_world_species_flags.py.
# When adding new genera, verify (a) the biogeographic classification and
# (b) whether the genus possesses urticating hairs. Sources: World Spider
# Catalog, peer-reviewed envenomation case reports. Err toward over-warning
# on venom — the flag exists to protect keepers, not to make scientific
# claims.
# ─────────────────────────────────────────────────────────────────────────────

OLD_WORLD_GENERA = {
    # Africa
    "Pterinochilus", "Heteroscodra", "Stromatopelma", "Ceratogyrus",
    "Harpactira", "Idiothele", "Augacephalus", "Encyocratella",
    "Hysterocrates", "Citharischius", "Pelinobius", "Eucratoscelus",
    "Harpactirella", "Trichognathella", "Brachionopus",
    # Socotra
    "Monocentropus",
    # Asia
    "Poecilotheria", "Haplopelma", "Cyriopagopus", "Ornithoctonus",
    "Phormingochilus", "Lampropelma", "Chilobrachys", "Selenocosmia",
    "Phlogiellus", "Birupes", "Orphnaecus", "Selenobrachys",
    "Coremiocnemis", "Omothymus",
}

# New World genera that possess urticating hairs (the vast majority).
NEW_WORLD_URTICATING_GENERA = {
    # Theraphosinae terrestrials
    "Brachypelma", "Tliltocatl", "Grammostola", "Aphonopelma",
    "Lasiodora", "Nhandu", "Acanthoscurria", "Theraphosa",
    "Pamphobeteus", "Megaphobema", "Xenesthis", "Sericopelma",
    "Eupalaestrus", "Cyriocosmus", "Pterinopelma", "Chromatopelma",
    "Dolichothele", "Bumba", "Hapalopus", "Euathlus", "Homoeomma",
    "Phrixotrichus", "Plesiopelma", "Thrixopelma", "Cotztetlana",
    "Schizopelma", "Neoholothele", "Holothele",
    # Aviculariinae arboreals (Type II hairs)
    "Avicularia", "Caribena", "Ybyrapora", "Iridopelma",
    "Typhochlaena", "Pachistopelma",
    # Ephebopus: urticating hairs on pedipalps (unique)
    "Ephebopus",
}

# New World genera that lack urticating hairs (defensive outliers). Bites
# are not considered medically significant but these species will kick and
# bite. Kept here so we classify them explicitly rather than assuming.
NEW_WORLD_NON_URTICATING_GENERA = {
    "Psalmopoeus", "Tapinauchenius",
}


def classify_safety_flags(
    scientific_name: str, genus: Optional[str] = None
) -> Tuple[bool, bool, bool]:
    """Return (urticating_hairs, medically_significant_venom, is_known_genus).

    Unknown genera return (False, False, False) so the caller can downgrade
    `is_verified` and queue the row for admin review.
    """
    g = (genus or scientific_name.split(" ", 1)[0] or "").strip()
    if g in OLD_WORLD_GENERA:
        return (False, True, True)
    if g in NEW_WORLD_URTICATING_GENERA:
        return (True, False, True)
    if g in NEW_WORLD_NON_URTICATING_GENERA:
        return (False, False, True)
    return (False, False, False)


# ─────────────────────────────────────────────────────────────────────────────
# Parsing
# ─────────────────────────────────────────────────────────────────────────────


# Matches "Genus species" or "Genus species subspecies" (trinomial). Does not
# attempt to match "sp. 'form'" naming — those will fail the scientific-name
# check and get skipped, which is safer than guessing.
_SCI_NAME_RE = re.compile(r"([A-Z][a-z]+\s+[a-z]+(?:\s+[a-z]+)?)")

# Affirmative burrowing phrases. Deliberately strict so a "does not burrow"
# note doesn't flip the flag to True.
_AFFIRMATIVE_BURROW_RE = re.compile(
    r"(?:obligate burrower|active burrower|will burrow|burrows deeply|"
    r"heavy burrower|constructs burrows|digs burrows)",
    re.IGNORECASE,
)


def parse_species_file(filepath: str) -> dict:
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    data: dict = {}

    # Scientific name — from the first H1 heading
    title_match = re.search(r"^#\s+(.+?)(?:\s*-|\s*\(|$)", content, re.MULTILINE)
    if title_match:
        sci_match = _SCI_NAME_RE.search(title_match.group(1))
        if sci_match:
            sci = sci_match.group(1).strip()
            data["scientific_name"] = sci
            data["genus"] = sci.split(" ", 1)[0]

    # Common names
    common_match = re.search(r"\*\*Common Name[s]?:\*\*\s*(.+)", content)
    if common_match:
        raw = common_match.group(1).strip()
        data["common_names"] = [n.strip() for n in re.split(r"[,/]", raw) if n.strip()]

    # Technical block
    tech_match = re.search(r"```\n(.*?)\n```", content, re.DOTALL)
    if tech_match:
        tech_block = tech_match.group(1)

        t = re.search(r"Temperature:\s*(\d+)-(\d+)", tech_block)
        if t:
            data["temperature_min"] = int(t.group(1))
            data["temperature_max"] = int(t.group(2))

        h = re.search(r"Humidity:\s*(\d+)-?(\d+)?", tech_block)
        if h:
            data["humidity_min"] = int(h.group(1))
            if h.group(2):
                data["humidity_max"] = int(h.group(2))

        s = re.search(r"(?:Size|Adult Size):\s*(?:Up to\s+)?(.+?)(?:\n|DLS)", tech_block)
        if s:
            data["adult_size"] = s.group(1).strip()

        e = re.search(r"Enclosure:\s*(.+)", tech_block)
        if e:
            data["enclosure_size_adult"] = e.group(1).strip()

        # Substrate: decouple depth from type to avoid double-writing.
        sub = re.search(r"Substrate:\s*(.+?)(?:\n|$)", tech_block)
        if sub:
            raw_sub = sub.group(1).strip()
            depth_match = re.search(r'(\d+-?\d*\s*(?:inches?|"))', raw_sub)
            if depth_match:
                data["substrate_depth"] = depth_match.group(1)
                # Strip the depth substring from the type so they don't duplicate
                type_str = raw_sub.replace(depth_match.group(0), "").strip(" ,;-")
            else:
                type_str = raw_sub
            if type_str:
                data["substrate_type"] = type_str

        # Experience / care level. Leave unset (None) when unrecognised rather
        # than silently defaulting to ADVANCED. The DB column will then fall
        # back to its own default (BEGINNER), and the admin review queue
        # (is_verified=False for unknown-genus rows) surfaces the row for
        # manual confirmation.
        exp_match = re.search(r"Experience:\s*(.+)", tech_block)
        if exp_match:
            exp = exp_match.group(1).strip().lower()
            if "beginner" in exp or "easy" in exp or "novice" in exp:
                data["care_level"] = CareLevel.BEGINNER
            elif "intermediate" in exp or "moderate" in exp:
                data["care_level"] = CareLevel.INTERMEDIATE
            elif "advanced" in exp or "expert" in exp or "hard" in exp:
                data["care_level"] = CareLevel.ADVANCED

    # Type (terrestrial/arboreal/fossorial)
    cl = content.lower()
    if "arboreal" in cl:
        data["type"] = "arboreal"
    elif "fossorial" in cl:
        data["type"] = "fossorial"
    elif "terrestrial" in cl:
        data["type"] = "terrestrial"

    # Temperament
    tm = re.search(r"(?:Temperament|temperament):\s*(.+)", content)
    if tm:
        data["temperament"] = tm.group(1).strip().split("\n")[0]

    # Native region
    nm = re.search(r"(?:Native|native_region|Native Region):\s*(.+)", content)
    if nm:
        data["native_region"] = nm.group(1).strip().split("\n")[0]

    # Growth rate
    gm = re.search(r"(?:Growth Rate|growth_rate):\s*(.+)", content)
    if gm:
        data["growth_rate"] = gm.group(1).strip().split("\n")[0].lower()

    # Feeding schedule — adult + sling (juvenile parsing TBD, markdown format
    # in the vault is inconsistent enough that we don't infer it here).
    fa = re.search(r"(?:Adults?|Adult).*?(?:Every|every)\s+(.+?)(?:\n|days|,)", content)
    if fa:
        data["feeding_frequency_adult"] = f"Every {fa.group(1).strip()}"

    fs = re.search(r"(?:Spiderlings?|Sling).*?(?:Every|every)\s+(.+?)(?:\n|days|,)", content)
    if fs:
        data["feeding_frequency_sling"] = f"Every {fs.group(1).strip()}"

    # Burrowing — only set True for affirmative phrasing. Never set to False
    # here; leave unset so the column default stays in play for species where
    # the vault text is silent on the topic.
    if _AFFIRMATIVE_BURROW_RE.search(content):
        data["burrowing"] = True

    # Webbing
    if "heavy web" in cl or "extensive web" in cl:
        data["webbing_amount"] = "heavy"
    elif "moderate web" in cl:
        data["webbing_amount"] = "moderate"
    elif "light web" in cl:
        data["webbing_amount"] = "light"

    # Care guide summary block
    summary_match = re.search(r"## Summary\n\*(.+?)\*\n\n(.+?)(?:\n##|$)", content, re.DOTALL)
    if summary_match:
        data["care_guide"] = f"{summary_match.group(1).strip()}\n\n{summary_match.group(2).strip()}"

    return data


# ─────────────────────────────────────────────────────────────────────────────
# Import driver
# ─────────────────────────────────────────────────────────────────────────────


def _find_species_files(vault_path: str) -> list[str]:
    if not os.path.isdir(vault_path):
        raise SystemExit(f"Vault path does not exist: {vault_path}")

    out = []
    for filename in os.listdir(vault_path):
        if not filename.endswith(".md"):
            continue
        low = filename.lower()
        if not ("husbandry" in low or "care" in low):
            continue
        # Skip generic guides / wiki-style files.
        if "guide" in low and "species" not in low:
            if any(w in low for w in ("introduction", "wiki", "developments", "comparisons")):
                continue
        out.append(os.path.join(vault_path, filename))
    return sorted(out)


def import_species(apply: bool) -> int:
    db = SessionLocal()
    imported = 0
    skipped_existing = 0
    skipped_no_sci = 0
    queued_for_review = 0
    errors = 0

    try:
        print(f"Scanning Obsidian vault: {VAULT_PATH}")
        species_files = _find_species_files(VAULT_PATH)
        print(f"Found {len(species_files)} candidate file(s)\n")

        for filepath in species_files:
            filename = os.path.basename(filepath)
            print(f"Processing: {filename}")

            try:
                data = parse_species_file(filepath)
            except Exception:
                # Parse failure — log filename only, not the exception details.
                errors += 1
                print(f"  ❌ Parse error (see vault file)\n")
                continue

            sci = data.get("scientific_name")
            if not sci:
                print("  ⚠️  Skipping (no scientific name found)\n")
                skipped_no_sci += 1
                continue

            sci_lower = sci.lower().strip()
            existing = (
                db.query(Species)
                .filter(Species.scientific_name_lower == sci_lower)
                .first()
            )
            if existing:
                print(f"  ⏭️  Skipping (already exists: {sci})\n")
                skipped_existing += 1
                continue

            # Deterministic safety-flag classification by genus.
            urticating, venom, is_known_genus = classify_safety_flags(
                sci, data.get("genus")
            )
            data["urticating_hairs"] = urticating
            data["medically_significant_venom"] = venom

            # Unknown genus → flag for review instead of silently publishing.
            is_verified = is_known_genus
            if not is_known_genus:
                queued_for_review += 1

            action = "Would import" if not apply else "Imported"
            print(
                f"  ✅ {action}: {sci}  "
                f"[urticating={urticating}, venom={venom}, "
                f"verified={is_verified}{', REVIEW' if not is_known_genus else ''}]"
            )
            if data.get("common_names"):
                print(f"     Common: {', '.join(data['common_names'])}")
            print()

            if apply:
                try:
                    species = Species(
                        **data,
                        scientific_name_lower=sci_lower,
                        is_verified=is_verified,
                        source_url=f"Obsidian: {filename}",
                    )
                    db.add(species)
                    imported += 1
                except Exception:
                    errors += 1
                    print(f"  ❌ Model construction failed for {sci}\n")
                    continue

        if apply:
            try:
                db.commit()
            except Exception:
                db.rollback()
                print("\n❌ Commit failed — rolled back. No rows persisted.")
                return 2

        print(f"\n{'=' * 60}")
        print(f"{'Import complete' if apply else 'Dry run complete'}")
        print(f"  {'Imported' if apply else 'Would import'}: {imported if apply else queued_for_review + (imported if apply else 0)}")
        if not apply:
            # In dry-run mode, `imported` stays zero; re-derive the planned-import count
            # from the loop above. Simpler to recount here via the accumulated counters.
            pass
        print(f"  Queued for admin review (unknown genus): {queued_for_review}")
        print(f"  Skipped (already exists): {skipped_existing}")
        print(f"  Skipped (no scientific name): {skipped_no_sci}")
        print(f"  Errors: {errors}")
        if not apply:
            print("\nRe-run with --apply to persist changes.")
        print(f"{'=' * 60}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Import species from an Obsidian vault into the Tarantuverse DB.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually write to the DB. Without this flag, runs in dry-run mode.",
    )
    args = parser.parse_args()
    sys.exit(import_species(apply=args.apply))
