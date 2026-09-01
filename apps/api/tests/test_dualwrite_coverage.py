"""Every shared column must be accounted for in BOTH mirror directions.

WHY THIS FILE EXISTS
--------------------
Four bugs in three days, all the same shape: a column or a field exists on both
sides of the dual-write pair, and one direction doesn't know about it.

  1. `TarantulaResponse` had no died_at/death_cause/death_notes — a write the
     legacy surface could make but never read back.
  2. photos.py mirrored photo_url legacy→invert only, so a hero set through the
     generic route never reached the collection card.
  3. `mirror_tarantula_update` applied the whole kwargs dict, hardcoded
     `species_id: None` included, silently wiping the backfilled species link on
     every legacy edit.
  4. `ScorpionResponse` repeated bug 1 for the other taxon.

Every one was found by a keeper or by reading code. None had to be: they are all
mechanically detectable as a set difference between the model columns and the
hand-maintained field lists.

These tests are that set difference. They fail when someone adds a column to
both tables and updates only one map — which is the exact moment the next one of
these gets introduced, rather than weeks later when a keeper notices.

WHEN A TEST HERE FAILS
----------------------
Don't add the column to the ignore set to make it pass. Either add it to the
mirror list, or add it to the exclusion tuple below WITH a comment saying why
the two sides legitimately disagree. The exclusion sets are the documentation.
"""
import pytest

from app.models.invert import Invert
from app.models.scorpion import Scorpion
from app.models.tarantula import Tarantula
from app.services.inverts_dualwrite import (
    _IMMUTABLE,
    _INVERT_OWNED_SCORPION,
    _INVERT_OWNED_TARANTULA,
    _REVERSE_SHARED_FIELDS,
    _scorpion_to_invert_kwargs,
    _tarantula_to_invert_kwargs,
)


def _cols(model) -> set:
    return {c.key for c in model.__table__.columns}


# Columns that exist on both tables but are deliberately NOT copied, with the
# reason. Anything here is a decision; anything not here is a bug.
_LEGITIMATELY_UNMIRRORED = {
    # Server-managed. Copying them would falsify the audit trail.
    "created_at",
    "updated_at",
    # Immutable identity.
    *_IMMUTABLE,
}

# `species_id` is deliberately NOT listed above. It is asymmetric, and the
# tests below encode that asymmetry explicitly rather than blanket-excusing it:
#
#   forward (legacy -> inverts)  MUST NOT copy it. The legacy PUT sends the
#     whole row, and copying species_id wiped 22 keepers' backfilled links.
#   reverse (inverts -> legacy)  MUST copy it, via _legacy_species_id()'s FK
#     guard. Omitting it left a corrected species on `inverts` while the legacy
#     row — which the web tarantula page reads — kept the old one. Found
#     2026-09-01 on a live Avicularia avicularia still linked to Grammostola
#     pulchra.
#
# It previously sat in the exclusion set on the grounds that the catalogs are
# separate. They share primary keys (Phase B preserved them), so that reasoning
# was wrong in the reverse direction and this test blessed a real bug.


def _shared(legacy_model) -> set:
    """Columns present on both the legacy table and `inverts`."""
    return (_cols(legacy_model) & _cols(Invert)) - _LEGITIMATELY_UNMIRRORED


# ── Forward: legacy → inverts ────────────────────────────────────────────────

@pytest.mark.parametrize(
    "model,builder",
    [(Tarantula, _tarantula_to_invert_kwargs), (Scorpion, _scorpion_to_invert_kwargs)],
    ids=["tarantula", "scorpion"],
)
def test_forward_map_covers_every_shared_column(model, builder):
    """A shared column missing from the forward map never reaches `inverts` at
    all — the generic detail screen shows a blank where the legacy page shows a
    value."""
    # The builders read attributes off a real instance; an empty one is enough
    # to enumerate the keys, which is all this test is about.
    mapped = set(builder(model()).keys())
    # species_id is invert-owned: the forward mirror must leave it alone, or a
    # legacy PUT wipes the link. _INVERT_OWNED_* enforces that at runtime.
    missing = _shared(model) - mapped - {"species_id"}
    assert not missing, (
        f"{model.__name__} columns missing from the forward mirror: {sorted(missing)}. "
        "Add them to the kwargs builder, or to _LEGITIMATELY_UNMIRRORED with a reason."
    )


