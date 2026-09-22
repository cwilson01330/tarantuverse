"""
A pairing must be correctable, for every taxon, without being corruptible.

WHAT WAS BROKEN
---------------
`PUT /pairings/{id}` validated `male_id`/`female_id` against `tarantulas` and
then wrote whatever it was handed. Three separate failures, all silent:

  1. A non-tarantula pairing could never be corrected. `PairingUpdate` had no
     invert fields, and the legacy ones are FKs into a table a mantis has no
     row in — so a jumping-spider pairing with the wrong female was permanent.

  2. Even for a tarantula it didn't work. `resolve_parents` prefers
     `male_invert_id`, so changing only the legacy column returned 200 and
     then kept rendering the OLD animal.

  3. Update enforced none of create's rules, so an edit could land a pairing
     in a state create would have refused outright — two males, mismatched
     taxa, an animal paired with itself.

The rules now live in `_validate_pair`, shared by both write paths, and both
foreign keys are written together by `_set_parent`. These tests pin that, with
plain objects rather than a database, because the rules are pure logic.
"""
import uuid

import pytest
from fastapi import HTTPException

from app.routers.pairings import _set_parent, _validate_pair


class FakeAnimal:
    """Enough of an `Invert` for the rules under test."""

    def __init__(self, taxon="tarantula", sex="unknown", species_id=None, id_=None):
        self.id = id_ or uuid.uuid4()
        self.taxon = taxon
        self.sex = sex
        self.species_id = species_id
        self.name = "Test"
        self.common_name = None
        self.scientific_name = None


class FakePairing:
    def __init__(self, **kw):
        self.male_id = kw.get("male_id")
        self.female_id = kw.get("female_id")
        self.male_invert_id = kw.get("male_invert_id")
        self.female_invert_id = kw.get("female_invert_id")


# ---------------------------------------------------------------------------
# Hard refusals — an edit must not reach a state create would reject
# ---------------------------------------------------------------------------

def test_an_animal_cannot_be_paired_with_itself():
    a = FakeAnimal()
    with pytest.raises(HTTPException) as e:
        _validate_pair(a, a)
    assert e.value.status_code == 400
    assert "itself" in e.value.detail


def test_parents_must_share_a_taxon():
    with pytest.raises(HTTPException) as e:
        _validate_pair(FakeAnimal(taxon="mantis"), FakeAnimal(taxon="tarantula"))
    assert e.value.status_code == 400
    assert "taxon" in e.value.detail


@pytest.mark.parametrize("sex", ["male", "female"])
def test_two_animals_of_the_same_known_sex_are_refused(sex):
    """Assert the SAME-SEX message specifically, not just any 400.

    The looser `assert sex in detail` this started as was worthless: the
    swapped-slots guard below fires on the same inputs and its message also
    contains both words, so deleting the same-sex check entirely left this
    test green.
    """
    with pytest.raises(HTTPException) as e:
        _validate_pair(FakeAnimal(sex=sex), FakeAnimal(sex=sex))
    assert e.value.status_code == 400
    assert "recorded as" in e.value.detail, (
        f"expected the same-sex refusal, got: {e.value.detail!r}"
    )
    assert sex in e.value.detail


def test_swapped_slots_are_refused():
    """A female in the male slot is a data-entry slip worth catching."""
    with pytest.raises(HTTPException) as e:
        _validate_pair(FakeAnimal(sex="female"), FakeAnimal(sex="male"))
    assert e.value.status_code == 400
    assert "swapped" in e.value.detail


# ---------------------------------------------------------------------------
# Evidence-first: `unknown` is missing information, never a third sex
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "male_sex,female_sex",
    [("unknown", "unknown"), ("unknown", "female"), ("male", "unknown")],
)
def test_unknown_sex_never_blocks_a_pairing(male_sex, female_sex):
    """Most animals are unsexed until maturity — refusing here would block the
    majority of legitimate pairings."""
    assert _validate_pair(
        FakeAnimal(sex=male_sex), FakeAnimal(sex=female_sex)
    ) == []


# ---------------------------------------------------------------------------
# Cross-species is a warning, not a refusal
# ---------------------------------------------------------------------------

def test_cross_species_warns_but_does_not_refuse():
    """This app records what a keeper did rather than licensing it. Someone
    logging a cross after the fact still has to be able to write it down."""
    warnings = _validate_pair(
        FakeAnimal(sex="male", species_id=uuid.uuid4()),
        FakeAnimal(sex="female", species_id=uuid.uuid4()),
    )
    assert len(warnings) == 1
    assert "different species" in warnings[0]


def test_same_species_produces_no_warning():
    sid = uuid.uuid4()
    assert _validate_pair(
        FakeAnimal(sex="male", species_id=sid),
        FakeAnimal(sex="female", species_id=sid),
    ) == []


def test_unlinked_species_produces_no_warning():
    """A null species_id is missing data, not evidence of a cross."""
    assert _validate_pair(
        FakeAnimal(sex="male"), FakeAnimal(sex="female", species_id=uuid.uuid4())
    ) == []


# ---------------------------------------------------------------------------
# Both foreign keys move together
# ---------------------------------------------------------------------------

