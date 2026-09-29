"""
Co-keepers — invites and memberships (PRD-shared-keeping rung 3;
build plan docs/design/PLAN-co-keepers.md step 4).

Mounted at /api/v1/collection-members.

  Owner                                   Member / invitee
  -----                                   ----------------
  GET    /?app=          list             GET  /shared-with-me
  POST   /               invite           POST /accept                 (token from the email link)
  PATCH  /{id}           change role      POST /invites/{id}/accept    (in-app; verified email match)
  DELETE /{id}           remove/revoke    POST /invites/{id}/decline
  POST   /{id}/resend    new link         POST /{id}/leave

SECURITY SHAPE
--------------
- Only the OWNER manages their collection's members; co-keepers never invite
  (PRD T8). Every owner route filters on owner_user_id == current_user.id.
- Inviting needs premium for that app (`can_use_co_keepers`); at most 10
  active + pending per collection per app. A lapse later doesn't evict
  anyone — utils/access caps them at viewer (T12).
- Invite tokens: 256-bit, only the SHA-256 is stored, single use, 7 days (T11).
- Accepting — by token or in-app — needs a signed-in account whose VERIFIED
  email equals the invited address. A forwarded invite email is useless to
  anyone else.
- Removal and leaving take effect on the next request: access is looked up
  per request, never cached (T9).
"""
# NOTE: no `from __future__ import annotations` — slowapi wraps the rate-limited
# endpoints, and FastAPI then can't resolve string annotations (see sitter_passes).
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.collection_member import MAX_MEMBERS_PER_COLLECTION, CollectionMember
from app.models.user import User
from app.schemas.collection_member import (
    AcceptByToken,
    InviteCreate,
    InviteCreated,
    MemberOut,
    PendingInvite,
    PersonBrief,
    RoleUpdate,
    SharedCollection,
    SharedWithMe,
)
from app.utils.dependencies import get_current_user
from app.utils.frontend_origin import HERPETOVERSE, TARANTUVERSE
from app.utils.rate_limit import limiter

logger = logging.getLogger(__name__)
router = APIRouter()

INVITE_TTL = timedelta(days=7)
APP_ORIGIN = {"tarantuverse": "https://www.tarantuverse.com", "herpetoverse": "https://herpetoverse.com"}
APP_BRAND = {"tarantuverse": TARANTUVERSE, "herpetoverse": HERPETOVERSE}
APP_NAME = {"tarantuverse": "Tarantuverse", "herpetoverse": "Herpetoverse"}

# One message for every way an invite can't be used by this person. Which of
# (unknown, expired, used, revoked) it was is not the caller's business.
INVITE_UNAVAILABLE = "This invite isn't available any more. Ask the keeper to send a new one."
WRONG_EMAIL = (
    "This invite was sent to a different email address. "
    "Sign in with that address (or add it to your account) to accept it."
)
VERIFY_FIRST = "Verify your email address first, then accept the invite."


# ── helpers ───────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _new_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    return raw, _hash(raw)


def _name(u: User) -> str:
    # Co-keeping is between account holders who've chosen to share, so the
    # username is an acceptable fallback here (unlike the anonymous sitter page).
    return (getattr(u, "display_name", None) or "").strip() or getattr(u, "username", None) or "A keeper"


def _person(u: User) -> PersonBrief:
    return PersonBrief(id=u.id, name=_name(u), username=getattr(u, "username", None),
                       avatar_url=getattr(u, "avatar_url", None))


def _is_live_pending(m: CollectionMember, now: datetime) -> bool:
    return m.status == "pending" and m.invite_expires_at is not None and now < _aware(m.invite_expires_at)


def _member_out(db: Session, m: CollectionMember) -> MemberOut:
    member = None
    if m.status == "active" and m.member_user_id:
        u = db.query(User).filter(User.id == m.member_user_id).first()
        member = _person(u) if u else None
    return MemberOut(
        id=m.id, app=m.app, role=m.role, status=m.status,
        invited_email=m.invited_email if m.status == "pending" else None,
        member=member, created_at=m.created_at, accepted_at=m.accepted_at,
        invite_expires_at=m.invite_expires_at if m.status == "pending" else None,
    )


