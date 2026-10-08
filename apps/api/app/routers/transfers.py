"""Animal transfer ("rehome") — BRIEF-animal-transfer-provenance.

Seller generates a claim link for an animal they own; buyer claims it and gets a
NEW invert pre-loaded with species + provenance + copied photos. Source record is
badged "Transferred" (Invert.transferred_out_at) and drops out of the seller's
active counts/cap/reminders.

Bright line (§1): no payments/brokering. sale_price is a PRIVATE seller ledger,
never returned to the buyer.

Colonies (ctr_20261008) ride the same table: a whole colony, or some of its
animals ("25 of 360"). A partial claim takes the counts out of the source
colony through 'removed' events, so its population history stays honest.
"""
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid as uuidlib

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.invert import Invert
from app.models.animal import Animal
from app.models.animal_transfer import AnimalTransfer
from app.models.photo import Photo
from app.models.offspring import Offspring
from app.models.egg_sac import EggSac
from app.models.pairing import Pairing
from app.models.molt_log import MoltLog
from app.models.colony import Colony, ColonyEvent
from app.models.invert_species import InvertSpecies
from app.models.user import User
from app.utils.dependencies import get_current_user
from app.routers.qr import _optional_user  # reuse the never-raise bearer resolver
from app.routers.colonies import _apply_delta  # the one bucket-adjust rule
from app.services.storage import storage_service
from app.services import analytics_events
from app.schemas.transfer import (
    ColonyTransferCreate, TransferCreate, TransferCreateResponse, TransferPreview,
    TransferListItem,
)
from app.config import settings
from app.utils.access import policy

logger = logging.getLogger(__name__)

router = APIRouter(tags=["transfers"])

TRANSFER_DEFAULT_TTL_DAYS = 30


# ─── helpers ────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_expired(t: AnimalTransfer) -> bool:
    exp = t.expires_at
    if exp is None:
        return False
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp <= _now()


def _effective_status(t: AnimalTransfer) -> str:
    """Lazy expiry — mirror utils/subscription.py: a pending transfer past its
    expiry reads as 'expired' even before any sweep flips it."""
    if t.status == "pending" and _is_expired(t):
        return "expired"
    return t.status


def _resolve_lineage(db: Session, invert_id) -> dict:
    """Best-effort dam/sire/sac-date from offspring→egg_sac→pairing.

    Only populated when the animal was bred on-platform AND linked to an
    Offspring row (the breeding-module cohort). Returns all-None otherwise —
    the UI degrades to a plain provenance block (§4c, honesty-first).
    """
    out = {"dam_scientific_name": None, "sire_scientific_name": None, "sac_laid_date": None}
    offspring = db.query(Offspring).filter(Offspring.invert_id == invert_id).first()
    if not offspring or not offspring.egg_sac_id:
        return out
    sac = db.query(EggSac).filter(EggSac.id == offspring.egg_sac_id).first()
    if not sac:
        return out
    out["sac_laid_date"] = sac.laid_date.isoformat() if sac.laid_date else None
    pairing = db.query(Pairing).filter(Pairing.id == sac.pairing_id).first()
    if not pairing:
        return out

    def _parent_sci(invert_fk, tarantula_rel):
        # Prefer the generic invert parent; fall back to the legacy tarantula rel.
        if invert_fk:
            p = db.query(Invert).filter(Invert.id == invert_fk).first()
            if p:
                return p.scientific_name
        if tarantula_rel is not None:
            return getattr(tarantula_rel, "scientific_name", None)
        return None

    out["dam_scientific_name"] = _parent_sci(pairing.female_invert_id, pairing.female)
    out["sire_scientific_name"] = _parent_sci(pairing.male_invert_id, pairing.male)
    return out


def _build_snapshot(db: Session, invert: Invert, seller: User) -> dict:
    """Freeze the pedigree facts at transfer-create time (§4c)."""
    molt_logs = (
        db.query(MoltLog)
        .filter(MoltLog.invert_id == invert.id)
        .order_by(MoltLog.molted_at.desc())
        .all()
    )
    last_molt = molt_logs[0].molted_at if molt_logs else None
    lineage = _resolve_lineage(db, invert.id)
    return {
        "taxon": invert.taxon,
        "scientific_name": invert.scientific_name,
        "common_name": invert.common_name,
        "name": invert.name,
        "sex": invert.sex.value if invert.sex else None,
        "life_stage": invert.life_stage,
        "species_id": str(invert.species_id) if invert.species_id else None,
        "breeder_handle": seller.username,
        "bred_by_user_id": str(seller.id),
        "origin_keeper_name": seller.display_name or seller.username,
        "dam_scientific_name": lineage["dam_scientific_name"],
        "sire_scientific_name": lineage["sire_scientific_name"],
        "sac_laid_date": lineage["sac_laid_date"],
        "dob_or_acquired": invert.date_acquired.isoformat() if invert.date_acquired else None,
        "molt_count_at_transfer": len(molt_logs),
        "last_molt_at_transfer": last_molt.isoformat() if last_molt else None,
        "source_invert_id": str(invert.id),
        "transferred_at": None,  # stamped at claim
    }


