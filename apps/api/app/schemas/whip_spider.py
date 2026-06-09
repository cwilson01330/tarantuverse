"""Whip spider (Amblypygi) schemas — ADR-006 taxon #1.

Whip spiders live exclusively on the unified `inverts` table with
`taxon='whip_spider'` (the centipede pattern — no legacy table, no
dual-write). Narrow Create/Update schemas reuse the wide InvertBase and
force the taxon server-side so clients don't send it on every request.

Note: many amblypygids (e.g. Damon, Phrynus) are genuinely communal,
unlike centipedes. Communal grouping (colony_id) is deferred for v1 —
the column is shared with the scorpion colony system and wiring a
whip-spider colony surface is its own piece of work. Until then, each
whip spider is an individual record.
"""
from typing import Optional
import uuid

from pydantic import ConfigDict

from app.schemas.invert import InvertBase, InvertResponse


class WhipSpiderCreate(InvertBase):
    """Create payload for /whip-spiders/. Taxon is omitted — the router
    forces it to 'whip_spider'. Species link is optional; FK validation
    runs server-side."""
    species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None


class WhipSpiderUpdate(InvertBase):
    """Partial update. `taxon` is immutable, so it's omitted."""
    species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None


class WhipSpiderResponse(InvertResponse):
    """Identical shape to InvertResponse — a distinct alias so OpenAPI
    consumers see a whip-spider-tagged response model."""
    model_config = ConfigDict(from_attributes=True)
