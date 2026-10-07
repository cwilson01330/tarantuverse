"""Tarantula logs are read by EITHER parent column (2026-10-07).

124 molts and 1,317 feedings on 259 tarantulas carried only `invert_id`, so
readers filtering on `tarantula_id` alone missed them; premolt prediction
then flagged freshly moulted spiders as overdue. See utils/legacy_logs.py.
"""
import pathlib
import re
import uuid

from sqlalchemy.dialects import postgresql

from app.models.feeding_log import FeedingLog
from app.models.molt_log import MoltLog
from app.utils.legacy_logs import tarantula_logs

APP = pathlib.Path(__file__).resolve().parents[1] / "app"


def test_clause_matches_either_column():
    sql = str(tarantula_logs(MoltLog, uuid.uuid4()).compile(dialect=postgresql.dialect()))
    assert "molt_logs.tarantula_id" in sql and "molt_logs.invert_id" in sql and " OR " in sql


def test_premolt_reads_both_columns():
    src = (APP / "services" / "premolt_service.py").read_text()
    assert "tarantula_logs(MoltLog, tarantula_id)" in src
    assert "tarantula_logs(FeedingLog, tarantula_id)" in src


# Places that may still compare tarantula_id alone, and why.
ALLOWED = {
    # Deleting the legacy row's own logs; the invert delete path handles the rest.
    ("routers/tarantulas.py", "FeedingLog"), ("routers/tarantulas.py", "MoltLog"),
    ("routers/tarantulas.py", "SubstrateChange"), ("routers/tarantulas.py", "Photo"),
    # Sibling lookup keyed on the photo's own parent column.
    ("routers/photos.py", "Photo"),
    # Photo cap and storage cleanup: separate review, not log reads.
    ("utils/limits.py", "Photo"), ("utils/photo_cleanup.py", "Photo"),
}


def test_no_new_tarantula_only_log_reads():
    pat = re.compile(r"\b(FeedingLog|MoltLog|SubstrateChange|Photo)\.tarantula_id ==")
    found = set()
    for path in list((APP / "routers").glob("*.py")) + list((APP / "services").glob("*.py")) + list((APP / "utils").glob("*.py")):
        rel = str(path.relative_to(APP)).replace("\\", "/")
        for m in pat.finditer(path.read_text(encoding="utf-8")):
            if (rel, m.group(1)) not in ALLOWED:
                found.add((rel, m.group(1)))
    assert not found, f"Use utils.legacy_logs.tarantula_logs for these reads: {sorted(found)}"
