"""Centipede schemas — Phase C2 of ADR-005.

Centipedes don't have a legacy per-taxon table; they live exclusively
on the unified `inverts` table with `taxon='centipede'`. To keep the
client payload tight (no need to send `taxon='centipede'` on every
request), we define narrow CentipedeCreate / CentipedeUpdate schemas
that reuse the wide InvertBase but force the taxon server-side.

The response schema is the same shape as InvertResponse, so a centipede
detail screen can share rendering logic with the unified species
browser if it wants — both deserialize through the same fields.
"""
from typing import Optional
import uuid

from pydantic import ConfigDict

from app.schemas.invert import InvertBase, InvertResponse


class CentipedeCreate(InvertBase):
    """Create payload for /centipedes/. Taxon is omitted — the router
    forces it to 'centipede' regardless of body content. Species link
    is optional; FK validation runs server-side."""
    species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None
    # colony_id is intentionally NOT exposed for centipedes — they're
    # solitary (cannibalistic). The DB column is shared with scorpions
    # but the centipede API doesn't acknowledge it.


class CentipedeUpdate(InvertBase):
    """Partial update. Same caveats as InvertUpdate — `taxon` is
    immutable, so it's omitted from the schema."""
    species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None


class CentipedeResponse(InvertResponse):
    """Identical shape to InvertResponse — kept as a distinct alias
    so OpenAPI consumers see a centipede-tagged response model."""
    model_config = ConfigDict(from_attributes=True)
