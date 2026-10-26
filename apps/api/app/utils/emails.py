"""Email address matching for sign-in.

Addresses used to be compared exact-case, so "Cory@x.com" typed as
"cory@x.com" (phone keyboards capitalise the first letter) was "no such
account", and a Google/Apple sign-in whose address differed only in case
created a second, empty account.

Rules:
  * Lookups are case-insensitive (`find_users_by_email`).
  * NEW rows store `normalize_email(...)`. Existing rows are never rewritten:
    production holds case-variant pairs that a blanket lower-casing would
    collide on (`users.email` is unique, exact-case).
  * Because several rows can now match one address, callers decide which one
    is meant: login picks the account whose password verifies, OAuth picks a
    verified account (`pick_oauth_match`).
"""
from __future__ import annotations

from typing import List, Optional, Sequence

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.user import User


def normalize_email(value: str) -> str:
    """The form NEW accounts store: surrounding whitespace removed, lower-case."""
    return (value or "").strip().lower()


def find_users_by_email(db: Session, email: str) -> List[User]:
    """Every account whose address equals `email` ignoring case.

    A row that matches the typed address exactly (after trimming) comes first,
    then oldest first, so the order is stable and "first match" is the
    keeper's most literal one. Empty list when nobody matches.

    Note: `lower(email)` cannot use the plain unique index on `users.email`;
    at the current size of the table that is a trivial scan.
    """
    typed = (email or "").strip()
    wanted = normalize_email(email)
    if not wanted:
        return []
    return (
        db.query(User)
        .filter(func.lower(User.email) == wanted)
        .order_by(case((User.email == typed, 0), else_=1), User.created_at, User.id)
        .all()
    )


def prefer_active(candidates: Sequence[User]) -> List[User]:
    """Drop deactivated accounts when an active case-variant twin exists.

    An inactive twin must never shadow the live account behind the same
    mailbox. When EVERY candidate is inactive they are all kept, so the usual
    "account is inactive" handling still applies.
    """
    active = [u for u in candidates if u.is_active]
    return active if active else list(candidates)


def pick_oauth_match(candidates: Sequence[User]) -> Optional[User]:
    """The account a provider sign-in should land on, among case-variants.

    Inactive twins are skipped when an active one exists (`prefer_active`).
    A VERIFIED account wins (only those may be auto-linked); if none is
    verified the first candidate is returned so the caller can refuse with the
    existing "not verified" message instead of minting a duplicate.
    """
    candidates = prefer_active(candidates)
    for user in candidates:
        if user.is_verified:
            return user
    return candidates[0] if candidates else None
