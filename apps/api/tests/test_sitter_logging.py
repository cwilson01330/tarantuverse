"""Sitter logging (PRD-shared-keeping, rung 2) — security and behaviour.

One class per control. Like test_sitter_pass_security.py there's no
database: the controls live in code that a small model-aware fake session
can exercise, and every test here was checked by breaking the control it
guards and watching it fail.
"""
from __future__ import annotations

import asyncio
import inspect
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError

from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.sitter_pass import KeeperPass, KeeperPassAnimal
from app.models.tarantula import Tarantula
from app.routers import sitter_passes as sp
from app.schemas.sitter_pass import PassCreate, PassSummary, PassUpdate, SitterFeedingCreate
from app.utils import sitter_pass as auth

NOW = datetime.now(timezone.utc)
PIN = "4827"
# bcrypt is slow on purpose; hash the test PIN once for the whole module.
PIN_HASH = auth.hash_pin(PIN)


def make_pass(**kw):
    raw, h, prefix = auth.new_pass_token()
    base = dict(
        id=uuid.uuid4(), owner_user_id=uuid.uuid4(), app="tarantuverse", label="Sam",
        token_hash=h, token_prefix=prefix, revoked_at=None, locked_at=None,
        starts_at=NOW - timedelta(hours=1), expires_at=NOW + timedelta(days=3),
        open_count=0, last_used_at=None, created_at=NOW, animals=[],
        can_log=True, pin_hash=PIN_HASH, pin_failures=0, created_under_premium=True,
    )
    base.update(kw)
    return NS(**base)


class Q:
    """A query that returns what it was configured with, whatever the filter."""

    def __init__(self, first=None, count=0, rows=None, scalar=None):
        self._first, self._count, self._rows, self._scalar = first, count, rows, scalar

    def scalar(self):
        return self._scalar

    def filter(self, *a, **k):
        return self

    options = order_by = limit = with_for_update = group_by = populate_existing = filter

    def first(self):
        return self._first

    def one(self):
        return self._first

    def count(self):
        return self._count

    def all(self):
        if self._rows is not None:
            return list(self._rows)
        return [] if self._first is None else [self._first]

    def __iter__(self):
        return iter(self.all())


class DB:
    """Fake session that answers per model: DB({KeeperPass: Q(...), ...})."""

    def __init__(self, by_model=None):
        self.by_model = by_model or {}
        self.added, self.deleted = [], []
        self.commits = 0

    def query(self, model, *_):
        key = getattr(model, "class_", model)  # FeedingLog.logged_via_pass_id → FeedingLog
        return self.by_model.get(key, Q())

    def add(self, obj):
        self.added.append(obj)

    def delete(self, obj):
        self.deleted.append(obj)

    def commit(self):
        self.commits += 1

    def flush(self):
        pass

    def rollback(self):
        pass

    def refresh(self, obj):
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()


def creds(token):
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def run(fn, **kw):
    return asyncio.run(inspect.unwrap(fn)(**kw))


# ── the PIN itself ───────────────────────────────────────────────────────────

class TestPinRules:
    @pytest.mark.parametrize("pin", ["4827", "90210", "305182", " 4827 "])
    def test_accepts_four_to_six_digits(self, pin):
        assert auth.validate_pin(pin) == pin.strip()

    @pytest.mark.parametrize("pin", [
        "", "12", "482", "4827105", "48a7", "48 27", "١٢٣٧",
        "0000", "777777",             # one digit repeated
        "1234", "4321", "123456", "98765",  # straight runs
    ])
    def test_rejects_short_long_non_digit_and_first_guesses(self, pin):
        with pytest.raises(auth.WeakPinError):
            auth.validate_pin(pin)

    def test_hash_is_one_way_and_salted(self):
        h1, h2 = auth.hash_pin(PIN), auth.hash_pin(PIN)
        assert PIN not in h1 and h1 != h2
        assert auth.verify_pin(PIN, h1) and auth.verify_pin(PIN, h2)

    def test_verify_fails_closed(self):
        assert not auth.verify_pin("1111", PIN_HASH)
        assert not auth.verify_pin(PIN, None)
        assert not auth.verify_pin(PIN, "not-a-hash")
        assert not auth.verify_pin("9" * 50, PIN_HASH)

    def test_the_summary_never_carries_the_pin(self):
        fields = set(PassSummary.model_fields)
        assert "has_pin" in fields
        assert not fields & {"pin", "pin_hash", "pin_failures"}


