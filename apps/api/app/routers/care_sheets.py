"""Printable care sheets for a sitter.

A keeper picks animals (or a whole location), optionally writes a note, and
gets a link to a print-ready page on the app's own web origin:

  POST /api/v1/care-sheets/          (keeper or owner of every animal) -> {url, token, expires_at}
  GET  /api/v1/care-sheets/{token}   (public; the token is the credential) -> the sheet

THE TOKEN (utils/care_sheet_token.py) is HMAC-signed with its own derived key,
lives 24 hours and is never stored. It carries ids, the owner and creator ids,
units, the keeper's timezone offset and the note — never an animal fact.

THE SHEET is composed at VIEW time from live data, through the same
allow-listed sitter-card composer the sitter pass uses (services/sitter_card.py
— safety, feeding state, water, heat, the keeper's sitter note), plus a few
more allow-listed facts added in `_extra` below (sex, stage, location,
substrate, last meal, a thumbnail under our storage base). Price, source,
private notes, enclosure notes, death details and the owner's email/username
are never read. An animal that has since died, been transferred, been deleted
or left the owner's collection simply drops off; if the creator was a
co-keeper who has since lost keeper rights, the whole sheet is gone.
"""
# NOTE: no `from __future__ import annotations` — slowapi's @limiter.limit
# wraps the endpoint and FastAPI must resolve the annotations (see
# routers/sitter_passes.py).
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.animal import Animal
from app.models.colony import Colony
from app.models.invert import Invert
from app.models.user import User
from app.schemas.care_sheet import CARE_SHEET_MAX_ANIMALS, CareSheetCreate, CareSheetCreated
from app.services import sitter_card as sc
from app.services.share_card import allowed_photo_url
from app.utils.access import policy, resolve_role, scope_collection
from app.utils.care_sheet_token import EXPIRED, read_care_sheet_token, sign_care_sheet_token
from app.utils.dependencies import get_current_user
from app.utils.limits import active_animals_query, active_colonies_query, active_inverts_query
from app.utils.rate_limit import limiter
from app.utils.units import UNITS, normalize_units

router = APIRouter()

# Same origins as card links: the sheet opens on the product the keeper uses.
CARE_SHEET_ORIGINS = {
    "tarantuverse": "https://www.tarantuverse.com",
    "herpetoverse": "https://herpetoverse.com",
}

NOT_FOUND = "This care sheet isn't available. Ask the keeper for a new link."
EXPIRED_MSG = "This care sheet has expired. Ask the keeper for a new link."
NOT_FOUND_ANIMAL = "One of those animals wasn't found."

# Sections of a sitter card that make sense per animal on paper. "today" is
# the big feeding line the page draws itself; "leave_alone" is the same for
# every animal, so it's printed once as `house_rules`.
PRINT_SECTIONS = ("safety", "feeding", "water", "heat", "note")

# Allow-list of top-level card keys the sheet returns. Everything a card
# carries is listed here; anything else is dropped.
CARD_KEYS = (
    "kind", "name", "common_name", "scientific_name", "taxon", "photo_url",
    "feeding", "sections",
    "sex", "life_stage", "current_instar", "location", "substrate", "last_meal",
)


# ── helpers ──────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _clean(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(getattr(v, "value", v)).strip()
    return s or None


def _dedupe(ids: List[UUID]) -> List[UUID]:
    seen, out = set(), []
    for i in ids:
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


def _user_units(*users) -> Optional[str]:
    for u in users:
        v = getattr(u, "measurement_units", None)
        if v in UNITS:
            return v
    return None


def _keeper_name(user: Optional[User]) -> str:
    # Display name only — never the username or email (same rule as the
    # sitter pass: a forwarded sheet mustn't hand out the keeper's identity).
    if user is None:
        return "Your keeper"
    return (getattr(user, "display_name", None) or "").strip() or "Your keeper"


def _require_active(db: Session, owner_id: UUID, app: str, ids: List[UUID], col_ids: List[UUID]) -> None:
    """Every id must be one of the owner's ACTIVE animals (not died, not
    transferred, not archived/ended) of a kind this app owns. Same 404 for
    "not theirs" and "doesn't exist"."""
    if app == "tarantuverse":
        found = {r.id for r in active_inverts_query(db, owner_id).filter(Invert.id.in_(ids)).all()} if ids else set()
        found_col = (
            {r.id for r in active_colonies_query(db, owner_id).filter(Colony.id.in_(col_ids)).all()}
            if col_ids else set()
        )
    else:
        found = {r.id for r in active_animals_query(db, owner_id).filter(Animal.id.in_(ids)).all()} if ids else set()
        found_col = set()
    if set(ids) - found or set(col_ids) - found_col:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_ANIMAL)


