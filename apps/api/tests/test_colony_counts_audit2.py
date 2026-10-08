"""Colony count correctness (audit-2 M3-M7).

* M4 -- the event type decides the sign: a death of 5 lowers the count whatever
  sign the client sent, on create and on edit; a count_correction keeps its sign.
* M5 -- one spelling per bucket: "Unsexed", "unsexed" and "unsexed " are the
  same bucket on every write path and in the history replay.
* M6 -- creating (or importing) a colony writes one 'added' "Starting count"
  event per non-zero bucket, without adding the counts a second time.
* M7 -- a direct stage_counts edit writes a count_correction per changed bucket,
  including a removed bucket (down to zero) and a rename (out of old, into new).
* M3 -- an archived colony is no longer public: /col, link previews and card
  links treat it like an ended one for everyone but its owner.

No Postgres: handlers are called directly against small fakes, the style of
test_colony_end.py / test_colony_qr.py.
"""
import asyncio
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.models.colony import COLONY_EVENT_TYPES, Colony, ColonyEvent
from app.routers import colonies as cr
from app.routers import qr
from app.routers import share_cards as sc
from app.schemas.colony import (
    ColonyCreate,
    ColonyEventCreate,
    ColonyEventUpdate,
    ColonyUpdate,
)
from app.services.colony_history_service import _replay
from app.utils.colony_counts import (
    DECREASING_EVENTS,
    INCREASING_EVENTS,
    STARTING_COUNT_NOTE,
    bucket_for,
    canonical_stage,
    canonical_stage_counts,
    signed_delta,
)


def run(coro):
    return asyncio.run(coro)


# ── the canonicaliser ────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw,canon", [
    ("Unsexed", "unsexed"),
    ("  unsexed ", "unsexed"),
    ("Adult females", "adult females"),
    ("adult_females", "adult females"),
    ("Sub   Adults", "sub adults"),
    ("MIXED", "mixed"),
    ("L2", "l2"),
    ("", None),
    ("   ", None),
    (None, None),
])
def test_canonical_stage(raw, canon):
    assert canonical_stage(raw) == canon


def test_blank_and_missing_stage_land_in_mixed():
    assert bucket_for(None) == bucket_for("") == bucket_for("  ") == "mixed"
    assert bucket_for("Mixed") == "mixed"


def test_case_variants_merge_by_summing_and_keep_first_order():
    got = canonical_stage_counts({"Unsexed": 3, "Females": 2, "unsexed": 4, "adult_males": 1, "Adult males": 1})
    assert got == {"unsexed": 7, "females": 2, "adult males": 2}
    assert list(got) == ["unsexed", "females", "adult males"]


def test_canonical_counts_is_idempotent_and_keeps_none():
    once = canonical_stage_counts({"Adults": 1, "mixed": 0})
    assert canonical_stage_counts(once) == once == {"adults": 1, "mixed": 0}
    assert canonical_stage_counts(None) is None


# ── the sign rule ────────────────────────────────────────────────────────────

def test_every_event_type_has_a_known_sign_rule():
    assert DECREASING_EVENTS == {"death", "removed", "cannibalism", "split"}
    assert INCREASING_EVENTS == {"birth", "added", "merge"}
    assert (DECREASING_EVENTS | INCREASING_EVENTS) <= set(COLONY_EVENT_TYPES)


@pytest.mark.parametrize("etype", sorted(DECREASING_EVENTS))
def test_decreasing_types_always_lower(etype):
    assert signed_delta(etype, 5) == -5 and signed_delta(etype, -5) == -5


@pytest.mark.parametrize("etype", sorted(INCREASING_EVENTS))
def test_increasing_types_always_raise(etype):
    assert signed_delta(etype, 5) == 5 and signed_delta(etype, -5) == 5


def test_correction_and_others_keep_their_sign_and_none_stays_none():
    assert signed_delta("count_correction", -3) == -3
    assert signed_delta("count_correction", 3) == 3
    assert signed_delta("observation", 2) == 2
    assert signed_delta("death", None) is None


# ── schemas canonicalise on every path that takes a bucket ───────────────────

