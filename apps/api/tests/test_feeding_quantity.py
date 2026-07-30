"""`quantity` semantics differ between an individual animal and a colony.

For one tarantula, a feeding event is one prey item — omitting the count loses
nothing, and defaulting to 1 is correct. For a communal it isn't: "six crickets
into eleven spiders" is the record, and a silent 1 would be a number nobody
observed. So the field has to be able to say "not counted".

These tests pin that distinction at the schema boundary, which is where it was
broken before: `quantity: int = 1` rejected an explicit null with a 422, so the
colony form had no way to express an uncounted feeding.
"""
import uuid
from datetime import datetime, timezone

import pytest

from app.schemas.feeding import FeedingLogCreate, FeedingLogResponse


NOW = datetime.now(timezone.utc)


def test_omitting_quantity_still_defaults_to_one():
    """The individual-animal path. Every existing client omits the field and
    must keep getting 1 — this is the behaviour the widening must not change."""
    assert FeedingLogCreate(fed_at=NOW).quantity == 1


def test_explicit_null_is_preserved_as_unrecorded():
    """The colony path. Previously a 422."""
    assert FeedingLogCreate(fed_at=NOW, quantity=None).quantity is None


def test_explicit_count_is_preserved():
    assert FeedingLogCreate(fed_at=NOW, quantity=6).quantity == 6


def test_zero_and_negative_counts_are_rejected():
    """A feeding of zero prey isn't a feeding — it's either a refusal
    (accepted=False) or a non-event. Allowing 0 would let the two be conflated."""
    for bad in (0, -3):
        with pytest.raises(Exception):
            FeedingLogCreate(fed_at=NOW, quantity=bad)


def test_response_serializes_a_null_quantity():
    """A colony row with no count must not 500 the list endpoint. This is the
    failure mode the widening on the response side guards against."""
    resp = FeedingLogResponse(
        id=uuid.uuid4(),
        fed_at=NOW,
        quantity=None,
        accepted=True,
        colony_id=uuid.uuid4(),
        created_at=NOW,
    )
    assert resp.quantity is None
    assert resp.colony_id is not None


def test_response_exposes_colony_parent():
    """Clients distinguish a group log from an individual one by this field
    rather than by inferring it from which parent id happens to be absent."""
    assert "colony_id" in FeedingLogResponse.model_fields