def _uuid_list(raw: Any) -> List[UUID]:
    if not isinstance(raw, list):
        raise ValueError("ids")
    return [UUID(hex=str(x)) for x in raw][:CARE_SHEET_MAX_ANIMALS]


def _last_meal(feedings: list) -> Optional[str]:
    """What the animal ate at its most recent ACCEPTED feeding."""
    for f in feedings:  # newest-first
        if not getattr(f, "accepted", False):
            continue
        food = _clean(getattr(f, "food_type", None))
        if not food:
            return None
        parts = []
        qty = getattr(f, "quantity", None)
        if qty:
            parts.append(str(qty))
        size = _clean(getattr(f, "food_size", None))
        if size:
            parts.append(size.lower())
        parts.append(food.lower())
        return " ".join(parts)
    return None


def _substrate(row: Any) -> Optional[str]:
    kind = _clean(getattr(row, "substrate_type", None))
    depth = _clean(getattr(row, "substrate_depth", None))
    if kind and depth:
        return f"{kind}, {depth} deep"
    return kind or (f"{depth} deep" if depth else None)


def _extra(card: dict, row: Any, feedings: list) -> None:
    """Allow-listed facts on top of the sitter card. Reads ONLY these fields."""
    sex = _clean(getattr(row, "sex", None))
    card["sex"] = sex if sex in ("male", "female") else None
    is_invert = card.get("kind") == "invert"
    card["life_stage"] = _clean(getattr(row, "life_stage", None)) if is_invert else None
    instar = getattr(row, "current_instar", None) if is_invert else None
    card["current_instar"] = int(instar) if isinstance(instar, int) and not isinstance(instar, bool) else None
    card["location"] = _clean(getattr(row, "location", None))
    enclosure = getattr(row, "enclosure", None) if card.get("kind") == "animal" else None
    card["substrate"] = _substrate(enclosure if enclosure is not None else row)
    card["last_meal"] = _last_meal(feedings)
    # The big feeding line already says when it was last fed.
    for s in card.get("sections", []):
        if s.get("key") == "feeding":
            s["lines"] = [l for l in s["lines"] if not str(l.get("text", "")).startswith("Last fed ")]


def _thumbnails(db: Session, urls: List[str]) -> Dict[str, str]:
    """Hero photo URL -> its generated thumbnail, when one exists."""
    if not urls:
        return {}
    from app.models.photo import Photo

    rows = db.query(Photo.url, Photo.thumbnail_url).filter(Photo.url.in_(urls)).all()
    return {u: t for u, t in rows if t}


def _local_today(tz_offset_minutes: Optional[int], now: datetime) -> date:
    return (now - timedelta(minutes=tz_offset_minutes or 0)).date()


def _sort_key(card: dict):
    loc = (card.get("location") or "").lower()
    return (loc == "", loc)


