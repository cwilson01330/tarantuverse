"""Colony transfers -- whole colony or part of it ("sell 25 of 360").

Pins the rules that would be expensive to get wrong after keepers start using
it: a partial link can't promise animals the colony doesn't have, nothing
leaves the source colony until the buyer claims, a partial claim reduces the
source through events (so its population history stays true) and re-checks
the counts first, a full claim badges the source handed-off, and the public
preview never carries the sale price, location or notes.

No Postgres: handlers are called directly against a small fake session that
answers per model, same style as test_colony_end.py / test_colony_qr.py.
"""
import asyncio
import importlib.util
import inspect
import pathlib
import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.models.animal_transfer import AnimalTransfer
from app.models.colony import Colony, ColonyEvent
from app.models.invert_species import InvertSpecies
from app.models.photo import Photo
from app.routers import transfers as tr
from app.schemas.transfer import ColonyTransferCreate, TransferListItem, TransferPreview


def run(coro):
    return asyncio.run(coro)


# ── fakes ────────────────────────────────────────────────────────────────────

class Q:
    def __init__(self, first=None, rows=None):
        self._first, self._rows = first, rows or []
        self.clauses = []

    def filter(self, *clauses, **_k):
        self.clauses.extend(str(c.compile(dialect=postgresql.dialect())) for c in clauses)
        return self

    def order_by(self, *_a):
        return self

    def with_for_update(self, *_a, **_k):
        return self

    def populate_existing(self):
        return self

    def first(self):
        return self._first

    def all(self):
        return list(self._rows)


class DB:
    """query(Model) -> that model's Q. Everything added is kept in .added."""

    def __init__(self, by_model=None):
        self.qs = {}
        for model, value in (by_model or {}).items():
            self.qs[model] = value if isinstance(value, Q) else Q(first=value)
        self.added = []
        self.commits = 0

    def query(self, model, *_):
        return self.qs.setdefault(model, Q())

    def add(self, obj):
        self.added.append(obj)

    def flush(self):
        pass

    def commit(self):
        self.commits += 1

    def refresh(self, _obj):
        pass

    def of(self, cls):
        return [o for o in self.added if isinstance(o, cls)]


def user(**kw):
    base = dict(id=uuid.uuid4(), username="seller", display_name=None,
                created_at=datetime.now(timezone.utc) - timedelta(days=90))
    base.update(kw)
    return NS(**base)


def colony(owner, **kw):
    fields = dict(
        id=uuid.uuid4(), user_id=owner.id, taxon="isopod", name="Dairy cows",
        species_id=None, stage_counts={"adults": 300, "juveniles": 60, "mancae": 0},
        count_is_estimated=True, visibility="private", is_active=True,
        location="Rack 2", notes="private seller notes", sitter_note="sitter",
        enclosure_type="terrestrial", substrate_type="leaf litter",
        target_temp_min=70, target_temp_max=78, water_dish=False,
        founded_date=date(2025, 3, 1), transferred_out_at=None, ended_at=None,
        created_at=datetime.now(timezone.utc),
    )
    fields.update(kw)
    return Colony(**fields)


def transfer_for(col, seller, counts=None, **kw):
    snap = tr._build_colony_snapshot(DB(), col, seller, "partial" if counts else "full", counts)
    fields = dict(
        id=uuid.uuid4(), token="tok", colony_id=col.id, from_user_id=seller.id,
        status="pending", snapshot=snap, transfer_counts=counts,
        note="Ships Monday", sale_price=45, include_photos=False,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        created_at=datetime.now(timezone.utc),
    )
    fields.update(kw)
    return AnimalTransfer(**fields)


@pytest.fixture(autouse=True)
def _quiet_side_effects():
    with patch.object(tr.analytics_events, "capture"), \
            patch("app.services.notification_service.create_notification"):
        yield


def create(col, seller, **body):
    db = DB({Colony: col})
    out = run(tr.create_colony_transfer(
        colony_id=col.id if col else uuid.uuid4(),
        body=ColonyTransferCreate(**body), db=db, current_user=seller,
    ))
    return db, out


