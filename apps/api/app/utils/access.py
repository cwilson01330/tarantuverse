"""
Collection access — the ONE place that decides who may touch whose animals.

PRD-shared-keeping rung 3 (co-keepers); build plan docs/design/PLAN-co-keepers.md.

WHY A CENTRAL RESOLVER
----------------------
Before co-keepers, "may this user touch this row?" was answered in ~140 inline
`Model.user_id == current_user.id` filters and 17 near-duplicate helpers. That
was fine while the answer was always "only if it's yours". With co-keepers the
answer becomes "if it's yours, OR you're an active member of the owner's
collection in this app with a high enough role", and writing that 140 times
is how an IDOR ships (T7). So routes migrate onto these functions one router
at a time; an unmigrated route keeps its inline owner filter and a co-keeper
simply gets a 404 from it. Deny by default.

THE RULES
---------
- Roles rank viewer < logger < keeper < owner.
- Membership is looked up on EVERY request, never cached in a token, so
  removing someone takes effect on their next request (T9).
- Memberships are PER APP: a Tarantuverse membership says nothing about the
  owner's Herpetoverse animals.
- No access at all → 404, identical to "doesn't exist". Access, but too low a
  role → 403: they can already see the thing, so 403 reveals nothing.
- A deactivated owner's collection resolves to nobody (not even viewers).
- LAPSE RULE (T12): when the owner's premium for the app has lapsed, every
  co-keeper is capped at viewer — read-only, never locked out.

WHOSE DATA vs WHO DID IT
------------------------
`Access.owner` is whose collection it is: new rows get `user_id=owner.id`,
free-tier caps and premium gates are the OWNER's. `Access.actor` is the
signed-in user, used only for attribution (`logged_by_user_id`).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional, Tuple
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

ROLE_RANK = {"viewer": 1, "logger": 2, "keeper": 3, "owner": 4}
POLICIES = ("viewer", "logger", "keeper", "owner_only", "public")
APPS = ("tarantuverse", "herpetoverse")

ROLE_TOO_LOW = "Your role in this collection can't do that. Ask the owner if you need it."


@dataclass(frozen=True)
class Access:
    owner: Any          # User — whose collection
    actor: Any          # User — who is signed in
    role: str           # 'owner' | 'keeper' | 'logger' | 'viewer'
    app: str

    @property
    def is_owner(self) -> bool:
        return self.role == "owner"

    def can(self, need: str) -> bool:
        return ROLE_RANK[self.role] >= ROLE_RANK[need]

    @property
    def logged_by_user_id(self) -> Optional[UUID]:
        """For attribution columns: NULL keeps meaning "the owner did it"."""
        return None if self.is_owner else self.actor.id


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, detail=detail)


def resolve_role(db: Session, user: Any, owner: Any, app: str) -> Optional[str]:
    """The caller's role in `owner`'s collection for `app`, or None."""
    from app.models.collection_member import CollectionMember

    if app not in APPS:
        raise ValueError(f"unknown app {app!r}")
    if owner is None or user is None:
        return None
    if owner.id == user.id:
        return "owner"
    if not getattr(owner, "is_active", True):
        return None
    m = (
        db.query(CollectionMember)
        .filter(
            CollectionMember.owner_user_id == owner.id,
            CollectionMember.member_user_id == user.id,
            CollectionMember.app == app,
            CollectionMember.status == "active",
        )
        .first()
    )
    if m is None:
        return None
    role = m.role if m.role in ("viewer", "logger", "keeper") else None
    if role is None:
        return None
    if role != "viewer" and not owner.is_premium_for_app(app):
        return "viewer"  # lapse rule (T12): read-only, not locked out
    return role


def require(
    db: Session,
    user: Any,
    owner_id: UUID,
    app: str,
    need: str,
    not_found: str = "Not found",
) -> Access:
    """Access to `owner_id`'s collection at role `need`, or raise.

    404 when the caller has no access at all (same as missing); 403 when they
    have access but too low a role.
    """
    from app.models.user import User

    if need not in ROLE_RANK:
        raise ValueError(f"unknown role {need!r}")
    owner = user if owner_id == user.id else db.query(User).filter(User.id == owner_id).first()
    role = resolve_role(db, user, owner, app)
    if role is None:
        raise _not_found(not_found)
    if ROLE_RANK[role] < ROLE_RANK[need]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=ROLE_TOO_LOW)
    return Access(owner=owner, actor=user, role=role, app=app)


def scope_collection(
    db: Session,
    user: Any,
    app: str,
    collection: Optional[UUID] = None,
    need: str = "viewer",
) -> Access:
    """For list endpoints: whose collection to list. `collection` is the owner's
    user id from `?collection=`; absent means the caller's own."""
    return require(db, user, collection or user.id, app, need, not_found="Collection not found")


def _load(db: Session, user: Any, model: Any, row_id: UUID, app: str, need: str,
          not_found: str) -> Tuple[Any, Access]:
    row = db.query(model).filter(model.id == row_id).first()
    if row is None:
        raise _not_found(not_found)
    return row, require(db, user, row.user_id, app, need, not_found=not_found)


