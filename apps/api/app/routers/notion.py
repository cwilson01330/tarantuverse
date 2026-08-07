"""Admin-only pushes into Notion.

Two actions, both deliberately manual:

  - Send a support message to the Feedback log. The press IS the triage
    decision — auto-forwarding every DM would fill the log with noise until
    nobody read it.
  - Snapshot platform metrics. The dashboard already shows current numbers;
    this writes them down so there's a history to look back at.

Everything here is gated on `get_current_admin`. A keeper's private message
must never be forwardable by anyone but the person it was sent to.
"""
import logging
import os
from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.direct_message import Conversation, DirectMessage
from app.models.user import User
from app.services import notion_service
from app.utils.dependencies import get_current_admin

logger = logging.getLogger(__name__)
router = APIRouter()


class SendMessageRequest(BaseModel):
    """Summary is the admin's words; the message body is quoted verbatim."""

    summary: str = Field(..., min_length=1, max_length=200)
    product: str = "Tarantuverse"
    source: str = notion_service.SOURCE_DIRECT_MESSAGE


class NotionPushResponse(BaseModel):
    url: str


@router.get("/status")
async def notion_status(_: User = Depends(get_current_admin)):
    """Lets the admin UI hide or disable the buttons rather than offering an
    action that will fail."""
    return {
        "feedback_enabled": notion_service.is_configured(),
        "metrics_enabled": notion_service.metrics_configured(),
    }


@router.post(
    "/feedback/from-message/{message_id}", response_model=NotionPushResponse
)
async def push_message_to_notion(
    message_id: str,
    payload: SendMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Push one direct message into the Feedback database."""
    message = db.query(DirectMessage).filter(
        DirectMessage.id == message_id
    ).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    # Admin is not a licence to read arbitrary private mail. The message must
    # belong to a conversation this admin is actually in — they can forward what
    # was said TO them, not what two other keepers said to each other.
    conversation = db.query(Conversation).filter(
        Conversation.id == message.conversation_id
    ).first()
    if not conversation or current_user.id not in (
        conversation.participant1_id,
        conversation.participant2_id,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only send messages from your own conversations.",
        )

    sender = db.query(User).filter(User.id == message.sender_id).first()
    keeper = (
        (sender.display_name or sender.username) if sender else "Unknown keeper"
    )

    try:
        url = notion_service.send_feedback(
            summary=payload.summary,
            message=message.content,
            keeper=keeper,
            product=payload.product,
            source=payload.source,
            received=message.created_at.date() if message.created_at else None,
        )
    except notion_service.NotionNotConfigured as e:
        # A setup problem, not an outage — say so plainly rather than showing a
        # generic failure the admin would waste time debugging.
        raise HTTPException(status_code=503, detail=str(e))

    if not url:
        raise HTTPException(
            status_code=502,
            detail="Notion rejected the request. The message is safe — try again.",
        )
    return NotionPushResponse(url=url)


@router.post("/metrics/snapshot", response_model=NotionPushResponse)
async def push_metrics_snapshot(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Write today's platform numbers to the Metrics database.

    Reuses the analytics overview rather than recomputing, so the snapshot and
    the dashboard can never disagree — two implementations of the same figure
    is how a metric quietly becomes two different metrics.
    """
    from app.routers.admin_analytics import get_analytics_overview

    overview = await get_analytics_overview(db=db)

    try:
        url = notion_service.send_metrics_snapshot(overview, on_date=date.today())
    except notion_service.NotionNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))

    if not url:
        raise HTTPException(
            status_code=502, detail="Notion rejected the snapshot. Try again."
        )
    return NotionPushResponse(url=url)


@router.post("/metrics/cron-snapshot")
async def cron_metrics_snapshot(
    x_cron_secret: str = Header(None),
    db: Session = Depends(get_db),
):
    """Secret-gated daily snapshot. Matches the `/notifications/run-digests`
    pattern — guarded by CRON_SECRET rather than user auth, because a cron has
    no user.

    Skips when today already has a row. A person pressing the button twice is
    making two deliberate observations; a job firing twice is noise, and Render
    Cron can retry.

    Returns 200 with `skipped` rather than an error when there's nothing to do,
    so a retry or an overlapping run doesn't show up as a failure.
    """
    secret = os.environ.get("CRON_SECRET")
    if not secret or x_cron_secret != secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if not notion_service.metrics_configured():
        # Not an error — the integration just isn't set up. Saying so plainly
        # beats a 500 that looks like an outage in the cron logs.
        return {"status": "disabled", "reason": "Notion metrics not configured"}

    today = date.today()
    if notion_service.has_snapshot_for(today):
        return {"status": "skipped", "reason": f"{today.isoformat()} already recorded"}

    from app.routers.admin_analytics import get_analytics_overview

    overview = await get_analytics_overview(db=db)
    url = notion_service.send_metrics_snapshot(overview, on_date=today)

    if not url:
        # 502 so a genuine failure shows red in the cron history — a metrics
        # history with silent gaps is worse than one that tells you it broke.
        raise HTTPException(status_code=502, detail="Notion rejected the snapshot.")
    return {"status": "created", "url": url}
