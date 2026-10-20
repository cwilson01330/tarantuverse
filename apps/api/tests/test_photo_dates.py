"""Keeper-set photo dates (2026-10-20).

Uploads stamp taken_at with the upload time (EXIF is stripped), so old photos
added in one go land out of order on the photo timeline. PATCH /photos/{id}
now takes `taken_at` so the keeper can set the day a photo was really taken:

* a valid date is stored (aware UTC); a naive one is read as UTC;
* null clears it (the timeline falls back to created_at);
* before 1990 or in the future -> 400, row untouched;
* omitting it leaves the stored date alone (caption-only edits);
* still allowed on died / transferred animals (it corrects history).

Fake-DB style, like test_tv_closed_inverts.
"""
import asyncio
import inspect
import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.models.photo import Photo
from app.routers import photos as ph

UPLOADED = datetime(2026, 10, 20, 15, 30, tzinfo=timezone.utc)


class Q:
    def __init__(self, first=None):
        self._first = first

    def filter(self, *a, **k):
        return self

    def first(self):
        return self._first


class DB:
    def __init__(self, photo):
        self.photo, self.commits, self.rollbacks = photo, 0, 0

    def query(self, model, *_):
        assert model is Photo
        return Q(self.photo)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def refresh(self, obj):
        pass


def run(fn, **kw):
    return asyncio.run(inspect.unwrap(fn)(**kw))


@pytest.fixture
def owner():
    return NS(id=uuid.uuid4())


def _photo(**over):
    base = dict(id=str(uuid.uuid4()), invert_id=uuid.uuid4(), url="https://r2/p.jpg", thumbnail_url="t",
                caption="first web", taken_at=UPLOADED, created_at=UPLOADED, logged_by_user_id=None)
    base.update(over)
    return NS(**base)


@pytest.fixture
def parent(monkeypatch, owner):
    animal = NS(id=uuid.uuid4(), user_id=owner.id, died_at=None, transferred_out_at=None)
    access = NS(owner=owner, actor=owner, role="owner", logged_by_user_id=None)
    monkeypatch.setattr(ph, "load_log_parent", lambda db, user, row, need, **k: (animal, access))
    return animal


def _patch(photo, owner, **fields):
    db = DB(photo)
    out = run(ph.update_photo, photo_id=photo.id, data=ph.PhotoUpdate(**fields), db=db, current_user=owner)
    return out, db


def test_sets_taken_at_and_returns_it(parent, owner):
    photo = _photo()
    when = datetime(2024, 3, 5, 17, 0, tzinfo=timezone.utc)  # local noon in UTC-5
    out, db = _patch(photo, owner, taken_at=when)
    assert photo.taken_at == when
    assert out["taken_at"] == when.isoformat()
    assert out["created_at"] == UPLOADED.isoformat()  # upload time never moves
    assert db.commits == 1


def test_offset_datetimes_are_stored_as_utc(parent, owner):
    photo = _photo()
    when = datetime(2024, 3, 5, 12, 0, tzinfo=timezone(timedelta(hours=-5)))
    _patch(photo, owner, taken_at=when)
    assert photo.taken_at == datetime(2024, 3, 5, 17, 0, tzinfo=timezone.utc)
    assert photo.taken_at.tzinfo == timezone.utc


def test_naive_datetime_is_read_as_utc(parent, owner):
    photo = _photo()
    _patch(photo, owner, taken_at=datetime(2023, 1, 2, 12, 0))
    assert photo.taken_at == datetime(2023, 1, 2, 12, 0, tzinfo=timezone.utc)


def test_json_string_body_parses(parent, owner):
    photo = _photo()
    body = ph.PhotoUpdate.model_validate({"taken_at": "2025-06-01T16:00:00.000Z"})
    run(ph.update_photo, photo_id=photo.id, data=body, db=DB(photo), current_user=owner)
    assert photo.taken_at == datetime(2025, 6, 1, 16, 0, tzinfo=timezone.utc)


def test_null_clears_the_date(parent, owner):
    photo = _photo()
    out, _ = _patch(photo, owner, taken_at=None)
    assert photo.taken_at is None
    assert out["taken_at"] is None


def test_caption_only_edit_leaves_the_date_alone(parent, owner):
    photo = _photo()
    _patch(photo, owner, caption="new caption")
    assert photo.taken_at == UPLOADED
    assert photo.caption == "new caption"


def test_date_only_edit_leaves_the_caption_alone(parent, owner):
    photo = _photo()
    _patch(photo, owner, taken_at=datetime(2024, 1, 1, 12, tzinfo=timezone.utc))
    assert photo.caption == "first web"


@pytest.mark.parametrize("when,msg", [
    (datetime(1989, 12, 31, 12, tzinfo=timezone.utc), "1990"),
    (datetime.now(timezone.utc) + timedelta(days=3), "future"),
], ids=["too_old", "future"])
def test_out_of_range_dates_are_refused(parent, owner, when, msg):
    photo = _photo()
    db = DB(photo)
    with pytest.raises(HTTPException) as e:
        run(ph.update_photo, photo_id=photo.id, data=ph.PhotoUpdate(taken_at=when, caption="x"),
            db=db, current_user=owner)
    assert e.value.status_code == 400
    assert msg in e.value.detail
    assert photo.taken_at == UPLOADED and photo.caption == "first web"  # nothing applied
    assert db.commits == 0


def test_local_noon_today_is_accepted_anywhere(parent, owner):
    # Local noon today in UTC-12 is ~12-24 h ahead of UTC now.
    photo = _photo()
    when = datetime.now(timezone.utc) + timedelta(hours=24)
    _patch(photo, owner, taken_at=when)
    assert photo.taken_at == when


def test_1990_is_allowed(parent, owner):
    photo = _photo()
    _patch(photo, owner, taken_at=datetime(1990, 1, 1, tzinfo=timezone.utc))
    assert photo.taken_at.year == 1990


@pytest.mark.parametrize("field,value", [
    ("died_at", date(2026, 9, 1)),
    ("transferred_out_at", datetime(2026, 9, 1, tzinfo=timezone.utc)),
], ids=["died", "transferred"])
def test_closed_animals_can_still_fix_photo_dates(parent, owner, field, value):
    setattr(parent, field, value)
    photo = _photo()
    when = datetime(2025, 5, 5, 12, tzinfo=timezone.utc)
    _patch(photo, owner, taken_at=when)
    assert photo.taken_at == when


def test_access_check_runs_before_anything(monkeypatch, owner):
    def deny(db, user, row, need, **k):
        raise HTTPException(status_code=404, detail="Photo not found")
    monkeypatch.setattr(ph, "load_log_parent", deny)
    photo = _photo()
    with pytest.raises(HTTPException) as e:
        _patch(photo, owner, taken_at=datetime(2024, 1, 1, tzinfo=timezone.utc))
    assert e.value.status_code == 404
    assert photo.taken_at == UPLOADED
