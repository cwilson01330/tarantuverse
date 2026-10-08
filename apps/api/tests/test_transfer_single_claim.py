"""One animal can only be claimed once (fresh audit 2026-10-08): a second
pending link, or two simultaneous claims, must not create a second animal."""
import inspect
from datetime import date, datetime, timezone
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.routers import transfers


def test_handed_off_or_died_source_is_refused():
    with pytest.raises(HTTPException) as e:
        transfers._refuse_handed_off_source(NS(transferred_out_at=datetime.now(timezone.utc), died_at=None))
    assert e.value.status_code == 409
    with pytest.raises(HTTPException):
        transfers._refuse_handed_off_source(NS(transferred_out_at=None, died_at=date.today()))
    transfers._refuse_handed_off_source(NS(transferred_out_at=None, died_at=None))  # fine


def test_every_claim_path_locks_and_checks_the_source():
    claim = inspect.getsource(transfers.claim_transfer)
    assert "with_for_update()" in claim and 'locked.status != "pending"' in claim
    assert "_refuse_handed_off_source(source)" in claim
    assert "_refuse_handed_off_source(source)" in inspect.getsource(transfers._claim_animal_transfer)
