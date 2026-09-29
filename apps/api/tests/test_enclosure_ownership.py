"""An animal can only be filed into an enclosure its collection's OWNER owns.

Animals carry an `enclosure_id` FK and the enclosure screens list every row
that points at them, so an unchecked id let any account drop its own animal
into someone else's enclosure (by UUID), and let a co-keeper move the owner's
animal into the co-keeper's own enclosure. `require_own_enclosure` closes both.
"""
from __future__ import annotations

import ast
import asyncio
import inspect
import textwrap
import uuid
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.models.animal import Animal
from app.models.collection_member import CollectionMember
from app.models.enclosure import Enclosure
from app.models.user import User
from app.routers import animals, centipedes, inverts, scorpions, whip_spiders
from app.schemas.animal import AnimalUpdate
from app.utils.access import require_own_enclosure


class CapQ:
    """Records the filter criteria so we can check WHOSE enclosure is asked for."""

    def __init__(self, first=None, log=None):
        self._first, self.log = first, log if log is not None else []

    def filter(self, *crit, **_):
        self.log.extend(str(c.compile(compile_kwargs={"literal_binds": True})) for c in crit)
        return self

    def first(self):
        return self._first


class DB:
    def __init__(self, by_model):
        self.by_model, self.commits = by_model, 0

    def query(self, model, *_):
        return self.by_model.get(getattr(model, "class_", model), CapQ())

    def commit(self):
        self.commits += 1

    def refresh(self, o):
        pass


# ── the helper ───────────────────────────────────────────────────────────────

def test_no_enclosure_needs_no_lookup():
    db = DB({})
    require_own_enclosure(db, None, NS(id=uuid.uuid4()))  # doesn't raise, doesn't query


def test_someone_elses_or_missing_enclosure_is_a_404():
    db = DB({Enclosure: CapQ(None)})
    with pytest.raises(HTTPException) as e:
        require_own_enclosure(db, uuid.uuid4(), NS(id=uuid.uuid4()))
    assert e.value.status_code == 404
    assert e.value.detail == "Enclosure not found"


def test_the_lookup_is_scoped_to_the_given_owner():
    owner, enc = NS(id=uuid.uuid4()), uuid.uuid4()
    log: list[str] = []
    require_own_enclosure(DB({Enclosure: CapQ(NS(id=enc), log)}), enc, owner)
    joined = " ".join(log).replace("-", "")
    assert owner.id.hex in joined, "must filter on the owner's id, not just the enclosure id"
    assert enc.hex in joined


# ── a co-keeper editing the owner's animal ───────────────────────────────────

def _world(role, enclosure_row):
    owner, me = NS(id=uuid.uuid4(), is_active=True, is_premium_for_app=lambda app: True), NS(id=uuid.uuid4())
    ani = NS(id=uuid.uuid4(), user_id=owner.id, enclosure_id=None)
    log: list[str] = []
    db = DB({
        Animal: CapQ(ani),
        User: CapQ(owner),
        CollectionMember: CapQ(NS(role=role, app="herpetoverse", status="active")),
        Enclosure: CapQ(enclosure_row, log),
    })
    return owner, me, ani, db, log


def test_a_keeper_cant_move_the_owners_animal_into_an_enclosure_the_owner_doesnt_own():
    owner, me, ani, db, _ = _world("keeper", None)
    body = AnimalUpdate(enclosure_id=uuid.uuid4())
    with pytest.raises(HTTPException) as e:
        asyncio.run(inspect.unwrap(animals.update_animal)(animal_id=ani.id, animal_data=body, current_user=me, db=db))
    assert e.value.status_code == 404
    assert ani.enclosure_id is None and db.commits == 0


def test_a_keeper_can_use_the_owners_enclosure_and_it_is_checked_against_the_owner():
    enc = uuid.uuid4()
    owner, me, ani, db, log = _world("keeper", NS(id=enc))
    body = AnimalUpdate(enclosure_id=enc)
    asyncio.run(inspect.unwrap(animals.update_animal)(animal_id=ani.id, animal_data=body, current_user=me, db=db))
    assert ani.enclosure_id == enc
    joined = " ".join(log).replace("-", "")
    assert owner.id.hex in joined and me.id.hex not in joined


def test_clearing_the_enclosure_is_always_allowed():
    owner, me, ani, db, _ = _world("keeper", None)
    ani.enclosure_id = uuid.uuid4()
    asyncio.run(inspect.unwrap(animals.update_animal)(
        animal_id=ani.id, animal_data=AnimalUpdate(enclosure_id=None), current_user=me, db=db))
    assert ani.enclosure_id is None


# ── every write path that accepts an enclosure_id checks it ─────────────────

WRITERS = [
    (animals, "create_animal"), (animals, "update_animal"),
    (inverts, "create_invert_row"), (inverts, "update_invert"),
    (scorpions, "create_scorpion"), (scorpions, "update_scorpion"),
    (centipedes, "create_centipede"), (centipedes, "update_centipede"),
    (whip_spiders, "create_whip_spider"), (whip_spiders, "update_whip_spider"),
]


@pytest.mark.parametrize("mod,name", WRITERS)
def test_every_writer_checks_the_enclosure(mod, name):
    fn = inspect.unwrap(getattr(mod, name))
    tree = ast.parse(textwrap.dedent(inspect.getsource(fn)))
    calls = {n.func.id for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)}
    assert "require_own_enclosure" in calls, f"{mod.__name__}.{name} accepts enclosure_id without checking it"


# ── owner-only fields: visibility and the hero URL (review 2026-09-29, L2) ───

def test_a_keeper_cannot_change_visibility_or_point_the_hero_at_an_outside_image():
    owner, me, ani, db, _ = _world("keeper", None)
    ani.visibility, ani.is_public, ani.photo_url, ani.name = "private", False, "https://r2/own.jpg", "Old"
    body = AnimalUpdate(visibility="public", is_public=True, photo_url="https://tracker.example/p.gif", name="New")
    asyncio.run(inspect.unwrap(animals.update_animal)(animal_id=ani.id, animal_data=body, current_user=me, db=db))
    assert (ani.visibility, ani.is_public, ani.photo_url) == ("private", False, "https://r2/own.jpg")
    assert ani.name == "New"  # the rest of the edit still lands


def test_the_owner_still_can():
    from app.utils.access import Access, strip_owner_only

    data = {"visibility": "public", "is_public": True, "photo_url": "x", "name": "n"}
    owner = NS(id=uuid.uuid4())
    assert strip_owner_only(Access(owner=owner, actor=owner, role="owner", app="herpetoverse"), data) == data
    keeper = Access(owner=owner, actor=NS(id=uuid.uuid4()), role="keeper", app="herpetoverse")
    assert strip_owner_only(keeper, data) == {"name": "n"}


@pytest.mark.parametrize("mod,name", [(animals, "create_animal"), (animals, "update_animal"),
                                      (inverts, "update_invert")])
def test_keeper_writes_strip_owner_only_fields(mod, name):
    src = inspect.getsource(inspect.unwrap(getattr(mod, name)))
    assert "strip_owner_only(access," in src


def test_keeper_invert_creates_reset_owner_only_fields():
    src = inspect.getsource(inspect.unwrap(inverts.create_invert))
    assert "OWNER_ONLY_ANIMAL_FIELDS" in src and "if not access.is_owner" in src
