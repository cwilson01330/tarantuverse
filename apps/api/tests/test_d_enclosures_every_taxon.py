"""Audit-2 D: enclosures hold every taxon (+ colonies); colony export fields.

Enclosure inhabitants, counts and add/remove used to read the legacy
`tarantulas` table only (audit2-animals M12), so a scorpion, mantis or colony
put in an enclosure was never listed or counted. They now read `inverts`
(every taxon) and, on request, `colonies`.

Fake-DB style (see test_advanced_analytics_every_taxon.py): the router runs
for real; the session returns canned rows and records every filter clause.
"""
import asyncio
import uuid
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.models.colony import Colony
from app.models.enclosure import Enclosure
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.models.tarantula import Tarantula
from app.routers import enclosures
from app.schemas.enclosure import InhabitantInfo


OWNER = NS(id=uuid.uuid4())


def _enclosure():
    return Enclosure(id=uuid.uuid4(), user_id=OWNER.id, name="Shelf A tub", is_communal=False, species_id=None)


def _animal(taxon, **kw):
    base = dict(
        id=uuid.uuid4(), taxon=taxon, name=f"{taxon} one", scientific_name=f"{taxon} sp",
        sex=None, photo_url=None, enclosure_id=None, died_at=None, transferred_out_at=None,
    )
    base.update(kw)
    return NS(**base)


def _colony(**kw):
    base = dict(
        id=uuid.uuid4(), taxon="isopod", name="Dairy cows", species_id=None, photo_url=None,
        stage_counts={"adults": 12, "mancae": 30}, enclosure_id=None,
    )
    base.update(kw)
    return NS(**base)


def _entity(e):
    """The mapped class a query is about (class, or a column's class)."""
    return e if isinstance(e, type) else getattr(e, "class_", None)


class _Q:
    def __init__(self, db, entities):
        self.db, self.entities = db, entities
        self.cls = _entity(entities[0])
        self.is_column = not isinstance(entities[0], type)

    def filter(self, *clauses):
        self.db.clauses.extend(clauses)
        return self

    def order_by(self, *a):
        return self

    def update(self, values, **kw):
        self.db.updates.append((self.cls, values))
        return 0

    def count(self):
        return len(self.all())

    def first(self):
        if self.cls is Enclosure:
            return self.db.enclosure
        return self.db.first.get(self.cls)

    def all(self):
        if self.cls is Invert and self.is_column:
            return [(i,) for i in self.db.twins]
        if self.cls is Invert:
            return self.db.inverts
        if self.cls is Tarantula:
            return self.db.legacy
        if self.cls is Colony:
            return self.db.colonies
        if self.cls is InvertSpecies:
            return self.db.species
        return []


class FakeDB:
    def __init__(self, enclosure=None, inverts=(), legacy=(), twins=(), colonies=(), species=(), first=None):
        self.enclosure = enclosure
        self.inverts, self.legacy, self.twins = list(inverts), list(legacy), list(twins)
        self.colonies, self.species = list(colonies), list(species)
        self.first = first or {}
        self.clauses, self.updates, self.commits = [], [], 0

    def query(self, *entities):
        return _Q(self, entities)

    def commit(self):
        self.commits += 1

    def sql(self):
        return " ".join(str(c.compile(dialect=postgresql.dialect())) for c in self.clauses)


def _inhabitants(db, enc, include_colonies):
    return asyncio.run(enclosures.get_inhabitants(
        enclosure_id=enc.id, include_colonies=include_colonies, current_user=OWNER, db=db,
    ))


# ── listing ──────────────────────────────────────────────────────────────────

def test_every_taxon_is_listed_and_colonies_only_on_request():
    enc = _enclosure()
    mantis, scorpion = _animal("mantis"), _animal("scorpion")
    twin = NS(id=uuid.uuid4(), name="Rosie", scientific_name="G. rosea", sex=None, photo_url=None)
    orphan = NS(id=uuid.uuid4(), name="Old", scientific_name="B. smithi", sex=None, photo_url=None)
    sp = uuid.uuid4()
    colony = _colony(species_id=sp)
    db = FakeDB(enclosure=enc, inverts=[mantis, scorpion], legacy=[twin, orphan], twins=[twin.id],
                colonies=[colony], species=[(sp, "Porcellio laevis")])

    rows = _inhabitants(db, enc, include_colonies=False)
    assert [r.id for r in rows] == [mantis.id, scorpion.id, orphan.id]  # twin not doubled
    assert {r.taxon for r in rows} == {"mantis", "scorpion", "tarantula"}
    assert all(r.kind == "animal" and r.count is None for r in rows)

    rows = _inhabitants(FakeDB(enclosure=enc, inverts=[mantis], colonies=[colony], species=[(sp, "Porcellio laevis")]),
                        enc, include_colonies=True)
    col = [r for r in rows if r.kind == "colony"]
    assert len(col) == 1
    assert col[0].id == colony.id and col[0].count == 42 and col[0].taxon == "isopod"
    assert col[0].scientific_name == "Porcellio laevis"


def test_died_handed_off_and_closed_colonies_are_left_out():
    enc = _enclosure()
    db = FakeDB(enclosure=enc)
    _inhabitants(db, enc, include_colonies=True)
    sql = db.sql()
    assert "inverts.died_at IS NULL" in sql
    assert "inverts.transferred_out_at IS NULL" in sql
    assert "inverts.user_id" in sql
    assert "colonies.ended_at IS NULL" in sql
    assert "colonies.transferred_out_at IS NULL" in sql
    assert "colonies.is_active IS true" in sql


