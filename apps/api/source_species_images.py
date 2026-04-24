"""
source_species_images.py — Find freely-licensed Wikimedia images for species
that currently have no image_url in the DB.

Workflow is three phases, each exposed as a subcommand so a human can pause
between them and verify before we put anything misidentified in front of
users:

  1) python3 source_species_images.py find
       Queries the DB for species where image_url IS NULL or empty and writes
       their scientific names to `species_without_images.txt`, one per line.

  2) python3 source_species_images.py candidates
       Reads that text file and, for each scientific name:
         - Calls the Wikipedia REST summary endpoint to find the page image.
         - Calls the MediaWiki API for that image's license + author metadata.
         - Filters to commercially-usable CC licenses (PD, CC0, CC-BY,
           CC-BY-SA). Rejects CC-BY-NC / CC-BY-ND since Tarantuverse is a
           commercial product.
       Writes `species_image_candidates.csv` with columns:
         scientific_name, wikipedia_page, image_url, thumb_url,
         license, author, attribution_line, notes, approved
       Rows with no candidate get notes="NO_CANDIDATE" and skipped by apply.

  3) Human review:
       Open the CSV, eyeball each image (click the URL), and set
       approved="y" for accepted rows. Leave blank or "n" to reject.
       Wrong-species photos or ambiguous IDs should NEVER be approved —
       per the honesty-first principle, no image is better than a wrong one.

  4) python3 source_species_images.py apply
       Reads the reviewed CSV. Dry-run by default — prints what it would
       do. Pass --apply to actually UPDATE rows. Only touches rows where
       approved == "y". Stores image_url and, when source_url is empty,
       sets source_url = wikipedia_page so attribution is one click away
       from the care sheet.

Safe to re-run: `find` and `candidates` are read-only. `apply` is
idempotent (re-applying the same CSV is a no-op).

Network etiquette: 0.4s sleep between Wikipedia calls so we stay well
under their rate limit without needing an API key.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from typing import Optional
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.species import Species


MISSING_LIST_PATH = "species_without_images.txt"
CANDIDATES_CSV_PATH = "species_image_candidates.csv"

# Licenses we'll accept. These are the CC licenses compatible with
# commercial use. CC-BY-NC and CC-BY-ND are deliberately excluded even
# though they're "free" — they'd force us to gate the care sheet behind
# a non-commercial promise we can't keep.
ACCEPTED_LICENSE_PREFIXES = (
    "Public domain",
    "PD",
    "CC0",
    "CC BY",
    "CC-BY",
    "Creative Commons Attribution",
)

# Licenses we actively reject so they don't sneak in via substring matching
# on the above (e.g. "CC BY-NC" contains "CC BY").
REJECTED_LICENSE_SUBSTRINGS = (
    "-NC",
    "NonCommercial",
    "-ND",
    "NoDerivatives",
    "NoDerivs",
)


WIKIPEDIA_REST_BASE = "https://en.wikipedia.org/api/rest_v1/page/summary/"
WIKIPEDIA_API_BASE = "https://en.wikipedia.org/w/api.php"
COMMONS_API_BASE = "https://commons.wikimedia.org/w/api.php"

# Wikipedia asks API clients to identify themselves. Good manners even for
# low-volume scripts; helps their abuse team separate hobbyists from bots
# if ever something about this script misbehaves.
USER_AGENT = (
    "TarantuverseCareSheetImageSourcer/1.0 "
    "(https://tarantuverse.com; admin@tarantuverse.com) stdlib-urllib"
)


@dataclass
class ImageCandidate:
    scientific_name: str
    wikipedia_page: Optional[str] = None
    image_url: Optional[str] = None
    thumb_url: Optional[str] = None
    license: Optional[str] = None
    author: Optional[str] = None
    attribution_line: Optional[str] = None
    notes: str = ""


# ─────────────────────────────────────────────────────────────────────────────
# Phase 1: find species missing images in the DB
# ─────────────────────────────────────────────────────────────────────────────

def cmd_find(args: argparse.Namespace) -> None:
    db = SessionLocal()
    try:
        missing = (
            db.query(Species.scientific_name)
            .filter((Species.image_url.is_(None)) | (Species.image_url == ""))
            .order_by(Species.scientific_name.asc())
            .all()
        )
    finally:
        db.close()

    names = [row[0] for row in missing if row[0]]
    with open(MISSING_LIST_PATH, "w", encoding="utf-8") as f:
        for n in names:
            f.write(n + "\n")

    print(f"[find] {len(names)} species missing images → {MISSING_LIST_PATH}")
    if names:
        preview = ", ".join(names[:5])
        suffix = "..." if len(names) > 5 else ""
        print(f"[find] first few: {preview}{suffix}")


# ─────────────────────────────────────────────────────────────────────────────
# Phase 2: query Wikipedia for candidate images
# ─────────────────────────────────────────────────────────────────────────────

def http_get_json(url: str) -> Optional[dict]:
    """GET a URL, parse JSON. Returns None on any error — callers decide
    what to do with that (usually: fall back gracefully and keep going)."""
    try:
        req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        with urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        # 404 here means Wikipedia has no page for this species name. Common
        # for obscure / freshly-described species; not an error we can fix.
        if e.code == 404:
            return None
        print(f"  [http] {e.code} for {url}", file=sys.stderr)
        return None
    except (URLError, json.JSONDecodeError, TimeoutError) as e:
        print(f"  [http] {e} for {url}", file=sys.stderr)
        return None


def wikipedia_summary(title: str) -> Optional[dict]:
    """Hit the Wikipedia REST summary endpoint. URL-encodes the title so
    species names with spaces or accents don't break the URL."""
    return http_get_json(WIKIPEDIA_REST_BASE + quote(title.replace(" ", "_")))


