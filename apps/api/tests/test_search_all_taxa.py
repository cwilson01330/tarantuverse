"""Global search must cover every taxon, not just the legacy tarantula table."""
import inspect

from sqlalchemy import func, or_, select
from sqlalchemy.dialects import postgresql

from app.models.colony import Colony
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.routers import search


def test_search_reads_the_unified_tables():
    src = inspect.getsource(search)
    assert "from app.models.tarantula import" not in src
    for name in ("Invert", "Colony", "InvertSpecies"):
        assert f"db.query({name})" in src, name


def test_animal_urls_route_by_taxon():
    src = inspect.getsource(search)
    # Tarantulas keep their own web page; every other animal uses the generic one.
    assert '"tarantulas" if animal.taxon == "tarantula" else "inverts"' in src
    assert 'url=f"/dashboard/colonies/{colony.id}"' in src
    assert 'url=f"/species/inverts/{sp.id}"' in src


def test_invert_species_common_name_match_compiles():
    stmt = select(InvertSpecies.id).where(
        InvertSpecies.taxon != "tarantula",
        or_(
            InvertSpecies.scientific_name_lower.ilike("%holc%"),
            func.array_to_string(InvertSpecies.common_names, " ").ilike("%huntsman%"),
        ),
    )
    sql = str(stmt.compile(dialect=postgresql.dialect()))
    assert "array_to_string" in sql and "ILIKE" in sql.upper()


def test_animal_query_columns_exist():
    for col in ("name", "common_name", "scientific_name", "photo_url", "transferred_out_at", "died_at", "taxon"):
        assert hasattr(Invert, col), col
    for col in ("name", "photo_url", "transferred_out_at"):
        assert hasattr(Colony, col), col


# ── Herpetoverse animals (audit-2 M9) ────────────────────────────────────────
# A fake session records which models were queried and with what filters, so
# these run without a database.
import asyncio
from types import SimpleNamespace

from app.models.animal import Animal


class _FakeQuery:
    def __init__(self, model, log, rows):
        self.model, self.rows = model, rows
        self.criteria = []
        log.append(self)

    def filter(self, *criteria):
        self.criteria.extend(criteria)
        return self

    def order_by(self, *a):
        return self

    def limit(self, n):
        return self

    def all(self):
        return self.rows


class _FakeDB:
    def __init__(self, rows_by_model=None):
        self.log = []
        self.rows_by_model = rows_by_model or {}

    def query(self, model):
        return _FakeQuery(model, self.log, self.rows_by_model.get(model, []))


_ME = SimpleNamespace(id="11111111-1111-1111-1111-111111111111")
_SNAKE = SimpleNamespace(
    id="22222222-2222-2222-2222-222222222222", taxon="snake", name="Noodle",
    common_name="Ball python", scientific_name="Python regius", photo_url=None,
)


def _run(db, app=None, user=_ME, type=None):
    return asyncio.run(search.global_search(q="nood", type=type, app=app, db=db, current_user=user))


def _sql(query):
    return " ".join(
        str(c.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        for c in query.criteria
    )


def test_hv_search_returns_only_the_keepers_own_animals():
    db = _FakeDB({Animal: [_SNAKE]})
    res = _run(db, app="herpetoverse")
    animal_queries = [q for q in db.log if q.model is Animal]
    assert len(animal_queries) == 1
    sql = _sql(animal_queries[0])
    # Scoped to the signed-in keeper, and transferred-out animals excluded.
    assert f"animals.user_id = '{_ME.id}'" in sql
    assert "animals.transferred_out_at IS NULL" in sql
    assert [r.url for r in res.animals] == [f"/app/reptiles/{_SNAKE.id}"]
    assert res.animals[0].type == "snake" and res.animals[0].title == "Noodle"
    assert res.total_results == 1
    # TV inverts/colonies (other app) are not searched in HV mode.
    assert not any(q.model in (Invert, Colony) for q in db.log)
    assert res.tarantulas == []


def test_hv_search_signed_out_never_reads_animals():
    db = _FakeDB({Animal: [_SNAKE]})
    res = _run(db, app="herpetoverse", user=None)
    assert not any(q.model is Animal for q in db.log)
    assert res.animals == []


def test_tv_search_never_returns_hv_animals():
    db = _FakeDB({Animal: [_SNAKE]})
    res = _run(db, app=None)
    assert not any(q.model is Animal for q in db.log)
    assert res.animals == []
    assert any(q.model is Invert for q in db.log)


def test_hv_type_filter_skips_animals_for_other_types():
    db = _FakeDB({Animal: [_SNAKE]})
    res = _run(db, app="herpetoverse", type="species")
    assert not any(q.model is Animal for q in db.log)
    assert res.animals == []
