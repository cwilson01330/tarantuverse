"""POST /animals/{id}/change-taxon — HV keepers can fix a mis-filed taxon
(audit-2 M10, 2026-10-09).

Before this the only fix was delete, which takes every pairing the animal is
a parent in, with their clutches and offspring. These tests pin the rules the
route documents:

  - history is untouched: nothing is deleted, nothing is re-pointed
  - a picked species must belong to the new taxon; an old-group link is
    cleared when none is picked
  - feeds_on_cgd_override resets to inherit
  - pairings are never deleted; their denormalized taxon follows only when
    both parents now share it
  - keeper role (as PUT /animals/{id}); a stranger gets 404, a viewer 403
  - same taxon is a 400; an unknown taxon fails validation
  - died / transferred animals are NOT refused (TV parity)

Fake-DB style, like test_hv_audit2_animals.
"""
from __future__ import annotations

import asyncio
import inspect
import uuid
from datetime import date
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models.animal import ANIMAL_TAXON_VALUES, Animal
from app.models.collection_member import CollectionMember
from app.models.reptile_pairing import ReptilePairing
from app.models.reptile_species import ReptileSpecies
from app.routers import animals as ar
from app.schemas.animal import AnimalUpdate, ChangeAnimalTaxonRequest


# ── fakes ────────────────────────────────────────────────────────────────────

class Q:
    def __init__(self, first=None, all_=None):
        self._first, self._all = first, list(all_ or [])

    def filter(self, *a, **k):
        return self

    def options(self, *a):
        return self

    def first(self):
        return self._first

    def all(self):
        return list(self._all)


class DB:
    """Canned results per model. Records every query and delete so a test can
    prove nothing was removed or re-pointed."""

    def __init__(self, by_model=None):
        self.by_model = by_model or {}
        self.commits = 0
        self.deleted = []
        self.queried = []

    def query(self, model, *_):
        key = getattr(model, "class_", model)
        self.queried.append(key)
        return self.by_model.get(key, Q())

    def delete(self, obj):
        self.deleted.append(obj)

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        pass


def run(fn, **kw):
    return asyncio.run(inspect.unwrap(fn)(**kw))


def animal(owner_id, **over):
    base = dict(
        id=uuid.uuid4(), user_id=owner_id, taxon="lizard", name="Noodle",
        common_name="Corn snake", scientific_name="Pantherophis guttatus",
        herp_species_id=None, feeds_on_cgd_override=None,
        died_at=None, transferred_out_at=None, feeding_interval_days=7,
        brumation_active=False, notes="keep me",
    )
    base.update(over)
    return NS(**base)


def species(taxon, name="Pantherophis guttatus", common=("Corn snake",)):
    return NS(id=uuid.uuid4(), taxon=taxon, scientific_name=name, common_names=list(common))


def body(taxon, sp=None):
    return ChangeAnimalTaxonRequest(taxon=taxon, herp_species_id=sp)


@pytest.fixture
def owner():
    return NS(id=uuid.uuid4(), is_active=True, is_premium_for_app=lambda app: True)


# ── success: history and breeding survive ──────────────────────────────────

def test_change_keeps_history_and_breeding(owner):
    a = animal(owner.id)
    mate = animal(owner.id, taxon="lizard")
    pairing = NS(id=uuid.uuid4(), male_animal_id=a.id, female_animal_id=mate.id, taxon="lizard")
    db = DB({Animal: Q(first=a, all_=[mate]), ReptilePairing: Q(all_=[pairing])})

    res = run(ar.change_animal_taxon, animal_id=a.id, payload=body("snake"), db=db, current_user=owner)

    assert res is a and a.taxon == "snake" and db.commits == 1
    # Nothing deleted; the id every log/photo/shed/weight/genotype/pairing
    # hangs off is the same object, unchanged.
    assert db.deleted == []
    assert pairing.male_animal_id == a.id and pairing.female_animal_id == mate.id
    # Mate is still a lizard: the pairing keeps its label rather than lying.
    assert pairing.taxon == "lizard"
    # Individual facts stay.
    assert a.name == "Noodle" and a.notes == "keep me" and a.feeding_interval_days == 7


