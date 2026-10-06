"""Editing or deleting a colony event keeps stage_counts in step (audit A5).

Exercised on the helpers with plain objects; update/delete routes compose
_reverse_delta + _apply_delta exactly as create composes _apply_delta.
"""
from types import SimpleNamespace

from app.routers.colonies import _apply_delta, _reverse_delta


def colony(**counts):
    return SimpleNamespace(stage_counts=dict(counts))


def test_delete_reverses_the_delta():
    c = colony(adults=10)
    _apply_delta(c, "adults", 5)
    assert c.stage_counts == {"adults": 15}
    assert _reverse_delta(c, "adults", 5) is False
    assert c.stage_counts == {"adults": 10}


def test_delete_of_a_negative_delta_restores_the_count():
    c = colony(adults=7)
    _reverse_delta(c, "adults", -3)
    assert c.stage_counts == {"adults": 10}


def test_update_with_changed_delta():
    c = colony(adults=15)  # 10 + event of +5
    _reverse_delta(c, "adults", 5)
    _apply_delta(c, "adults", 8)
    assert c.stage_counts == {"adults": 18}


def test_update_with_changed_stage_moves_between_buckets():
    c = colony(adults=15, mancae=2)
    _reverse_delta(c, "adults", 5)
    _apply_delta(c, "mancae", 5)
    assert c.stage_counts == {"adults": 10, "mancae": 7}


def test_missing_stage_maps_to_mixed():
    c = colony(mixed=12)
    _reverse_delta(c, None, 4)
    assert c.stage_counts == {"mixed": 8}


def test_reverse_clamps_at_zero_and_reports_it():
    c = colony(adults=2)
    assert _reverse_delta(c, "adults", 5) is True
    assert c.stage_counts == {"adults": 0}


def test_no_delta_is_a_no_op():
    c = colony(adults=3)
    assert _reverse_delta(c, "adults", None) is False
    assert c.stage_counts == {"adults": 3}
