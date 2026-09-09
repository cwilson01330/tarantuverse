"""Care log schemas (water dish / overflow / misting)."""
from datetime import datetime
from typing import Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.care_log import CARE_LOG_TYPES


# Built from the model's tuple rather than retyped. A hand-copied regex here is
# how the taxon pattern went stale during ADR-006 and 422'd the species
# browser; deriving it means the two literally cannot disagree.
LOG_TYPE_PATTERN = f"^({'|'.join(CARE_LOG_TYPES)})$"


class CareLogBase(BaseModel):
    log_type: str = Field(..., pattern=LOG_TYPE_PATTERN)
    logged_at: datetime
    notes: Optional[str] = None

    @field_validator("logged_at")
    @classmethod
    def not_in_the_future(cls, v: datetime) -> datetime:
        """Watering is an event that must already have happened.

        Note this is the OPPOSITE of the rule for acquisition dates, which are
        legitimately future-dated because keepers add animals that haven't
        shipped yet. The distinction is whether the thing being recorded is a
        plan or a past act — see feedback_future_dates_are_legitimate.
        """
        from datetime import timezone

        now = datetime.now(timezone.utc)
        # A little slack for clock skew between the device and the server;
        # rejecting a log because a phone is 40 seconds fast would be absurd.
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        if (v - now).total_seconds() > 300:
            raise ValueError("logged_at cannot be in the future")
        return v


class CareLogCreate(CareLogBase):
    pass


class CareLogUpdate(BaseModel):
    log_type: Optional[str] = Field(None, pattern=LOG_TYPE_PATTERN)
    logged_at: Optional[datetime] = None
    notes: Optional[str] = None


class CareLogResponse(CareLogBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    invert_id: uuid.UUID
    created_at: datetime
