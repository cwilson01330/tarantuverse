"""
`/i/{id}` — the public profile every non-tarantula QR code points at.

WHY IT EXISTS
-------------
`/t/{id}` reads the legacy `tarantulas` table, so it 404s for a mantis,
jumper or isopod. Mobile's QRSheet had a `resource` prop and was generating
enclosure labels for every taxon — and pointing all of them at `/t/{id}`. A
keeper could print a label, stick it on a mantis tub, scan it, and get an
error from the one page whose entire job is to say what's in the enclosure.

A printed label outlives the deploy that made it, so the things pinned here
are the ones that can't be fixed after the fact: which table it reads, and
that a private collection still can't be read by strangers.
"""
import inspect

from app.routers import qr as qr_router


def _source() -> str:
    return inspect.getsource(qr_router.get_public_invert_profile)


def test_the_route_is_registered():
    from app.main import app

    paths = {r.path for r in app.routes}
    assert "/api/v1/i/{invert_id}" in paths


def test_it_reads_the_unified_table_not_the_legacy_one():
    """The whole point. Querying `Tarantula` here would reproduce the 404
    this endpoint was added to fix."""
    src = _source()
    assert "query(Invert)" in src
    assert "query(Tarantula)" not in src


def test_logs_are_matched_on_invert_id():
    """A mantis's feeding logs carry `invert_id` and nothing else — matching
    on `tarantula_id` would render an empty history for an animal with one."""
    src = _source()
    assert "FeedingLog.invert_id" in src
    assert "MoltLog.invert_id" in src
    assert "Photo.invert_id" in src
    assert "FeedingLog.tarantula_id" not in src


def test_a_private_collection_is_refused():
    """Same rule as /t/{id}. This endpoint is unauthenticated by design, so
    the visibility check is the only thing standing between a stranger with a
    UUID and someone's collection."""
    src = _source()
    assert 'collection_visibility == "public"' in src
    assert "403" in src


def test_refused_feedings_do_not_reset_last_fed():
    """An offer the animal turned down isn't a meal. The tarantula profile
    has always filtered these out; a copy that forgot would quietly report a
    premolt animal as recently fed."""
    assert "accepted.is_(True)" in _source()


def test_husbandry_and_notes_are_owner_only():
    """Everything inside the `is_owner` branch is private. A keeper's notes
    are not public because they scanned their own label."""
    src = _source()
    owner_at = src.index("if is_owner:")
    private = src[owner_at:]
    for field in ("husbandry", "notes", "date_acquired", "source"):
        assert f'"{field}"' in private, f"{field} is not owner-gated"
    # And must not also appear in the public payload above it.
    public = src[:owner_at]
    assert '"notes"' not in public


def test_the_public_payload_carries_the_taxon():
    """The page picks its vocabulary and its 'open in my collection' target
    from this — without it, every animal renders as a generic invert."""
    src = _source()
    assert '"taxon": invert.taxon' in src


def test_species_block_uses_the_cross_taxon_safety_fields():
    """`urticating_hairs` is a tarantula fact. A millipede's hazard is a
    chemical secretion, and a roach's is that it flies out of the tub."""
    src = _source()
    assert "InvertSpecies" in src
    for field in ("venom_severity", "defensive_secretion", "can_fly", "can_climb_smooth"):
        assert field in src, f"{field} missing from the public species block"


def test_the_provenance_snapshot_this_endpoint_publishes_carries_no_sale_price():
    """`provenance` is returned to anonymous viewers here.

    That's only safe because `_build_snapshot` never puts a price in it —
    BRIEF-animal-transfer-provenance §1: "sale_price is a PRIVATE seller
    ledger, never returned to the buyer." This asserts against the builder
    rather than against this endpoint, because the builder is where the
    guarantee actually lives: adding a price there would leak it through
    every public profile without touching a line of this file.
    """
    from app.routers import transfers

    src = inspect.getsource(transfers._build_snapshot)
    # Strip comments and docstrings — a mention in prose isn't a leak.
    code = "\n".join(
        line for line in src.splitlines() if not line.lstrip().startswith("#")
    )
    assert '"sale_price"' not in code
    assert "sale_price=" not in code