def test_pairing_taxon_follows_once_both_parents_match(owner):
    a = animal(owner.id)
    mate = animal(owner.id, taxon="snake")  # already corrected earlier
    pairing = NS(id=uuid.uuid4(), male_animal_id=mate.id, female_animal_id=a.id, taxon="lizard")
    db = DB({Animal: Q(first=a, all_=[mate]), ReptilePairing: Q(all_=[pairing])})

    run(ar.change_animal_taxon, animal_id=a.id, payload=body("snake"), db=db, current_user=owner)

    assert pairing.taxon == "snake"
    assert db.deleted == []


def test_route_never_deletes_or_touches_log_tables():
    """Structural: the handler must not delete anything or query a log table.
    Every child row keys on animals.id, which a taxon change leaves alone."""
    src = inspect.getsource(inspect.unwrap(ar.change_animal_taxon))
    code = src.split('"""')[-1]  # skip the docstring
    assert ".delete(" not in code and "db.delete" not in code
    for model in ("FeedingLog", "ShedLog", "WeightLog", "AnimalGenotype", "Photo", "Clutch", "ReptileOffspring"):
        assert model not in code, f"change-taxon should not touch {model}"


# ── species rules ────────────────────────────────────────────────────────────

def test_species_from_the_new_taxon_is_linked(owner):
    sp = species("snake")
    a = animal(owner.id, scientific_name=None, common_name=None)
    db = DB({Animal: Q(first=a), ReptileSpecies: Q(first=sp)})

    run(ar.change_animal_taxon, animal_id=a.id, payload=body("snake", sp.id), db=db, current_user=owner)

    assert a.herp_species_id == sp.id
    assert a.scientific_name == "Pantherophis guttatus" and a.common_name == "Corn snake"


def test_species_from_another_taxon_is_rejected_and_nothing_changes(owner):
    sp = species("lizard", name="Eublepharis macularius")
    a = animal(owner.id)
    db = DB({Animal: Q(first=a), ReptileSpecies: Q(first=sp)})

    with pytest.raises(HTTPException) as e:
        run(ar.change_animal_taxon, animal_id=a.id, payload=body("snake", sp.id), db=db, current_user=owner)
    assert e.value.status_code == 400
    assert a.taxon == "lizard" and db.commits == 0


def test_species_with_no_group_is_rejected(owner):
    sp = species(None)
    a = animal(owner.id)
    db = DB({Animal: Q(first=a), ReptileSpecies: Q(first=sp)})
    with pytest.raises(HTTPException) as e:
        run(ar.change_animal_taxon, animal_id=a.id, payload=body("snake", sp.id), db=db, current_user=owner)
    assert e.value.status_code == 400 and db.commits == 0


def test_missing_species_is_a_404(owner):
    a = animal(owner.id)
    db = DB({Animal: Q(first=a), ReptileSpecies: Q(first=None)})
    with pytest.raises(HTTPException) as e:
        run(ar.change_animal_taxon, animal_id=a.id, payload=body("snake", uuid.uuid4()), db=db, current_user=owner)
    assert e.value.status_code == 404 and a.taxon == "lizard"


def test_old_group_species_is_cleared_when_none_is_picked(owner):
    old = species("lizard", name="Correlophus ciliatus", common=("Crested gecko",))
    a = animal(owner.id, herp_species_id=old.id, scientific_name=old.scientific_name, common_name="Crested gecko")
    db = DB({Animal: Q(first=a), ReptileSpecies: Q(first=old)})

    run(ar.change_animal_taxon, animal_id=a.id, payload=body("frog"), db=db, current_user=owner)

    assert a.herp_species_id is None and a.scientific_name is None
    assert a.common_name == "Crested gecko"  # the keeper's label stays, as on TV


def test_species_already_in_the_new_group_is_kept(owner):
    """A link that already matches the destination (a catalog entry filed
    correctly on a mis-filed animal) has nothing wrong with it."""
    sp = species("snake")
    a = animal(owner.id, herp_species_id=sp.id)
    db = DB({Animal: Q(first=a), ReptileSpecies: Q(first=sp)})

    run(ar.change_animal_taxon, animal_id=a.id, payload=body("snake"), db=db, current_user=owner)

    assert a.herp_species_id == sp.id


