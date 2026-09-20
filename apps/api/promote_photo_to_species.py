"""
Use one of your own photos as a species-catalog image.

    python3 promote_photo_to_species.py --photo <photo_id> --species "Cubaris sp. 'Panda King'" \
        --attribution "Cory Wilson, Appalachian Tarantulas"
    python3 promote_photo_to_species.py --colony <colony_id> --species "..." --attribution "..." --apply

Dry run by default. Prints exactly what it would write, then stops.

WHY A COPY AND NOT A LINK
-------------------------
It would be one line to point `invert_species.image_url` at the photo's
existing URL. Don't. That photo belongs to an animal or a colony, and deleting
either cascades the row away — at which point the species page 404s for every
keeper, not just the one who deleted something.

`StorageService._copy_in_r2` already solves this for the transfer flow, for the
identical reason (BRIEF §5: the buyer's record must own its image objects so
the seller can't break it later). The catalog gets its own object under
`species-images/`, with an independent lifetime. Server-side copy: no download,
no re-encode, no quality loss.

GAP-FILLING ONLY
----------------
Refuses when the species already has an image. The catalog's existing pictures
are curated and attributed; a bulk tool that could silently overwrite one is a
tool that eventually does. Pass --replace if you genuinely mean to, and it will
tell you what it's discarding first.

ATTRIBUTION IS REQUIRED
-----------------------
Not decoration. 186 of the 193 catalog images carry it, in the form
"Name, LICENCE, via Source". A keeper photo is simply "Your Name" — but
something has to be there, because an unattributed image in a catalog that
attributes everything else reads as if its provenance was lost.

THIS TOOL IS FOR *YOUR* PHOTOS
------------------------------
It doesn't check who owns the photo, because as an admin script pointed at your
own collection it doesn't need to. If this ever becomes a user-facing
"contribute this photo" feature, consent stops being implicit and needs to be
asked for explicitly — a keeper uploading a photo of their pet has not thereby
agreed to license it as your catalog artwork.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import uuid

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.colony import Colony
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.models.photo import Photo
from app.services.storage import StorageService


def _resolve_species(db, needle: str) -> InvertSpecies | None:
    """By id, or by scientific name (case-insensitive)."""
    try:
        uuid.UUID(needle)
        found = db.query(InvertSpecies).filter(InvertSpecies.id == needle).first()
        if found:
            return found
    except (ValueError, AttributeError):
        pass
    return (
        db.query(InvertSpecies)
        .filter(InvertSpecies.scientific_name_lower == needle.strip().lower())
        .first()
    )


def _resolve_photo(db, args) -> Photo | None:
    """Explicit photo id, or the hero photo of an animal / colony."""
    if args.photo:
        return db.query(Photo).filter(Photo.id == args.photo).first()

    if args.colony:
        colony = db.query(Colony).filter(Colony.id == args.colony).first()
        if not colony:
            return None
        q = db.query(Photo).filter(Photo.colony_id == colony.id)
        # Prefer the hero if one is set; it's the picture the keeper chose.
        if colony.photo_url:
            hero = q.filter(Photo.url == colony.photo_url).first()
            if hero:
                return hero
        return q.order_by(Photo.created_at.desc()).first()

    if args.animal:
        animal = db.query(Invert).filter(Invert.id == args.animal).first()
        if not animal:
            return None
        q = db.query(Photo).filter(Photo.invert_id == animal.id)
        if animal.photo_url:
            hero = q.filter(Photo.url == animal.photo_url).first()
            if hero:
                return hero
        return q.order_by(Photo.created_at.desc()).first()

    return None


async def main() -> int:
    ap = argparse.ArgumentParser()
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--photo", help="photo id")
    src.add_argument("--colony", help="colony id (uses its hero photo)")
    src.add_argument("--animal", help="invert id (uses its hero photo)")
    ap.add_argument("--species", required=True, help="scientific name or species id")
    ap.add_argument("--attribution", required=True, help='e.g. "Cory Wilson, Appalachian Tarantulas"')
    ap.add_argument(
        "--replace", action="store_true",
        help="overwrite an existing catalog image (prints what it discards first)",
    )
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    if not args.attribution.strip():
        print("! --attribution cannot be blank. See the module docstring.")
        return 1

    db = SessionLocal()
    try:
        species = _resolve_species(db, args.species)
        if not species:
            print(f"! No species matching {args.species!r}")
            return 1

        photo = _resolve_photo(db, args)
        if not photo:
            print("! No photo found for that source")
            return 1

        print(f"{'APPLY' if args.apply else 'DRY RUN'}")
        print(f"  species     : {species.scientific_name}  ({species.taxon})")
        print(f"  source photo: {photo.id}")
        print(f"                {photo.url}")
        print(f"  attribution : {args.attribution}")

        if species.image_url:
            if not args.replace:
                print()
                print("  ! REFUSED — this species already has an image:")
                print(f"      {species.image_url}")
                print(f"      {species.image_attribution or '(no attribution recorded)'}")
                print("    This tool fills gaps. Pass --replace if you mean to overwrite it.")
                return 1
            print()
            print("  ! REPLACING an existing image:")
            print(f"      {species.image_url}")
            print(f"      {species.image_attribution or '(no attribution recorded)'}")

        # Slug key, matching the existing catalog convention
        # (species-images/brachypelma-boehmei.jpg). A uuid suffix keeps a
        # replacement from colliding with the object it supersedes — and from
        # being served stale by anything that cached the old key.
        slug = (species.slug or species.scientific_name_lower or "species").replace(" ", "-")
        slug = "".join(c for c in slug if c.isalnum() or c in "-_")
        dest_key = f"species-images/{slug}-{uuid.uuid4().hex[:8]}.jpg"
        print(f"  new object  : {dest_key}")

        if not args.apply:
            print("  (re-run with --apply)")
            return 0

        storage = StorageService()
        if not storage.use_r2:
            print("! R2 is not configured in this environment — refusing to guess at local paths.")
            return 1

        new_url = storage._copy_in_r2(photo.url, dest_key)
        species.image_url = new_url
        species.image_attribution = args.attribution.strip()
        db.commit()

        print(f"  done -> {new_url}")
        print("  The keeper's original photo is untouched; the catalog owns its own copy.")
        return 0
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