def test_create_and_update_payloads_canonicalise_bucket_keys():
    c = ColonyCreate(name="Bin", taxon="isopod", stage_counts={"Adults": 4, "adults": 1, "Mixed": 2})
    assert c.stage_counts == {"adults": 5, "mixed": 2}
    u = ColonyUpdate(stage_counts={"Unsexed": 9})
    assert u.stage_counts == {"unsexed": 9}


def test_event_payloads_canonicalise_the_stage():
    assert ColonyEventCreate(event_type="birth", stage="Unsexed", count_delta=1).stage == "unsexed"
    assert ColonyEventCreate(event_type="birth", stage="  ", count_delta=1).stage is None
    assert ColonyEventUpdate(stage="Adult_Females").stage == "adult females"
    assert "stage" not in ColonyEventUpdate(notes="x").model_dump(exclude_unset=True)


def test_apply_delta_merges_an_old_variant_into_the_canonical_bucket():
    col = NS(stage_counts={"Unsexed": 10, "females": 2})
    cr._apply_delta(col, "unsexed", -3)
    assert col.stage_counts == {"unsexed": 7, "females": 2}
    cr._apply_delta(col, "Females", 1)
    assert col.stage_counts == {"unsexed": 7, "females": 3}


def test_reverse_delta_reads_the_canonical_bucket():
    col = NS(stage_counts={"Adults": 2})
    assert cr._reverse_delta(col, "adults", 5) is True  # held 2, took back 5 -> clamped
    assert col.stage_counts == {"adults": 0}


def test_history_replays_case_variants_into_one_bucket():
    evs = [
        NS(count_delta=5, stage="Unsexed", occurred_at=date(2026, 1, 1), created_at=None, event_type="added"),
        NS(count_delta=-2, stage="unsexed", occurred_at=date(2026, 1, 2), created_at=None, event_type="death"),
    ]
    pts = _replay(evs)
    assert pts[-1]["stage_counts"] == {"unsexed": 3} and pts[-1]["total"] == 3


# ── fakes for the route handlers ─────────────────────────────────────────────

class Q:
    def __init__(self, first=None):
        self._first = first

    def filter(self, *a, **k):
        return self

    def first(self):
        return self._first


class DB:
    def __init__(self, first=None):
        self._first = first
        self.added, self.commits = [], 0

    def query(self, *_):
        return Q(self._first)

    def add(self, o):
        self.added.append(o)

    def commit(self):
        self.commits += 1

    def refresh(self, o):
        pass

    def events(self):
        return [o for o in self.added if isinstance(o, ColonyEvent)]


OWNER = NS(id=uuid.uuid4(), is_active=True)


def colony(**kw):
    fields = dict(id=uuid.uuid4(), user_id=OWNER.id, taxon="isopod", name="Dwarf whites",
                  stage_counts={"adults": 10}, count_is_estimated=False, visibility="private",
                  is_active=True, created_at=datetime.now(timezone.utc))
    fields.update(kw)
    return Colony(**fields)


@pytest.fixture
def as_owner(monkeypatch):
    """load_colony -> (the colony, owner access). Access control has its own tests."""
    state = {}

    def load(db, user, colony_id, need, not_found="Colony not found"):
        return state["colony"], NS(owner=OWNER, logged_by_user_id=None)

    monkeypatch.setattr(cr, "load_colony", load)
    return state


# ── M4 on the routes ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("sent", [5, -5])
def test_a_death_lowers_the_count_whatever_sign_was_sent(as_owner, sent):
    col = as_owner["colony"] = colony(stage_counts={"adults": 10})
    db = DB()
    log = run(cr.create_event(col.id, ColonyEventCreate(event_type="death", stage="Adults", count_delta=sent),
                              current_user=OWNER, db=db))
    assert log.count_delta == -5 and log.stage == "adults"
    assert col.stage_counts == {"adults": 5}


