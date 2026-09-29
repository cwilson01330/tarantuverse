"""Delete stored photo files when the rows that own them are deleted.

WHY
---
Photo rows cascade away with their animal, colony or account (ON DELETE
CASCADE), but the image files in R2 never did. Deleting an animal — or an
entire account — left every photo of it downloadable at its public URL
forever. For an account deletion that is a promise we were breaking.

HOW
---
1. BEFORE the delete, `collect_*` reads the (url, thumbnail_url) pairs the
   cascade is about to remove.
2. The caller deletes and COMMITS.
3. AFTER the commit, `delete_files` removes each file — but only if no
   remaining photo row still points at it, and only inside the photos/,
   thumbnails/ or avatars/ areas. Species catalogue images and anything
   else are never touched, whatever a row says.

File deletion is best-effort and never raises: the database is the source of
truth, and a leftover file is a smaller failure than a half-deleted account.
"""
import logging
import re
from typing import Iterable, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.photo import Photo

logger = logging.getLogger(__name__)

# The ONLY storage keys this module will ever delete: exactly the shapes our
# upload code generates — an area, an optional prefix, a UUID, an image
# extension. Nothing else (no nested paths, no "..", no other areas).
#
# This has to be strict because avatar_url is free text on the profile form:
# a user can point it at any string. A loose "starts with photos/" check let a
# crafted URL resolve to someone else's photo and delete it on the next avatar
# change. With an exact key, the "still referenced?" check below protects every
# file a real row points at.
_UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
KEY_RE = re.compile(
    rf"^(?:photos/{_UUID}|thumbnails/thumb_{_UUID}|avatars/avatar_{_UUID})\.(?:jpe?g|png|webp|gif)$",
    re.IGNORECASE,
)

FilePair = tuple[Optional[str], Optional[str]]


def _pairs(rows) -> list[FilePair]:
    return [(u, t) for (u, t) in rows]


def collect_for_animal(db: Session, animal_id) -> list[FilePair]:
    """Photos for one individual animal. TV animals share one id across the
    inverts row and its legacy tarantula/scorpion twin, so match all three."""
    aid = str(animal_id)
    rows = db.query(Photo.url, Photo.thumbnail_url).filter(or_(
        Photo.invert_id == aid,
        Photo.tarantula_id == aid,
        Photo.scorpion_id == aid,
        Photo.animal_id == aid,
    )).all()
    return _pairs(rows)


def collect_for_colony(db: Session, colony_id) -> list[FilePair]:
    rows = db.query(Photo.url, Photo.thumbnail_url).filter(Photo.colony_id == str(colony_id)).all()
    return _pairs(rows)


def collect_for_user(db: Session, user_id) -> list[FilePair]:
    """Every photo of every animal/colony the user owns, plus their avatar."""
    from app.models.animal import Animal
    from app.models.colony import Colony
    from app.models.invert import Invert
    from app.models.scorpion import Scorpion
    from app.models.tarantula import Tarantula
    from app.models.user import User

    uid = user_id
    owned = or_(
        Photo.invert_id.in_(db.query(Invert.id).filter(Invert.user_id == uid)),
        Photo.tarantula_id.in_(db.query(Tarantula.id).filter(Tarantula.user_id == uid)),
        Photo.scorpion_id.in_(db.query(Scorpion.id).filter(Scorpion.user_id == uid)),
        Photo.animal_id.in_(db.query(Animal.id).filter(Animal.user_id == uid)),
        Photo.colony_id.in_(db.query(Colony.id).filter(Colony.user_id == uid)),
    )
    pairs = _pairs(db.query(Photo.url, Photo.thumbnail_url).filter(owned).all())
    avatar = db.query(User.avatar_url).filter(User.id == uid).scalar()
    if avatar:
        pairs.append((avatar, None))
    return pairs


def _is_deletable(url: str, public_base: Optional[str]) -> bool:
    """True only for a URL that is exactly one of our generated keys under our
    own storage root — so the URL IS the canonical form, and an exact-match
    "still referenced?" query is sound."""
    if public_base:
        prefix = public_base.rstrip("/") + "/"
        if not url.startswith(prefix):
            return False
        key = url[len(prefix):]
    else:
        if not url.startswith("/uploads/"):
            return False
        key = url[len("/uploads/"):]
    return bool(KEY_RE.match(key))


async def delete_files(db: Session, pairs: Iterable[FilePair], storage=None) -> int:
    """Delete the files for `pairs` that nothing references any more.
    Call AFTER the commit. Returns how many files were deleted."""
    from app.models.user import User

    if storage is None:
        from app.services.storage import storage_service as storage

    base = getattr(storage, "public_url_base", None) if getattr(storage, "use_r2", False) else None
    urls: list[str] = []
    for url, thumb in pairs:
        for u in (url, thumb):
            if u and u not in urls:
                urls.append(u)

    deleted = 0
    for u in urls:
        try:
            if not _is_deletable(u, base):
                continue
            still_used = (
                db.query(Photo.id).filter(or_(Photo.url == u, Photo.thumbnail_url == u)).first()
                or db.query(User.id).filter(User.avatar_url == u).first()
            )
            if still_used:
                continue
            await storage.delete_file(u)
            deleted += 1
        except Exception:  # best-effort: never fail the caller over a file
            logger.exception("photo file cleanup failed for %s", u)
    return deleted
