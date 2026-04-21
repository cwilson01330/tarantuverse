"""Animal genotype schemas — data layer only for v1.

No router consumes these yet; they're exported for Sprint 5's morph calculator
to use. Validation rules mirror PRD §5.4:

  - zygosity is constrained to the hobby vocabulary
  - poss_het_percentage is only meaningful when zygosity=='poss_het'
    (router layer can enforce this; schema just bounds it 1..99)
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid


ZYGOSITY_PATTERN = r"^(het|visual|poss_het|super)$"


class AnimalGenotypeBase(BaseModel):
    gene_id: uuid.UUID
    zygosity: str = Field(..., pattern=ZYGOSITY_PATTERN)
    poss_het_percentage: Optional[int] = Field(None, ge=1, le=99)
    proven: bool = False
    notes: Optional[str] = None


class AnimalGenotypeCreate(AnimalGenotypeBase):
    """snake_id comes from the route, not the payload."""
    pass


class AnimalGenotypeUpdate(BaseModel):
    """PATCH-style update — every field optional."""
    gene_id: Optional[uuid.UUID] = None
    zygosity: Optional[str] = Field(None, pattern=ZYGOSITY_PATTERN)
    poss_het_percentage: Optional[int] = Field(None, ge=1, le=99)
    proven: Optional[bool] = None
    notes: Optional[str] = None


class AnimalGenotypeResponse(AnimalGenotypeBase):
    id: uuid.UUID
    snake_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True
