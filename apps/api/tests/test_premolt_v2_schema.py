"""Premolt v2 schema: episodes table, snooze column, daily-run guard row."""
import uuid
from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.invert import Invert
from app.models.premolt_episode import PremoltEpisode
from app.models.system_setting import SystemSetting
from app.models.user import User

pytestmark = pytest.mark.requires_postgres


def _user(db):
    u = User(id=uuid.uuid4(), email=f"pm-{uuid.uuid4().hex[:8]}@test.local",
             username=f"pm_{uuid.uuid4().hex[:8]}", is_active=True, is_verified=True)
    db.add(u)
    db.commit()
    return u


def _invert(db, user):
    inv = Invert(id=uuid.uuid4(), user_id=user.id, taxon="tarantula", name="Pm")
    db.add(inv)
    db.commit()
    return inv


def _ep(inv, user, **kw):
    base = dict(invert_id=inv.id, user_id=user.id, opened_on=date(2026, 11, 17),
                branch="fasting", signals={}, rule_version="2026-11-v2")
    base.update(kw)
    return PremoltEpisode(**base)


def test_episode_round_trip(db_session):
    u = _user(db_session)
    inv = _invert(db_session, u)
    db_session.add(_ep(inv, u, signals={"gap_days": 31, "usual": 9.5}))
    db_session.commit()
    db_session.expire_all()
    got = db_session.query(PremoltEpisode).filter_by(invert_id=inv.id).one()
    assert got.signals == {"gap_days": 31, "usual": 9.5}
    assert got.closed_on is None and got.keeper_answer is None
    assert got.created_at is not None


def test_only_one_open_episode_per_animal(db_session):
    u = _user(db_session)
    inv = _invert(db_session, u)
    db_session.add(_ep(inv, u, closed_on=date(2026, 11, 1), close_reason="molted"))
    db_session.add(_ep(inv, u))
    db_session.commit()  # closed + open is fine
    db_session.add(_ep(inv, u))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_close_reason_check(db_session):
    u = _user(db_session)
    inv = _invert(db_session, u)
    db_session.add(_ep(inv, u, closed_on=date(2026, 11, 2), close_reason="bogus"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_invert_has_snooze_column(db_session):
    u = _user(db_session)
    inv = _invert(db_session, u)
    assert inv.premolt_snoozed_until is None
    inv.premolt_snoozed_until = date(2026, 12, 1)
    db_session.commit()
    db_session.expire_all()
    assert db_session.get(Invert, inv.id).premolt_snoozed_until == date(2026, 12, 1)


def test_run_guard_setting_seeded(db_session):
    row = db_session.query(SystemSetting).filter_by(key="premolt.episodes_last_run_on").one()
    assert row.value == ""
    assert row.value_type == "string"
    assert row.category == "maintenance"
    assert row.is_sensitive is False