def test_tarantula_parent_writes_both_columns():
    """They share a primary key, and the legacy column still feeds
    tarantula-side reads and lineage."""
    p, animal = FakePairing(), FakeAnimal(taxon="tarantula")
    _set_parent(p, "male", animal)
    assert p.male_invert_id == animal.id
    assert p.male_id == animal.id


@pytest.mark.parametrize("taxon", ["mantis", "true_spider", "scorpion", "isopod"])
def test_non_tarantula_parent_leaves_the_legacy_column_null(taxon):
    """`male_id` is a FK into `tarantulas`. A mantis has no row there, so
    writing its id would violate the constraint."""
    p, animal = FakePairing(), FakeAnimal(taxon=taxon)
    _set_parent(p, "male", animal)
    assert p.male_invert_id == animal.id
    assert p.male_id is None


def test_retargeting_a_tarantula_slot_to_another_taxon_clears_the_legacy_fk():
    """The stale-pointer case. Leaving the old tarantula id behind would make
    the record claim two different parents depending on which column you read."""
    old = FakeAnimal(taxon="tarantula")
    p = FakePairing(male_id=old.id, male_invert_id=old.id)

    new = FakeAnimal(taxon="mantis")
    _set_parent(p, "male", new)

    assert p.male_invert_id == new.id
    assert p.male_id is None, "legacy FK still points at the previous animal"


def test_each_slot_is_independent():
    p = FakePairing()
    male, female = FakeAnimal(), FakeAnimal()
    _set_parent(p, "male", male)
    assert p.female_invert_id is None and p.female_id is None
    _set_parent(p, "female", female)
    assert p.male_invert_id == male.id
    assert p.female_invert_id == female.id


# ---------------------------------------------------------------------------
# The write paths share the rules
# ---------------------------------------------------------------------------

def test_create_and_update_both_go_through_the_validator():
    """The bug wasn't a missing check, it was a check only one path ran.

    Asserted against the source because the invariant is "these two call the
    same thing" — a behavioural test would pass just as happily against two
    copies of the logic that have since drifted.
    """
    import inspect

    from app.routers import pairings

    for fn_name in ("create_invert_pairing", "update_pairing"):
        src = inspect.getsource(getattr(pairings, fn_name))
        assert "_validate_pair" in src, f"{fn_name} doesn't run the shared rules"


def test_update_accepts_invert_parents():
    """Without these fields a non-tarantula pairing is permanent."""
    from app.schemas.pairing import PairingUpdate

    for field in ("male_invert_id", "female_invert_id"):
        assert field in PairingUpdate.model_fields


def test_update_prefers_the_generic_field_over_the_legacy_one():
    """When both arrive, the one that works for every taxon wins."""
    import inspect

    from app.routers import pairings

    src = inspect.getsource(pairings.update_pairing)
    generic = src.index('f"{slot}_invert_id" in update_data')
    legacy = src.index('f"{slot}_id" in update_data')
    assert generic < legacy, "legacy field is checked first"


def test_update_never_writes_a_parent_column_directly_source():
    """Parent columns must go through `_set_parent`, which writes both.

    The original loop `setattr(pairing, field, value)` over every field is
    exactly how the legacy column got updated on its own while the invert FK
    kept pointing at the old animal.
    """
    import inspect

    from app.routers import pairings

    src = inspect.getsource(pairings.update_pairing)
    assert "parent_fields" in src and "continue" in src, (
        "parent columns are not excluded from the generic setattr loop"
    )


# ---------------------------------------------------------------------------
# The endpoint itself, driven against a fake session
# ---------------------------------------------------------------------------
#
# The assertions above are structural — they prove the right functions are
# called, not that the endpoint behaves. These run `update_pairing` for real.
# A fake session rather than Postgres because the logic under test is slot
# resolution and column writes, neither of which needs a database to be wrong.

import asyncio

from app.models.invert import Invert
from app.models.pairing import Pairing
from app.schemas.pairing import PairingUpdate


class FakeQuery:
    """Enough of `Query` for `.filter(...).first()`.

    Reads the id out of the filter expression rather than ignoring it, so
    "animal not found" is a real outcome and not something the fake papers
    over.
    """

    def __init__(self, rows):
        self._rows = rows
        self._wanted_id = None

    def filter(self, *conditions):
        for c in conditions:
            left = getattr(c, "left", None)
            right = getattr(c, "right", None)
            if getattr(left, "key", None) == "id" and hasattr(right, "value"):
                self._wanted_id = right.value
        return self

    def first(self):
        if self._wanted_id is None:
            return next(iter(self._rows.values()), None)
        return self._rows.get(self._wanted_id)


class FakeSession:
    def __init__(self, pairings_, inverts):
        self._by_model = {Pairing: pairings_, Invert: inverts}
        self.committed = False

    def query(self, model):
        return FakeQuery(self._by_model.get(model, {}))

    def commit(self):
        self.committed = True

    def refresh(self, _obj):
        pass


class FakeUser:
    def __init__(self):
        self.id = uuid.uuid4()


