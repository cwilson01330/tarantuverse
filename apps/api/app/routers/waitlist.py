"""
Public waitlist endpoint.
Unauthenticated; rate-limited to deter scraping and spam.
Idempotent on (email, brand) — returns existing record silently on duplicate.
"""
import hashlib
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models.waitlist import WaitlistSignup
from app.schemas.waitlist import WaitlistCreate, WaitlistResponse
from app.utils.rate_limit import limiter

router = APIRouter()


def _hash_ip(ip: str) -> str:
    """Truncated sha256 for abuse detection without storing raw IPs."""
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()[:32]


@router.post(
    "/waitlist",
    response_model=WaitlistResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
async def add_to_waitlist(
    request: Request,
    payload: WaitlistCreate,
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else ""
    user_agent = (request.headers.get("user-agent") or "")[:512]
    email_clean = payload.email.lower().strip()

    signup = WaitlistSignup(
        email=email_clean,
        brand=payload.brand,
        source=payload.source,
        user_agent=user_agent or None,
        ip_hash=_hash_ip(client_ip) if client_ip else None,
    )

    try:
        db.add(signup)
        db.commit()
        db.refresh(signup)
        return signup
    except IntegrityError:
        db.rollback()
        # Idempotent: if already on list, silently return the existing record.
        # (Don't leak "already subscribed" info to the UI — treat same as success.)
        existing = (
            db.query(WaitlistSignup)
            .filter(
                WaitlistSignup.email == email_clean,
                WaitlistSignup.brand == payload.brand,
            )
            .first()
        )
        if existing:
            return existing
        raise HTTPException(status_code=500, detail="Signup failed")
