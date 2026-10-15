"""Closed Tarantuverse animals refuse NEW history (2026-10-12).

A died (`inverts.died_at`) or handed-off (`inverts.transferred_out_at`) invert
is history. Same rule as Herpetoverse (`routers/animals.py::refuse_if_closed`),
with the same 409 messages, so both apps say the same thing:

* NEW feedings, molts, substrate changes, care logs, photos (incl. QR upload
  sessions and QR uploads) and per-animal events -> 409.
* Editing or deleting an existing entry, photo caption / set-main / delete,
  PUT /inverts/{id}, revive, change-taxon -> still open. Keepers fix the
  records of animals that died; revive is how a mistaken mark-died is undone.
* Feeding Day (`/inverts/bulk-feedings`) SKIPS a closed animal and reports it
  in `skipped` instead of failing the batch.

Every TV write path calls one of the two functions below. Tests:
tests/test_tv_closed_inverts.py.
"""
from typing import Optional

from fastapi import HTTPException, status

from app.models.invert import Invert

DIED_DETAIL = "This animal is marked as died. Restore it before making changes."
TRANSFERRED_DETAIL = (
    "This animal was transferred to another keeper, so its record can't be changed."
)
# Shorter wording for Feeding Day's per-animal `skipped` list.
DIED_SKIP_REASON = "Marked as died"
TRANSFERRED_SKIP_REASON = "Transferred to another keeper"


def closed_reason(animal) -> Optional[str]:
    """'died' / 'transferred' when the record is history, else None."""
    if animal is None:
        return None
    if getattr(animal, "died_at", None) is not None:
        return "died"
    if getattr(animal, "transferred_out_at", None) is not None:
        return "transferred"
    return None


def skip_reason(animal) -> Optional[str]:
    """Feeding Day wording for a closed animal, else None."""
    reason = closed_reason(animal)
    if reason == "died":
        return DIED_SKIP_REASON
    if reason == "transferred":
        return TRANSFERRED_SKIP_REASON
    return None


def refuse_if_closed_invert(animal) -> None:
    """409 when an `inverts` row (or anything carrying died_at /
    transferred_out_at) is closed. Call AFTER the 404/ownership check."""
    reason = closed_reason(animal)
    if reason == "died":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DIED_DETAIL)
    if reason == "transferred":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=TRANSFERRED_DETAIL)


def refuse_if_closed_legacy(db, legacy) -> None:
    """For the legacy facade routes (/tarantulas/, /scorpions/) that load the
    old per-taxon row. Those share their primary key with the `inverts` twin
    (ADR-005), and the twin is where lifecycle lives — `transferred_out_at`
    exists only there, and mark-died writes `inverts.died_at` first. Checks
    the legacy row too, for a row whose twin is missing."""
    if legacy is None:
        return
    refuse_if_closed_invert(legacy)
    twin = db.query(Invert).filter(Invert.id == legacy.id).first()
    refuse_if_closed_invert(twin)