def claim(t, source, buyer, photos=()):
    db = DB({AnimalTransfer: t, Colony: source, Photo: Q(rows=list(photos))})
    return db, run(tr.claim_transfer(token=t.token, body=None, db=db, current_user=buyer))


# ── schema ───────────────────────────────────────────────────────────────────

def test_partial_needs_counts_and_full_refuses_them():
    with pytest.raises(ValidationError):
        ColonyTransferCreate(mode="partial")
    with pytest.raises(ValidationError):
        ColonyTransferCreate(mode="partial", counts={})
    with pytest.raises(ValidationError):
        ColonyTransferCreate(mode="full", counts={"adults": 3})
    assert ColonyTransferCreate(mode="full").counts is None
    assert ColonyTransferCreate(mode="full", counts={}).counts is None
    with pytest.raises(ValidationError):
        ColonyTransferCreate(mode="some")


@pytest.mark.parametrize("bad", [0, -2, True, "5", 2.5])
def test_partial_counts_must_be_whole_numbers_above_zero(bad):
    with pytest.raises(ValidationError):
        ColonyTransferCreate(mode="partial", counts={"adults": bad})


# ── create ───────────────────────────────────────────────────────────────────

def test_create_is_owner_only_and_404s_for_anyone_else():
    seller = user()
    db = DB({Colony: None})
    with pytest.raises(HTTPException) as e:
        run(tr.create_colony_transfer(
            colony_id=uuid.uuid4(), body=ColonyTransferCreate(mode="full"),
            db=db, current_user=seller,
        ))
    assert e.value.status_code == 404
    assert any("colonies.user_id" in c for c in db.qs[Colony].clauses)
    assert tr.create_colony_transfer.__access_policy__ == "owner_only"


@pytest.mark.parametrize("counts,needle", [
    ({"adults": 301}, "at most 300 adults"),
    ({"nymphs": 5}, "no 'nymphs' count"),
    ({"adults": 300, "juveniles": 60}, "Whole colony"),
])
def test_create_refuses_counts_the_colony_cannot_cover(counts, needle):
    seller = user()
    with pytest.raises(HTTPException) as e:
        create(colony(seller), seller, mode="partial", counts=counts)
    assert e.value.status_code == 400
    assert needle in e.value.detail


@pytest.mark.parametrize("state,needle", [
    (dict(ended_at=date(2026, 9, 1)), "ended"),
    (dict(is_active=False), "archived"),
    (dict(transferred_out_at=datetime.now(timezone.utc)), "already been transferred"),
])
def test_create_refuses_ended_archived_and_transferred_colonies(state, needle):
    seller = user()
    with pytest.raises(HTTPException) as e:
        create(colony(seller, **state), seller, mode="full")
    assert e.value.status_code == 400
    assert needle in e.value.detail


def test_create_partial_stores_the_counts_and_leaves_the_colony_alone():
    seller = user()
    col = colony(seller)
    db, out = create(col, seller, mode="partial", counts={"adults": 20, "juveniles": 5},
                     sale_price=45, note="Ships Monday")
    (t,) = db.of(AnimalTransfer)
    assert t.colony_id == col.id and t.invert_id is None and t.animal_id is None
    assert t.transfer_counts == {"adults": 20, "juveniles": 5}
    assert col.stage_counts == {"adults": 300, "juveniles": 60, "mancae": 0}  # untouched
    assert not db.of(ColonyEvent)
    assert out.claim_url.endswith(f"/claim/{t.token}")
    # The snapshot is what the buyer may see: none of the seller's private bits.
    blob = repr(t.snapshot)
    for private in ("Rack 2", "private seller notes", "sitter"):
        assert private not in blob
    assert not {"sale_price", "location", "notes"} & set(t.snapshot)
    assert t.sale_price == 45  # kept, privately, on the row


def test_create_full_has_no_counts():
    seller = user()
    db, _ = create(colony(seller), seller, mode="full")
    (t,) = db.of(AnimalTransfer)
    assert t.transfer_counts is None