def test_species_id_alias_is_accepted():
    sid = uuid.uuid4()
    assert ChangeAnimalTaxonRequest.model_validate({"taxon": "snake", "species_id": str(sid)}).herp_species_id == sid
    assert ChangeAnimalTaxonRequest.model_validate({"taxon": "snake", "herp_species_id": str(sid)}).herp_species_id == sid


# ── flags ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("override", [True, False])
def test_cgd_override_resets_to_inherit(owner, override):
    a = animal(owner.id, feeds_on_cgd_override=override)
    db = DB({Animal: Q(first=a)})
    run(ar.change_animal_taxon, animal_id=a.id, payload=body("snake"), db=db, current_user=owner)
    assert a.feeds_on_cgd_override is None


# ── validation ───────────────────────────────────────────────────────────────

def test_same_taxon_is_a_400(owner):
    a = animal(owner.id, taxon="snake")
    db = DB({Animal: Q(first=a)})
    with pytest.raises(HTTPException) as e:
        run(ar.change_animal_taxon, animal_id=a.id, payload=body("snake"), db=db, current_user=owner)
    assert e.value.status_code == 400 and db.commits == 0


@pytest.mark.parametrize("bad", ["tarantula", "Snake", "", "amphibian"])
def test_invalid_taxon_is_rejected(bad):
    with pytest.raises(ValidationError):
        ChangeAnimalTaxonRequest(taxon=bad)


def test_every_hv_taxon_is_accepted():
    for t in ANIMAL_TAXON_VALUES:
        assert ChangeAnimalTaxonRequest(taxon=t).taxon == t


def test_taxon_is_still_not_on_the_ordinary_update():
    assert "taxon" not in AnimalUpdate.model_fields


# ── permissions ──────────────────────────────────────────────────────────────

def test_stranger_gets_a_404(owner):
    a = animal(owner.id)
    stranger = NS(id=uuid.uuid4(), is_active=True, is_premium_for_app=lambda app: True)
    # Owner lookup + membership both come back empty: no access at all.
    db = DB({Animal: Q(first=a)})
    with pytest.raises(HTTPException) as e:
        run(ar.change_animal_taxon, animal_id=a.id, payload=body("snake"), db=db, current_user=stranger)
    assert e.value.status_code == 404
    assert a.taxon == "lizard" and db.commits == 0


def test_viewer_co_keeper_gets_a_403(owner):
    from app.models.user import User

    a = animal(owner.id)
    viewer = NS(id=uuid.uuid4(), is_active=True, is_premium_for_app=lambda app: True)
    member = NS(role="viewer")
    db = DB({Animal: Q(first=a), User: Q(first=owner), CollectionMember: Q(first=member)})
    with pytest.raises(HTTPException) as e:
        run(ar.change_animal_taxon, animal_id=a.id, payload=body("snake"), db=db, current_user=viewer)
    assert e.value.status_code == 403
    assert a.taxon == "lizard" and db.commits == 0


def test_keeper_co_keeper_may_change_it(owner):
    from app.models.user import User

    a = animal(owner.id)
    keeper = NS(id=uuid.uuid4(), is_active=True, is_premium_for_app=lambda app: True)
    db = DB({Animal: Q(first=a), User: Q(first=owner), CollectionMember: Q(first=NS(role="keeper"))})
    run(ar.change_animal_taxon, animal_id=a.id, payload=body("snake"), db=db, current_user=keeper)
    assert a.taxon == "snake"


def test_policy_matches_the_edit_route():
    assert getattr(ar.change_animal_taxon, "__access_policy__", None) == "keeper"
    assert getattr(ar.update_animal, "__access_policy__", None) == "keeper"


# ── closed records: TV parity, not refused ──────────────────────────────────

@pytest.mark.parametrize("field,value", [
    ("died_at", date(2026, 9, 1)),
    ("transferred_out_at", date(2026, 9, 1)),
])
def test_closed_animals_can_still_be_corrected(owner, field, value):
    a = animal(owner.id, **{field: value})
    db = DB({Animal: Q(first=a)})
    run(ar.change_animal_taxon, animal_id=a.id, payload=body("snake"), db=db, current_user=owner)
    assert a.taxon == "snake"
    assert "refuse_if_closed" not in inspect.getsource(inspect.unwrap(ar.change_animal_taxon))
