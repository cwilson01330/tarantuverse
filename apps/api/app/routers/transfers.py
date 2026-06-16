"""Animal transfer ("rehome") — BRIEF-animal-transfer-provenance.

Seller generates a claim link for an animal they own; buyer claims it and gets a
NEW invert pre-loaded with species + provenance + copied photos. Source record is
badged "Transferred" (Invert.transferred_out_at) and drops out of the seller's
active counts/cap/reminders.

Bright line (§1): no payments/brokering. sale_price is a PRIVATE seller ledger,
never returned to the buyer.
"""
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid as uuidlib

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.invert import Invert
from app.models.animal_transfer import AnimalTransfer
from app.models.photo import Photo
from app.models.offspring import Offspring
from app.models.egg_sac import EggSac
from app.models.pairing import Pairing
from app.models.molt_log import MoltLog
from app.models.user import User
from app.utils.dependencies import get_current_user
from app.routers.qr import _optional_user  # reuse the never-raise bearer resolver
from app.services.storage import storage_service
from app.services import analytics_events
from app.schemas.transfer import (
    TransferCreate, TransferCreateResponse, TransferPreview, TransferListItem,
)
from app.config import settings

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


def _web_base() -> str:
    return getattr(settings, "FRONTEND_URL", "https://tarantuverse.com")


# ─── endpoints ──────────────────────────────────────────────────────────────

@router.post("/inverts/{invert_id}/transfer", response_model=TransferCreateResponse)
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


@router.get("/transfers/{token}", response_model=TransferPreview)
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
    photo_urls: list[str] = []
    if transfer.include_photos:
        photos = (
            db.query(Photo)
            .filter(Photo.invert_id == transfer.invert_id)
            .order_by(Photo.created_at.desc())
            .all()
        )
        photo_urls = [p.url for p in photos if p.url]

    analytics_events.capture("transfer_link_viewed", viewer.id if viewer else None, {
        "authed": viewer is not None,
    })

    return TransferPreview(
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


@router.post("/transfers/{token}/claim")
async def claim_transfer(
    token: str,
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
        raise HTTPException(status_code=409, detail="This animal has already been claimed.")
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

    source = db.query(Invert).filter(Invert.id == transfer.invert_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="The source animal no longer exists.")

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

    db.commit()
    db.refresh(new_invert)

    # was_new_signup: did this claim onboard a brand-new keeper? The brief's
    # preferred source is a resume-path marker from register→claim; until that's
    # wired through NextAuth, use the account-age backstop (created within the
    # last 15 min ⇒ this claim almost certainly drove the signup).
    was_new_signup = False
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
    })
    if was_new_signup:
        analytics_events.capture("transfer_signup", current_user.id, {"taxon": new_invert.taxon})

    return {
        "id": str(new_invert.id),
        "taxon": new_invert.taxon,
        "name": new_invert.name,
        "scientific_name": new_invert.scientific_name,
    }


@router.post("/transfers/{token}/cancel")
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
    transfer.status = "cancelled"
    transfer.cancelled_at = _now()
    db.commit()
    return {"status": "cancelled"}


@router.get("/transfers/", response_model=list[TransferListItem])
async def list_transfers(
    role: str = "sent",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the caller's transfers. role=sent (as seller) | received (as buyer)."""
    if role not in ("sent", "received"):
        raise HTTPException(status_code=400, detail="role must be 'sent' or 'received'")

    if role == "sent":
        rows = db.query(AnimalTransfer).filter(
            AnimalTransfer.from_user_id == current_user.id
        ).order_by(AnimalTransfer.created_at.desc()).all()
    else:
        rows = db.query(AnimalTransfer).filter(
            AnimalTransfer.to_user_id == current_user.id
        ).order_by(AnimalTransfer.created_at.desc()).all()

    out: list[TransferListItem] = []
    for t in rows:
        snap = t.snapshot or {}
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