# ── preview ──────────────────────────────────────────────────────────────────

def test_preview_shows_part_of_the_colony_and_never_the_price():
    seller = user()
    col = colony(seller)
    t = transfer_for(col, seller, counts={"adults": 20, "juveniles": 5})
    db = DB({AnimalTransfer: t, Colony: col})
    p = run(tr.preview_transfer(token="tok", db=db, viewer=None))
    data = p.model_dump()
    assert "sale_price" not in data and "sale_price" not in TransferPreview.model_fields
    assert "location" not in data and "notes" not in data
    assert "Rack 2" not in repr(data) and "private seller notes" not in repr(data)
    assert data["kind"] == "colony" and data["colony_mode"] == "partial"
    assert data["transfer_counts"] == {"adults": 20, "juveniles": 5}
    assert data["transfer_total"] == 25
    assert data["colony_total"] is None   # the seller's headcount stays private
    assert data["count_is_estimated"] is True
    assert data["note"] == "Ships Monday"


def test_preview_of_a_full_transfer_lists_every_non_empty_stage():
    seller = user()
    col = colony(seller)
    db = DB({AnimalTransfer: transfer_for(col, seller), Colony: col})
    p = run(tr.preview_transfer(token="tok", db=db, viewer=None))
    assert p.colony_mode == "full"
    assert p.transfer_counts == {"adults": 300, "juveniles": 60}
    assert p.transfer_total == p.colony_total == 360


def test_preview_photos_come_from_the_colony():
    seller = user()
    col = colony(seller)
    t = transfer_for(col, seller, include_photos=True)
    db = DB({AnimalTransfer: t, Colony: col, Photo: Q(rows=[NS(url="https://x.r2.dev/p.jpg")])})
    p = run(tr.preview_transfer(token="tok", db=db, viewer=None))
    assert p.photo_urls == ["https://x.r2.dev/p.jpg"]
    assert any("photos.colony_id" in c for c in db.qs[Photo].clauses)


# ── claim: full ──────────────────────────────────────────────────────────────

def test_full_claim_moves_the_whole_colony_and_badges_the_source():
    seller, buyer = user(), user(username="buyer")
    col = colony(seller)
    t = transfer_for(col, seller)
    db, out = claim(t, col, buyer)

    new = next(c for c in db.of(Colony) if c is not col)
    assert out == {"id": str(new.id), "kind": "colony", "taxon": "isopod",
                   "name": "Dairy cows", "scientific_name": None}
    assert new.user_id == buyer.id
    assert new.stage_counts == {"adults": 300, "juveniles": 60, "mancae": 0}
    assert new.count_is_estimated is True
    assert new.location is None and new.notes is None and new.sitter_note is None
    assert new.visibility == "private"
    assert new.founded_date == date(2025, 3, 1)  # the line's start date carries over
    assert new.date_acquired == tr._now().date()
    assert new.substrate_type == "leaf litter"

    assert col.transferred_out_at is not None
    assert col.stage_counts == {"adults": 300, "juveniles": 60, "mancae": 0}  # history kept
    assert t.status == "claimed" and t.claimed_colony_id == new.id and t.to_user_id == buyer.id
    # The buyer's counts arrive as events, so their history starts complete.
    added = [e for e in db.of(ColonyEvent) if e.colony_id == new.id]
    assert sorted((e.stage, e.count_delta, e.event_type) for e in added) == [
        ("adults", 300, "added"), ("juveniles", 60, "added"),
    ]
    assert not [e for e in db.of(ColonyEvent) if e.colony_id == col.id]
    assert db.commits == 1