def wikipedia_pageimage_filename(title: str) -> Optional[str]:
    """MediaWiki API call to get the canonical page-image filename (e.g.
    'File:Brachypelma_hamorii_1.jpg'). The REST summary gives us the
    image URL, but we need the filename for the Commons extmetadata call.
    """
    url = (
        f"{WIKIPEDIA_API_BASE}?action=query&titles={quote(title)}"
        "&prop=pageimages&piprop=name&format=json&formatversion=2"
    )
    data = http_get_json(url)
    if not data:
        return None
    pages = data.get("query", {}).get("pages", [])
    if not pages:
        return None
    name = pages[0].get("pageimage")
    return f"File:{name}" if name else None


def commons_file_metadata(file_title: str) -> Optional[dict]:
    """Commons API call for extmetadata (license, author, usage terms)."""
    url = (
        f"{COMMONS_API_BASE}?action=query&titles={quote(file_title)}"
        "&prop=imageinfo&iiprop=url|extmetadata|user&format=json&formatversion=2"
    )
    data = http_get_json(url)
    if not data:
        return None
    pages = data.get("query", {}).get("pages", [])
    if not pages or not pages[0].get("imageinfo"):
        return None
    return pages[0]["imageinfo"][0]


def _strip_html(s: str) -> str:
    """Commons extmetadata fields are HTML. We only need plain text for
    the CSV — strip tags and decode a couple of common entities."""
    s = re.sub(r"<[^>]+>", "", s)
    return (
        s.replace("&amp;", "&")
         .replace("&nbsp;", " ")
         .replace("&quot;", '"')
         .strip()
    )


def is_license_acceptable(license_str: str) -> bool:
    """Filter to commercial-safe CC licenses only. See the module docstring
    for why we reject -NC and -ND even though they're technically 'free'."""
    if not license_str:
        return False
    if any(bad in license_str for bad in REJECTED_LICENSE_SUBSTRINGS):
        return False
    return any(license_str.startswith(p) or p in license_str for p in ACCEPTED_LICENSE_PREFIXES)