# ── T1: a read session can't write ───────────────────────────────────────────

class TestWriteSessions:
    def test_a_read_session_cannot_write(self):
        p = make_pass()
        token, _ = auth.create_pass_session(p)
        claims = auth.decode_pass_session_claims(token)
        assert not auth.session_can_log(p, claims)
        with pytest.raises(HTTPException) as e:
            auth.get_logging_pass(pc=(p, claims))
        assert (e.value.status_code, e.value.detail) == (403, auth.PIN_NEEDED)

    def test_an_unlocked_session_can(self):
        p = make_pass()
        claims = auth.decode_pass_session_claims(auth.create_pass_session(p, logging=True)[0])
        assert auth.get_logging_pass(pc=(p, claims)) is p

    def test_changing_the_pin_ends_unlocked_sessions(self):
        p = make_pass()
        claims = auth.decode_pass_session_claims(auth.create_pass_session(p, logging=True)[0])
        p.pin_hash = auth.hash_pin(PIN)  # same digits, new salt — still a new PIN
        assert not auth.session_can_log(p, claims)

    def test_turning_logging_off_ends_unlocked_sessions(self):
        p = make_pass()
        claims = auth.decode_pass_session_claims(auth.create_pass_session(p, logging=True)[0])
        p.can_log = False
        assert not auth.session_can_log(p, claims)
        p.can_log, p.pin_hash = True, None
        assert not auth.session_can_log(p, claims)

    def test_no_write_session_without_logging_and_a_pin(self):
        for kw in ({"can_log": False}, {"pin_hash": None}):
            with pytest.raises(ValueError):
                auth.create_pass_session(make_pass(**kw), logging=True)

    def test_the_session_holds_no_trace_of_the_pin_hash(self):
        p = make_pass()
        token = auth.create_pass_session(p, logging=True)[0]
        claims = auth.decode_pass_session_claims(token)
        assert claims["pb"] not in p.pin_hash and p.pin_hash[7:20] not in token

    def test_revoking_still_kills_an_unlocked_session(self):
        p = make_pass()
        token = auth.create_pass_session(p, logging=True)[0]
        p.revoked_at = NOW
        with pytest.raises(HTTPException) as e:
            auth.get_current_pass_with_claims(credentials=creds(token), db=DB({KeeperPass: Q(p)}))
        assert e.value.status_code == 401


# ── T4: brute force — 5 wrong PINs lock the pass ─────────────────────────────

