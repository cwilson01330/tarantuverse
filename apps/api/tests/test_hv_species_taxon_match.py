"""An HV animal's species must be filed under the animal's own taxon
(2026-10-12, follow-up to change-taxon).

Rules pinned here:
  - create: a picked herp_species_id must belong to the body's taxon
    (400 otherwise, 400 for a species with no group, 404 if missing)
  - update: checked only when the link is SET to a different species; an
    echoed, unchanged link never fails an unrelated edit (even one that is
    already mismatched or group-less), and clearing it is always allowed
  - copies (transfer claim, import auto-match) drop a mismatched link
    instead of failing; an unset species group isn't a known mismatch there

Fake-DB style, like test_hv_change_taxon.
"""
from __future__ import annotations

import asyncio
import inspect
import uuid
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.models.animal import Animal
from app.models.reptile_species import ReptileSpecies
from app.routers import animals as ar
from app.routers import transfers
from app.schemas.animal import AnimalCreate, AnimalUpdate
from app.services import import_service


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
    def __init__(self, by_model=None):
        self.by_model = by_model or {}
        self.commits = 0
        self.added = []
        self.queried = []

    def query(self, model, *_):
        key = getattr(model, "class_", model)
        self.queried.append(key)
        return self.by_model.get(key, Q())

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        pass


def run(fn, **kw):
    return asyncio.run(inspect.unwrap(fn)(**kw))


def species(taxon, name="Pantherophis guttatus"):
    return NS(id=uuid.uuid4(), taxon=taxon, scientific_name=name, common_names=["Corn snake"])


def animal(owner_id, **over):
    base = dict(
        id=uuid.uuid4(), user_id=owner_id, taxon="snake", name="Noodle",
        herp_species_id=None, died_at=None, transferred_out_at=None,
        scientific_name=None, common_name=None,
    )
    base.update(over)
    return NS(**base)


@pytest.fixture
def owner():
    return NS(id=uuid.uuid4(), is_active=True, is_premium_for_app=lambda app: True)


@pytest.fixture
def create_env(monkeypatch, owner):
    monkeypatch.setattr(
        ar, "scope_collection",
        lambda *a, **k: NS(owner=owner, is_owner=True, logged_by_user_id=None),
    )
    monkeypatch.setattr(ar, "enforce_animal_limit", lambda *a, **k: None)
    monkeypatch.setattr(ar, "require_own_enclosure", lambda *a, **k: None)
    monkeypatch.setattr(ar, "canonical_location", lambda db, uid, loc, scope: loc)


def create(db, owner, **body):
    return run(
        ar.create_animal, animal_data=AnimalCreate(**body), collection=None,
        db=db, current_user=owner,
    )


# ── create ───────────────────────────────────────────────────────────────────

def test_create_links_a_species_of_the_same_taxon(create_env, owner):
    sp = species("snake")
    db = DB({ReptileSpecies: Q(first=sp)})
    res = create(db, owner, taxon="snake", name="Noodle", herp_species_id=sp.id)
    assert res.herp_species_id == sp.id and db.commits == 1


@pytest.mark.parametrize("sp_taxon", ["lizard", None])
def test_create_refuses_a_species_from_another_or_no_group(create_env, owner, sp_taxon):
    sp = species(sp_taxon, name="Eublepharis macularius")
    db = DB({ReptileSpecies: Q(first=sp)})
    with pytest.raises(HTTPException) as e:
        create(db, owner, taxon="snake", name="Noodle", herp_species_id=sp.id)
    assert e.value.status_code == 400
    assert "Eublepharis macularius" in e.value.detail and "snake" in e.value.detail
    assert db.added == [] and db.commits == 0


def test_create_with_a_missing_species_is_a_404(create_env, owner):
    db = DB({ReptileSpecies: Q(first=None)})
    with pytest.raises(HTTPException) as e:
        create(db, owner, taxon="snake", name="Noodle", herp_species_id=uuid.uuid4())
    assert e.value.status_code == 404 and db.added == []


def test_create_without_a_species_never_looks_one_up(create_env, owner):
    db = DB()
    create(db, owner, taxon="frog", name="Hop")
    assert ReptileSpecies not in db.queried and db.commits == 1


def test_other_group_message_reads_naturally(create_env, owner):
    sp = species("lizard", name="Pogona vitticeps")
    db = DB({ReptileSpecies: Q(first=sp)})
    with pytest.raises(HTTPException) as e:
        create(db, owner, taxon="other", name="X", herp_species_id=sp.id)
    assert 'under "other"' in e.value.detail


# ── update ───────────────────────────────────────────────────────────────────

def update(db, owner, a, **body):
    return run(
        ar.update_animal, animal_id=a.id, animal_data=AnimalUpdate(**body),
        current_user=owner, db=db,
    )


