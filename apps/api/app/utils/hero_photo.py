"""Keeping the hero photo in step across the dual-write pair.

THE BUG THIS EXISTS TO PREVENT
------------------------------
A tarantula lives in TWO tables while the ADR-005 read cutover is pending: the
legacy `tarantulas` row and its `inverts` mirror, sharing a primary key. Both
carry `photo_url`, and different surfaces read different ones — the web
collection reads `/api/v1/tarantulas/`, the generic detail screen reads
`/api/v1/inverts/`.

Three separate places wrote `photo_url` (set-main, first-upload default, and
delete-promotion), and all three mirrored in ONE direction only: legacy → invert.
The guard was `if not isinstance(parent, Invert)`.

That's fine when the photo carries a `tarantula_id`, because the owner lookup
resolves the legacy row first. But a photo uploaded through the generic
`/inverts/{id}/photos` route has NO `tarantula_id`, so the owner resolves as the
Invert, the guard skips, and `tarantulas.photo_url` is never updated. The keeper
sets a new hero, the detail screen changes, and the collection card does not.

Reported by a keeper 2026-08-02; seven animals across four accounts were
affected before the fix.

The fix is to stop asking "which kind of parent is this" and instead always
write BOTH rows. Direction-agnostic, one helper, three call sites.
"""
from typing import Any, Optional


def sync_hero_photo(db: Any, parent: Any, url: Optional[str]) -> None:
    """Set `photo_url` on `parent` AND on its dual-write twin.

    Safe to call with any parent:
      - Invert            → also writes the legacy tarantula/scorpion row
      - Tarantula/Scorpion → also writes the Invert mirror
      - Animal (HV), Colony, Centipede… → no twin exists, so this is a no-op
        beyond the parent itself

    Keyed on the shared primary key rather than on the photo's FK columns, so
    photos predating the ADR-005 backfill — which have a null `invert_id` — are
    covered too.
    """
    from app.models.invert import Invert
    from app.models.scorpion import Scorpion
    from app.models.tarantula import Tarantula

    parent.photo_url = url

    if isinstance(parent, Invert):
        # Forward was already handled; THIS is the direction that was missing.
        twins = (Tarantula, Scorpion)
    elif isinstance(parent, (Tarantula, Scorpion)):
        twins = (Invert,)
    else:
        return  # HV animal, colony, or an invert-native taxon — nothing to mirror

    for model in twins:
        row = db.query(model).filter(model.id == parent.id).first()
        if row is not None:
            row.photo_url = url