class TestUnlock:
    @pytest.fixture(autouse=True)
    def no_notify(self, monkeypatch):
        self.locked_notices = []
        monkeypatch.setattr(sp, "_notify_locked", lambda db, p: self.locked_notices.append(p.id))

    def unlock(self, p, pin):
        return run(sp.unlock_logging, request=None, body=sp.PinUnlockRequest(pin=pin),
                   p=p, db=DB({KeeperPass: Q(p)}))

    def test_right_pin_gives_a_write_session_but_keeps_the_count(self):
        """Review L1: a correct PIN must not hand an attacker fresh guesses."""
        p = make_pass(pin_failures=3)
        out = self.unlock(p, PIN)
        claims = auth.decode_pass_session_claims(out["session"])
        assert auth.session_can_log(p, claims) and p.pin_failures == 3

    def test_wrong_pins_count_down_then_lock_and_tell_the_keeper(self):
        p = make_pass()
        for left in (4, 3, 2, 1):
            with pytest.raises(HTTPException) as e:
                self.unlock(p, "9051")
            assert e.value.status_code == 403 and e.value.detail["attempts_left"] == left
            assert p.locked_at is None
        with pytest.raises(HTTPException) as e:
            self.unlock(p, "9051")
        assert e.value.status_code == 423 and e.value.detail == auth.LOGGING_PAUSED
        assert p.locked_at is not None and self.locked_notices == [p.id]
        # Review M1: the lockout pauses LOGGING; the list stays readable.
        assert auth.pass_is_live(p)

    def test_even_the_right_pin_fails_once_locked(self):
        p = make_pass(locked_at=NOW, pin_failures=5)
        with pytest.raises(HTTPException) as e:
            self.unlock(p, PIN)
        assert e.value.status_code == 423

    def test_a_lockout_ends_existing_write_sessions(self):
        p = make_pass()
        claims = auth.decode_pass_session_claims(auth.create_pass_session(p, logging=True)[0])
        p.locked_at = NOW
        assert not auth.session_can_log(p, claims)
        with pytest.raises(HTTPException) as e:
            auth.get_logging_pass(pc=(p, claims))
        assert e.value.status_code == 423

    def test_logging_turned_off_mid_request_wins(self):
        """The dependency saw logging on; by the time the lock is held the
        keeper has turned it off. The locked re-read must be what counts."""
        stale = make_pass()                       # can_log=True, as first read

        class Fresh(Q):
            def populate_existing(self):
                stale.can_log, stale.pin_hash = False, None
                return self

        with pytest.raises(HTTPException) as e:
            run(sp.unlock_logging, request=None, body=sp.PinUnlockRequest(pin=PIN),
                p=stale, db=DB({KeeperPass: Fresh(stale)}))
        assert e.value.status_code == 409

    def test_a_read_only_pass_has_nothing_to_unlock(self):
        p = make_pass(can_log=False, pin_hash=None)
        with pytest.raises(HTTPException) as e:
            self.unlock(p, PIN)
        assert e.value.status_code == 409

    def test_parallel_guesses_really_add_up(self):
        """Review H1. Each request's dependency hands the endpoint a STALE copy
        of the pass (the identity map), while the real row lives in `row`. The
        endpoint must re-read under the lock or the count never climbs."""
        row = {"pin_failures": 0, "locked_at": None}

        class Fresh(Q):
            def __init__(self, obj):
                super().__init__(obj)
                self.obj = obj

            def populate_existing(self):  # what SQLAlchemy does on refresh
                for k, v in row.items():
                    setattr(self.obj, k, v)
                return self

        class RowDB(DB):
            def __init__(self, obj):
                super().__init__({KeeperPass: Fresh(obj)})
                self.obj = obj

            def commit(self):
                row.update(pin_failures=self.obj.pin_failures, locked_at=self.obj.locked_at)

        for _ in range(auth.MAX_PIN_FAILURES):
            stale = make_pass(pin_failures=0, locked_at=None)  # read before the lock
            with pytest.raises(HTTPException):
                run(sp.unlock_logging, request=None, body=sp.PinUnlockRequest(pin="9051"),
                    p=stale, db=RowDB(stale))
        assert row["pin_failures"] == auth.MAX_PIN_FAILURES and row["locked_at"] is not None


# ── T6/T8: what a sitter can write ───────────────────────────────────────────

class TestSitterFeedingSchema:
    def test_sitters_cannot_backdate(self):
        assert "fed_at" not in SitterFeedingCreate.model_fields

    def test_colonies_are_not_loggable(self):
        with pytest.raises(ValidationError):
            SitterFeedingCreate(kind="colony", id=uuid.uuid4(), accepted=True)

    def test_only_feedings_and_refusals(self):
        assert set(SitterFeedingCreate.model_fields) == {
            "kind", "id", "accepted", "food_type", "food_size", "quantity", "notes"}