def test_full_claim_copies_photos_only_when_asked():
    seller, buyer = user(), user(username="buyer")
    col = colony(seller)
    photo = NS(id=uuid.uuid4(), url="https://x.r2.dev/a.jpg", thumbnail_url=None,
               caption="tub", taken_at=None)
    with patch.object(tr.storage_service, "copy_photo",
                      AsyncMock(return_value=("https://x.r2.dev/b.jpg", None))) as cp:
        db, _ = claim(transfer_for(col, seller, include_photos=False), col, buyer, [photo])
        assert not db.of(Photo) and cp.await_count == 0
        col2 = colony(seller)
        db, _ = claim(transfer_for(col2, seller, include_photos=True), col2, buyer, [photo])
    (copied,) = db.of(Photo)
    new = next(c for c in db.of(Colony) if c is not col2)
    assert copied.colony_id == new.id and copied.invert_id is None
    assert new.photo_url == "https://x.r2.dev/b.jpg"


# ── claim: partial ───────────────────────────────────────────────────────────

def test_partial_claim_takes_the_counts_out_through_events():
    seller, buyer = user(), user(username="buyer")
    col = colony(seller)
    t = transfer_for(col, seller, counts={"adults": 20, "juveniles": 5})
    db, out = claim(t, col, buyer)

    new = next(c for c in db.of(Colony) if c is not col)
    assert new.stage_counts == {"adults": 20, "juveniles": 5}
    assert new.founded_date == tr._now().date()  # a split starts a new line
    assert col.stage_counts == {"adults": 280, "juveniles": 55, "mancae": 0}
    assert col.transferred_out_at is None and col.is_active is True

    removed = [e for e in db.of(ColonyEvent) if e.colony_id == col.id]
    assert sorted((e.stage, e.count_delta) for e in removed) == [("adults", -20), ("juveniles", -5)]
    for e in removed:
        assert e.event_type == "removed"
        assert e.user_id == seller.id
        assert e.notes == "Transferred to a new keeper"
        assert e.destination == "@buyer"
    assert t.claimed_colony_id == new.id and out["kind"] == "colony"


def test_partial_claim_409s_when_the_colony_has_shrunk_since():
    seller, buyer = user(), user(username="buyer")
    col = colony(seller)
    t = transfer_for(col, seller, counts={"adults": 20, "juveniles": 5})
    col.stage_counts = {"adults": 280, "juveniles": 3}  # deaths logged since
    with pytest.raises(HTTPException) as e:
        claim(t, col, buyer)
    assert e.value.status_code == 409
    assert "no longer has 5 juveniles" in e.value.detail and "there are 3 now" in e.value.detail
    assert col.stage_counts == {"adults": 280, "juveniles": 3}
    assert t.status == "pending"


def test_a_partial_that_now_takes_everything_left_is_still_honoured():
    seller, buyer = user(), user(username="buyer")
    col = colony(seller)
    t = transfer_for(col, seller, counts={"adults": 20})
    col.stage_counts = {"adults": 20}
    db, _ = claim(t, col, buyer)
    assert col.stage_counts == {"adults": 0}


# ── claim: guards ────────────────────────────────────────────────────────────

def test_a_link_cannot_be_claimed_twice():
    seller, buyer = user(), user(username="buyer")
    col = colony(seller)
    t = transfer_for(col, seller, status="claimed")
    with pytest.raises(HTTPException) as e:
        claim(t, col, buyer)
    assert e.value.status_code == 409 and "colony" in e.value.detail


def test_the_locked_reread_catches_a_claim_that_landed_first():
    seller, buyer = user(), user(username="buyer")
    col = colony(seller)
    t = transfer_for(col, seller)
    stale = transfer_for(col, seller, id=t.id)  # what this request read first
    t.status = "claimed"  # ...while another request claimed it
    db = DB({AnimalTransfer: Q(first=t), Colony: col})
    with pytest.raises(HTTPException) as e:
        run(tr._claim_colony_transfer(db, stale, buyer, None))
    assert e.value.status_code == 409
    assert not db.of(Colony)


@pytest.mark.parametrize("state", [
    dict(transferred_out_at=datetime.now(timezone.utc)),
    dict(ended_at=date(2026, 9, 1)),
])
def test_claim_refuses_a_source_that_already_left_or_ended(state):
    seller, buyer = user(), user(username="buyer")
    col = colony(seller)
    t = transfer_for(col, seller, counts={"adults": 2})
    for k, v in state.items():
        setattr(col, k, v)
    with pytest.raises(HTTPException) as e:
        claim(t, col, buyer)
    assert e.value.status_code == 409