def _owned_membership(db: Session, membership_id: UUID, owner: User) -> CollectionMember:
    m = (
        db.query(CollectionMember)
        .filter(CollectionMember.id == membership_id, CollectionMember.owner_user_id == owner.id)
        .first()
    )
    if m is None or m.status not in ("pending", "active"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Member not found")
    return m


def _in_app_invites() -> bool:
    """Whether invites may be seen / accepted / declined from inside the app,
    i.e. without the emailed token.

    That path trusts `is_verified` as proof the account holder owns the
    invited address. With EMAIL_VERIFICATION_REQUIRED off, registration marks
    every account verified, so anyone could register the invitee's address and
    take the invite. Then only the emailed link — which proves inbox access —
    can accept. (Security review 2026-09-29, H1.)
    """
    return bool(settings.EMAIL_VERIFICATION_REQUIRED)


IN_APP_OFF = "Open the link in your invite email to accept."


def _email_matches(user: User, m: CollectionMember) -> bool:
    return (getattr(user, "email", "") or "").strip().lower() == (m.invited_email or "").strip().lower()


async def _send_invite(owner: User, m: CollectionMember, raw: str) -> bool:
    from app.services.email import EmailService

    url = f"{APP_ORIGIN[m.app]}/invite#{raw}"
    try:
        await EmailService.send_collection_invite_email(
            to_email=m.invited_email, inviter_name=_name(owner), role=m.role, accept_link=url,
            valid_days=INVITE_TTL.days, brand=APP_BRAND[m.app],
        )
        return True
    except Exception:
        logger.exception("collection invite email failed")
        return False


def _notify(db: Session, user_id: UUID, type_: str, title: str, body: str, data: dict) -> None:
    try:
        from app.services.notification_service import create_notification

        create_notification(db, user_id=user_id, type=type_, title=title, body=body,
                            deeplink="/shared", data=data)
    except Exception:
        logger.exception("collection member notification failed")
        db.rollback()


def _activate(db: Session, m: CollectionMember, user: User) -> CollectionMember:
    """Turn a pending invite into an active membership for `user`, after
    every check has passed. Idempotent against an existing membership."""
    now = _now()
    existing = (
        db.query(CollectionMember)
        .filter(
            CollectionMember.owner_user_id == m.owner_user_id,
            CollectionMember.member_user_id == user.id,
            CollectionMember.app == m.app,
            CollectionMember.status == "active",
        )
        .first()
    )
    m.invite_token_hash = None  # single use, whatever happens next
    if existing is not None:
        m.status, m.ended_at = "expired", now
        db.commit()
        return existing
    m.member_user_id, m.status, m.accepted_at = user.id, "active", now
    db.commit()
    db.refresh(m)
    owner = db.query(User).filter(User.id == m.owner_user_id).first()
    if owner is not None:
        _notify(db, owner.id, "collection_member_joined",
                f"{_name(user)} joined your {APP_NAME[m.app]} collection",
                f"They can now {'see' if m.role == 'viewer' else 'log in'} your collection as a {m.role}.",
                {"membership_id": str(m.id), "app": m.app})
    return m


def _check_can_accept(m: Optional[CollectionMember], user: User) -> CollectionMember:
    now = _now()
    if m is None or m.status != "pending":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=INVITE_UNAVAILABLE)
    if not _is_live_pending(m, now):
        raise HTTPException(status.HTTP_410_GONE, detail=INVITE_UNAVAILABLE)
    if m.owner_user_id == user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="That's your own collection.")
    if not getattr(user, "is_verified", False):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=VERIFY_FIRST)
    if not _email_matches(user, m):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=WRONG_EMAIL)
    return m


# ── owner ─────────────────────────────────────────────────────────────────────
# Static paths are declared before /{membership_id}.

@router.get("/shared-with-me", response_model=SharedWithMe)
async def shared_with_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Collections shared with the caller, plus invites waiting for them.

    Pending invites are listed only once the caller's email is VERIFIED —
    before that, an unverified account claiming someone's address would see
    who is inviting that person.
    """
    now = _now()
    rows = (
        db.query(CollectionMember)
        .filter(CollectionMember.member_user_id == current_user.id, CollectionMember.status == "active")
        .order_by(CollectionMember.accepted_at.desc())
        .all()
    )
    collections: List[SharedCollection] = []
    for m in rows:
        owner = db.query(User).filter(User.id == m.owner_user_id).first()
        if owner is None or not getattr(owner, "is_active", True):
            continue
        lapsed = m.role != "viewer" and not owner.is_premium_for_app(m.app)
        collections.append(SharedCollection(
            membership_id=m.id, owner=_person(owner), app=m.app,
            role="viewer" if lapsed else m.role, read_only=lapsed or m.role == "viewer",
            accepted_at=m.accepted_at,
        ))

    verified = bool(getattr(current_user, "is_verified", False))
    invites: List[PendingInvite] = []
    if verified and current_user.email and _in_app_invites():
        pending = (
            db.query(CollectionMember)
            .filter(
                CollectionMember.status == "pending",
                CollectionMember.invited_email == current_user.email.strip().lower(),
            )
            .all()
        )
        for m in pending:
            if not _is_live_pending(m, now) or m.owner_user_id == current_user.id:
                continue
            owner = db.query(User).filter(User.id == m.owner_user_id).first()
            if owner is None:
                continue
            invites.append(PendingInvite(id=m.id, owner=_person(owner), app=m.app, role=m.role,
                                         invite_expires_at=m.invite_expires_at))
    return SharedWithMe(collections=collections, invites=invites, email_verified=verified)


@router.post("/accept", response_model=SharedCollection)
@limiter.limit("20/minute")
async def accept_by_token(
    request: Request,
    body: AcceptByToken,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Accept from the email link. The token rides in the POST body (from the
    URL fragment), never in a query string."""
    m = (
        db.query(CollectionMember)
        .filter(CollectionMember.invite_token_hash == _hash(body.token))
        .with_for_update()
        .first()
    )
    m = _activate(db, _check_can_accept(m, current_user), current_user)
    owner = db.query(User).filter(User.id == m.owner_user_id).first()
    return SharedCollection(membership_id=m.id, owner=_person(owner), app=m.app, role=m.role,
                            read_only=m.role == "viewer", accepted_at=m.accepted_at)


