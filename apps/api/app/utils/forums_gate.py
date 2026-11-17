"""The "forums paused" switch (spec 2026-11-17).

Settings row `feature.forums_enabled` (admin page, 5-minute cache). While it is
off, every forum route (`routers/forums.py`) and every legacy community-board
route (`routers/messages.py`) refuses: writes -> 403 `forums_paused`, reads ->
404. Admins (`is_admin` or `is_superuser`) are never paused, so moderation keeps
working. Direct messages are a different router and are NOT gated.

Call the gate FIRST in a route, before any query, write or side effect.
`tests/test_forums_pause.py::test_every_forum_and_board_route_is_gated` fails a
route that skips it.
"""
from typing import Optional

from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.models.user import User
from app.services import settings_service

PAUSED_DETAIL = "Forums are paused."
PAUSED_CODE = "forums_paused"


class ForumsPaused(HTTPException):
    """403 whose JSON body carries BOTH `detail` and a machine-readable `code`
    (same shape as expenses.PremiumRequired). Rendered by
    `forums_paused_handler`, registered in main.py."""

    def __init__(self) -> None:
        super().__init__(status.HTTP_403_FORBIDDEN, detail=PAUSED_DETAIL)


async def forums_paused_handler(request: Request, exc: ForumsPaused) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={"detail": PAUSED_DETAIL, "code": PAUSED_CODE},
    )


def forums_enabled(db: Session) -> bool:
    """The flag itself. Missing row = on (settings_service default)."""
    return bool(settings_service.is_feature_enabled(db, "forums"))


def forums_open(db: Session, user: Optional[User]) -> bool:
    """Flag on, or the caller is an admin. `user` may be None (anonymous)."""
    if user is not None and (user.is_admin or user.is_superuser):
        return True
    return forums_enabled(db)


def refuse_write_if_paused(db: Session, user: Optional[User]) -> None:
    """403 `forums_paused` for a forum/board write while paused."""
    if not forums_open(db, user):
        raise ForumsPaused()


def hide_read_if_paused(db: Session, user: Optional[User]) -> None:
    """404 for a forum/board read while paused (content is out of sight)."""
    if not forums_open(db, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