def build_candidate(scientific_name: str) -> ImageCandidate:
    c = ImageCandidate(scientific_name=scientific_name)

    summary = wikipedia_summary(scientific_name)
    if not summary:
        c.notes = "NO_WIKIPEDIA_PAGE"
        return c

    # Wikipedia returns disambiguation pages as type=disambiguation. We
    # can't pick the right sub-page automatically, so flag for human review.
    if summary.get("type") == "disambiguation":
        c.notes = "DISAMBIGUATION_PAGE"
        c.wikipedia_page = (summary.get("content_urls", {})
                            .get("desktop", {}).get("page"))
        return c

    c.wikipedia_page = (summary.get("content_urls", {})
                        .get("desktop", {}).get("page"))
    original = summary.get("originalimage") or {}
    thumb = summary.get("thumbnail") or {}
    c.image_url = original.get("source")
    c.thumb_url = thumb.get("source")

    if not c.image_url:
        c.notes = "NO_PAGE_IMAGE"
        return c

    # Follow up for license metadata on the specific page image.
    file_title = wikipedia_pageimage_filename(scientific_name)
    if not file_title:
        c.notes = "NO_PAGEIMAGE_FILENAME"
        return c

    meta = commons_file_metadata(file_title)
    if not meta:
        c.notes = "NO_COMMONS_METADATA"
        return c

    ext = meta.get("extmetadata", {}) or {}

    def _field(key: str) -> str:
        return _strip_html(ext.get(key, {}).get("value", "") or "")

    c.license = _field("LicenseShortName") or _field("License")
    c.author = _field("Artist") or _field("Credit") or meta.get("user", "")
    c.attribution_line = _field("Attribution") or _field("Credit")

    if not is_license_acceptable(c.license or ""):
        c.notes = f"LICENSE_NOT_ACCEPTED: {c.license or '(none)'}"

    return c


