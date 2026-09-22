"""
Achievements and exports must count EVERY taxon, not just tarantulas.

WHY THIS FILE EXISTS
--------------------
Both of these started life as tarantula-only and stayed that way through five
taxon launches, because nothing failed loudly when they didn't. The first
premium subscriber had 21 animals, 22 feeding logs and 28 molt logs recorded,
and had earned zero achievements — only 2 of the 21 were tarantulas, and none
of the logs carried the legacy `tarantula_id`. His export would have contained
none of his animals.

The regression is silent in both directions: a tarantula-only query returns a
smaller number rather than an error, and a tarantula-only export returns a
valid file that happens to be empty. So the invariant is pinned here, by
compiling the real queries and reading the SQL, rather than by trusting that
someone will notice.

The queries are compiled, not executed — these assertions need no database and
still fail if the filter stops touching a table.
"""
import re

import pytest
from sqlalchemy.dialects import postgresql

from app.models.colony import Colony
from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.molt_log import MoltLog
from app.models.photo import Photo
from app.models.substrate_change import SubstrateChange
from app.models.tarantula import Tarantula
from app.services import achievement_service, export_service


UID = "00000000-0000-0000-0000-000000000001"

# Every polymorphic log table a keeper's records can hang off.
LOG_MODELS = [FeedingLog, MoltLog, SubstrateChange, Photo]


def _sql(expr) -> str:
    return str(expr.compile(dialect=postgresql.dialect())).lower()


# ---------------------------------------------------------------------------
# Achievements
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("model", LOG_MODELS, ids=lambda m: m.__name__)
def test_achievement_log_filter_reaches_every_parent(model):
    """A log counts if it belongs to the user via ANY parent column.

    `inverts` is the one that matters most: a mantis, jumper or isopod has no
    row in `tarantulas` at all, so a filter that names only that table counts
    nothing for them.
    """
    sql = _sql(achievement_service._owned_log_filter(model, UID))

    assert "inverts" in sql, f"{model.__name__}: unified invert parent not counted"
    assert "tarantulas" in sql, f"{model.__name__}: legacy parent dropped"
    assert "colonies" in sql, f"{model.__name__}: colony parent not counted"


def test_achievement_log_filter_is_a_disjunction_not_a_join():
    """Dual-written tarantula logs carry BOTH ids and must count once.

    `tarantulas` and `inverts` share primary keys, so a log written through a
    legacy path has the same value in both columns. Joining against both
    tables would count it twice and award `dedicated_feeder_50` at 25 real
    feedings. Filtering one row against sets of owned ids can't double-count.
    """
    sql = _sql(achievement_service._owned_log_filter(FeedingLog, UID))

    assert " or " in sql, "parents must be OR-ed together"
    assert "join" not in sql, "a join over both parent tables double-counts dual-written logs"


def test_animal_count_reads_the_unified_table():
    """`get_tarantula_count` backs the collection badges; it must count all taxa."""
    import inspect

    src = inspect.getsource(achievement_service.get_tarantula_count)
    assert "Invert" in src, "collection achievements still count only tarantulas"
    assert "transferred_out_at" in src, (
        "transferred animals belong to the buyer and should not inflate the count"
    )


def test_deceased_animals_still_count_toward_achievements():
    """Losing an animal must not revoke progress.

    The free-tier cap excludes the dead on purpose (ADR-015). Borrowing that
    rule here would mean a keeper who lost an animal quietly slid back below a
    badge threshold, which is a cruel way to learn about a design decision.
    """
    import inspect

    src = inspect.getsource(achievement_service.get_tarantula_count)
    assert "died_at" not in src, "achievement counts must not exclude deceased animals"