def _build_animal_snapshot(db: Session, animal: Animal, seller: User) -> dict:
    """Freeze pedigree facts for an HV animal transfer.

    Reptile/amphibian lineage (reptile_pairings + genotypes) isn't resolved
    yet — the snapshot degrades to a plain provenance block (honesty-first),
    same contract as an invert with no linked Offspring. Weight/length + last
    shed are carried so the buyer's record starts pre-populated.
    """
    return {
        "domain": "animal",
        "taxon": animal.taxon,
        "scientific_name": animal.scientific_name,
        "common_name": animal.common_name,
        "name": animal.name,
        "sex": animal.sex.value if animal.sex else None,
        "life_stage": None,  # animals don't use the invert life_stage axis
        "species_id": str(animal.herp_species_id) if animal.herp_species_id else None,
        "breeder_handle": seller.username,
        "bred_by_user_id": str(seller.id),
        "origin_keeper_name": seller.display_name or seller.username,
        "dam_scientific_name": None,
        "sire_scientific_name": None,
        "sac_laid_date": None,
        "dob_or_acquired": (
            animal.date_acquired.isoformat() if animal.date_acquired
            else (animal.hatch_date.isoformat() if animal.hatch_date else None)
        ),
        "weight_g": float(animal.current_weight_g) if animal.current_weight_g is not None else None,
        "length_in": float(animal.current_length_in) if animal.current_length_in is not None else None,
        "last_shed_at": animal.last_shed_at.isoformat() if animal.last_shed_at else None,
        "molt_count_at_transfer": None,
        "last_molt_at_transfer": None,
        "source_animal_id": str(animal.id),
        "transferred_at": None,  # stamped at claim
    }


# ─── colony helpers (ctr_20261008) ──────────────────────────────────────────

def _counts_total(counts: Optional[dict]) -> int:
    """Sum a {stage: n} map. Same rule as colonies._total_count: ints only."""
    if not counts:
        return 0
    return sum(int(v) for v in counts.values() if isinstance(v, int) and not isinstance(v, bool))


def _stage_word(stage: str) -> str:
    return stage.replace("_", " ").strip()


def _counts_phrase(counts: Optional[dict]) -> str:
    """'20 adults, 5 juveniles' — the non-zero buckets, in stored order."""
    parts = [
        f"{int(n)} {_stage_word(s)}"
        for s, n in (counts or {}).items()
        if isinstance(n, int) and not isinstance(n, bool) and n > 0
    ]
    return ", ".join(parts)


def partial_counts_error(stage_counts: Optional[dict], counts: dict, *, at_claim: bool) -> Optional[str]:
    """Why these partial-transfer counts can't come out of this colony, or None.

    Checked when the link is made AND again when it is claimed, because the
    keeper keeps logging births and deaths in between. At claim time a partial
    that happens to take everything left is allowed (the link was valid when
    made and the buyer is owed what was promised); at create time it isn't --
    taking every animal is a whole-colony transfer.
    """
    have = dict(stage_counts or {})
    for stage, n in counts.items():
        if stage not in have:
            if at_claim:
                return (
                    f"This colony no longer has a '{_stage_word(stage)}' count. "
                    f"Ask the keeper for a new link."
                )
            return f"This colony has no '{_stage_word(stage)}' count to take from."
        available = int(have.get(stage) or 0)
        if int(n) > available:
            if at_claim:
                return (
                    f"The keeper no longer has {int(n)} {_stage_word(stage)} in this colony "
                    f"(there are {available} now). Ask them for a new link."
                )
            return (
                f"You can hand over at most {available} {_stage_word(stage)}. "
                f"That's all this colony has."
            )
    if not at_claim and _counts_total(counts) >= _counts_total(have):
        return "That's every animal in the colony. Choose Whole colony instead."
    return None


def _build_colony_snapshot(
    db: Session, colony: Colony, seller: User, mode: str, counts: Optional[dict],
) -> dict:
    """Freeze what the buyer is being offered. Never location, notes or price."""
    sp = None
    if colony.species_id:
        sp = db.query(InvertSpecies).filter(InvertSpecies.id == colony.species_id).first()
    stage_counts = dict(colony.stage_counts or {})
    return {
        "domain": "colony",
        "taxon": colony.taxon,
        "name": colony.name,
        "scientific_name": sp.scientific_name if sp is not None else None,
        "common_name": (sp.common_names[0] if sp is not None and sp.common_names else None),
        "species_id": str(colony.species_id) if colony.species_id else None,
        "mode": mode,
        "transfer_counts": dict(counts) if counts else None,
        "stage_counts_at_transfer": stage_counts,
        "total_at_transfer": _counts_total(stage_counts),
        "count_is_estimated": bool(colony.count_is_estimated),
        "breeder_handle": seller.username,
        "bred_by_user_id": str(seller.id),
        "origin_keeper_name": seller.display_name or seller.username,
        "founded_date": colony.founded_date.isoformat() if colony.founded_date else None,
        "source_colony_id": str(colony.id),
        "transferred_at": None,  # stamped at claim
    }


def _transfer_kind(t: AnimalTransfer) -> str:
    if t.colony_id is not None:
        return "colony"
    if t.animal_id is not None:
        return "animal"
    return "invert"


def _colony_offer(db: Session, t: AnimalTransfer) -> dict:
    """What a colony transfer hands over, read against the colony as it is NOW.

    Partial: the requested counts. Full: every non-zero bucket the colony
    currently holds (that is what "the whole colony" means at claim time).
    Falls back to the frozen snapshot if the source row is gone.
    """
    snap = t.snapshot or {}
    source = db.query(Colony).filter(Colony.id == t.colony_id).first()
    if source is not None:
        live = dict(source.stage_counts or {})
        estimated = bool(source.count_is_estimated)
    else:
        live = dict(snap.get("stage_counts_at_transfer") or {})
        estimated = bool(snap.get("count_is_estimated"))
    if t.transfer_counts:
        mode = "partial"
        handed = {k: int(v) for k, v in t.transfer_counts.items()}
    else:
        mode = "full"
        handed = {k: int(v) for k, v in live.items() if isinstance(v, int) and v > 0}
    return {
        "colony_mode": mode,
        "transfer_counts": handed,
        "transfer_total": _counts_total(handed),
        # A partial sale shows only what's being handed over: the seller's
        # whole headcount is their business, not the link holder's.
        "colony_total": _counts_total(live) if mode == "full" else None,
        "count_is_estimated": estimated,
    }