def test_seller_cannot_claim_their_own_colony():
    seller = user()
    col = colony(seller)
    with pytest.raises(HTTPException) as e:
        claim(transfer_for(col, seller), col, seller)
    assert e.value.status_code == 400


def test_claim_follows_the_animal_claim_cap_rule_and_never_402s():
    """The invert/animal claim is deliberately exempt from the free cap (the
    buyer is often a brand-new keeper -- the growth loop). A colony counts as
    one animal, so it follows the same rule rather than a stricter one."""
    src = inspect.getsource(tr._claim_colony_transfer) + inspect.getsource(tr.claim_transfer)
    assert "enforce_collection_limit" not in src
    seller, buyer = user(), user(username="buyer")
    col = colony(seller)
    with patch("app.utils.limits.enforce_collection_limit",
               side_effect=HTTPException(status_code=402, detail="cap")):
        _db, out = claim(transfer_for(col, seller), col, buyer)
    assert out["kind"] == "colony"


# ── list ─────────────────────────────────────────────────────────────────────

def test_list_labels_colony_transfers_and_keeps_price_to_the_seller():
    seller = user()
    col = colony(seller)
    part = transfer_for(col, seller, counts={"adults": 20, "juveniles": 5})
    whole = transfer_for(col, seller, token="tok2")
    db = DB({AnimalTransfer: Q(rows=[part, whole])})
    rows = run(tr.list_transfers(role="sent", colony_id=col.id, db=db, current_user=seller))
    assert any("animal_transfers.colony_id" in c for c in db.qs[AnimalTransfer].clauses)
    a, b = rows
    assert a.kind == "colony" and a.colony_mode == "partial" and a.transfer_total == 25
    assert a.label == "25 from the colony (20 adults, 5 juveniles)"
    assert a.colony_id == str(col.id) and a.sale_price == 45
    assert b.colony_mode == "full" and b.label == "Whole colony" and b.transfer_counts is None
    assert "colony_id" in TransferListItem.model_fields


# ── schema of the table ──────────────────────────────────────────────────────

def test_one_source_check_now_includes_colony_id():
    (check,) = [c for c in AnimalTransfer.__table__.constraints
                if getattr(c, "name", None) == "animal_transfers_one_source_check"]
    text = str(check.sqltext)
    for col in ("invert_id", "animal_id", "colony_id"):
        assert col in text
    assert text.strip().endswith("= 1")
    for name in ("colony_id", "claimed_colony_id", "transfer_counts"):
        assert AnimalTransfer.__table__.c[name].nullable


def _migration():
    path = (pathlib.Path(__file__).resolve().parents[1] / "alembic" / "versions"
            / "ctr_20261008_colony_transfers.py")
    spec = importlib.util.spec_from_file_location("ctr_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_migration_chains_from_share_card_kinds_and_widens_the_check():
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    m = _migration()
    assert m.revision == "ctr_20261008_colony_transfers"
    assert m.down_revision == "shk_20261007_share_card_kinds"
    assert "colony_id" in m.ONE_SOURCE_V3 and "colony_id" not in m.ONE_SOURCE_V2
    up, down = inspect.getsource(m.upgrade), inspect.getsource(m.downgrade)
    for col in ("colony_id", "claimed_colony_id", "transfer_counts"):
        assert f'"{col}"' in up and f'"{col}"' in down
    assert 'ondelete="CASCADE"' in up and 'ondelete="SET NULL"' in up
    # The narrow CHECK can't hold colony rows, so downgrade removes them first.
    assert down.index("DELETE FROM animal_transfers") < down.index("ONE_SOURCE_V2")

    root = pathlib.Path(__file__).resolve().parents[1]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    script = ScriptDirectory.from_config(cfg)
    assert len(script.get_heads()) == 1
    assert m.revision in {r.revision for r in script.walk_revisions()}