def build_sheet(db: Session, claims: dict, now: Optional[datetime] = None) -> dict:
    """The sheet for verified `claims`. 404 when the sheet no longer stands."""
    now = now or _now()
    app = claims.get("app")
    if app not in CARE_SHEET_ORIGINS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    try:
        owner_id = UUID(hex=str(claims["o"]))
        creator_id = UUID(hex=str(claims["b"]))
        inv_ids = _uuid_list(claims.get("i", []))
        col_ids = _uuid_list(claims.get("c", [])) if app == "tarantuverse" else []
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)

    owner = db.query(User).filter(User.id == owner_id).first()
    if owner is None or not getattr(owner, "is_active", True):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    if creator_id != owner_id:
        # A co-keeper's sheet lasts only while they still hold keeper rights.
        creator = db.query(User).filter(User.id == creator_id).first()
        if resolve_role(db, creator, owner, app) not in ("keeper", "owner"):
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)

    units = claims.get("u") if claims.get("u") in UNITS else _user_units(owner)
    tz = claims.get("z") if isinstance(claims.get("z"), int) and -840 <= claims["z"] <= 840 else None
    keeper = _keeper_name(owner)

    if app == "tarantuverse":
        refs = [SimpleNamespace(invert_id=i, colony_id=None, animal_id=None) for i in inv_ids]
        refs += [SimpleNamespace(invert_id=None, colony_id=c, animal_id=None) for c in col_ids]
    else:
        refs = [SimpleNamespace(invert_id=None, colony_id=None, animal_id=a) for a in inv_ids]

    from app.routers.sitter_passes import compose_cards

    cards = compose_cards(
        db, owner_id, refs, keeper=keeper, keeper_units=units,
        tz_offset_minutes=tz, now=now, extra=_extra,
    )

    thumbs = _thumbnails(db, [c["photo_url"] for c in cards if c.get("photo_url")])
    animals = []
    for c in cards:
        c["photo_url"] = allowed_photo_url(thumbs.get(c.get("photo_url") or "", c.get("photo_url")))
        c["sections"] = [s for s in c.get("sections", []) if s.get("key") in PRINT_SECTIONS and s.get("lines")]
        animals.append({k: c.get(k) for k in CARD_KEYS})
    animals.sort(key=_sort_key)  # stable: the keeper's order within a location

    from app.models.sitter_pass import SitterGuide

    guide = (
        db.query(SitterGuide)
        .filter(SitterGuide.owner_user_id == owner_id, SitterGuide.app == app)
        .first()
    )
    exp = claims.get("exp")
    note = claims.get("n")
    return {
        "app": app,
        "keeper_name": keeper,
        "note": note.strip()[:500] if isinstance(note, str) and note.strip() else None,
        "generated_on": _local_today(tz, now).isoformat(),
        "expires_at": datetime.fromtimestamp(exp, tz=timezone.utc).isoformat() if isinstance(exp, int) else None,
        "units": normalize_units(units),
        "house_rules": [l.text for l in sc._leave_alone(keeper, colony=bool(col_ids)).lines],
        "routine": sc.compose_routine(guide, cards),
        "animals": animals,
        "skipped": len(refs) - len(animals),
    }


# ── routes ───────────────────────────────────────────────────────────────────

@router.post("/care-sheets/", response_model=CareSheetCreated, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/hour")
@policy("keeper")
async def create_care_sheet(
    request: Request,
    body: CareSheetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Keeper role or owner of the collection the animals live in; 404 for
    # anyone else (utils/access).
    access = scope_collection(db, current_user, body.app, body.collection, need="keeper")
    owner = access.owner
    ids = _dedupe(body.animal_ids)
    col_ids = _dedupe(body.colony_ids)
    if body.app == "herpetoverse" and col_ids:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Herpetoverse has no colonies.")
    if not ids and not col_ids:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Pick at least one animal.")
    if len(ids) + len(col_ids) > CARE_SHEET_MAX_ANIMALS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"A care sheet can hold up to {CARE_SHEET_MAX_ANIMALS} animals.",
        )
    _require_active(db, owner.id, body.app, ids, col_ids)

    # Temperatures print in the author's units: their own setting, else the
    # owner's, else what their device resolved (sent by the client), else
    # imperial (storage).
    units = _user_units(current_user, owner) or body.units
    note = (body.note or "").strip() or None
    claims = {
        "v": 1,
        "app": body.app,
        "o": owner.id.hex,
        "b": current_user.id.hex,
        "i": [i.hex for i in ids],
        "c": [c.hex for c in col_ids],
        "u": units,
        "z": body.tz_offset_minutes,
        "n": note,
    }
    token, exp = sign_care_sheet_token(claims)
    return CareSheetCreated(
        url=f"{CARE_SHEET_ORIGINS[body.app]}/care-sheet/{token}",
        token=token,
        expires_at=datetime.fromtimestamp(exp, tz=timezone.utc),
    )


@router.get("/care-sheets/{token}")
@limiter.limit("120/minute")
@policy("public")
async def read_care_sheet(
    request: Request,
    token: str,
    response: Response,
    db: Session = Depends(get_db),
):
    """The sheet. No login: the token proved the keeper's right when it was
    issued, and everything is re-checked against live data here."""
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    claims, err = read_care_sheet_token(token)
    if claims is None:
        if err == EXPIRED:
            raise HTTPException(status.HTTP_410_GONE, detail=EXPIRED_MSG)
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return build_sheet(db, claims)