@router.post("/invites/{invite_id}/accept", response_model=SharedCollection)
@limiter.limit("20/minute")
async def accept_in_app(
    request: Request,
    invite_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Accept an invite listed in Shared with me — same checks as the link:
    live, not your own, verified email that matches."""
    if not _in_app_invites():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=IN_APP_OFF)
    m = db.query(CollectionMember).filter(CollectionMember.id == invite_id).with_for_update().first()
    if m is not None and not _email_matches(current_user, m):
        m = None  # someone else's invite: indistinguishable from no invite
    m = _activate(db, _check_can_accept(m, current_user), current_user)
    owner = db.query(User).filter(User.id == m.owner_user_id).first()
    return SharedCollection(membership_id=m.id, owner=_person(owner), app=m.app, role=m.role,
                            read_only=m.role == "viewer", accepted_at=m.accepted_at)


@router.post("/invites/{invite_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
async def decline_invite(
    invite_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _in_app_invites():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=IN_APP_OFF)
    m = db.query(CollectionMember).filter(CollectionMember.id == invite_id).first()
    if m is None or m.status != "pending" or not getattr(current_user, "is_verified", False) \
            or not _email_matches(current_user, m):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=INVITE_UNAVAILABLE)
    m.status, m.ended_at, m.invite_token_hash = "declined", _now(), None
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/", response_model=List[MemberOut])
async def list_members(
    app: str = Query(..., pattern="^(tarantuverse|herpetoverse)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The owner's co-keepers and open invites for one app."""
    now = _now()
    rows = (
        db.query(CollectionMember)
        .filter(
            CollectionMember.owner_user_id == current_user.id,
            CollectionMember.app == app,
            CollectionMember.status.in_(("active", "pending")),
        )
        .order_by(CollectionMember.created_at.asc())
        .all()
    )
    out = []
    for m in rows:
        if m.status == "pending" and not _is_live_pending(m, now):
            m.status, m.ended_at, m.invite_token_hash = "expired", now, None  # lazy expiry
            continue
        out.append(_member_out(db, m))
    db.commit()
    return out


@router.post("/", response_model=InviteCreated, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/hour")
async def invite(
    request: Request,
    body: InviteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owner = current_user
    if not owner.is_premium_for_app(body.app):
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            detail={"message": "Inviting co-keepers is a premium feature.", "is_premium": False,
                    "source": "shared_keeping"},
        )
    if body.email == (owner.email or "").strip().lower():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="That's your own email address.")

    now = _now()
    # Serialise invites per owner so two at once can't both squeeze under the cap.
    db.query(User).filter(User.id == owner.id).with_for_update().first()
    rows = (
        db.query(CollectionMember)
        .filter(
            CollectionMember.owner_user_id == owner.id,
            CollectionMember.app == body.app,
            CollectionMember.status.in_(("active", "pending")),
        )
        .all()
    )
    live = [m for m in rows if m.status == "active" or _is_live_pending(m, now)]
    for m in rows:
        if m not in live:
            m.status, m.ended_at, m.invite_token_hash = "expired", now, None
    for m in live:
        if m.status == "pending" and m.invited_email == body.email:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                detail="You've already invited that address. Resend it from the list instead.")
        if m.status == "active" and m.member_user_id:
            u = db.query(User).filter(User.id == m.member_user_id).first()
            if u is not None and (u.email or "").strip().lower() == body.email:
                raise HTTPException(status.HTTP_409_CONFLICT, detail="That person is already a co-keeper.")
    if len(live) >= MAX_MEMBERS_PER_COLLECTION:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"A collection can have up to {MAX_MEMBERS_PER_COLLECTION} co-keepers and invites. "
                   "Remove someone first.",
        )

    raw, token_hash = _new_token()
    m = CollectionMember(
        owner_user_id=owner.id, app=body.app, role=body.role, invited_email=body.email,
        invite_token_hash=token_hash, invite_expires_at=now + INVITE_TTL, status="pending",
    )
    db.add(m)
    db.commit()
    db.refresh(m)

    sent = await _send_invite(owner, m, raw)
    invitee = (
        db.query(User)
        .filter(func.lower(User.email) == body.email, User.is_verified.is_(True))
        .first()
    )
    # Only when the invite can actually be accepted in-app: otherwise this
    # would tell whoever registered that address (see _in_app_invites) who is
    # inviting them, and point them at a screen with nothing to accept.
    if invitee is not None and invitee.id != owner.id and _in_app_invites():
        _notify(db, invitee.id, "collection_invite",
                f"{_name(owner)} invited you to their {APP_NAME[body.app]} collection",
                f"As a {body.role}. Open Shared with me to accept.",
                {"membership_id": str(m.id), "app": body.app})
    return InviteCreated(**_member_out(db, m).model_dump(),
                         accept_url=f"{APP_ORIGIN[m.app]}/invite#{raw}", email_sent=sent)