def test_inhabitant_count_includes_every_taxon_and_colonies():
    enc = _enclosure()
    db = FakeDB(enclosure=enc, inverts=[_animal("mantis"), _animal("roach")], colonies=[_colony()])
    data = enclosures.get_enclosure_with_computed_fields(enc, db)
    assert data["inhabitant_count"] == 3


def test_unknown_enclosure_is_404():
    with pytest.raises(HTTPException) as e:
        _inhabitants(FakeDB(enclosure=None), _enclosure(), include_colonies=True)
    assert e.value.status_code == 404


def test_inhabitant_schema_stays_readable_by_old_clients():
    row = InhabitantInfo(id=uuid.uuid4(), name="x")
    dumped = row.model_dump()
    for key in ("id", "name", "scientific_name", "sex", "photo_url"):
        assert key in dumped
    assert dumped["kind"] == "animal" and dumped["count"] is None and dumped["taxon"] is None


def test_include_colonies_defaults_off_for_older_app_builds():
    import inspect
    default = inspect.signature(enclosures.get_inhabitants).parameters["include_colonies"].default
    assert getattr(default, "default", default) is False


# ── add / remove ─────────────────────────────────────────────────────────────

@pytest.fixture
def mirrored(monkeypatch):
    from app.services import inverts_dualwrite
    calls = []
    monkeypatch.setattr(inverts_dualwrite, "mirror_invert_update_to_legacy", lambda db, inv: calls.append(inv.id))
    monkeypatch.setattr(inverts_dualwrite, "mirror_tarantula_update", lambda db, t: calls.append(t.id))
    return calls


def _add(db, enc, member_id):
    return asyncio.run(enclosures.add_inhabitant(enclosure_id=enc.id, tarantula_id=member_id, current_user=OWNER, db=db))


def _remove(db, enc, member_id):
    return asyncio.run(enclosures.remove_inhabitant(enclosure_id=enc.id, tarantula_id=member_id, current_user=OWNER, db=db))


def test_any_taxon_can_be_put_in_an_enclosure_and_is_mirrored(mirrored):
    enc = _enclosure()
    scorpion = _animal("scorpion")
    db = FakeDB(enclosure=enc, first={Invert: scorpion})
    out = _add(db, enc, scorpion.id)
    assert scorpion.enclosure_id == enc.id
    assert out["kind"] == "animal" and out["tarantula_id"] == str(scorpion.id)
    assert mirrored == [scorpion.id] and db.commits == 1


def test_a_colony_can_be_put_in_an_enclosure(mirrored):
    enc = _enclosure()
    colony = _colony()
    db = FakeDB(enclosure=enc, first={Colony: colony})
    out = _add(db, enc, colony.id)
    assert colony.enclosure_id == enc.id and out["kind"] == "colony"
    assert mirrored == []


def test_a_dead_animal_cannot_be_moved_in(mirrored):
    from datetime import date
    enc = _enclosure()
    gone = _animal("mantis", died_at=date(2026, 9, 1))
    with pytest.raises(HTTPException) as e:
        _add(FakeDB(enclosure=enc, first={Invert: gone}), enc, gone.id)
    assert e.value.status_code == 409
    assert gone.enclosure_id is None


def test_someone_elses_or_unknown_id_is_404(mirrored):
    enc = _enclosure()
    with pytest.raises(HTTPException) as e:
        _add(FakeDB(enclosure=enc), enc, uuid.uuid4())
    assert e.value.status_code == 404
    # The ownership filter is on every lookup.
    db = FakeDB(enclosure=enc)
    with pytest.raises(HTTPException):
        _add(db, enc, uuid.uuid4())
    sql = db.sql()
    for table in ("inverts", "tarantulas", "colonies"):
        assert f"{table}.user_id" in sql


def test_remove_only_from_the_enclosure_it_is_in(mirrored):
    enc = _enclosure()
    elsewhere = _animal("roach", enclosure_id=uuid.uuid4())
    with pytest.raises(HTTPException) as e:
        _remove(FakeDB(enclosure=enc, first={Invert: elsewhere}), enc, elsewhere.id)
    assert e.value.status_code == 404
    assert elsewhere.enclosure_id is not None

    inside = _animal("roach", enclosure_id=enc.id)
    out = _remove(FakeDB(enclosure=enc, first={Invert: inside}), enc, inside.id)
    assert inside.enclosure_id is None and out["kind"] == "animal"


def test_deleting_an_enclosure_empties_it_for_every_taxon():
    from app.models.scorpion import Scorpion
    enc = _enclosure()
    db = FakeDB(enclosure=enc)
    db.delete = lambda obj: None
    asyncio.run(enclosures.delete_enclosure(enclosure_id=enc.id, current_user=OWNER, db=db))
    cleared = {cls for cls, values in db.updates if values == {"enclosure_id": None}}
    assert {Tarantula, Invert, Scorpion, Colony} <= cleared


# ── colony export (audit2-colonies M10) ─────────────────────────────────────

def test_colony_export_keeps_enclosure_and_sitter_fields():
    from app.services.export_service import COLONY_FIELDS
    for field in ("enclosure_type", "enclosure_size", "sitter_note"):
        assert field in COLONY_FIELDS
    assert set(COLONY_FIELDS) <= set(Colony.__table__.c.keys())
    assert len(COLONY_FIELDS) == len(set(COLONY_FIELDS))
