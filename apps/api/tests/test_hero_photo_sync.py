"""The hero photo must stay in step across the dual-write pair.

THE BUG: a tarantula lives in two tables until the ADR-005 read cutover — the
legacy `tarantulas` row and its `inverts` mirror — and different surfaces read
different ones. The web collection reads /api/v1/tarantulas/; the generic detail
screen reads /api/v1/inverts/.

All three photo_url write paths mirrored in ONE direction only, guarded by
`if not isinstance(parent, Invert)`. That works when the photo carries a
tarantula_id, because the owner lookup resolves the legacy row first. A photo
uploaded through /inverts/{id}/photos has no tarantula_id, so the owner resolves
as the Invert, the guard skips, and the legacy row is never updated.

Result: the keeper sets a new hero, the detail screen changes, the collection
card doesn't. Reported by a keeper 2026-08-02; seven animals across four
accounts were already affected.

These tests pin the property that prevents it: writes go BOTH ways, and which
kind of row you happen to be holding must not matter.
"""
import pytest

from app.utils.hero_photo import sync_hero_photo


class Row:
    """Stands in for any model carrying photo_url."""

    def __init__(self, id_, url=None):
        self.id = id_
        self.photo_url = url


class FakeQuery:
    """`filter()` receives a SQLAlchemy BinaryExpression, not a plain value, so
    there's nothing useful to match on here. Each test registers at most one row
    per model, so returning it is sufficient — what's under test is WHICH tables
    the helper reaches for and what it writes, not the WHERE clause."""

    def __init__(self, rows):
        self._rows = rows

    def filter(self, *_criteria):
        return self

    def first(self):
        return next(iter(self._rows.values()), None)


class FakeSession:
    """Routes db.query(Model) to whichever fake row we registered for it."""

    def __init__(self, by_model):
        self.by_model = by_model
        self.queried = []

    def query(self, model):
        self.queried.append(model.__name__)
        rows = self.by_model.get(model.__name__, {})
        return FakeQuery(rows)


def _models():
    from app.models.invert import Invert
    from app.models.scorpion import Scorpion
    from app.models.tarantula import Tarantula

    return Invert, Scorpion, Tarantula


# ── The direction that was broken ────────────────────────────────────────────

def test_invert_parent_writes_back_to_the_legacy_row():
    """THE REGRESSION TEST.

    A photo uploaded via /inverts/{id}/photos resolves its owner as the Invert.
    Before the fix this branch was skipped entirely and `tarantulas.photo_url`
    kept its old value — which is exactly what the collection card renders.
    """
    Invert, _, Tarantula = _models()
    invert = Invert(id='shared-pk', photo_url='old.jpg')
    legacy = Row('shared-pk', 'old.jpg')

    db = FakeSession({'Tarantula': {'shared-pk': legacy}, 'Scorpion': {}})
    sync_hero_photo(db, invert, 'new.jpg')

    assert invert.photo_url == 'new.jpg'
    assert legacy.photo_url == 'new.jpg', 'legacy row must follow the invert'


def test_legacy_parent_still_writes_forward_to_the_invert():
    """The direction that already worked must keep working."""
    Invert, _, Tarantula = _models()
    tarantula = Tarantula(id='shared-pk', photo_url='old.jpg')
    mirror = Row('shared-pk', 'old.jpg')

    db = FakeSession({'Invert': {'shared-pk': mirror}})
    sync_hero_photo(db, tarantula, 'new.jpg')

    assert tarantula.photo_url == 'new.jpg'
    assert mirror.photo_url == 'new.jpg'


# ── Shape and safety ─────────────────────────────────────────────────────────

def test_clearing_the_hero_propagates_too():
    """Delete-promotion passes None when the last photo goes. A null must
    propagate, or the collection keeps rendering a photo that no longer
    exists."""
    Invert, _, _ = _models()
    invert = Invert(id='shared-pk', photo_url='old.jpg')
    legacy = Row('shared-pk', 'old.jpg')

    db = FakeSession({'Tarantula': {'shared-pk': legacy}, 'Scorpion': {}})
    sync_hero_photo(db, invert, None)

    assert invert.photo_url is None
    assert legacy.photo_url is None


def test_missing_twin_is_not_an_error():
    """Invert-native taxa (centipedes, mantises, anything added after the
    per-taxon tables stopped being written) have no legacy row."""
    Invert, _, _ = _models()
    invert = Invert(id='no-twin', photo_url=None)

    db = FakeSession({'Tarantula': {}, 'Scorpion': {}})
    sync_hero_photo(db, invert, 'new.jpg')

    assert invert.photo_url == 'new.jpg'


def test_parent_without_a_twin_type_touches_no_other_table():
    """HV animals and colonies have no mirror. The helper must set the parent
    and then stop — not go hunting through tables that can't be related."""
    animal = Row('hv-1', None)
    db = FakeSession({})
    sync_hero_photo(db, animal, 'new.jpg')

    assert animal.photo_url == 'new.jpg'
    assert db.queried == [], 'should not query for twins that cannot exist'


def test_keyed_on_shared_pk_not_the_photo_fk():
    """Photos predating the ADR-005 backfill have a null invert_id. Keying the
    mirror on the photo's FK silently skipped those; keying on the shared
    primary key covers them."""
    Invert, _, _ = _models()
    invert = Invert(id='shared-pk', photo_url=None)
    legacy = Row('shared-pk', 'stale.jpg')

    db = FakeSession({'Tarantula': {'shared-pk': legacy}, 'Scorpion': {}})
    sync_hero_photo(db, invert, 'new.jpg')

    assert legacy.photo_url == 'new.jpg'