def test_a_birth_raises_and_a_correction_keeps_its_sign(as_owner):
    col = as_owner["colony"] = colony(stage_counts={"adults": 10})
    run(cr.create_event(col.id, ColonyEventCreate(event_type="birth", count_delta=-4),
                        current_user=OWNER, db=DB()))
    assert col.stage_counts == {"adults": 10, "mixed": 4}
    run(cr.create_event(col.id, ColonyEventCreate(event_type="count_correction", stage="adults", count_delta=-3),
                        current_user=OWNER, db=DB()))
    assert col.stage_counts == {"adults": 7, "mixed": 4}


def test_editing_an_event_reapplies_the_sign_rule(monkeypatch):
    col = colony(stage_counts={"adults": 15})  # holds a wrong-signed +5 "death"
    ev = ColonyEvent(id=uuid.uuid4(), colony_id=col.id, user_id=OWNER.id, event_type="death",
                     stage="adults", count_delta=5)
    monkeypatch.setattr(cr, "_event_for", lambda db, eid, user, need: ev)
    run(cr.update_event(ev.id, ColonyEventUpdate(notes="found in the corner"), current_user=OWNER, db=DB(col)))
    # +5 taken back, -5 applied: the stored population now matches the history.
    assert ev.count_delta == -5 and col.stage_counts == {"adults": 5}


def test_changing_type_to_a_decreasing_one_flips_the_sign(monkeypatch):
    col = colony(stage_counts={"adults": 12})
    ev = ColonyEvent(id=uuid.uuid4(), colony_id=col.id, user_id=OWNER.id, event_type="count_correction",
                     stage="adults", count_delta=2)
    monkeypatch.setattr(cr, "_event_for", lambda db, eid, user, need: ev)
    run(cr.update_event(ev.id, ColonyEventUpdate(event_type="removed"), current_user=OWNER, db=DB(col)))
    assert ev.count_delta == -2 and col.stage_counts == {"adults": 8}


# ── M6 starting count ────────────────────────────────────────────────────────

def test_create_writes_one_starting_event_per_nonzero_bucket_without_double_counting(monkeypatch):
    monkeypatch.setattr(cr, "enforce_collection_limit", lambda d, u: None)
    monkeypatch.setattr(cr, "canonical_location", lambda d, uid, raw: raw)
    db = DB()
    payload = ColonyCreate(name="Bin", taxon="isopod", stage_counts={"Adults": 12, "juveniles": 30, "mixed": 0})
    col = cr.create_colony_row(db, OWNER, payload, logged_by_user_id=None)
    assert col.stage_counts == {"adults": 12, "juveniles": 30, "mixed": 0}  # not doubled
    evs = db.events()
    assert sorted((e.stage, e.count_delta) for e in evs) == [("adults", 12), ("juveniles", 30)]
    assert all(e.event_type == "added" and e.notes == STARTING_COUNT_NOTE for e in evs)
    assert all(e.colony_id == col.id and col.id is not None and e.user_id == OWNER.id for e in evs)
    assert db.commits == 1  # one transaction with the colony


def test_create_with_no_counts_writes_no_events(monkeypatch):
    monkeypatch.setattr(cr, "enforce_collection_limit", lambda d, u: None)
    monkeypatch.setattr(cr, "canonical_location", lambda d, uid, raw: raw)
    db = DB()
    cr.create_colony_row(db, OWNER, ColonyCreate(name="Bin", taxon="isopod"))
    assert db.events() == []


def test_a_co_keeper_create_is_attributed(monkeypatch):
    monkeypatch.setattr(cr, "enforce_collection_limit", lambda d, u: None)
    monkeypatch.setattr(cr, "canonical_location", lambda d, uid, raw: raw)
    helper = uuid.uuid4()
    db = DB()
    cr.create_colony_row(db, OWNER, ColonyCreate(name="Bin", taxon="isopod", stage_counts={"adults": 1}),
                         logged_by_user_id=helper)
    assert [e.logged_by_user_id for e in db.events()] == [helper]