def test_update_to_a_species_of_the_same_taxon(owner):
    sp = species("snake")
    a = animal(owner.id)
    db = DB({Animal: Q(first=a), ReptileSpecies: Q(first=sp)})
    update(db, owner, a, herp_species_id=sp.id)
    assert a.herp_species_id == sp.id and db.commits == 1


@pytest.mark.parametrize("sp_taxon", ["frog", None])
def test_update_to_a_species_from_another_or_no_group_is_refused(owner, sp_taxon):
    old = species("snake")
    new = species(sp_taxon, name="Dendrobates tinctorius")
    a = animal(owner.id, herp_species_id=old.id)
    db = DB({Animal: Q(first=a), ReptileSpecies: Q(first=new)})
    with pytest.raises(HTTPException) as e:
        update(db, owner, a, herp_species_id=new.id, name="Renamed")
    assert e.value.status_code == 400
    assert a.herp_species_id == old.id and a.name == "Noodle" and db.commits == 0


@pytest.mark.parametrize("stored_taxon", ["lizard", None])
def test_an_echoed_unchanged_link_never_fails_an_unrelated_edit(owner, stored_taxon):
    """Edit forms send the stored species id back on every save. A link that
    is already mismatched (pre-rule data) or has no group must not start
    blocking a keeper who only renamed the animal."""
    stored = species(stored_taxon)
    a = animal(owner.id, herp_species_id=stored.id)
    db = DB({Animal: Q(first=a), ReptileSpecies: Q(first=stored)})
    update(db, owner, a, herp_species_id=stored.id, name="Renamed")
    assert a.name == "Renamed" and a.herp_species_id == stored.id and db.commits == 1
    assert ReptileSpecies not in db.queried


def test_clearing_the_link_is_always_allowed(owner):
    stored = species("lizard")
    a = animal(owner.id, herp_species_id=stored.id)
    db = DB({Animal: Q(first=a)})
    update(db, owner, a, herp_species_id=None)
    assert a.herp_species_id is None and ReptileSpecies not in db.queried


def test_update_without_the_field_does_not_check(owner):
    a = animal(owner.id, herp_species_id=uuid.uuid4())
    db = DB({Animal: Q(first=a)})
    update(db, owner, a, name="Renamed")
    assert a.name == "Renamed" and ReptileSpecies not in db.queried


def test_pick_paths_share_one_rule():
    for fn in (ar.create_animal, ar.update_animal, ar.change_animal_taxon):
        assert "species_for_taxon(" in inspect.getsource(inspect.unwrap(fn)), fn.__name__


# ── copies: drop, never fail ─────────────────────────────────────────────────

@pytest.mark.parametrize("sp_taxon,animal_taxon,conflict", [
    ("snake", "snake", False),
    ("lizard", "snake", True),
    (None, "snake", False),  # unknown group isn't a known mismatch
])
def test_species_taxon_conflict(sp_taxon, animal_taxon, conflict):
    assert ar.species_taxon_conflict(species(sp_taxon), animal_taxon) is conflict


def test_conflict_with_no_species_is_false():
    assert ar.species_taxon_conflict(None, "snake") is False


def test_transfer_claim_drops_a_mismatched_link_instead_of_failing():
    src = inspect.getsource(transfers._claim_animal_transfer)
    assert "species_taxon_conflict(" in src
    assert "herp_species_id=herp_species_id" in src
    assert "herp_species_id=source.herp_species_id" not in src


def _norm(monkeypatch, sp, row_taxon):
    monkeypatch.setattr(import_service, "match_herp_species", lambda db, name: sp)
    return import_service.normalize_animal_row(
        None,
        {"Name": "Noodle", "Species": "Pantherophis guttatus", "Group": row_taxon},
        {"Name": "name", "Species": "scientific_name", "Group": "taxon"},
        "snake",
    )


def test_import_keeps_a_matching_species(monkeypatch):
    sp = species("snake")
    out = _norm(monkeypatch, sp, "snake")
    assert out["payload"]["herp_species_id"] == str(sp.id) and out["errors"] == []


def test_import_drops_a_species_from_another_group_but_keeps_the_row(monkeypatch):
    sp = species("lizard")
    out = _norm(monkeypatch, sp, "frog")
    assert "herp_species_id" not in out["payload"]
    assert out["payload"]["taxon"] == "frog" and out["errors"] == []
    assert out["species_matched"] is False
    # The name the keeper typed is kept.
    assert out["payload"]["scientific_name"] == "Pantherophis guttatus"


def test_import_keeps_a_species_with_no_group(monkeypatch):
    sp = species(None)
    out = _norm(monkeypatch, sp, "snake")
    assert out["payload"]["herp_species_id"] == str(sp.id)