class TestSitterLogFeeding:
    @pytest.fixture(autouse=True)
    def setup(self, monkeypatch):
        self.notified = []
        monkeypatch.setattr(sp, "_notify_sitter_log",
                            lambda db, p, target, accepted: self.notified.append((target.id, accepted)))
        self.inv = NS(id=uuid.uuid4(), taxon="scorpion", name="Vex", feeding_paused_reason=None)
        monkeypatch.setattr(sp, "active_inverts_query", lambda db, uid: Q(self.inv))

    def call(self, p, db, **body):
        body = {"kind": "invert", "id": self.inv.id, "accepted": True, **body}
        return run(sp.sitter_log_feeding, request=None, body=SitterFeedingCreate(**body), p=p, db=db)

    def db(self, p, on_pass=True, recent=0, dup=None, twin=None):
        return DB({
            KeeperPass: Q(p),
            KeeperPassAnimal: Q(NS() if on_pass else None),
            FeedingLog: Q(dup, count=recent),
            Tarantula: Q(twin),
        })

    def test_logs_an_attributed_entry_at_server_time(self):
        p = make_pass()
        db = self.db(p)
        out = self.call(p, db, food_type="cricket", notes="ate right away")
        (log,) = db.added
        assert log.invert_id == self.inv.id and log.logged_via_pass_id == p.id
        assert abs((log.fed_at - datetime.now(timezone.utc)).total_seconds()) < 5
        assert log.logged_by_user_id is None and log.tarantula_id is None
        assert out["can_undo"] is True and out["comment"] == "ate right away"
        assert self.notified == [(self.inv.id, True)]

    def test_animal_not_on_this_pass_is_a_404(self):
        p = make_pass()
        with pytest.raises(HTTPException) as e:
            self.call(p, self.db(p, on_pass=False))
        assert e.value.status_code == 404

    def test_animal_no_longer_active_is_a_404(self, monkeypatch):
        """On the pass, but since sold, transferred or deceased."""
        monkeypatch.setattr(sp, "active_inverts_query", lambda db, uid: Q(None))
        p = make_pass()
        with pytest.raises(HTTPException) as e:
            self.call(p, self.db(p))
        assert e.value.status_code == 404

    def test_the_owner_scopes_the_lookup(self, monkeypatch):
        seen = []
        monkeypatch.setattr(sp, "active_inverts_query", lambda db, uid: seen.append(uid) or Q(self.inv))
        p = make_pass()
        self.call(p, self.db(p))
        assert seen == [p.owner_user_id]

    def test_per_pass_hourly_cap(self):
        p = make_pass()
        with pytest.raises(HTTPException) as e:
            self.call(p, self.db(p, recent=sp.PASS_WRITES_PER_HOUR))
        assert e.value.status_code == 429
        self.call(p, self.db(p, recent=sp.PASS_WRITES_PER_HOUR - 1))

    def test_a_double_tap_returns_the_first_entry(self):
        p = make_pass()
        dup = FeedingLog(id=uuid.uuid4(), invert_id=self.inv.id, accepted=True, fed_at=NOW,
                         created_at=NOW, logged_via_pass_id=p.id)
        db = self.db(p, dup=dup)
        out = self.call(p, db)
        assert out["id"] == str(dup.id) and db.added == [] and self.notified == []

    def test_a_tarantula_entry_shows_on_its_legacy_page_too(self):
        self.inv.taxon = "tarantula"
        p = make_pass()
        db = self.db(p, twin=NS(id=self.inv.id))
        self.call(p, db)
        assert db.added[0].tarantula_id == self.inv.id == db.added[0].invert_id

    def test_a_sitter_never_ends_a_pause_but_the_keeper_hears(self, monkeypatch):
        """Review M2: a pause is the keeper's call; an undo couldn't restore it."""
        alerts = []
        monkeypatch.setattr(sp, "_notify_fed_while_paused", lambda db, p, t: alerts.append(t.id))
        self.inv.feeding_paused_reason, self.inv.feeding_paused_until = "premolt", None
        p = make_pass()
        self.call(p, self.db(p), accepted=False)
        assert alerts == [] and self.notified == [(self.inv.id, False)]
        self.call(p, self.db(p), accepted=True)
        assert self.inv.feeding_paused_reason == "premolt"
        assert alerts == [self.inv.id]

    def test_a_revoke_or_lockout_mid_request_wins(self):
        for change, code in (({"locked_at": NOW}, 423), ({"can_log": False}, 403), ({"revoked_at": NOW}, 401)):
            p = make_pass(**change)
            with pytest.raises(HTTPException) as e:
                self.call(p, self.db(p))
            assert e.value.status_code == code

    def test_writes_never_check_premium(self):
        """Welfare rule (T12): a lapse mid-trip must not stop the sitter."""
        def boom(app):
            raise AssertionError("premium was checked on a sitter write")
        p = make_pass(owner=NS(is_active=True, is_premium_for_app=boom))
        self.call(p, self.db(p))
        assert "is_premium" not in inspect.getsource(sp.sitter_log_feeding)
        assert "is_premium" not in inspect.getsource(auth.get_logging_pass)