def load_invert(db: Session, user: Any, invert_id: UUID, need: str,
                not_found: str = "Animal not found") -> Tuple[Any, Access]:
    from app.models.invert import Invert
    return _load(db, user, Invert, invert_id, "tarantuverse", need, not_found)


def load_colony(db: Session, user: Any, colony_id: UUID, need: str,
                not_found: str = "Colony not found") -> Tuple[Any, Access]:
    from app.models.colony import Colony
    return _load(db, user, Colony, colony_id, "tarantuverse", need, not_found)


def load_animal(db: Session, user: Any, animal_id: UUID, need: str,
                not_found: str = "Animal not found") -> Tuple[Any, Access]:
    from app.models.animal import Animal
    return _load(db, user, Animal, animal_id, "herpetoverse", need, not_found)


def load_log_parent(db: Session, user: Any, row: Any, need: str,
                    not_found: str = "Entry not found") -> Tuple[Any, Access]:
    """Access to a polymorphic log row (feeding, molt, substrate change, photo)
    through whichever parent it hangs off.

    Replaces the per-router `_*_owner_parent` helpers, which (a) answered 403
    for someone else's row and 404 for a missing one — confirming that
    another keeper's record exists — and (b) had no colony branch, so colony
    feedings couldn't be read or edited by id at all.

    Enclosure-level and legacy-only rows are owner-only in v1 (build plan).
    """
    if row is None:
        raise _not_found(not_found)
    if getattr(row, "invert_id", None):
        return load_invert(db, user, row.invert_id, need, not_found=not_found)
    if getattr(row, "colony_id", None):
        return load_colony(db, user, row.colony_id, need, not_found=not_found)
    if getattr(row, "animal_id", None):
        return load_animal(db, user, row.animal_id, need, not_found=not_found)
    # Pre-consolidation rows with only a legacy parent, and enclosure rows:
    # owner-only. Resolved through `require(..., "owner")` so a co-keeper gets
    # the same 404 as a stranger.
    for attr, model_path in (
        ("tarantula_id", "app.models.tarantula:Tarantula"),
        ("scorpion_id", "app.models.scorpion:Scorpion"),
        ("enclosure_id", "app.models.enclosure:Enclosure"),
    ):
        pid = getattr(row, attr, None)
        if pid:
            mod, cls = model_path.split(":")
            model = getattr(__import__(mod, fromlist=[cls]), cls)
            parent = db.query(model).filter(model.id == pid).first()
            if parent is None or parent.user_id != user.id:
                raise _not_found(not_found)
            return parent, Access(owner=user, actor=user, role="owner", app="tarantuverse")
    raise _not_found(not_found)


LOGGER_OWN_ONLY = "As a logger you can change only entries you logged. Ask a keeper or the owner."


def require_can_change(access: Access, row: Any) -> None:
    """Loggers may edit/delete only what they logged themselves; keepers and
    the owner may change any entry in the collection."""
    if access.role != "logger":
        return
    if getattr(row, "logged_by_user_id", None) != access.actor.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=LOGGER_OWN_ONLY)


def invert_log_fields(db: Session, invert: Any) -> dict:
    """Parent columns for a new log on an invert.

    A tarantula still has its legacy twin row (ADR-005; read cutover pending)
    and its legacy detail screens read logs by `tarantula_id`. Setting both —
    as the keeper's own /tarantulas path and the sitter path already do —
    keeps an entry made on the generic surface visible on every tarantula
    screen.
    """
    fields = {"invert_id": invert.id}
    if getattr(invert, "taxon", None) == "tarantula":
        from app.models.tarantula import Tarantula

        twin = db.query(Tarantula.id).filter(
            Tarantula.id == invert.id, Tarantula.user_id == invert.user_id
        ).first()
        if twin is not None:
            fields["tarantula_id"] = invert.id
    return fields


def access_helper(fn: Callable) -> Callable:
    """Mark a router-local helper that goes through this module (e.g. a
    by-id log loader that calls `require`). The structural test accepts a
    route handler that calls a marked helper as enforcing access."""
    fn.__uses_access__ = True
    return fn


def policy(level: str) -> Callable:
    """Tag a route handler with its co-keeper policy.

    Does nothing at runtime. The structural test (tests/test_access_policies)
    reads the tag and checks the handler actually enforces it — that's what
    turns "remember to check access" into something CI catches.

      viewer / logger / keeper — reachable by co-keepers at that role or above;
                                 the handler MUST go through this module.
      owner_only               — never reachable by a co-keeper.
      public                   — no login at all (share tokens, public
                                 profiles); co-keeper access is irrelevant.

    Put it directly above `def` (below the router and limiter decorators) so
    the tag lands on the function FastAPI registers.
    """
    if level not in POLICIES:
        raise ValueError(f"unknown policy {level!r}")

    def deco(fn: Callable) -> Callable:
        fn.__access_policy__ = level
        return fn

    return deco
