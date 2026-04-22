"""Polymorphic parent validation helpers (Herpetoverse v1).

Several tables now accept multiple parent taxa via nullable FKs with a
Postgres CHECK constraint enforcing exactly-one-non-null:

  - photos          — tarantula_id | snake_id
  - qr_upload_sessions — tarantula_id | snake_id

The DB CHECK is the source of truth. These helpers exist so the API
returns a clean 400 instead of letting a bad payload fall through to the
DB and surface as a 500.

v1 usage: path-based endpoints like `POST /tarantulas/{id}/photos` or
`POST /snakes/{id}/photos` always supply exactly one parent via the URL
and don't need this helper. It's reserved for:

  - admin / bulk import endpoints that accept JSON payloads with both
    parent id fields present
  - shed_logs / animal_genotypes once lizards land (v1.1+) and the model
    grows a second parent column

Keep this module dependency-light. No SQLAlchemy imports — it works off
plain (field_name, value) pairs so both request schemas and ORM-level
checks can share it.
"""
from __future__ import annotations

from typing import Any, Iterable

from fastapi import HTTPException, status


def ensure_exactly_one_parent(
    parents: Iterable[tuple[str, Any]],
    *,
    table_name: str | None = None,
) -> str:
    """Raise HTTP 400 if exactly one of the provided parent ids isn't set.

    `parents` is an iterable of `(field_name, value)` pairs. Any truthy
    value (non-empty UUID, non-None id) counts as "set." Returns the
    field_name of the single set parent for caller convenience.

    Example:
        ensure_exactly_one_parent([
            ("tarantula_id", payload.tarantula_id),
            ("snake_id", payload.snake_id),
        ], table_name="photos")
    """
    set_fields = [name for name, value in parents if value is not None]

    if len(set_fields) == 1:
        return set_fields[0]

    table_hint = f" on {table_name}" if table_name else ""
    if not set_fields:
        detail = (
            f"Exactly one parent id must be supplied{table_hint}. "
            f"Got none."
        )
    else:
        detail = (
            f"Exactly one parent id must be supplied{table_hint}. "
            f"Got {len(set_fields)}: {', '.join(set_fields)}."
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=detail,
    )