class TestHvAnimalFeeding:
    @pytest.fixture(autouse=True)
    def setup(self, monkeypatch):
        monkeypatch.setattr(sp, "_notify_sitter_log", lambda *a: None)
        self.animal = NS(id=uuid.uuid4(), name="Mango", last_fed_at=NOW - timedelta(days=9),
                         feeding_paused_reason=None)
        monkeypatch.setattr(sp, "active_animals_query", lambda db, uid: Q(self.animal))

    def call(self, accepted):
        p = make_pass(app="herpetoverse")
        db = DB({KeeperPass: Q(p), KeeperPassAnimal: Q(NS()), FeedingLog: Q(None)})
        run(sp.sitter_log_feeding, request=None, p=p, db=db,
            body=SitterFeedingCreate(kind="animal", id=self.animal.id, accepted=accepted))
        return db.added[0]

    def test_refusal_does_not_reset_days_since_fed(self):
        before = self.animal.last_fed_at
        log = self.call(False)
        assert log.animal_id == self.animal.id and self.animal.last_fed_at == before

    def test_accepted_feeding_moves_last_fed_forward(self):
        self.call(True)
        assert self.animal.last_fed_at > NOW - timedelta(minutes=1)


# ── T8: undo — own entries only, within an hour ──────────────────────────────

class TestUndo:
    def call(self, p, found):
        db = DB({FeedingLog: Q(found)})
        run(sp.sitter_undo_feeding, request=None, feeding_id=uuid.uuid4(), p=p, db=db)
        return db

    def test_own_recent_entry_is_removed(self):
        p = make_pass()
        f = FeedingLog(id=uuid.uuid4(), logged_via_pass_id=p.id, created_at=NOW - timedelta(minutes=59))
        assert self.call(p, f).deleted == [f]

    def test_undo_puts_days_since_fed_back(self):
        """The sitter's entry moved an HV animal's last_fed_at forward; undoing
        it must not leave the badge claiming a meal that didn't happen."""
        from app.models.animal import Animal
        p = make_pass(app="herpetoverse")
        before = NOW - timedelta(days=9)
        animal = NS(id=uuid.uuid4(), last_fed_at=NOW)
        f = FeedingLog(id=uuid.uuid4(), animal_id=animal.id, logged_via_pass_id=p.id,
                       fed_at=NOW, created_at=NOW - timedelta(minutes=5))
        db = DB({FeedingLog: Q(f), Animal: Q(animal)})
        orig = db.query
        db.query = lambda m, *a: Q(scalar=before) if not hasattr(m, "class_") and m is not Animal and m is not FeedingLog else orig(m)
        run(sp.sitter_undo_feeding, request=None, feeding_id=f.id, p=p, db=db)
        assert db.deleted == [f] and animal.last_fed_at == before

    def test_after_an_hour_only_the_keeper_can_change_it(self):
        p = make_pass()
        f = FeedingLog(id=uuid.uuid4(), logged_via_pass_id=p.id, created_at=NOW - timedelta(minutes=61))
        with pytest.raises(HTTPException) as e:
            self.call(p, f)
        assert e.value.status_code == 409

    def test_anything_not_logged_by_this_pass_is_a_404(self):
        with pytest.raises(HTTPException) as e:
            self.call(make_pass(), None)
        assert e.value.status_code == 404

    def test_the_lookup_is_scoped_to_this_pass(self):
        src = inspect.getsource(sp.sitter_undo_feeding)
        assert "FeedingLog.logged_via_pass_id == p.id" in src


# ── the payload only shows the sitter their OWN entries ──────────────────────

