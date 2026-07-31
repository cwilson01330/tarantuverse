"""Marking an animal as died (ADR-015).

Its own module because the shape is shared by both products and because keeping
it out of the general update schemas is deliberate: `died_at` must not be
settable by an incidental PATCH that happens to include the field. Retiring an
animal is grave enough to deserve its own endpoint.
"""
from datetime import date
from typing import Optional

from pydantic import BaseModel, Field, field_validator


# Offered, never demanded. Every value optional; a date alone is a complete
# record.
#
# `unknown` is a FIRST-CLASS answer, not a synonym for null. Most invertebrate
# deaths are genuinely unexplained, and a keeper who honestly doesn't know
# should be able to say so rather than leave a blank that reads as an omission
# — or worse, feel pressured to guess. A guessed cause is worse than no cause:
# it would pollute any future mortality analysis with fiction.
DEATH_CAUSES = (
    "bad_molt",     # the single most common way a tarantula dies
    "dehydration",
    "dks",          # dyskinetic syndrome
    "illness",
    "injury",
    "escaped",      # never recovered — a real and distinct outcome
    "old_age",
    "unknown",
    "other",
)


class MarkDiedRequest(BaseModel):
    """Record that an animal died.

    Nothing here is required except the date, and even that defaults to today.
    """

    # A DATE, not a datetime. Keepers know the day and rarely the hour; storing
    # a spurious 03:00 would be false precision about something they never
    # observed. Defaults to today because that's the common case and one less
    # thing to fill in at a bad moment.
    died_at: Optional[date] = None
    death_cause: Optional[str] = None
    death_notes: Optional[str] = Field(None, max_length=5000)

    @field_validator("death_cause")
    @classmethod
    def _known_cause(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if v not in DEATH_CAUSES:
            raise ValueError(
                f"death_cause must be one of: {', '.join(DEATH_CAUSES)}"
            )
        return v

    @field_validator("died_at")
    @classmethod
    def _not_in_future(cls, v: Optional[date]) -> Optional[date]:
        # A future death date is always a typo, and it would quietly corrupt
        # ordering in the memorial view. Reject rather than silently clamp:
        # clamping would record a date the keeper didn't choose.
        if v is not None and v > date.today():
            raise ValueError("died_at cannot be in the future")
        return v


class ReviveRequest(BaseModel):
    """Undo a mark-as-died.

    Exists because the alternative is a keeper who mis-taps living with a
    memorial for an animal sitting in front of them. Clears all three columns —
    a lingering cause or note with no date would be an orphan nobody can see or
    edit.
    """

    pass