def cmd_candidates(args: argparse.Namespace) -> None:
    if not os.path.exists(MISSING_LIST_PATH):
        print(f"[candidates] {MISSING_LIST_PATH} not found. Run `find` first.", file=sys.stderr)
        sys.exit(1)

    with open(MISSING_LIST_PATH, "r", encoding="utf-8") as f:
        names = [line.strip() for line in f if line.strip()]

    print(f"[candidates] sourcing {len(names)} species from Wikipedia...")
    rows: list[ImageCandidate] = []
    for i, name in enumerate(names, 1):
        print(f"  [{i}/{len(names)}] {name}")
        c = build_candidate(name)
        rows.append(c)
        # Polite throttle — 2-3 API calls per species @ 0.4s each keeps us
        # well under Wikipedia's per-IP limits even for ~100 species.
        time.sleep(0.4)

    with open(CANDIDATES_CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "scientific_name",
            "wikipedia_page",
            "image_url",
            "thumb_url",
            "license",
            "author",
            "attribution_line",
            "notes",
            "approved",
        ])
        for r in rows:
            writer.writerow([
                r.scientific_name,
                r.wikipedia_page or "",
                r.image_url or "",
                r.thumb_url or "",
                r.license or "",
                r.author or "",
                r.attribution_line or "",
                r.notes,
                "",  # approved — blank; user fills in 'y'
            ])

    hits = sum(1 for r in rows if r.image_url and not r.notes)
    partial = sum(1 for r in rows if r.notes and "LICENSE" in r.notes)
    missing = sum(1 for r in rows if not r.image_url)
    print(
        f"[candidates] done. {hits} good candidates, "
        f"{partial} with license issues, {missing} with no image. "
        f"Review {CANDIDATES_CSV_PATH} and set approved=y on rows you accept."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Phase 3: apply the human-approved rows to the DB
# ─────────────────────────────────────────────────────────────────────────────

def _format_attribution(author: str, license: str, attribution_line: str) -> str:
    """Build the credit line we store on species.image_attribution.

    Shape: "Photo: <author> (<license>) via Wikimedia Commons"

    Falls back gracefully when fields are missing — e.g. public domain
    images usually have no author:
        "Photo: public domain via Wikimedia Commons"
        "Photo: Jane Doe via Wikimedia Commons"  (unknown license)

    If Commons provided a pre-formatted Attribution line (e.g. artist
    specifically requested a specific credit form), we prefer that
    verbatim and just suffix "via Wikimedia Commons".
    """
    # A Commons-provided attribution_line can include raw HTML or a
    # wikilink-ish artist blurb. We already stripped HTML during candidate
    # generation, so we can use it as-is.
    if attribution_line:
        base = f"Photo: {attribution_line}"
        if license and license.lower() not in base.lower():
            base = f"{base} ({license})"
        return f"{base} via Wikimedia Commons"

    parts = ["Photo:"]
    if author:
        parts.append(author)
    else:
        # Public-domain / CC0 images frequently have no named author. Say so
        # explicitly so the credit line doesn't look truncated.
        if license and "public domain" in license.lower():
            parts.append("public domain")
        elif license and license.lower().startswith("cc0"):
            parts.append("public domain (CC0)")
        else:
            parts.append("unknown author")

    if license and license.lower() not in " ".join(parts).lower():
        parts.append(f"({license})")

    parts.append("via Wikimedia Commons")
    return " ".join(parts)




def cmd_apply(args: argparse.Namespace) -> None:
    if not os.path.exists(CANDIDATES_CSV_PATH):
        print(f"[apply] {CANDIDATES_CSV_PATH} not found.", file=sys.stderr)
        sys.exit(1)

    approved_rows: list[dict] = []
    with open(CANDIDATES_CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if (row.get("approved", "").strip().lower() in ("y", "yes", "true", "1")
                    and row.get("image_url", "").strip()):
                approved_rows.append(row)

    if not approved_rows:
        print("[apply] no approved rows found (approved=y column empty everywhere).")
        return

    print(f"[apply] {len(approved_rows)} approved rows. "
          f"{'DRY RUN' if not args.apply else 'WRITING CHANGES'}.")

    db = SessionLocal()
    try:
        updated = 0
        skipped = 0
        for row in approved_rows:
            name = row["scientific_name"].strip()
            species = (
                db.query(Species)
                .filter(Species.scientific_name == name)
                .first()
            )
            if not species:
                print(f"  ? {name} — not found in DB, skipping")
                skipped += 1
                continue

            # Idempotent: if the image_url already matches, no-op. This lets
            # us re-run the script on the same CSV without churn.
            target_url = row["image_url"].strip()
            if species.image_url == target_url:
                print(f"  = {name} — already set, no change")
                continue

            # Build the credit line from license + author. We always want
            # SOMETHING here when applying a Wikimedia image so CC-BY
            # attribution obligations are visibly met.
            attribution = _format_attribution(
                author=row.get("author", "").strip(),
                license=row.get("license", "").strip(),
                attribution_line=row.get("attribution_line", "").strip(),
            )

            print(f"  + {name} ← {target_url}")
            if attribution:
                print(f"      credit: {attribution}")
            if args.apply:
                species.image_url = target_url
                species.image_attribution = attribution or None
                # Backfill source_url only when it's missing — never clobber
                # a hand-curated source the admin might have entered.
                if not species.source_url and row.get("wikipedia_page"):
                    species.source_url = row["wikipedia_page"].strip()
            updated += 1

        if args.apply:
            db.commit()
            print(f"[apply] committed. {updated} rows updated, {skipped} skipped.")
        else:
            print(f"[apply] dry-run complete. Would update {updated}, skip {skipped}.")
            print("[apply] re-run with --apply to commit.")
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("find", help="List species missing image_url from DB.")
    sub.add_parser("candidates", help="Query Wikipedia for image candidates.")

    apply_parser = sub.add_parser("apply", help="Apply approved rows to DB.")
    apply_parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually write changes. Default is dry-run (prints intended updates).",
    )

    args = parser.parse_args()
    {"find": cmd_find, "candidates": cmd_candidates, "apply": cmd_apply}[args.cmd](args)


if __name__ == "__main__":
    main()