class TestPayloadLoggingState:
    def test_a_lockout_shows_as_paused_not_unlocked(self):
        st = sp._logging_state(make_pass(locked_at=NOW), logging_unlocked=True)
        assert st == {"can_log": True, "logging_unlocked": False, "logging_locked": True}

    def test_normal_states(self):
        assert sp._logging_state(make_pass(), True)["logging_unlocked"] is True
        assert sp._logging_state(make_pass(), False)["logging_unlocked"] is False
        ro = sp._logging_state(make_pass(can_log=False, pin_hash=None, locked_at=NOW), True)
        assert ro == {"can_log": False, "logging_unlocked": False, "logging_locked": False}


class TestPayloadLoggingFields:
    def test_only_this_passes_entries_are_listed(self):
        p = make_pass()
        mine = FeedingLog(id=uuid.uuid4(), logged_via_pass_id=p.id, accepted=True,
                          fed_at=NOW - timedelta(hours=2), created_at=NOW - timedelta(hours=2))
        keepers = FeedingLog(id=uuid.uuid4(), logged_via_pass_id=None, accepted=True,
                             fed_at=NOW - timedelta(hours=1), created_at=NOW, notes="private")
        other_pass = FeedingLog(id=uuid.uuid4(), logged_via_pass_id=uuid.uuid4(), accepted=True,
                                fed_at=NOW, created_at=NOW)
        out = sp._logging_fields(p, {"kind": "invert"}, [other_pass, keepers, mine], NOW)
        assert [e["id"] for e in out["sitter_logs"]] == [str(mine.id)]
        assert out["sitter_logs"][0]["can_undo"] is False     # two hours old
        assert "notes" not in out["sitter_logs"][0]

    def test_colonies_and_read_only_passes_are_not_loggable(self):
        assert not sp._logging_fields(make_pass(), {"kind": "colony"}, [], NOW)["loggable"]
        assert not sp._logging_fields(make_pass(can_log=False), {"kind": "invert"}, [], NOW)["loggable"]
        assert sp._logging_fields(make_pass(), {"kind": "animal"}, [], NOW)["loggable"]

    def test_prefill_is_the_last_meal_taken(self):
        refused = FeedingLog(accepted=False, food_type="superworm", fed_at=NOW)
        taken = FeedingLog(accepted=True, food_type="cricket", food_size="medium", fed_at=NOW)
        out = sp._logging_fields(make_pass(), {"kind": "invert"}, [refused, taken], NOW)
        assert out["prefill"] == {"food_type": "cricket", "food_size": "medium"}


# ── keeper side: turning logging on is the premium action ────────────────────

class TestKeeperControls:
    @pytest.fixture(autouse=True)
    def setup(self, monkeypatch):
        self.p = make_pass(can_log=False, pin_hash=None)
        monkeypatch.setattr(sp, "_owned_pass", lambda db, pid, user: self.p)
        monkeypatch.setattr(sp, "_log_counts", lambda db, ids: {})

    def update(self, premium, **body):
        user = NS(id=uuid.uuid4(), is_premium_for_app=lambda app: premium)
        return run(sp.update_pass, pass_id=self.p.id, body=PassUpdate(**body),
                   current_user=user, db=DB())

    def test_free_keepers_cannot_turn_logging_on(self):
        with pytest.raises(HTTPException) as e:
            self.update(False, can_log=True, pin="4827")
        assert e.value.status_code == 402 and e.value.detail["source"] == "shared_keeping"
        assert self.p.can_log is False

    def test_logging_needs_a_pin(self):
        with pytest.raises(HTTPException) as e:
            self.update(True, can_log=True)
        assert e.value.status_code == 422 and self.p.can_log is False

    def test_weak_pins_are_refused(self):
        with pytest.raises(HTTPException) as e:
            self.update(True, can_log=True, pin="1234")
        assert e.value.status_code == 422

    def test_premium_with_a_pin_turns_it_on(self):
        out = self.update(True, can_log=True, pin="4827")
        assert out.can_log and out.has_pin and auth.verify_pin("4827", self.p.pin_hash)

    def test_off_clears_the_pin_even_without_premium(self):
        self.p.can_log, self.p.pin_hash = True, PIN_HASH
        out = self.update(False, can_log=False)
        assert not out.can_log and self.p.pin_hash is None

    def test_changing_the_pin_is_never_paywalled(self):
        """Security hygiene after a lapse must stay possible."""
        self.p.can_log, self.p.pin_hash = True, PIN_HASH
        self.update(False, pin="90517")
        assert self.p.can_log and auth.verify_pin("90517", self.p.pin_hash)

    def test_a_pin_without_logging_is_refused(self):
        with pytest.raises(HTTPException) as e:
            self.update(True, pin="4827")
        assert e.value.status_code == 422 and self.p.pin_hash is None

    def test_the_final_state_always_satisfies_the_db_check(self):
        """NOT can_log OR pin_hash IS NOT NULL, whatever the request."""
        for body in ({"can_log": True, "pin": "4827"}, {"can_log": False}, {"label": "x"}):
            try:
                self.update(True, **body)
            except HTTPException:
                pass
            assert (not self.p.can_log) or self.p.pin_hash


