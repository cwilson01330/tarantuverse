"""Request/response shapes for sitter passes (PRD-shared-keeping)."""
from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

PassApp = Literal["tarantuverse", "herpetoverse"]
AnimalKind = Literal["invert", "colony", "animal"]

MAX_ANIMALS_PER_PASS = 500
MAX_ROUTINE_STEPS = 30


class PassAnimalRef(BaseModel):
    kind: AnimalKind
    id: UUID


class PassCreate(BaseModel):
    app: PassApp
    animals: List[PassAnimalRef] = Field(..., min_length=1, max_length=MAX_ANIMALS_PER_PASS)
    # Optional: defaults to now. A future start lets a keeper send the link
    # before leaving; the page says when it opens.
    starts_at: Optional[datetime] = None
    expires_at: datetime
    label: Optional[str] = Field(None, max_length=80)
    # Rung 2 (premium). Logging always needs a PIN — the DB enforces it too.
    can_log: bool = False
    pin: Optional[str] = Field(None, max_length=12)


class PassUpdate(BaseModel):
    label: Optional[str] = Field(None, max_length=80)
    expires_at: Optional[datetime] = None
    animals: Optional[List[PassAnimalRef]] = Field(None, min_length=1, max_length=MAX_ANIMALS_PER_PASS)
    # Turning logging ON needs premium and a PIN (new, or the one already
    # set). Turning it OFF clears the PIN. Changing just the PIN is always
    # allowed — it's security hygiene, never a paywalled action.
    can_log: Optional[bool] = None
    pin: Optional[str] = Field(None, max_length=12)


class PassUnlock(BaseModel):
    """Keeper clears a PIN lockout. A new PIN is optional but recommended
    when the keeper didn't cause the lockout themselves."""
    pin: Optional[str] = Field(None, max_length=12)


class PassSummary(BaseModel):
    id: UUID
    app: PassApp
    label: Optional[str]
    token_prefix: str
    status: Literal["scheduled", "active", "expired", "revoked", "locked"]
    starts_at: datetime
    expires_at: datetime
    revoked_at: Optional[datetime]
    animal_count: int
    open_count: int
    last_used_at: Optional[datetime]
    created_at: Optional[datetime]
    can_log: bool = False
    log_count: int = 0
    # Never the PIN or its hash — only whether one is set.
    has_pin: bool = False


class PassCreated(PassSummary):
    """Returned ONLY by create and rotate. `token` is shown once, never again."""
    token: str
    # Relative path; the client prefixes its own origin. The token rides in
    # the fragment so it never reaches a server log or a Referer header.
    share_path: str


class ExchangeRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=128)


class PinUnlockRequest(BaseModel):
    pin: str = Field(..., min_length=1, max_length=12)


class SitterFeedingCreate(BaseModel):
    """What a sitter can log. Deliberately narrow (PRD decision 5): a feeding
    or a refusal, for one individual animal on their pass. No molts, no health
    events, no dates in the past — fed_at is the server's clock."""
    # Colonies are fed as a unit on the keeper's own schedule and their cards
    # say "graze"; sitters don't log them in v1.
    kind: Literal["invert", "animal"]
    id: UUID
    accepted: bool
    food_type: Optional[str] = Field(None, max_length=100)
    food_size: Optional[str] = Field(None, max_length=50)
    quantity: Optional[int] = Field(None, ge=1, le=50)
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("food_type", "food_size", "notes")
    @classmethod
    def _strip(cls, v: Optional[str]) -> Optional[str]:
        return (v or "").strip() or None


class SitterNoteUpdate(BaseModel):
    kind: AnimalKind
    id: UUID
    sitter_note: Optional[str] = Field(None, max_length=1000)


class SitterGuideBody(BaseModel):
    routine_steps: List[str] = Field(default_factory=list, max_length=MAX_ROUTINE_STEPS)
    # None = use the built-in emergency defaults; "" = deliberately cleared.
    emergency_text: Optional[str] = Field(None, max_length=4000)
    contact_line: Optional[str] = Field(None, max_length=200)
    vet_contact: Optional[str] = Field(None, max_length=200)

    @field_validator("routine_steps")
    @classmethod
    def _steps(cls, v: List[str]) -> List[str]:
        cleaned = [s.strip() for s in v if s and s.strip()]
        for s in cleaned:
            if len(s) > 300:
                raise ValueError("Each routine step must be 300 characters or fewer")
        return cleaned
