"""
Breeding has to work for animals that aren't tarantulas (2026-09-20).

The breeding tables were built tarantula-first: `pairings.male_id` points at
`tarantulas`, `offspring.tarantula_id` likewise, and the columns are named
`egg_sacs` and `spiderling_count`. Non-tarantula support was added underneath
(ADR-010) but three things never followed:

  1. Reads returned bare ids, so every client resolved names by fetching the
     whole tarantula list. `male_id` is NULL for an invert, so the lookup missed
     and the parent rendered blank — a pairing with no animals in it.
  2. `offspring.invert_id` existed on the RESPONSE only. A kept jumping spider
     sling could not be linked to its record at all.
  3. The export field lists omitted every invert column, so a non-tarantula
     pairing exported with its parentage silently blank.

None of those raise. They just quietly lose the keeper's data, which is why
they're pinned here rather than left to a manual pass.

Asserted against source and schema rather than a live database, matching
test_retaxon_ordering — these are structural facts, and the invariants worth
protecting are "this field is accepted" and "this column is exported", both of
which a refactor can drop without failing anything else.
"""
import inspect

import pytest

from app.models.egg_sac import EggSac
from app.models.offspring import Offspring
from app.models.pairing import Pairing
from app.routers import offspring as offspring_router
from app.routers import pairings as pairings_router
from app.schemas.offspring import OffspringCreate, OffspringUpdate
from app.schemas.pairing import PairingParent, PairingResponse
from app.services import breeding_service
from app.services.export_service import (
    EGG_SAC_FIELDS,
    OFFSPRING_FIELDS,
    PAIRING_FIELDS,
)


# ── 1. Parents resolve for every taxon, not just tarantulas ────────────────

def test_pairing_response_carries_resolved_parents():
    """Without these, each client re-invents the tarantula-map hack and each
    copy is blank for non-tarantulas."""
    assert "male_parent" in PairingResponse.model_fields
    assert "female_parent" in PairingResponse.model_fields


def test_resolved_parent_includes_what_a_hub_row_needs():
    """display_name is computed server-side so four surfaces can't disagree
    about what to call an unnamed animal; taxon rides along so the client can
    pick its breeding vocabulary without a second request."""
    for field in ("id", "display_name", "scientific_name", "sex", "taxon", "photo_url"):
        assert field in PairingParent.model_fields, field


def test_parents_are_never_assigned_over_the_mapped_relationships():
    """`male` and `female` are real SQLAlchemy relationships to Tarantula
    (models/pairing.py). Assigning a dict over one dirties the instance and the
    next flush tries to persist it, so the resolved values must use different
    names."""
    src = inspect.getsource(breeding_service.attach_parents)
    # The setattr TARGET is what matters. `pair.get("male")` is just the dict
    # key coming back from resolve_parents and is fine.
    assert 'setattr(p, "male_parent"' in src
    assert 'setattr(p, "female_parent"' in src
    assert 'setattr(p, "male"' not in src
    assert 'setattr(p, "female"' not in src

    mapped = set(Pairing.__mapper__.relationships.keys())
    assert "male" in mapped and "female" in mapped, "test premise changed"
    assert "male_parent" not in mapped and "female_parent" not in mapped


def test_resolution_prefers_the_invert_row_over_the_legacy_mirror():
    """Under dual-write a tarantula has both FKs set and the inverts row is
    canonical. Chasing the legacy table first would give a tarantula a
    different name source from every other taxon."""
    src = inspect.getsource(breeding_service.resolve_parents)
    assert src.index("invert_fk and invert_fk in inverts") < src.index(
        "legacy_fk and legacy_fk in tarantulas"
    )


def test_resolution_is_batched():
    """The per-row version was an N+1 that got worse with every pairing a
    breeder recorded. Two queries total, regardless of input size."""
    src = inspect.getsource(breeding_service.resolve_parents)
    assert src.count(".in_(") == 2


def test_every_pairing_read_path_resolves_parents():
    """A path that skips attach_parents is a screen that renders blank. There
    are five: list, get, invert-scoped list, tarantula-scoped list, and update —
    plus the two creates."""
    src = inspect.getsource(pairings_router)
    assert src.count("attach_parents(") >= 7


