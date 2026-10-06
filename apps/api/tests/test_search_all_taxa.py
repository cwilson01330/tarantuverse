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
