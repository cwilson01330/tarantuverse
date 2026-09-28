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


class PassUpdate(BaseModel):
    label: Optional[str] = Field(None, max_length=80)
    expires_at: Optional[datetime] = None
    animals: Optional[List[PassAnimalRef]] = Field(None, min_length=1, max_length=MAX_ANIMALS_PER_PASS)


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


class PassCreated(PassSummary):
    """Returned ONLY by create and rotate. `token` is shown once, never again."""
    token: str
    # Relative path; the client prefixes its own origin. The token rides in
    # the fragment so it never reaches a server log or a Referer header.
    share_path: str


class ExchangeRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=128)


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