# ── Reverse: inverts → legacy ────────────────────────────────────────────────

@pytest.mark.parametrize("model", [Tarantula, Scorpion], ids=["tarantula", "scorpion"])
def test_reverse_map_covers_every_shared_column(model):
    """A shared column missing from the reverse map goes stale on the legacy
    row — which is what the web collection reads. This is the direction that
    produced the renamed-communal report and the hero photo bug."""
    # life_stage and enclosure_type are copied by a separate guarded branch in
    # mirror_invert_update_to_legacy (SQLEnum vs CHECK-string type mismatch), so
    # they're covered even though they're absent from the plain field tuple.
    # species_id, life_stage and enclosure_type are each copied by a separate
    # guarded branch in mirror_invert_update_to_legacy rather than the plain
    # field tuple — species_id because it needs the catalog FK existence check.
    handled = set(_REVERSE_SHARED_FIELDS) | {
        "life_stage",
        "enclosure_type",
        "species_id",
    }
    missing = _shared(model) - handled
    assert not missing, (
        f"{model.__name__} columns missing from _REVERSE_SHARED_FIELDS: {sorted(missing)}. "
        "An edit made on the generic surface will not reach the legacy row."
    )


# ── The update-clobber guard ─────────────────────────────────────────────────

@pytest.mark.parametrize(
    "builder,model,owned",
    [
        (_tarantula_to_invert_kwargs, Tarantula, _INVERT_OWNED_TARANTULA),
        (_scorpion_to_invert_kwargs, Scorpion, _INVERT_OWNED_SCORPION),
    ],
    ids=["tarantula", "scorpion"],
)
def test_hardcoded_nulls_are_excluded_from_updates(builder, model, owned):
    """THE REGRESSION TEST for bug 3.

    Any key the builder hardcodes to None regardless of the source row is the
    legacy side saying "I have nothing to say about this". That's fine on
    INSERT. On UPDATE it overwrites a value the invert side owns — which is how
    every `PUT /tarantulas/{id}` came to wipe `inverts.species_id`.

    Detected structurally: build kwargs from a row with the attribute set to a
    sentinel, and see whether the sentinel survives. If it doesn't, the key is
    hardcoded and must be in the owned set.
    """
    for key in ("species_id", "colony_id", "life_stage"):
        if key not in _cols(model):
            continue  # not a column on this legacy table at all
        row = model()
        setattr(row, key, "SENTINEL")
        if builder(row).get(key) != "SENTINEL":
            assert key in owned, (
                f"{builder.__name__} hardcodes {key!r} rather than reading it from the "
                f"row, so applying the full dict on update would null it. "
                f"Add {key!r} to the owned set for this taxon."
            )


def test_owned_sets_do_not_hide_real_columns():
    """The inverse failure: excluding a column the legacy row DOES populate
    would silently stop propagating real edits. Anything in an owned set must
    genuinely be hardcoded by its builder."""
    for builder, model, owned in (
        (_tarantula_to_invert_kwargs, Tarantula, _INVERT_OWNED_TARANTULA),
        (_scorpion_to_invert_kwargs, Scorpion, _INVERT_OWNED_SCORPION),
    ):
        for key in owned:
            if key not in _cols(model):
                continue
            row = model()
            setattr(row, key, "SENTINEL")
            assert builder(row).get(key) != "SENTINEL", (
                f"{key!r} is excluded from {model.__name__} updates but the builder "
                f"reads it from the row — real edits to it would stop propagating."
            )


# ── Response schema symmetry ─────────────────────────────────────────────────

# ── The create mirror (transfer claims, CSV imports) ─────────────────────────

class _FakeQuery:
    def __init__(self, result):
        self._result = result

    def filter(self, *_criteria):
        return self

    def first(self):
        return self._result


class _FakeSession:
    """Records what got added; returns a fixed lookup result."""

    def __init__(self, lookup=None):
        self.lookup = lookup
        self.added = []

    def query(self, *_args):
        return _FakeQuery(self.lookup)

    def add(self, obj):
        self.added.append(obj)


