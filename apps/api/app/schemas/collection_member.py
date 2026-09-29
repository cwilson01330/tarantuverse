"""Request/response shapes for co-keepers (PRD-shared-keeping rung 3)."""
from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

MemberApp = Literal["tarantuverse", "herpetoverse"]
MemberRole = Literal["viewer", "logger", "keeper"]


class InviteCreate(BaseModel):
    app: MemberApp
    email: str = Field(..., min_length=3, max_length=255)
    role: MemberRole = "logger"

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = (v or "").strip().lower()
        # Deliberately light: the real proof is the invitee's VERIFIED account
        # email matching this string at accept time (T11).
        if "@" not in v or v.startswith("@") or v.endswith("@") or " " in v:
            raise ValueError("Enter a valid email address.")
        return v


class RoleUpdate(BaseModel):
    role: MemberRole


class AcceptByToken(BaseModel):
    token: str = Field(..., min_length=20, max_length=128)


class AcceptByCode(BaseModel):
    """The short code printed in the invite email — for inboxes whose
    security filters rewrite or block links (Mimecast and friends)."""
    code: str = Field(..., min_length=8, max_length=32)


class PersonBrief(BaseModel):
    id: UUID
    name: str                      # display name, else username
    username: Optional[str] = None
    avatar_url: Optional[str] = None


class MemberOut(BaseModel):
    """What the OWNER sees about someone on (or invited to) their collection."""
    id: UUID
    app: MemberApp
    role: MemberRole
    status: str                    # pending | active
    invited_email: Optional[str] = None   # pending only
    member: Optional[PersonBrief] = None  # active only
    created_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    invite_expires_at: Optional[datetime] = None


class InviteCreated(MemberOut):
    """Returned by create and resend. `accept_url` is shown to the owner once,
    so they can also send it by text; accepting still needs the invitee's
    verified email to match."""
    accept_url: str
    email_sent: bool
    # Same invite, typeable: the invitee can enter it on the Sharing screen
    # instead of clicking. Shown to the owner once, like accept_url.
    invite_code: str


class SharedCollection(BaseModel):
    """A collection the CALLER can reach as a co-keeper."""
    membership_id: UUID
    owner: PersonBrief
    app: MemberApp
    role: MemberRole
    read_only: bool                # owner's premium lapsed → viewer until renewed
    accepted_at: Optional[datetime] = None


class PendingInvite(BaseModel):
    id: UUID
    owner: PersonBrief
    app: MemberApp
    role: MemberRole
    invite_expires_at: Optional[datetime] = None


class SharedWithMe(BaseModel):
    collections: List[SharedCollection]
    invites: List[PendingInvite]
    # When there are invites for your email but it isn't verified yet, the
    # client can say "verify your email to see and accept invites".
    email_verified: bool