def test_replay_of_a_new_colony_matches_its_counts(monkeypatch):
    monkeypatch.setattr(cr, "enforce_collection_limit", lambda d, u: None)
    monkeypatch.setattr(cr, "canonical_location", lambda d, uid, raw: raw)
    db = DB()
    col = cr.create_colony_row(db, OWNER, ColonyCreate(name="Bin", taxon="isopod",
                                                       stage_counts={"adults": 12, "juveniles": 30}))
    pts = _replay(db.events())
    assert pts[-1]["total"] == sum(col.stage_counts.values())


def test_the_30_day_change_leaves_out_starting_counts():
    import inspect
    src = inspect.getsource(inspect.unwrap(cr.list_colonies))
    assert "ColonyEvent.notes.notin_(STARTING_COUNT_NOTES)" in src
    assert "ColonyEvent.notes.is_(None)" in src


# ── M7 direct edits ──────────────────────────────────────────────────────────

def _put(col, **payload):
    db = DB(col)
    run(cr.update_colony(col.id, ColonyUpdate(**payload), current_user=OWNER, db=db))
    return db.events()


def test_changed_buckets_are_logged_as_corrections(as_owner):
    col = as_owner["colony"] = colony(stage_counts={"adults": 10, "juveniles": 5})
    evs = _put(col, stage_counts={"adults": 12, "juveniles": 5})
    assert [(e.event_type, e.stage, e.count_delta) for e in evs] == [("count_correction", "adults", 2)]
    assert col.stage_counts == {"adults": 12, "juveniles": 5}


def test_a_removed_bucket_is_corrected_down_to_zero(as_owner):
    col = as_owner["colony"] = colony(stage_counts={"adults": 10, "juveniles": 5})
    evs = _put(col, stage_counts={"adults": 10})
    assert [(e.stage, e.count_delta) for e in evs] == [("juveniles", -5)]
    assert col.stage_counts == {"adults": 10}


def test_a_rename_is_a_move(as_owner):
    col = as_owner["colony"] = colony(stage_counts={"adults": 10})
    evs = _put(col, stage_counts={"breeders": 10})
    assert sorted((e.stage, e.count_delta) for e in evs) == [("adults", -10), ("breeders", 10)]
    # Replaying the history (baseline + move) lands on the stored counts, no double count.
    baseline = [NS(count_delta=10, stage="adults", occurred_at=date(2026, 1, 1), created_at=None, event_type="added")]
    moved = [NS(count_delta=e.count_delta, stage=e.stage, occurred_at=date(2026, 2, 1), created_at=None,
                event_type=e.event_type) for e in evs]
    assert _replay(baseline + moved)[-1]["stage_counts"] == {"adults": 0, "breeders": 10}


def test_a_respelling_is_no_change(as_owner):
    col = as_owner["colony"] = colony(stage_counts={"Adults": 10})
    assert _put(col, stage_counts={"adults": 10}) == []
    assert col.stage_counts == {"adults": 10}


def test_an_edit_that_leaves_counts_alone_writes_nothing(as_owner):
    col = as_owner["colony"] = colony(stage_counts={"adults": 10})
    assert _put(col, name="Renamed") == []
    assert col.stage_counts == {"adults": 10}


def test_clearing_all_buckets_corrects_each_to_zero(as_owner):
    col = as_owner["colony"] = colony(stage_counts={"adults": 3, "mixed": 2})
    evs = _put(col, stage_counts=None)
    assert sorted((e.stage, e.count_delta) for e in evs) == [("adults", -3), ("mixed", -2)]


def test_corrections_are_attributed_to_the_co_keeper(monkeypatch):
    helper = uuid.uuid4()
    col = colony(stage_counts={"adults": 3})
    monkeypatch.setattr(cr, "load_colony",
                        lambda *a, **k: (col, NS(owner=OWNER, logged_by_user_id=helper)))
    evs = _put(col, stage_counts={"adults": 4})
    assert [(e.user_id, e.logged_by_user_id) for e in evs] == [(OWNER.id, helper)]


# ── M3 archived colonies are not public ──────────────────────────────────────