def _run_update(pairing, animals, payload, monkeypatch):
    """Call the real endpoint; return the pairing it wrote."""
    from app.routers import pairings as mod

    # attach_parents does its own querying and isn't what's under test.
    monkeypatch.setattr(mod, "attach_parents", lambda db, ps: list(ps))

    user = FakeUser()
    db = FakeSession({pairing.id: pairing}, {a.id: a for a in animals})
    return asyncio.run(
        mod.update_pairing(
            pairing_id=pairing.id,
            pairing_data=PairingUpdate(**payload),
            db=db,
            current_user=user,
        )
    )


def _pairing(male, female):
    p = Pairing()
    p.id = uuid.uuid4()
    p.male_invert_id = male.id
    p.female_invert_id = female.id
    p.male_id = male.id if male.taxon == "tarantula" else None
    p.female_id = female.id if female.taxon == "tarantula" else None
    return p


def test_a_mantis_pairing_can_finally_be_corrected(monkeypatch):
    """The headline fix: before this, there was no field that could name a
    non-tarantula parent, so a wrong one was permanent."""
    male = FakeAnimal(taxon="mantis", sex="male")
    female = FakeAnimal(taxon="mantis", sex="female")
    right_female = FakeAnimal(taxon="mantis", sex="female")
    p = _pairing(male, female)

    out = _run_update(
        p, [male, female, right_female],
        {"female_invert_id": right_female.id}, monkeypatch,
    )

    assert out.female_invert_id == right_female.id
    assert out.female_id is None, "a mantis must not be written to the tarantula FK"
    assert out.male_invert_id == male.id, "the untouched slot moved"


def test_legacy_field_update_moves_the_invert_fk_too(monkeypatch):
    """The silent one. `resolve_parents` prefers `male_invert_id`, so an edit
    that changed only the legacy column returned 200 and kept showing the old
    animal."""
    male = FakeAnimal(taxon="tarantula", sex="male")
    female = FakeAnimal(taxon="tarantula", sex="female")
    new_male = FakeAnimal(taxon="tarantula", sex="male")
    p = _pairing(male, female)

    out = _run_update(
        p, [male, female, new_male], {"male_id": new_male.id}, monkeypatch,
    )

    assert out.male_id == new_male.id
    assert out.male_invert_id == new_male.id, (
        "invert FK left pointing at the previous animal — the read path "
        "prefers it, so the UI would still show the old parent"
    )


def test_changing_one_slot_is_checked_against_the_other(monkeypatch):
    """Swapping only the male still has to be validated against the female
    already on the record."""
    male = FakeAnimal(taxon="tarantula", sex="male")
    female = FakeAnimal(taxon="tarantula", sex="female")
    another_female = FakeAnimal(taxon="tarantula", sex="female")
    p = _pairing(male, female)

    with pytest.raises(HTTPException) as e:
        _run_update(
            p, [male, female, another_female],
            {"male_invert_id": another_female.id}, monkeypatch,
        )
    assert e.value.status_code == 400


def test_cannot_retarget_across_taxa(monkeypatch):
    male = FakeAnimal(taxon="tarantula", sex="male")
    female = FakeAnimal(taxon="tarantula", sex="female")
    mantis = FakeAnimal(taxon="mantis", sex="female")
    p = _pairing(male, female)

    with pytest.raises(HTTPException) as e:
        _run_update(
            p, [male, female, mantis],
            {"female_invert_id": mantis.id}, monkeypatch,
        )
    assert "taxon" in e.value.detail


def test_unknown_animal_is_rejected(monkeypatch):
    male = FakeAnimal(taxon="tarantula", sex="male")
    female = FakeAnimal(taxon="tarantula", sex="female")
    p = _pairing(male, female)

    with pytest.raises(HTTPException) as e:
        _run_update(
            p, [male, female], {"male_invert_id": uuid.uuid4()}, monkeypatch,
        )
    assert e.value.status_code == 404


def test_scalar_only_update_leaves_parents_alone(monkeypatch):
    """Editing the outcome is the common case and must not touch the FKs."""
    from app.models.pairing import PairingOutcome

    male = FakeAnimal(taxon="mantis", sex="male")
    female = FakeAnimal(taxon="mantis", sex="female")
    p = _pairing(male, female)

    out = _run_update(
        p, [male, female], {"outcome": PairingOutcome.SUCCESSFUL}, monkeypatch,
    )

    assert out.male_invert_id == male.id
    assert out.female_invert_id == female.id
    assert out.male_id is None and out.female_id is None
    assert out.outcome == PairingOutcome.SUCCESSFUL


def test_scalar_update_survives_a_deleted_parent(monkeypatch):
    """A keeper whose animal died and was removed must still be able to close
    out the pairing. Only parent edits need both sides resolvable."""
    from app.models.pairing import PairingOutcome

    male = FakeAnimal(taxon="mantis", sex="male")
    female = FakeAnimal(taxon="mantis", sex="female")
    p = _pairing(male, female)

    out = _run_update(
        p, [male],  # female no longer exists
        {"outcome": PairingOutcome.UNSUCCESSFUL}, monkeypatch,
    )
    assert out.outcome == PairingOutcome.UNSUCCESSFUL
