"""Gene schemas — morph catalog API contract.

Validation mirrors PRD §5.4:
  - gene_type is constrained to the four hobby-recognized inheritance modes
  - welfare_flag accepts the three taxonomy values or null
  - welfare_citations is a free-form JSONB list; content rubric (not schema)
    enforces the 3+ citations rule for flagged genes
"""
from datetime import date, datetime
from typing import Any, List, Optional
import uuid

from pydantic import BaseModel, Field, field_validator


GENE_TYPE_PATTERN = r"^(recessive|dominant|codominant|incomplete_dominant)$"
WELFARE_FLAG_PATTERN = r"^(neurological|structural|viability)$"


class GeneBase(BaseModel):
    species_scientific_name: str = Field(..., min_length=1, max_length=255)
    common_name: str = Field(..., min_length=1, max_length=100)
    symbol: Optional[str] = Field(None, max_length=30)
    description: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=500)
    gene_type: str = Field(..., pattern=GENE_TYPE_PATTERN)

    welfare_flag: Optional[str] = Field(None, pattern=WELFARE_FLAG_PATTERN)
    welfare_notes: Optional[str] = None
    lethal_homozygous: bool = False
    welfare_citations: Optional[List[dict]] = None

    content_last_reviewed_at: Optional[date] = None

    @field_validator("species_scientific_name")
    @classmethod
    def strip_scientific_name(cls, v: str) -> str:
        return v.strip()

    @field_validator("common_name")
    @classmethod
    def strip_common_name(cls, v: str) -> str:
        return v.strip()


class GeneCreate(GeneBase):
    """Admin can pre-verify on create; regular users get is_verified=False."""
    is_verified: Optional[bool] = False


class GeneUpdate(BaseModel):
    """PATCH-style update — every field optional."""
    species_scientific_name: Optional[str] = Field(None, min_length=1, max_length=255)
    common_name: Optional[str] = Field(None, min_length=1, max_length=100)
    symbol: Optional[str] = Field(None, max_length=30)
    description: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=500)
    gene_type: Optional[str] = Field(None, pattern=GENE_TYPE_PATTERN)

    welfare_flag: Optional[str] = Field(None, pattern=WELFARE_FLAG_PATTERN)
    welfare_notes: Optional[str] = None
    lethal_homozygous: Optional[bool] = None
    welfare_citations: Optional[List[dict]] = None

    is_verified: Optional[bool] = None
    content_last_reviewed_at: Optional[date] = None


class GeneResponse(GeneBase):
    id: uuid.UUID
    is_verified: bool
    submitted_by: Optional[uuid.UUID] = None
    verified_by: Optional[uuid.UUID] = None
    verified_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GenePaginatedResponse(BaseModel):
    items: List[GeneResponse]
    total: int
    skip: int
    limit: int
    has_more: bool


class GeneWelfareSummary(BaseModel):
    """Compact response for the calculator UI — only what it needs to render
    a warning badge next to a predicted morph."""
    id: uuid.UUID
    common_name: str
    welfare_flag: Optional[str] = None
    lethal_homozygous: bool
    # Human-readable one-liner; caller pulls full notes + citations from the
    # detail endpoint only when the user expands the warning.
    summary: Optional[str] = None

    class Config:
        from_attributes = True