@router.post("/{membership_id}/resend", response_model=InviteCreated)
@limiter.limit("10/hour")
async def resend_invite(
    request: Request,
    membership_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """A fresh link and 7 more days. The old link stops working."""
    m = (
        db.query(CollectionMember)
        .filter(CollectionMember.id == membership_id, CollectionMember.owner_user_id == current_user.id)
        .first()
    )
    if m is None or m.status not in ("pending", "expired") or m.member_user_id is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if not current_user.is_premium_for_app(m.app):
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            detail={"message": "Inviting co-keepers is a premium feature.", "is_premium": False,
                    "source": "shared_keeping"},
        )
    if m.status == "expired":
        # Reviving an expired invite adds a live one, so it gets the same
        # checks as a new invite: the owner lock, the cap, and no second
        # pending invite to the same address (which the unique index would
        # otherwise turn into a 500). Review 2026-09-29, L1.
        now = _now()
        db.query(User).filter(User.id == current_user.id).with_for_update().first()
        others = (
            db.query(CollectionMember)
            .filter(
                CollectionMember.owner_user_id == current_user.id,
                CollectionMember.app == m.app,
                CollectionMember.status.in_(("active", "pending")),
                CollectionMember.id != m.id,
            )
            .all()
        )
        live = [o for o in others if o.status == "active" or _is_live_pending(o, now)]
        for o in others:
            if o not in live:  # lazy expiry, so a dead invite can't block this one
                o.status, o.ended_at, o.invite_token_hash = "expired", now, None
        db.flush()
        if any(o.status == "pending" and o.invited_email == m.invited_email for o in live):
            raise HTTPException(status.HTTP_409_CONFLICT,
                                detail="There's already an open invite to that address.")
        if len(live) >= MAX_MEMBERS_PER_COLLECTION:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail=f"A collection can have up to {MAX_MEMBERS_PER_COLLECTION} co-keepers and invites. "
                       "Remove someone first.",
            )
    raw, token_hash = _new_token()
    m.invite_token_hash, m.invite_expires_at, m.status, m.ended_at = token_hash, _now() + INVITE_TTL, "pending", None
    db.commit()
    db.refresh(m)
    sent = await _send_invite(current_user, m, raw)
    return InviteCreated(**_member_out(db, m).model_dump(),
                         accept_url=f"{APP_ORIGIN[m.app]}/invite#{raw}", email_sent=sent)


@router.patch("/{membership_id}", response_model=MemberOut)
async def change_role(
    membership_id: UUID,
    body: RoleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    m = _owned_membership(db, membership_id, current_user)
    m.role = body.role
    db.commit()
    db.refresh(m)
    return _member_out(db, m)


@router.delete("/{membership_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    membership_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a co-keeper or revoke an invite. Takes effect on their next
    request — access is resolved per request, never cached."""
    m = _owned_membership(db, membership_id, current_user)
    was_active, member_id = m.status == "active", m.member_user_id
    m.status, m.ended_at, m.invite_token_hash = "removed", _now(), None
    db.commit()
    if was_active and member_id:
        _notify(db, member_id, "collection_member_removed",
                f"You're no longer a co-keeper on {_name(current_user)}'s collection",
                "The owner ended your access.", {"app": m.app})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{membership_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave(
    membership_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    m = (
        db.query(CollectionMember)
        .filter(
            CollectionMember.id == membership_id,
            CollectionMember.member_user_id == current_user.id,
            CollectionMember.status == "active",
        )
        .first()
    )
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Membership not found")
    m.status, m.ended_at = "left", _now()
    db.commit()
    _notify(db, m.owner_user_id, "collection_member_left",
            f"{_name(current_user)} left your {APP_NAME[m.app]} collection", "They no longer have access.",
            {"app": m.app})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