# ── 2. A kept non-tarantula offspring can be linked ────────────────────────

def test_offspring_create_accepts_an_invert():
    """The single break in the chain: passing a jumper's id as tarantula_id
    404s, because a non-tarantula has no row in that table."""
    assert "invert_id" in OffspringCreate.model_fields
    assert "invert_id" in OffspringUpdate.model_fields


def test_the_kept_link_is_validated_in_one_place():
    """Create and update both validated against Tarantula before, which is how
    they drifted into the same bug twice. One helper, two callers."""
    src = inspect.getsource(offspring_router)
    assert src.count("_resolve_kept_link(") >= 3  # definition + create + update


def test_a_non_tarantula_never_gets_written_to_the_legacy_column():
    """tarantula_id is an FK to `tarantulas`. Writing a jumper's id there would
    violate it — the mirror is only valid because tarantulas share a primary key
    with their inverts row."""
    src = inspect.getsource(offspring_router._resolve_kept_link)
    assert 'animal.taxon == "tarantula"' in src


def test_bulk_create_has_no_kept_link():
    """N identical rows can't each point at a different animal, and pointing
    them all at one would be false."""
    from app.schemas.offspring import OffspringBulkCreate

    assert "invert_id" not in OffspringBulkCreate.model_fields
    assert "tarantula_id" not in OffspringBulkCreate.model_fields


# ── 3. The export keeps parentage for every taxon ──────────────────────────

@pytest.mark.parametrize(
    "fields,model,name",
    [
        (PAIRING_FIELDS, Pairing, "PAIRING_FIELDS"),
        (EGG_SAC_FIELDS, EggSac, "EGG_SAC_FIELDS"),
        (OFFSPRING_FIELDS, Offspring, "OFFSPRING_FIELDS"),
    ],
)
def test_export_covers_every_column(fields, model, name):
    """A GDPR export that silently drops a column is a correctness problem, not
    a cosmetic one. Asserting completeness rather than a hand-written list means
    a future column can't be forgotten."""
    columns = {c.name for c in model.__table__.columns}
    missing = columns - set(fields)
    assert not missing, f"{name} omits real columns: {sorted(missing)}"
    invalid = set(fields) - columns
    assert not invalid, f"{name} names non-existent columns: {sorted(invalid)}"


def test_export_keeps_the_invert_parent_refs_specifically():
    """Named explicitly because these are the ONLY parent reference a
    non-tarantula pairing has."""
    assert "male_invert_id" in PAIRING_FIELDS
    assert "female_invert_id" in PAIRING_FIELDS
    assert "invert_id" in OFFSPRING_FIELDS


# ── 4. Guards refuse what's wrong, not what's merely unknown ───────────────

def test_same_sex_is_refused_but_unknown_is_not():
    """'unknown' is the default and stays common until maturity. Treating it as
    a mismatch would block most legitimate pairings."""
    src = inspect.getsource(pairings_router.create_invert_pairing)
    assert "male_sex and female_sex and male_sex == female_sex" in src

    sex_of = inspect.getsource(pairings_router._sex_of)
    assert 'lowered if lowered in ("male", "female") else None' in sex_of


def test_sex_comparison_is_case_insensitive():
    """The column is a plain VARCHAR holding UPPERCASE enum names in
    production. A case-sensitive check silently never matches — which is
    exactly the bug the clients had."""
    assert ".lower()" in inspect.getsource(pairings_router._sex_of)


def test_a_cross_species_pairing_warns_rather_than_refuses():
    """This app records what a keeper did rather than licensing it. Someone
    logging a cross after the fact still needs to write it down, and blocking
    would also punish the common case of an unlinked species."""
    src = inspect.getsource(pairings_router.create_invert_pairing)
    assert "warnings.append(" in src

    warn_at = src.index("warnings.append(")
    # Everything before the warning may raise; the species block itself must not.
    species_block = src[src.index("male.species_id is not None") : warn_at]
    assert "HTTPException" not in species_block

    assert "warnings" in PairingResponse.model_fields