def test_feeding_streak_is_not_tarantula_only():
    """Feeding a mantis on Tuesday is feeding on Tuesday."""
    import inspect

    src = inspect.getsource(achievement_service.get_feeding_streak)
    assert "_owned_log_filter" in src, "streak still walks the tarantula join"


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("model", LOG_MODELS, ids=lambda m: m.__name__)
def test_export_log_queries_reach_every_parent(model):
    """The export's log queries use the same owner-based rule."""
    import inspect

    src = inspect.getsource(export_service._owned_logs)
    for table in ("Invert", "Tarantula", "Colony"):
        assert table in src, f"export log query ignores {table}"
    assert "or_" in src, "export log query must OR the parents, not join them"


@pytest.mark.parametrize(
    "fields,name",
    [
        (export_service.FEEDING_FIELDS, "FEEDING_FIELDS"),
        (export_service.MOLT_FIELDS, "MOLT_FIELDS"),
        (export_service.SUBSTRATE_CHANGE_FIELDS, "SUBSTRATE_CHANGE_FIELDS"),
        (export_service.PHOTO_FIELDS, "PHOTO_FIELDS"),
    ],
)
def test_exported_logs_carry_their_parent_id(fields, name):
    """Widening the query is useless if the row can't say who it belongs to.

    A mantis log has no `tarantula_id`. Without `invert_id` in the column list
    it exports with a null parent — an orphan the keeper can't match to an
    animal and the importer can't re-attach.
    """
    assert "invert_id" in fields, f"{name}: non-tarantula logs would export orphaned"
    assert "colony_id" in fields, f"{name}: colony logs would export orphaned"


def test_export_has_an_all_taxa_animal_section():
    assert hasattr(export_service, "INVERT_FIELDS")
    assert "taxon" in export_service.INVERT_FIELDS, (
        "an all-taxa animal list that doesn't say which taxon each row is "
        "isn't usable by the importer or by the keeper"
    )


@pytest.mark.parametrize(
    "field",
    ["current_instar", "current_length_mm", "died_at", "feeding_interval_days"],
)
def test_export_carries_non_tarantula_growth_and_lifecycle_fields(field):
    """Instar and length are how the non-moult-measuring taxa record growth.

    Exporting an animal without them loses the only growth data those taxa
    have.
    """
    assert field in export_service.INVERT_FIELDS


def test_every_export_field_exists_on_its_model():
    """`_row_to_dict` uses getattr(..., None), so a typo exports silent nulls."""
    pairs = [
        (Invert, export_service.INVERT_FIELDS, "INVERT_FIELDS"),
        (FeedingLog, export_service.FEEDING_FIELDS, "FEEDING_FIELDS"),
        (MoltLog, export_service.MOLT_FIELDS, "MOLT_FIELDS"),
        (SubstrateChange, export_service.SUBSTRATE_CHANGE_FIELDS, "SUBSTRATE_CHANGE_FIELDS"),
        (Photo, export_service.PHOTO_FIELDS, "PHOTO_FIELDS"),
    ]
    for model, fields, name in pairs:
        columns = {c.name for c in model.__table__.columns}
        missing = [f for f in fields if f not in columns]
        assert not missing, f"{name} names columns absent from {model.__name__}: {missing}"


# ---------------------------------------------------------------------------
# Round-trip
# ---------------------------------------------------------------------------

def test_importer_prefers_the_complete_animal_list():
    """`inverts` is a superset of `tarantulas` — read it first.

    Both keys appear in a Tarantuverse export and describe the SAME rows.
    Reading `tarantulas` first would import only the tarantulas out of a mixed
    collection, and nothing at all for a keeper who has none — a round-trip
    that silently loses most of the file.
    """
    import inspect

    from app.services import import_service

    src = inspect.getsource(import_service.parse_bytes)
    match = re.search(r'raw\s*=\s*raw\.get\(([^)]*)\)', src)
    assert match, "could not locate the export-key precedence line"

    order = re.findall(r'"(\w+)"', src[match.start(): match.start() + 200])
    assert order.index("inverts") < order.index("tarantulas"), (
        f"importer reads {order} — `inverts` must come first"
    )
