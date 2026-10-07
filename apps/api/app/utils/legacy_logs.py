"""Reading a tarantula's logs during the ADR-005 dual-table period.

A tarantula exists twice: its legacy `tarantulas` row and its `inverts` row,
which share one id. Logs carry `invert_id` always and `tarantula_id` only
when the writer remembered to set it. Until 2026-09-29 the generic invert
routes (which mobile tarantulas use) set only `invert_id`, so 124 molts and
1,317 feedings across 259 tarantulas had no `tarantula_id`.

Every reader that filtered on `tarantula_id` alone therefore missed them. The
visible symptom (2026-10-07): premolt prediction saw a molt from June as the
"last molt" on a spider that molted last week, called it three months
overdue, and flagged premolt on a freshly moulted animal.

`invert_id` is the complete set (no log has tarantula_id without it), and the
two ids are equal, so matching either column is exact for a tarantula. Use
this for every read of a tarantula's feedings, molts, substrate changes or
photos.
"""
from sqlalchemy import or_


def tarantula_logs(model, tarantula_id):
    """Filter clause: this tarantula's rows in a log table, whichever parent
    column the writer set."""
    return or_(model.tarantula_id == tarantula_id, model.invert_id == tarantula_id)
