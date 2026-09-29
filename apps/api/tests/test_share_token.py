"""Render tokens are the only credential for drawing a card of a private
animal, so tampering and expiry must both fail closed."""
from app.utils.share_token import sign_render_token, verify_render_token

P = {"app": "tarantuverse", "kind": "profile", "animal_id": "a1", "fields": ["name"], "shape": "story"}


def test_round_trip():
    t = sign_render_token(P, now=1000.0)
    assert verify_render_token(t, now=1001.0)["animal_id"] == "a1"


def test_expired():
    t = sign_render_token(P, ttl_seconds=900, now=1000.0)
    assert verify_render_token(t, now=1901.0) is None


def test_tampered_payload():
    t = sign_render_token(P, now=1000.0)
    body, sig = t.split(".")
    other = sign_render_token({**P, "animal_id": "someone-else"}, now=1000.0).split(".")[0]
    assert verify_render_token(f"{other}.{sig}", now=1001.0) is None


def test_garbage():
    for bad in ("", "abc", "a.b.c", "!!!.???"):
        assert verify_render_token(bad, now=1001.0) is None