def _public_colony(**kw):
    owner = NS(id=uuid.uuid4(), username="k", collection_visibility="public")
    fields = dict(
        id=uuid.uuid4(), user_id=owner.id, taxon="isopod", name="Dwarf whites", species_id=None,
        species=None, photo_url=None, stage_counts={"adults": 10}, count_is_estimated=False,
        transferred_out_at=None, ended_at=None, enclosure_type=None, enclosure_size=None,
        substrate_type=None, substrate_depth=None, last_substrate_change=None, target_temp_min=None,
        target_temp_max=None, target_humidity_min=None, target_humidity_max=None, water_dish=None,
        date_acquired=None, founded_date=None, source=None, notes=None, sitter_note=None,
        location=None, visibility="public", is_active=True,
    )
    fields.update(kw)
    return NS(**fields), owner


class KeyedDB:
    def __init__(self, rows):
        self.rows = rows

    def query(self, model, *_):
        name = getattr(model, "__name__", "")
        return Q(self.rows.get(name)) if name in self.rows else _Rows()


class _Rows(Q):
    def order_by(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def all(self):
        return []


def _col_page(col, owner, viewer):
    return run(qr.get_public_colony_profile(str(col.id), db=KeyedDB({"Colony": col, "User": owner}),
                                            current_user=viewer))


def test_an_archived_colony_is_a_404_to_strangers_but_not_its_owner():
    col, owner = _public_colony(is_active=False)
    for viewer in (None, NS(id=uuid.uuid4(), username="other")):
        with pytest.raises(HTTPException) as e:
            _col_page(col, owner, viewer)
        assert e.value.status_code == 404
    assert _col_page(col, owner, owner)["is_owner"] is True


def test_a_running_public_colony_is_still_public():
    col, owner = _public_colony()
    assert _col_page(col, owner, None)["is_owner"] is False


def test_share_cards_treat_archived_as_closed():
    col, _owner = _public_colony(is_active=False)
    assert sc._colony_closed(col) is True
    assert sc._colony_closed(_public_colony()[0]) is False


def test_an_archived_colony_has_no_link_preview_and_its_card_links_go():
    col, owner = _public_colony(is_active=False)
    with pytest.raises(HTTPException) as e:
        run(sc.public_colony_card(col.id, db=KeyedDB({"Colony": col, "User": owner})))
    assert e.value.status_code == 404
    assert sc._colony_live(KeyedDB({"Colony": col}), col.id) is False
    live, _ = _public_colony()
    assert sc._colony_live(KeyedDB({"Colony": live}), live.id) is True


# ── the data scripts ─────────────────────────────────────────────────────────

def _script(name):
    import importlib.util
    import pathlib
    path = pathlib.Path(__file__).resolve().parents[1] / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_fix_script_merges_variants_and_is_idempotent():
    fix = _script("fix_colony_stage_keys_20261008")
    new, merges = fix.plan_counts({"Unsexed": 3, "unsexed": 4, "Females": 1})
    assert new == {"unsexed": 7, "females": 1}
    assert merges == {"unsexed": ["Unsexed", "unsexed"]}
    assert fix.plan_counts(new) == (None, {})          # second run: nothing to do
    assert fix.plan_counts({}) == (None, {}) and fix.plan_counts(None) == (None, {})
    assert fix.plan_stage("Unsexed") == (True, "unsexed")
    assert fix.plan_stage("unsexed") == (False, "unsexed")
    assert fix.plan_stage("  ") == (True, None)
    assert fix.plan_stage(None) == (False, None)


def test_fix_script_dry_run_is_the_default():
    import inspect
    src = inspect.getsource(_script("fix_colony_stage_keys_20261008").main)
    assert 'apply = "--apply" in sys.argv' in src
    assert src.count("if apply:") >= 3


def test_sign_report_is_read_only():
    import inspect
    rep = _script("report_colony_event_signs")
    src = inspect.getsource(rep)
    for verb in ("UPDATE ", "DELETE ", "INSERT ", ".commit("):
        assert verb not in src.split('"""', 2)[2], verb
    assert "e.event_type = ANY(:dec) AND e.count_delta > 0" in rep.QUERY
    assert "e.event_type = ANY(:inc) AND e.count_delta < 0" in rep.QUERY
