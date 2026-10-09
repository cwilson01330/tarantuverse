"""Who chose an animal's visibility (2026-10-09).

`inverts.visibility_explicit` separates "the keeper hid this" from "this was
private because the collection was private when it was added". Only the
second kind is flipped when the collection goes private->public
(`routers/auth.py::_cascade_collection_to_public`), so hidden holdbacks stay
hidden.

Rules:
* Create: inheriting the collection's visibility is NOT explicit; a value the
  client sent is (the tarantula router has always let keepers hide an animal
  at creation).
* Update: explicit only when the write CHANGES the stored value. Edit forms
  (web + mobile) send `visibility` back on every save, so presence alone would
  mark every edited animal as hand-hidden.
* Transfers (a new animal on the buyer's side): not explicit.
* The flag is never cleared by a write; a public explicit animal is ignored by
  the cascade anyway (it only touches private rows).
"""
from __future__ import annotations

from typing import Any, Mapping


def visibility_chosen_at_create(supplied: Any) -> bool:
    """True when the create payload carried a visibility value of its own,
    i.e. the keeper chose it rather than inheriting the collection's."""
    return bool(supplied)


def visibility_changed(row: Any, data: Mapping[str, Any]) -> bool:
    """True when an update payload sets `visibility` to a new non-null value.

    Call BEFORE the payload is applied to `row`."""
    if "visibility" not in data:
        return False
    new = data["visibility"]
    return new is not None and new != getattr(row, "visibility", None)


def mark_explicit(invert: Any) -> None:
    """Record on the `inverts` row that the keeper chose its visibility."""
    if invert is not None:
        invert.visibility_explicit = True
