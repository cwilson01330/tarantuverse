"""Keep an animal's molt/instar count in step with its molt log (2026-10-07).

`inverts.current_instar` was a number keepers typed in by hand and then had to
remember to bump. Keepers of instar animals (mantids, jumping spiders) use it
as the instar ("L6"); tarantula keepers as a molt count. Either way it goes up
by exactly one per molt, so the server now does that.

The one rule that matters: only the NEWEST molt moves the count. Keepers often
back-fill history — a mantis already set to L6 whose keeper then logs its five
earlier molts must stay L6, not become L11. Likewise deleting an old molt says
nothing about the current stage; deleting the newest one undoes its bump.

A count that was never set stays unset: we don't know the starting point, and
guessing one is how a number becomes wrong.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session


def is_newest(molted_at: Optional[datetime], other_dates: list[Optional[datetime]]) -> bool:
    """True when `molted_at` is on or after every other molt of the animal."""
    if molted_at is None:
        return False
    others = [d for d in other_dates if d is not None]
    return all(_naive(molted_at) >= _naive(d) for d in others)


def _naive(d: datetime) -> datetime:
    return d.replace(tzinfo=None) if d.tzinfo else d


def adjust_instar_for_molt(db: Session, molt, delta: int) -> None:
    """After adding (+1) or before deleting (-1) `molt`, move the animal's
    count if this molt is its newest. Call before commit; flushes nothing."""
    from app.models.invert import Invert
    from app.models.molt_log import MoltLog
    from app.services.inverts_dualwrite import mirror_invert_update_to_legacy
    from app.utils.legacy_logs import tarantula_logs

    animal_id = molt.invert_id or molt.tarantula_id or getattr(molt, "scorpion_id", None)
    if animal_id is None:
        return  # colony / enclosure molts have no per-animal count
    invert = db.query(Invert).filter(Invert.id == animal_id).first()
    if invert is None or invert.current_instar is None:
        return
    others = [
        r[0] for r in db.query(MoltLog.molted_at)
        .filter(tarantula_logs(MoltLog, animal_id), MoltLog.id != molt.id)
        .all()
    ]
    if not is_newest(molt.molted_at, others):
        return
    invert.current_instar = max(0, invert.current_instar + delta)
    mirror_invert_update_to_legacy(db, invert)