def test_create_mirror_noops_for_invert_native_taxa():
    """Centipedes, mantises and everything added after the per-taxon tables
    stopped being written have no legacy table. The mirror must not invent one."""
    from app.services.inverts_dualwrite import mirror_invert_create_to_legacy

    db = _FakeSession()
    mirror_invert_create_to_legacy(db, Invert(id="x", taxon="centipede"))
    assert db.added == []


def test_create_mirror_is_idempotent():
    """Called from a path that may already have gone through a legacy create,
    so a second call must not produce a duplicate row."""
    from app.services.inverts_dualwrite import mirror_invert_create_to_legacy

    db = _FakeSession(lookup=("already-there",))
    mirror_invert_create_to_legacy(db, Invert(id="x", taxon="tarantula"))
    assert db.added == []


def test_legacy_species_id_is_dropped_when_the_catalog_row_is_absent():
    """THE FK GUARD. The catalogs share ids for mirrored species, so the value
    can be copied — but a species created natively on `invert_species` has no
    legacy counterpart, and copying it blindly would raise a foreign key
    violation and fail the whole claim or import."""
    from app.services.inverts_dualwrite import _legacy_species_id

    invert = Invert(id="x", taxon="tarantula", species_id="sp-1")

    assert _legacy_species_id(_FakeSession(lookup=None), invert) is None
    assert _legacy_species_id(_FakeSession(lookup=("sp-1",)), invert) == "sp-1"


def test_species_reverse_mirror_only_touches_shared_columns():
    """Derived from the model intersection, so it can never try to write an
    invert-only column (slug, taxon, venom_severity …) onto a legacy catalog
    row — which would fail on flush."""
    from app.models.scorpion_species import ScorpionSpecies
    from app.models.species import Species
    from app.services.inverts_dualwrite import _species_reverse_fields

    from app.models.invert_species import InvertSpecies

    invert_cols = {c.key for c in InvertSpecies.__table__.columns}
    for legacy in (Species, ScorpionSpecies):
        legacy_cols = {c.key for c in legacy.__table__.columns}
        fields = set(_species_reverse_fields(legacy))
        assert fields <= legacy_cols, f"{legacy.__name__}: would write a column it lacks"
        assert fields <= invert_cols, f"{legacy.__name__}: would read a column invert_species lacks"
        assert fields, "mirror would be a no-op"


def test_death_columns_are_readable_on_every_surface():
    """Bugs 1 and 4. A surface that can WRITE a death via the shared id must be
    able to READ it back, or the animal reports as alive on that surface."""
    from app.schemas.invert import InvertResponse
    from app.schemas.scorpion import ScorpionResponse
    from app.schemas.tarantula import TarantulaResponse

    for schema in (TarantulaResponse, ScorpionResponse, InvertResponse):
        fields = set(schema.model_fields)
        missing = {"died_at", "death_cause", "death_notes"} - fields
        assert not missing, (
            f"{schema.__name__} cannot read back {sorted(missing)}. "
            "POST /inverts/{id}/died writes both rows; this surface would show "
            "a dead animal as alive."
        )


def test_reverse_update_carries_species_id_to_the_legacy_row():
    """A species corrected on the generic invert screen must reach the legacy
    row, because the web tarantula detail page reads it.

    Regression for 2026-09-01: `species_id` was excluded from
    _REVERSE_SHARED_FIELDS, so `mirror_invert_update_to_legacy` left the legacy
    link untouched. A live Avicularia avicularia kept a Grammostola pulchra
    link on the legacy row — arboreal New World animal showing terrestrial
    husbandry on web.

    Asserted against the function source rather than a live session so it runs
    without a database, matching the other structural checks in this file.
    """
    import inspect
    from app.services.inverts_dualwrite import mirror_invert_update_to_legacy

    src = inspect.getsource(mirror_invert_update_to_legacy)
    assert "species_id" in src, (
        "mirror_invert_update_to_legacy no longer touches species_id. A species "
        "change made on the invert surface will not reach the legacy row, and "
        "the web tarantula page will keep showing the previous species."
    )
    assert "_legacy_species_id" in src, (
        "species_id must go through _legacy_species_id() so a species that "
        "exists only on the unified catalog clears the link instead of writing "
        "a dangling foreign key."
    )