class TestKeeperCreate:
    def create(self, premium, **extra):
        user = NS(id=uuid.uuid4(), is_premium_for_app=lambda app: premium)
        body = PassCreate(app="tarantuverse", animals=[{"kind": "invert", "id": uuid.uuid4()}],
                          expires_at=NOW + timedelta(days=3), **extra)
        return run(sp.create_pass, request=None, body=body, current_user=user, db=DB())

    def test_free_create_with_logging_is_a_402(self):
        with pytest.raises(HTTPException) as e:
            self.create(False, can_log=True, pin="4827")
        assert e.value.status_code == 402

    def test_logging_create_without_a_pin_is_a_422(self):
        with pytest.raises(HTTPException) as e:
            self.create(True, can_log=True)
        assert e.value.status_code == 422


class TestKeeperUnlock:
    def test_unlock_clears_the_lockout(self, monkeypatch):
        p = make_pass(locked_at=NOW, pin_failures=5)
        monkeypatch.setattr(sp, "_owned_pass", lambda db, pid, user: p)
        monkeypatch.setattr(sp, "_log_counts", lambda db, ids: {})
        out = run(sp.unlock_pass, pass_id=p.id, body=None, current_user=NS(id=uuid.uuid4()), db=DB())
        assert out.status == "active" and p.pin_failures == 0 and p.locked_at is None

    def test_an_ended_pass_stays_ended(self, monkeypatch):
        p = make_pass(locked_at=NOW, revoked_at=NOW)
        monkeypatch.setattr(sp, "_owned_pass", lambda db, pid, user: p)
        with pytest.raises(HTTPException) as e:
            run(sp.unlock_pass, pass_id=p.id, body=None, current_user=NS(id=uuid.uuid4()), db=DB())
        assert e.value.status_code == 409


# ── T10: the keeper hears about it ───────────────────────────────────────────

class TestNotifications:
    @pytest.fixture(autouse=True)
    def capture(self, monkeypatch):
        import app.services.notification_service as ns
        self.sent = []
        monkeypatch.setattr(ns, "create_notification", lambda db, **kw: self.sent.append(kw))

    def test_one_heads_up_per_round(self):
        from app.models.notification import Notification
        p, target = make_pass(), NS(name="Vex")
        sp._notify_sitter_log(DB({Notification: Q(None)}), p, target, True)
        sp._notify_sitter_log(DB({Notification: Q(NS(id=1))}), p, target, True)
        assert len(self.sent) == 1
        assert self.sent[0]["push_category"] == "sitter_activity_enabled"
        assert self.sent[0]["deeplink"] == "/sitter"

    def test_lockouts_ignore_the_preference(self):
        sp._notify_locked(DB(), make_pass())
        assert self.sent[0].get("push_category") is None
        assert self.sent[0]["type"] == "sitter_pass_locked"

    def test_sitter_deeplink_is_in_the_vocabulary(self):
        from app.services.notification_service import _validate_deeplink
        assert _validate_deeplink("/sitter", "sitter_log") == "/sitter"