def _colony_label(mode: Optional[str], counts: Optional[dict]) -> str:
    if mode != "partial":
        return "Whole colony"
    phrase = _counts_phrase(counts)
    total = _counts_total(counts)
    return f"{total} from the colony" + (f" ({phrase})" if phrase else "")


def _web_base() -> str:
    return getattr(settings, "FRONTEND_URL", "https://tarantuverse.com")


def _herp_web_base() -> str:
    return getattr(settings, "HERPETOVERSE_FRONTEND_URL", "https://herpetoverse.com")


# ─── endpoints ──────────────────────────────────────────────────────────────

@router.post("/inverts/{invert_id}/transfer", response_model=TransferCreateResponse)
@policy("owner_only")
async def create_transfer(
    invert_id: str,
    body: TransferCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a pending transfer for an animal the caller owns. Free (no gate, §8)."""
    invert = db.query(Invert).filter(
        Invert.id == invert_id,
        Invert.user_id == current_user.id,
    ).first()
    if not invert:
        raise HTTPException(status_code=404, detail="Animal not found")
    if invert.transferred_out_at is not None:
        raise HTTPException(status_code=400, detail="This animal has already been transferred.")

    snapshot = _build_snapshot(db, invert, current_user)
    token = secrets.token_urlsafe(32)
    expires_at = _now() + timedelta(days=body.expires_in_days or TRANSFER_DEFAULT_TTL_DAYS)

    transfer = AnimalTransfer(
        id=uuidlib.uuid4(),
        token=token,
        invert_id=invert.id,
        from_user_id=current_user.id,
        status="pending",
        snapshot=snapshot,
        note=(body.note or None),
        sale_price=body.sale_price,
        include_photos=body.include_photos,
        expires_at=expires_at,
    )
    db.add(transfer)
    db.commit()
    db.refresh(transfer)

    analytics_events.capture("transfer_created", current_user.id, {
        "taxon": invert.taxon,
        "species_id": snapshot.get("species_id"),
    })

    return TransferCreateResponse(
        token=token,
        claim_url=f"{_web_base()}/claim/{token}",
        expires_at=transfer.expires_at,
    )


@router.post("/animals/{animal_id}/transfer", response_model=TransferCreateResponse)
@policy("owner_only")
async def create_animal_transfer(
    animal_id: str,
    body: TransferCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a pending transfer for an HV animal the caller owns. Free (no gate)."""
    animal = db.query(Animal).filter(
        Animal.id == animal_id,
        Animal.user_id == current_user.id,
    ).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found")
    if animal.transferred_out_at is not None:
        raise HTTPException(status_code=400, detail="This animal has already been transferred.")

    snapshot = _build_animal_snapshot(db, animal, current_user)
    token = secrets.token_urlsafe(32)
    expires_at = _now() + timedelta(days=body.expires_in_days or TRANSFER_DEFAULT_TTL_DAYS)

    transfer = AnimalTransfer(
        id=uuidlib.uuid4(),
        token=token,
        animal_id=animal.id,
        from_user_id=current_user.id,
        status="pending",
        snapshot=snapshot,
        note=(body.note or None),
        sale_price=body.sale_price,
        include_photos=body.include_photos,
        expires_at=expires_at,
    )
    db.add(transfer)
    db.commit()
    db.refresh(transfer)

    analytics_events.capture("transfer_created", current_user.id, {
        "taxon": animal.taxon,
        "species_id": snapshot.get("species_id"),
        "domain": "animal",
    })

    return TransferCreateResponse(
        token=token,
        claim_url=f"{_herp_web_base()}/claim/{token}",
        expires_at=transfer.expires_at,
    )


@router.post("/colonies/{colony_id}/transfer", response_model=TransferCreateResponse)
@policy("owner_only")
async def create_colony_transfer(
    colony_id: uuidlib.UUID,
    body: ColonyTransferCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a claim link for a whole colony or part of it. Free, like the
    animal transfer. Nothing is taken out of the colony yet: the keeper can
    still cancel, so counts move only when the buyer claims."""
    colony = db.query(Colony).filter(
        Colony.id == colony_id,
        Colony.user_id == current_user.id,
    ).first()
    if not colony:
        raise HTTPException(status_code=404, detail="Colony not found")
    if colony.transferred_out_at is not None:
        raise HTTPException(status_code=400, detail="This colony has already been transferred.")
    if colony.ended_at is not None:
        raise HTTPException(status_code=400, detail="This colony has ended, so it can't be transferred.")
    if not colony.is_active:
        raise HTTPException(
            status_code=400,
            detail="This colony is archived. Unarchive it before transferring it.",
        )

    counts = None
    if body.mode == "partial":
        counts = {k: int(v) for k, v in (body.counts or {}).items()}
        err = partial_counts_error(colony.stage_counts, counts, at_claim=False)
        if err:
            raise HTTPException(status_code=400, detail=err)

    snapshot = _build_colony_snapshot(db, colony, current_user, body.mode, counts)
    token = secrets.token_urlsafe(32)
    expires_at = _now() + timedelta(days=body.expires_in_days or TRANSFER_DEFAULT_TTL_DAYS)

    transfer = AnimalTransfer(
        id=uuidlib.uuid4(),
        token=token,
        colony_id=colony.id,
        from_user_id=current_user.id,
        status="pending",
        snapshot=snapshot,
        transfer_counts=counts,
        note=(body.note or None),
        sale_price=body.sale_price,
        include_photos=body.include_photos,
        expires_at=expires_at,
    )
    db.add(transfer)
    db.commit()
    db.refresh(transfer)

    analytics_events.capture("transfer_created", current_user.id, {
        "taxon": colony.taxon,
        "species_id": snapshot.get("species_id"),
        "domain": "colony",
        "colony_mode": body.mode,
    })

    return TransferCreateResponse(
        token=token,
        claim_url=f"{_web_base()}/claim/{token}",
        expires_at=transfer.expires_at,
    )


@router.get("/transfers/{token}", response_model=TransferPreview)
@policy("public")
async def preview_transfer(
    token: str,
    db: Session = Depends(get_db),
    viewer: Optional[User] = Depends(_optional_user),
):
    """Public claim-page preview. Never returns sale_price."""
    transfer = db.query(AnimalTransfer).filter(AnimalTransfer.token == token).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")

    snap = transfer.snapshot or {}
    kind = _transfer_kind(transfer)
    photo_urls: list[str] = []
    if transfer.include_photos:
        # Polymorphic source — HV animals attach photos via Photo.animal_id,
        # colonies via Photo.colony_id.
        if kind == "colony":
            photo_filter = Photo.colony_id == transfer.colony_id
        elif kind == "animal":
            photo_filter = Photo.animal_id == transfer.animal_id
        else:
            photo_filter = Photo.invert_id == transfer.invert_id
        photos = (
            db.query(Photo)
            .filter(photo_filter)
            .order_by(Photo.created_at.desc())
            .all()
        )
        photo_urls = [p.url for p in photos if p.url]

    analytics_events.capture("transfer_link_viewed", viewer.id if viewer else None, {
        "authed": viewer is not None,
    })

    # Colony: what is being handed over, "25 of ~360". Deliberately nothing
    # else from the colony row -- no location, notes or price.
    colony_fields: dict = {}
    if kind == "colony":
        colony_fields = _colony_offer(db, transfer)

    return TransferPreview(
        kind=kind,
        **colony_fields,
        status=_effective_status(transfer),
        taxon=snap.get("taxon", "other"),
        name=snap.get("name"),
        common_name=snap.get("common_name"),
        scientific_name=snap.get("scientific_name"),
        sex=snap.get("sex"),
        life_stage=snap.get("life_stage"),
        species_id=snap.get("species_id"),
        photo_urls=photo_urls,
        breeder_handle=snap.get("breeder_handle"),
        note=transfer.note,
        dam_scientific_name=snap.get("dam_scientific_name"),
        sire_scientific_name=snap.get("sire_scientific_name"),
        sac_laid_date=snap.get("sac_laid_date"),
        molt_count_at_transfer=snap.get("molt_count_at_transfer"),
        last_molt_at_transfer=snap.get("last_molt_at_transfer"),
        expires_at=transfer.expires_at,
    )


class ClaimBody(BaseModel):
    # Resume-path marker carried by the client through register→claim. None means
    # "client didn't assert" → server falls back to the account-age backstop.
    new_signup: Optional[bool] = None


async def _claim_animal_transfer(
    db: Session,
    transfer: AnimalTransfer,
    current_user: User,
    body: "Optional[ClaimBody]",
) -> dict:
    """HV claim path — create a new Animal owned by the buyer, copy photos,
    badge the source animal handed-off. Mirrors the invert claim (§5)."""
    source = (
        db.query(Animal).filter(Animal.id == transfer.animal_id)
        .with_for_update().populate_existing().first()
    )
    if not source:
        raise HTTPException(status_code=404, detail="The source animal no longer exists.")
    _refuse_handed_off_source(source)

    snap = transfer.snapshot or {}
    snap_for_record = {**snap, "transferred_at": _now().isoformat()}

    from app.models.tarantula import Source as SourceEnum
    new_animal = Animal(
        id=uuidlib.uuid4(),
        user_id=current_user.id,
        taxon=source.taxon,
        herp_species_id=source.herp_species_id,
        name=source.name,
        common_name=source.common_name,
        scientific_name=source.scientific_name,
        sex=source.sex,
        date_acquired=_now().date(),
        hatch_date=source.hatch_date,
        source=SourceEnum.BOUGHT,
        # current state carried so the buyer's record starts pre-populated
        current_weight_g=source.current_weight_g,
        current_length_in=source.current_length_in,
        feeding_schedule=source.feeding_schedule,
        feeds_on_cgd_override=source.feeds_on_cgd_override,
        # provenance
        bred_by_user_id=transfer.from_user_id,
        origin_keeper_name=snap.get("origin_keeper_name"),
        source_transfer_id=transfer.id,
        provenance=snap_for_record,
    )
    db.add(new_animal)
    db.flush()  # need new_animal.id for photo rows + transfer link

    if transfer.include_photos:
        src_photos = (
            db.query(Photo)
            .filter(Photo.animal_id == source.id)
            .order_by(Photo.created_at.desc())
            .all()
        )
        hero_set = False
        for p in src_photos:
            try:
                new_url, new_thumb = await storage_service.copy_photo(p.url, p.thumbnail_url)
            except Exception:
                logger.exception("photo copy failed during claim (transfer %s, photo %s)", transfer.id, p.id)
                continue
            db.add(Photo(
                id=str(uuidlib.uuid4()),
                animal_id=new_animal.id,
                url=new_url,
                thumbnail_url=new_thumb,
                caption=p.caption,
                taken_at=p.taken_at,
                created_at=datetime.utcnow(),
            ))
            if not hero_set:
                new_animal.photo_url = new_url
                hero_set = True

    transfer.status = "claimed"
    transfer.to_user_id = current_user.id
    transfer.claimed_animal_id = new_animal.id
    transfer.claimed_at = _now()

    # Badge the source record handed off — drops from active collection + reminders.
    source.transferred_out_at = _now()

    db.commit()
    db.refresh(new_animal)

    # was_new_signup — same attribution logic as the invert path.
    if body is not None and body.new_signup is not None:
        was_new_signup = body.new_signup
        signup_attribution = "resume_marker"
    else:
        was_new_signup = False
        signup_attribution = "age_backstop"
        try:
            created = current_user.created_at
            if created is not None:
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                was_new_signup = (_now() - created) <= timedelta(minutes=15)
        except Exception:
            pass

    analytics_events.capture("transfer_claimed", current_user.id, {
        "taxon": new_animal.taxon,
        "was_new_signup": was_new_signup,
        "signup_attribution": signup_attribution,
        "domain": "animal",
    })
    if was_new_signup:
        analytics_events.capture("transfer_signup", current_user.id, {"taxon": new_animal.taxon})

    try:
        from app.services.notification_service import create_notification
        animal_label = source.name or source.scientific_name or "your animal"
        create_notification(
            db,
            user_id=transfer.from_user_id,
            type="transfer_claimed",
            title="Transfer claimed",
            body=f"{current_user.username} claimed {animal_label}.",
            # Canonical logical route. Only Herpetoverse web currently has a
            # transfers index (/app/transfers); every other client's resolver
            # returns null and the notification stays informational rather than
            # opening a 404. This used to hardcode the HV web path, which meant
            # a TV keeper's tap went nowhere good.
            deeplink="/transfers",
            data={"claimer": current_user.username, "transfer_id": str(transfer.id)},
        )
    except Exception:
        pass

    return {
        "id": str(new_animal.id),
        "kind": "animal",
        "taxon": new_animal.taxon,
        "name": new_animal.name,
        "scientific_name": new_animal.scientific_name,
    }


def _was_new_signup(current_user: User, body: "Optional[ClaimBody]"):
    """Same attribution rule as the invert/animal claim paths."""
    if body is not None and body.new_signup is not None:
        return body.new_signup, "resume_marker"
    was_new = False
    try:
        created = current_user.created_at
        if created is not None:
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            was_new = (_now() - created) <= timedelta(minutes=15)
    except Exception:
        pass
    return was_new, "age_backstop"


async def _claim_colony_transfer(
    db: Session,
    transfer: AnimalTransfer,
    current_user: User,
    body: "Optional[ClaimBody]",
) -> dict:
    """Colony claim path (ctr_20261008). One transaction:

    Full    -- a new colony for the buyer carrying the whole population; the
               source is badged transferred_out_at and leaves the seller's
               list and cap.
    Partial -- the counts are re-checked against the source AS IT IS NOW (409
               if the keeper no longer has them), the buyer gets a colony with
               exactly those counts, and the source is reduced through one
               'removed' event per stage so its population history stays true.
               The source stays active.

    In both cases the buyer's counts arrive as 'added' events, so their
    population history starts complete instead of from a number with no
    events behind it.

    Like the animal claim, this never 402s: the buyer is often a brand-new free
    keeper and a claimed record is exempt from the cap on claim.
    """
    # Lock the transfer and the source colony so two claims of the same link,
    # or two partial links racing for the same animals, can't both succeed.
    locked = (
        db.query(AnimalTransfer)
        .filter(AnimalTransfer.id == transfer.id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if locked is None or locked.status != "pending":
        raise HTTPException(status_code=409, detail="This colony has already been claimed.")
    transfer = locked

    source = (
        db.query(Colony)
        .filter(Colony.id == transfer.colony_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if not source:
        raise HTTPException(status_code=404, detail="The source colony no longer exists.")
    if source.transferred_out_at is not None:
        raise HTTPException(
            status_code=409,
            detail="This colony has already gone to another keeper.",
        )
    if source.ended_at is not None:
        raise HTTPException(
            status_code=409,
            detail="The keeper has ended this colony, so it can't be claimed. Ask them about it.",
        )

    partial = bool(transfer.transfer_counts)
    if partial:
        handed = {k: int(v) for k, v in transfer.transfer_counts.items()}
        err = partial_counts_error(source.stage_counts, handed, at_claim=True)
        if err:
            raise HTTPException(status_code=409, detail=err)
    else:
        handed = {
            k: int(v) for k, v in (source.stage_counts or {}).items()
            if isinstance(v, int) and not isinstance(v, bool)
        }

    snap = transfer.snapshot or {}
    today = _now().date()
    seller_handle = snap.get("breeder_handle")

    new_colony = Colony(
        id=uuidlib.uuid4(),
        user_id=current_user.id,
        taxon=source.taxon,
        species_id=source.species_id,
        name=source.name,
        # Same rule as an invert claim: acquired today, bought.
        date_acquired=today,
        # A whole colony keeps the line's start date; a split starts a new line.
        founded_date=(today if partial else source.founded_date),
        source="bought",
        # Buckets start at zero and are filled by the 'added' events below.
        stage_counts={k: 0 for k in handed},
        count_is_estimated=bool(source.count_is_estimated),
        # Husbandry setup (the buyer starts their own logs). Not location,
        # notes, sitter note, enclosure link or visibility -- those are the
        # seller's.
        enclosure_type=source.enclosure_type,
        enclosure_size=source.enclosure_size,
        substrate_type=source.substrate_type,
        substrate_depth=source.substrate_depth,
        target_temp_min=source.target_temp_min,
        target_temp_max=source.target_temp_max,
        target_humidity_min=source.target_humidity_min,
        target_humidity_max=source.target_humidity_max,
        water_dish=source.water_dish,
        visibility="private",
        is_active=True,
    )
    db.add(new_colony)
    db.flush()  # need new_colony.id for events, photos and the transfer link

    arrived_note = (
        f"Arrived through a transfer from @{seller_handle}" if seller_handle
        else "Arrived through a transfer"
    )
    for stage, n in handed.items():
        if n <= 0:
            continue
        db.add(ColonyEvent(
            id=uuidlib.uuid4(),
            colony_id=new_colony.id,
            user_id=current_user.id,
            event_type="added",
            stage=stage,
            count_delta=n,
            occurred_at=today,
            notes=arrived_note,
        ))
        _apply_delta(new_colony, stage, n)

    if partial:
        # Through the same bucket rule as a keeper-logged removal.
        for stage, n in handed.items():
            if n <= 0:
                continue
            db.add(ColonyEvent(
                id=uuidlib.uuid4(),
                colony_id=source.id,
                user_id=source.user_id,
                event_type="removed",
                stage=stage,
                count_delta=-n,
                occurred_at=today,
                destination=f"@{current_user.username}"[:200] if current_user.username else None,
                notes="Transferred to a new keeper",
            ))
            _apply_delta(source, stage, -n)
    else:
        source.transferred_out_at = _now()

    if transfer.include_photos:
        src_photos = (
            db.query(Photo)
            .filter(Photo.colony_id == source.id)
            .order_by(Photo.created_at.desc())
            .all()
        )
        hero_set = False
        for p in src_photos:
            try:
                new_url, new_thumb = await storage_service.copy_photo(p.url, p.thumbnail_url)
            except Exception:
                logger.exception("photo copy failed during claim (transfer %s, photo %s)", transfer.id, p.id)
                continue
            db.add(Photo(
                id=uuidlib.uuid4(),
                colony_id=new_colony.id,
                url=new_url,
                thumbnail_url=new_thumb,
                caption=p.caption,
                taken_at=p.taken_at,
                created_at=datetime.utcnow(),
            ))
            if not hero_set:
                new_colony.photo_url = new_url
                hero_set = True

    # Parity with colony create: the buyer is now keeping this species.
    if new_colony.species_id:
        sp = db.query(InvertSpecies).filter(InvertSpecies.id == new_colony.species_id).first()
        if sp is not None:
            sp.times_kept = (sp.times_kept or 0) + 1

    transfer.status = "claimed"
    transfer.to_user_id = current_user.id
    transfer.claimed_colony_id = new_colony.id
    transfer.claimed_at = _now()

    db.commit()
    db.refresh(new_colony)

    was_new_signup, signup_attribution = _was_new_signup(current_user, body)
    analytics_events.capture("transfer_claimed", current_user.id, {
        "taxon": new_colony.taxon,
        "was_new_signup": was_new_signup,
        "signup_attribution": signup_attribution,
        "domain": "colony",
        "colony_mode": "partial" if partial else "full",
    })
    if was_new_signup:
        analytics_events.capture("transfer_signup", current_user.id, {"taxon": new_colony.taxon})

    try:
        from app.services.notification_service import create_notification
        colony_label = source.name or "your colony"
        what = (
            f"{_counts_total(handed)} from {colony_label}" if partial else colony_label
        )
        create_notification(
            db,
            user_id=transfer.from_user_id,
            type="transfer_claimed",
            title="Transfer claimed",
            body=f"{current_user.username} claimed {what}.",
            deeplink="/transfers",
            data={"claimer": current_user.username, "transfer_id": str(transfer.id)},
        )
    except Exception:
        pass  # never block the claim on notification issues

    return {
        "id": str(new_colony.id),
        "kind": "colony",
        "taxon": new_colony.taxon,
        "name": new_colony.name,
        "scientific_name": snap.get("scientific_name"),
    }


def _refuse_handed_off_source(source) -> None:
    """One animal, one claim. A keeper can have several pending links for the
    same animal; the first claim moves it, and every later one must fail rather
    than mint a second copy. A died animal can't be handed over either."""
    if getattr(source, "transferred_out_at", None) is not None:
        raise HTTPException(status_code=409, detail="This animal has already been transferred to another keeper.")
    if getattr(source, "died_at", None) is not None:
        raise HTTPException(status_code=409, detail="This animal is no longer available to transfer.")


@router.post("/transfers/{token}/claim")
@policy("owner_only")
async def claim_transfer(
    token: str,
    body: Optional[ClaimBody] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Claim a transfer → create a new invert owned by the buyer. AUTH required.

    Never 402s — the buyer is often a brand-new free user and this is the growth
    loop (§5). Claimed animals are exempt from the cap on claim.
    """
    analytics_events.capture("transfer_claim_started", current_user.id, None)

    transfer = db.query(AnimalTransfer).filter(AnimalTransfer.token == token).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if transfer.status == "claimed":
        raise HTTPException(
            status_code=409,
            detail=(
                "This colony has already been claimed." if transfer.colony_id is not None
                else "This animal has already been claimed."
            ),
        )
    if transfer.status == "cancelled":
        raise HTTPException(status_code=409, detail="This transfer was cancelled by the seller.")
    if transfer.status != "pending" or _is_expired(transfer):
        # flip pending-but-expired so it stops being claimable
        if transfer.status == "pending" and _is_expired(transfer):
            transfer.status = "expired"
            db.commit()
        raise HTTPException(status_code=409, detail="This transfer link has expired.")
    if transfer.from_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't claim your own transfer.")

    # Serialize claims: lock the transfer row and re-check it, so two claims of
    # the same link at the same moment can't both create an animal (fresh
    # audit 2026-10-08). The colony path re-locks in the same transaction.
    locked = (
        db.query(AnimalTransfer)
        .filter(AnimalTransfer.id == transfer.id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if locked is None or locked.status != "pending":
        raise HTTPException(status_code=409, detail="This transfer has already been claimed.")
    transfer = locked

    # HV animals take the parallel claim path (creates an Animal, not an Invert).
    if transfer.animal_id is not None:
        return await _claim_animal_transfer(db, transfer, current_user, body)
    # Colonies too (creates a Colony; may be part of the source's population).
    if transfer.colony_id is not None:
        return await _claim_colony_transfer(db, transfer, current_user, body)

    source = (
        db.query(Invert).filter(Invert.id == transfer.invert_id)
        .with_for_update().populate_existing().first()
    )
    if not source:
        raise HTTPException(status_code=404, detail="The source animal no longer exists.")
    _refuse_handed_off_source(source)

    snap = transfer.snapshot or {}
    snap_for_record = {**snap, "transferred_at": _now().isoformat()}

    # Create the buyer's new record (copy identity + husbandry targets only).
    from app.models.tarantula import Source as SourceEnum
    new_invert = Invert(
        id=uuidlib.uuid4(),
        user_id=current_user.id,
        taxon=source.taxon,
        species_id=source.species_id,
        name=source.name,
        common_name=source.common_name,
        scientific_name=source.scientific_name,
        sex=source.sex,
        life_stage=source.life_stage,
        date_acquired=_now().date(),
        source=SourceEnum.BOUGHT,
        # husbandry targets (buyer starts logs fresh — no log rows copied)
        enclosure_type=source.enclosure_type,
        substrate_type=source.substrate_type,
        target_temp_min=source.target_temp_min,
        target_temp_max=source.target_temp_max,
        target_humidity_min=source.target_humidity_min,
        target_humidity_max=source.target_humidity_max,
        water_dish=source.water_dish,
        misting_schedule=source.misting_schedule,
        # provenance
        bred_by_user_id=transfer.from_user_id,
        origin_keeper_name=snap.get("origin_keeper_name"),
        source_transfer_id=transfer.id,
        provenance=snap_for_record,
    )
    db.add(new_invert)
    db.flush()  # need new_invert.id for photo rows + transfer link

    # True-copy selected photos (independent R2 objects — §5).
    if transfer.include_photos:
        src_photos = (
            db.query(Photo)
            .filter(Photo.invert_id == source.id)
            .order_by(Photo.created_at.desc())
            .all()
        )
        hero_set = False
        for p in src_photos:
            try:
                new_url, new_thumb = await storage_service.copy_photo(p.url, p.thumbnail_url)
            except Exception:
                logger.exception("photo copy failed during claim (transfer %s, photo %s)", transfer.id, p.id)
                continue
            db.add(Photo(
                id=str(uuidlib.uuid4()),
                invert_id=new_invert.id,
                url=new_url,
                thumbnail_url=new_thumb,
                caption=p.caption,
                taken_at=p.taken_at,
                created_at=datetime.utcnow(),
            ))
            if not hero_set:
                new_invert.photo_url = new_url
                hero_set = True

    # Mark transfer claimed.
    transfer.status = "claimed"
    transfer.to_user_id = current_user.id
    transfer.claimed_invert_id = new_invert.id
    transfer.claimed_at = _now()

    # Badge the source record as handed off (drives cap/count/reminder exclusion).
    source.transferred_out_at = _now()

    # If the source was a tracked offspring, flip it SOLD.
    offspring = db.query(Offspring).filter(Offspring.invert_id == source.id).first()
    if offspring:
        from app.models.offspring import OffspringStatus
        offspring.status = OffspringStatus.SOLD
        offspring.status_date = _now().date()
        offspring.buyer_info = current_user.username

    # ADR-005 dual-write. Deliberately last: the hero photo is assigned during
    # the copy loop above, and mirroring before that would leave the legacy row
    # with a null photo_url — the same one-directional hero bug fixed in
    # photos.py. Building the legacy row from the finished invert avoids it.
    # Without this the claimed animal exists on mobile and is absent from the
    # web collection, search, analytics and the export.
    from app.services.inverts_dualwrite import mirror_invert_create_to_legacy

    mirror_invert_create_to_legacy(db, new_invert)

    db.commit()
    db.refresh(new_invert)

    # was_new_signup: did this claim onboard a brand-new keeper? Primary signal is
    # the resume-path marker the client carries through register→claim (BRIEF §6:
    # "known, not guessed"). When the client doesn't assert it (older client, OAuth
    # signup, email-verification login path), fall back to the account-age backstop
    # (account created within the last 15 min ⇒ this claim almost certainly drove
    # the signup). signup_attribution lets the funnel separate trustworthy
    # marker-sourced rows from backstop guesses.
    if body is not None and body.new_signup is not None:
        was_new_signup = body.new_signup
        signup_attribution = "resume_marker"
    else:
        was_new_signup = False
        signup_attribution = "age_backstop"
        try:
            created = current_user.created_at
            if created is not None:
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                was_new_signup = (_now() - created) <= timedelta(minutes=15)
        except Exception:
            pass

    analytics_events.capture("transfer_claimed", current_user.id, {
        "taxon": new_invert.taxon,
        "was_new_signup": was_new_signup,
        "signup_attribution": signup_attribution,
    })
    if was_new_signup:
        analytics_events.capture("transfer_signup", current_user.id, {"taxon": new_invert.taxon})

    # Tell the seller their animal was claimed (notification center + best-effort
    # push). Transactional + low-volume, so no per-category toggle.
    try:
        from app.services.notification_service import create_notification
        animal_label = source.name or source.scientific_name or "your animal"
        create_notification(
            db,
            user_id=transfer.from_user_id,
            type="transfer_claimed",
            title="Transfer claimed",
            body=f"{current_user.username} claimed {animal_label}.",
            # See the animal-transfer twin of this handler above. Tarantuverse
            # has no transfers index, so TV clients resolve this to null — the
            # previous hardcoded /dashboard/transfers was a 404 on every client.
            deeplink="/transfers",
            data={"claimer": current_user.username, "transfer_id": str(transfer.id)},
        )
    except Exception:
        pass  # never block the claim on notification issues

    return {
        "id": str(new_invert.id),
        "kind": "invert",
        "taxon": new_invert.taxon,
        "name": new_invert.name,
        "scientific_name": new_invert.scientific_name,
    }


@router.post("/transfers/{token}/cancel")
@policy("owner_only")
async def cancel_transfer(
    token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Seller cancels a still-pending transfer."""
    transfer = db.query(AnimalTransfer).filter(AnimalTransfer.token == token).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if transfer.from_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your transfer.")
    if transfer.status != "pending":
        raise HTTPException(status_code=409, detail=f"Can't cancel a {transfer.status} transfer.")
    # Conditional UPDATE: a claim that commits between the read above and
    # this write must win, or the seller would see "Cancelled" for animals
    # the buyer already has (and, for a partial sale, already counted out).
    changed = (
        db.query(AnimalTransfer)
        .filter(AnimalTransfer.id == transfer.id, AnimalTransfer.status == "pending")
        .update({"status": "cancelled", "cancelled_at": _now()}, synchronize_session=False)
    )
    db.commit()
    if not changed:
        raise HTTPException(status_code=409, detail="This transfer was claimed before it could be cancelled.")
    return {"status": "cancelled"}


@router.get("/transfers/", response_model=list[TransferListItem])
@policy("owner_only")
async def list_transfers(
    role: str = "sent",
    colony_id: Optional[uuidlib.UUID] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the caller's transfers. role=sent (as seller) | received (as buyer).
    `colony_id` narrows to one colony's links (the colony detail page)."""
    if role not in ("sent", "received"):
        raise HTTPException(status_code=400, detail="role must be 'sent' or 'received'")

    if role == "sent":
        q = db.query(AnimalTransfer).filter(AnimalTransfer.from_user_id == current_user.id)
    else:
        q = db.query(AnimalTransfer).filter(AnimalTransfer.to_user_id == current_user.id)
    if colony_id is not None:
        q = q.filter(AnimalTransfer.colony_id == colony_id)
    rows = q.order_by(AnimalTransfer.created_at.desc()).all()

    out: list[TransferListItem] = []
    for t in rows:
        snap = t.snapshot or {}
        kind = _transfer_kind(t)
        colony_mode = None
        transfer_counts = None
        if kind == "colony":
            colony_mode = "partial" if t.transfer_counts else "full"
            transfer_counts = (
                {k: int(v) for k, v in t.transfer_counts.items()} if t.transfer_counts else None
            )
        counterparty = None
        if role == "sent" and t.to_user_id:
            buyer = db.query(User).filter(User.id == t.to_user_id).first()
            counterparty = buyer.username if buyer else None
        elif role == "received":
            counterparty = snap.get("breeder_handle")
        out.append(TransferListItem(
            id=str(t.id),
            token=t.token,
            status=_effective_status(t),
            role=role,
            invert_id=str(t.invert_id) if t.invert_id else None,
            claimed_invert_id=str(t.claimed_invert_id) if t.claimed_invert_id else None,
            animal_id=str(t.animal_id) if t.animal_id else None,
            claimed_animal_id=str(t.claimed_animal_id) if t.claimed_animal_id else None,
            colony_id=str(t.colony_id) if t.colony_id else None,
            claimed_colony_id=str(t.claimed_colony_id) if t.claimed_colony_id else None,
            kind=kind,
            colony_mode=colony_mode,
            transfer_counts=transfer_counts,
            transfer_total=_counts_total(transfer_counts) if transfer_counts else None,
            label=_colony_label(colony_mode, transfer_counts) if kind == "colony" else None,
            taxon=snap.get("taxon"),
            display_name=snap.get("name") or snap.get("common_name") or snap.get("scientific_name"),
            counterparty=counterparty,
            # sale_price only on the seller's own 'sent' rows.
            sale_price=float(t.sale_price) if (role == "sent" and t.sale_price is not None) else None,
            note=t.note,
            created_at=t.created_at,
            claimed_at=t.claimed_at,
            expires_at=t.expires_at,
        ))
    return out
