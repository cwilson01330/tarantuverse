"""
source_species_images.py — Find freely-licensed Wikimedia images for species
that have no image yet, across ALL taxa, and emit a CSV that feeds the R2
pipeline (no hotlinking).

This is the SOURCING front-end for the image workflow:

  source_species_images.py  (this script, run on Render — needs outbound HTTP)
      ↓ produces species_images_sourced.csv  (Commons URLs + verified licenses)
  upload_species_images_to_r2.py             (copies each into R2, emits *_r2.csv)
      ↓
  apply_species_images.py species_images_r2.csv   (writes image_url to BOTH the
      legacy `species` row + the invert_species mirror)

Why not write the DB directly here: care guides must not hotlink Commons
(etiquette + breakage), and tarantula guides read the legacy `species` table
while everything else reads `invert_species`. Routing through the R2 pipeline
handles both. So this script only SOURCES + LICENSE-FILTERS; it never touches
the DB.

Phases:
  1) python3 source_species_images.py find [--taxon mantis]
       Query invert_species for rows with NULL/empty image_url (the unified
       catalog covers every taxon, tarantulas included) → species_without_images.txt
       as TSV "scientific_name<TAB>taxon".

  2) python3 source_species_images.py candidates
       For each, hit Wikipedia (summary + pageimage filename) and Commons
       (extmetadata) and keep only commercial-safe CC licenses (PD/CC0/CC BY/
       CC BY-SA; reject NC/ND). Writes species_images_sourced.csv in the SAME
       schema the R2 uploader consumes:
         scientific_name_lower, taxon, status, license, attribution,
         image_url, commons_file
       status = 'verified' (image + good license) or a descriptive reason
       ('no_wikipedia_page' / 'no_page_image' / 'no_license' / 'license_rejected:…').

  3) Human review (honesty-first): open the CSV, click image_url on each
       'verified' row, and DOWNGRADE the status of any wrong-species or
       poor-quality photo (set it to 'review_quality' so the uploader skips it).
       A wrong photo is worse than none.

  4) Hand to the R2 pipeline:
       python3 upload_species_images_to_r2.py species_images_sourced.csv --max-width 1600
       python3 apply_species_images.py docs/design/species_images_r2.csv --dry-run
       python3 apply_species_images.py docs/design/species_images_r2.csv

`find` and `candidates` are read-only (no DB writes); safe to re-run.
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
from app.models.invert_species import InvertSpecies


MISSING_LIST_PATH = "species_without_images.txt"
SOURCED_CSV_PATH = "species_images_sourced.csv"

ACCEPTED_LICENSE_PREFIXES = (
    "Public domain", "PD", "CC0", "CC BY", "CC-BY",
    "Creative Commons Attribution",
)
REJECTED_LICENSE_SUBSTRINGS = ("-NC", "NonCommercial", "-ND", "NoDerivatives", "NoDerivs")

WIKIPEDIA_REST_BASE = "https://en.wikipedia.org/api/rest_v1/page/summary/"
WIKIPEDIA_API_BASE = "https://en.wikipedia.org/w/api.php"
COMMONS_API_BASE = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = (
    "TarantuverseCareSheetImageSourcer/1.0 "
    "(https://tarantuverse.com; admin@tarantuverse.com) stdlib-urllib"
)


@dataclass
class Candidate:
    scientific_name: str
    taxon: str
    status: str = ""
    license: str = ""
    attribution: str = ""
    image_url: str = ""
    commons_file: str = ""


def http_get_json(url: str) -> Optional[dict]:
    try:
        req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        with urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        if e.code == 404:
            return None
        print(f"  [http] {e.code} for {url}", file=sys.stderr)
        return None
    except (URLError, json.JSONDecodeError, TimeoutError) as e:
        print(f"  [http] {e} for {url}", file=sys.stderr)
        return None


def wikipedia_summary(title: str) -> Optional[dict]:
    return http_get_json(WIKIPEDIA_REST_BASE + quote(title.replace(" ", "_")))


def wikipedia_pageimage_filename(title: str) -> Optional[str]:
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
    s = re.sub(r"<[^>]+>", "", s)
    return s.replace("&amp;", "&").replace("&nbsp;", " ").replace("&quot;", '"').strip()


def is_license_acceptable(license_str: str) -> bool:
    if not license_str:
        return False
    if any(bad in license_str for bad in REJECTED_LICENSE_SUBSTRINGS):
        return False
    return any(license_str.startswith(p) or p in license_str for p in ACCEPTED_LICENSE_PREFIXES)


def _attribution(author: str, license: str) -> str:
    """Match the existing CSV style: 'Author, License, via Wikimedia Commons'."""
    author = author or ("public domain" if license and "public" in license.lower() else "")
    parts = [p for p in (author, license) if p]
    parts.append("via Wikimedia Commons")
    return ", ".join(parts)


def build_candidate(scientific_name: str, taxon: str) -> Candidate:
    c = Candidate(scientific_name=scientific_name, taxon=taxon)

    summary = wikipedia_summary(scientific_name)
    if not summary:
        c.status = "no_wikipedia_page"
        return c
    if summary.get("type") == "disambiguation":
        c.status = "disambiguation_page"
        return c

    original = summary.get("originalimage") or {}
    c.image_url = original.get("source", "") or ""
    if not c.image_url:
        c.status = "no_page_image"
        return c

    file_title = wikipedia_pageimage_filename(scientific_name)
    if not file_title:
        c.status = "no_pageimage_filename"
        return c
    c.commons_file = file_title.replace("File:", "")

    meta = commons_file_metadata(file_title)
    if not meta:
        c.status = "no_commons_metadata"
        return c
    ext = meta.get("extmetadata", {}) or {}

    def _field(key: str) -> str:
        return _strip_html(ext.get(key, {}).get("value", "") or "")

    c.license = _field("LicenseShortName") or _field("License")
    author = _field("Artist") or _field("Credit") or meta.get("user", "")
    c.attribution = _attribution(author, c.license)

    if not is_license_acceptable(c.license):
        c.status = f"license_rejected: {c.license or '(none)'}"
        return c

    c.status = "verified"
    return c


def cmd_find(args: argparse.Namespace) -> None:
    db = SessionLocal()
    try:
        q = db.query(InvertSpecies.scientific_name, InvertSpecies.taxon).filter(
            (InvertSpecies.image_url.is_(None)) | (InvertSpecies.image_url == "")
        )
        if args.taxon:
            q = q.filter(InvertSpecies.taxon == args.taxon)
        rows = q.order_by(InvertSpecies.taxon, InvertSpecies.scientific_name).all()
    finally:
        db.close()

    with open(MISSING_LIST_PATH, "w", encoding="utf-8") as f:
        for name, taxon in rows:
            if name:
                f.write(f"{name}\t{taxon}\n")
    print(f"[find] {len(rows)} species missing images → {MISSING_LIST_PATH}"
          + (f" (taxon={args.taxon})" if args.taxon else ""))


def cmd_candidates(args: argparse.Namespace) -> None:
    if not os.path.exists(MISSING_LIST_PATH):
        print(f"[candidates] {MISSING_LIST_PATH} not found. Run `find` first.", file=sys.stderr)
        sys.exit(1)

    pairs: list[tuple[str, str]] = []
    with open(MISSING_LIST_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            name, _, taxon = line.partition("\t")
            pairs.append((name.strip(), taxon.strip()))

    print(f"[candidates] sourcing {len(pairs)} species from Wikipedia/Commons…")
    out: list[Candidate] = []
    for i, (name, taxon) in enumerate(pairs, 1):
        c = build_candidate(name, taxon)
        out.append(c)
        print(f"  [{i}/{len(pairs)}] {name} → {c.status}")
        time.sleep(0.4)  # polite throttle

    with open(SOURCED_CSV_PATH, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["scientific_name_lower", "taxon", "status", "license",
                    "attribution", "image_url", "commons_file"])
        for c in out:
            w.writerow([c.scientific_name.lower(), c.taxon, c.status, c.license,
                        c.attribution, c.image_url, c.commons_file])

    verified = sum(1 for c in out if c.status == "verified")
    print(f"\n[candidates] {verified}/{len(out)} verified → {SOURCED_CSV_PATH}")
    print("[candidates] REVIEW: click each verified image_url; downgrade any wrong/poor")
    print("            photo's status (e.g. to 'review_quality') so the uploader skips it.")
    print("[candidates] then: python3 upload_species_images_to_r2.py "
          f"{SOURCED_CSV_PATH} --max-width 1600")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    pf = sub.add_parser("find", help="List species missing image_url (all taxa).")
    pf.add_argument("--taxon", default=None, help="Restrict to one taxon (e.g. mantis).")
    sub.add_parser("candidates", help="Query Wikipedia/Commons for licensed images.")
    args = p.parse_args()
    {"find": cmd_find, "candidates": cmd_candidates}[args.cmd](args)


if __name__ == "__main__":
    main()
