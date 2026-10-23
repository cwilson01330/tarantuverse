"""Expense tracking - schemas + CRUD router (Task 3, spec 2026-10-22 §2).

Real Postgres through the TestClient: users, co-keeper memberships, premium
subscriptions, inverts / colonies / HV animals are real rows, so the access
rules (stranger 404, below-keeper 403, lapsed owner -> read-only) and the
premium gate are exercised end to end rather than mocked.
"""
import itertools
import json
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.models.animal import Animal
from app.models.collection_member import CollectionMember
from app.models.colony import Colony
from app.models.expense import Expense, ExpenseShare
from app.models.invert import Invert
from app.models.subscription import SubscriptionPlan, UserSubscription
from app.models.user import User
from app.utils.auth import create_access_token
from app.utils.rate_limit import limiter

pytestmark = pytest.mark.requires_postgres

URL = "/api/v1/expenses/"
TV, HV = "tarantuverse", "herpetoverse"
PREMIUM_BODY = {"detail": "Expense tracking is a premium feature", "code": "premium_required"}
BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)
_seq = itertools.count()


@pytest.fixture(autouse=True)
def _fresh_limiter():
    limiter.reset()
    yield
    limiter.reset()


# ── builders ─────────────────────────────────────────────────────────────────

def today() -> date:
    return datetime.now(timezone.utc).date()


def mk_user(db, tag, display_name=None):
    u = User(
        id=uuid.uuid4(),
        email=f"{tag}-{uuid.uuid4().hex[:8]}@test.local",
        username=f"{tag}_{uuid.uuid4().hex[:8]}",
        display_name=display_name,
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    return u


def make_premium(db, user, app=TV):
    plan = SubscriptionPlan(name=f"plan-{uuid.uuid4().hex[:10]}", display_name="Premium", app=app)
    db.add(plan)
    db.commit()
    sub = UserSubscription(user_id=user.id, plan_id=plan.id, status="active")
    db.add(sub)
    db.commit()
    return sub


def join(db, owner, member, role, app=TV):
    db.add(CollectionMember(
        owner_user_id=owner.id, member_user_id=member.id, app=app, role=role,
        invited_email=member.email, status="active",
    ))
    db.commit()


def hdr(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.id)})}"}


def mk_invert(db, owner, name=None, **kw):
    i = next(_seq)
    row = Invert(
        id=uuid.uuid4(), user_id=owner.id, taxon="tarantula", name=name or f"T{i}",
        created_at=BASE + timedelta(seconds=i), **kw,
    )
    db.add(row)
    db.commit()
    return row


def mk_colony(db, owner, name=None, **kw):
    i = next(_seq)
    row = Colony(
        id=uuid.uuid4(), user_id=owner.id, taxon="isopod", name=name or f"C{i}",
        created_at=BASE + timedelta(seconds=i), **kw,
    )
    db.add(row)
    db.commit()
    return row


def mk_animal(db, owner, name=None, **kw):
    i = next(_seq)
    row = Animal(
        id=uuid.uuid4(), user_id=owner.id, taxon="snake", name=name or f"S{i}",
        created_at=BASE + timedelta(seconds=i), **kw,
    )
    db.add(row)
    db.commit()
    return row


def body(app=TV, **kw):
    d = {
        "app": app,
        "spent_on": today().isoformat(),
        "description": "Crickets",
        "category": "feeders",
        "amount": "10.00",
    }
    d.update(kw)
    return d


def dec(v) -> Decimal:
    return Decimal(str(v))


@pytest.fixture()
def world(db_session):
    """A premium TV owner, with one co-keeper per role and a stranger."""
    db = db_session
    w = SimpleNamespace(db=db)
    w.owner = mk_user(db, "owner", display_name="Olivia Owner")
    make_premium(db, w.owner, TV)
    w.keeper = mk_user(db, "keeper", display_name="Kay Keeper")
    w.logger = mk_user(db, "logger")
    w.viewer = mk_user(db, "viewer")
    w.stranger = mk_user(db, "stranger")
    join(db, w.owner, w.keeper, "keeper")
    join(db, w.owner, w.logger, "logger")
    join(db, w.owner, w.viewer, "viewer")
    return w


@pytest.fixture()
def post(client):
    def _post(user, payload, **kw):
        return client.post(URL, json=payload, headers=hdr(user), **kw)
    return _post


# ── create + split ───────────────────────────────────────────────────────────

def test_create_split_across_collection_stores_shares(client, world, post):
    db, owner = world.db, world.owner
    open_ones = [mk_invert(db, owner) for _ in range(15)]
    dead = mk_invert(db, owner, died_at=datetime.now(timezone.utc))
    gone = mk_invert(db, owner, transferred_out_at=datetime.now(timezone.utc))

    r = post(owner, body(amount="30", split={"mode": "collection"}))
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["split_mode"] == "collection"
    assert out["share_count"] == 15
    assert len(out["shares"]) == 15
    assert {dec(s["amount"]) for s in out["shares"]} == {Decimal("2.00")}
    assert {s["target_kind"] for s in out["shares"]} == {"invert"}
    targets = {s["target_id"] for s in out["shares"]}
    assert targets == {str(i.id) for i in open_ones}
    assert str(dead.id) not in targets and str(gone.id) not in targets

    stored = db.query(ExpenseShare).filter(ExpenseShare.expense_id == uuid.UUID(out["id"])).all()
    assert sorted(s.position for s in stored) == list(range(15))
    assert sum(s.amount for s in stored) == Decimal("30.00")


def test_create_without_split_is_a_plain_purchase(client, world, post):
    r = post(world.owner, body(notes="  bag of 1000  "))
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["split_mode"] == "none" and out["split_label"] is None
    assert out["share_count"] == 0 and out["shares"] == []
    assert out["notes"] == "bag of 1000"
    assert out["created_by_name"] == "Olivia Owner"
    assert dec(out["amount"]) == Decimal("10.00")


def test_collection_split_includes_colonies(client, world, post):
    db, owner = world.db, world.owner
    t = mk_invert(db, owner, name="Rosie")
    c = mk_colony(db, owner, name="Dairy cows")
    mk_colony(db, owner, name="Crashed", ended_at=today())
    out = post(owner, body(amount="9.00", split={"mode": "collection"})).json()
    assert out["share_count"] == 2
    by_name = {s["name"]: s for s in out["shares"]}
    assert by_name["Rosie"]["target_kind"] == "invert" and by_name["Rosie"]["target_id"] == str(t.id)
    assert by_name["Dairy cows"]["target_kind"] == "colony" and by_name["Dairy cows"]["target_id"] == str(c.id)
    assert [s["name"] for s in out["shares"]] == ["Rosie", "Dairy cows"]  # animals, then colonies
    assert [dec(s["amount"]) for s in out["shares"]] == [Decimal("4.50"), Decimal("4.50")]


def test_location_split_records_the_canonical_label(client, world, post):
    db, owner = world.db, world.owner
    a = mk_invert(db, owner, location="Rack A")
    b = mk_invert(db, owner, location="rack a")  # same place, different spelling
    mk_invert(db, owner, location="Garage")
    out = post(owner, body(amount="1.01", split={"mode": "location", "location": "RACK A "})).json()
    assert out["split_mode"] == "location"
    assert out["split_label"] == "Rack A"
    assert {s["target_id"] for s in out["shares"]} == {str(a.id), str(b.id)}
    assert sorted(dec(s["amount"]) for s in out["shares"]) == [Decimal("0.50"), Decimal("0.51")]


def test_location_with_no_animals_is_400(client, world, post):
    mk_invert(world.db, world.owner, location="Rack A")
    r = post(world.owner, body(split={"mode": "location", "location": "Nowhere"}))
    assert r.status_code == 400
    assert r.json()["detail"] == "No animals at that location"


def test_animals_split_uses_exactly_the_picked_ids(client, world, post):
    db, owner = world.db, world.owner
    a, b, _c = (mk_invert(db, owner) for _ in range(3))
    out = post(owner, body(amount="5.00", split={"mode": "animals", "invert_ids": [str(a.id), str(b.id)]})).json()
    assert [s["target_id"] for s in out["shares"]] == [str(a.id), str(b.id)]
    assert [dec(s["amount"]) for s in out["shares"]] == [Decimal("2.50"), Decimal("2.50")]


def test_picking_someone_elses_or_a_closed_animal_is_404(client, world, post):
    db, owner = world.db, world.owner
    theirs = mk_invert(db, world.stranger)
    dead = mk_invert(db, owner, died_at=datetime.now(timezone.utc))
    for pick in (theirs, dead):
        r = post(owner, body(split={"mode": "animals", "invert_ids": [str(pick.id)]}))
        assert r.status_code == 404, r.text
        assert r.json()["detail"] == "Animal not found"
    assert db.query(Expense).filter(Expense.owner_id == owner.id).count() == 0


def test_a_split_that_resolves_to_nothing_is_400(client, world, post):
    r = post(world.owner, body(split={"mode": "collection"}))  # owner has no animals
    assert r.status_code == 400
    assert r.json()["detail"] == "No animals to split across"
    assert world.db.query(Expense).count() == 0


@pytest.mark.parametrize("mode", ["none", "collection", "location"])
def test_ids_with_a_mode_other_than_animals_are_refused(client, world, post, mode):
    a = mk_invert(world.db, world.owner, location="Rack A")
    split = {"mode": mode, "invert_ids": [str(a.id)]}
    if mode == "location":
        split["location"] = "Rack A"
    r = post(world.owner, body(split=split))
    assert r.status_code == 400
    assert r.json()["detail"] == "Ids are only used when splitting across picked animals"


def test_herpetoverse_split_uses_animals_and_no_colonies(client, world, post):
    db = world.db
    hv_owner = mk_user(db, "hvowner")
    make_premium(db, hv_owner, HV)
    a, b = mk_animal(db, hv_owner, name="Noodle"), mk_animal(db, hv_owner, name="Ball")
    mk_animal(db, hv_owner, died_at=datetime.now(timezone.utc))
    out = post(hv_owner, body(app=HV, amount="3.00", split={"mode": "collection"})).json()
    assert [s["target_kind"] for s in out["shares"]] == ["animal", "animal"]
    assert {s["target_id"] for s in out["shares"]} == {str(a.id), str(b.id)}
    assert {s["name"] for s in out["shares"]} == {"Noodle", "Ball"}
    # An invert id on HV is refused by the split service.
    r = post(hv_owner, body(app=HV, split={"mode": "animals", "invert_ids": [str(uuid.uuid4())]}))
    assert r.status_code == 400


# ── validation ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "sent, stored",
    [("30.005", "30.01"), (30, "30.00"), ("30", "30.00"), (12.5, "12.50"), ("0.005", "0.01"),
     ("100000", "100000.00"), ("100000.004", "100000.00")],
)
def test_amount_is_rounded_half_up_to_cents(client, world, post, sent, stored):
    r = post(world.owner, body(amount=sent))
    assert r.status_code == 201, r.text
    assert dec(r.json()["amount"]) == Decimal(stored)
    row = world.db.get(Expense, uuid.UUID(r.json()["id"]))
    assert row.amount == Decimal(stored)


@pytest.mark.parametrize(
    "sent",
    ["0.004", "0", "-5", "100000.005", 100001, "abc", None, True,
     "NaN", "Infinity", "-Infinity",
     "1e30", 1e30, "9" * 29],  # huge values: quantize() overflows the 28-digit context
)
def test_amount_floor_and_ceiling_are_422(client, world, post, sent):
    r = post(world.owner, body(amount=sent))
    assert r.status_code == 422, r.text
    assert world.db.query(Expense).count() == 0


@pytest.mark.parametrize("token", ["NaN", "Infinity", "-Infinity"])
def test_non_finite_json_numbers_are_422(client, world, token):
    """Bare JSON tokens (not strings) - httpx cannot send these via json=, so post the raw body."""
    raw = json.dumps({**body(), "amount": 0}).replace('"amount": 0', f'"amount": {token}')
    r = client.post(URL, content=raw, headers={**hdr(world.owner), "Content-Type": "application/json"})
    assert r.status_code == 422, r.text
    assert world.db.query(Expense).count() == 0


def test_spent_on_today_plus_one_ok_plus_two_422(client, world, post):
    t = today()
    assert post(world.owner, body(spent_on=(t + timedelta(days=1)).isoformat())).status_code == 201
    assert post(world.owner, body(spent_on=(t + timedelta(days=2)).isoformat())).status_code == 422
    assert post(world.owner, body(spent_on="1990-01-01")).status_code == 201
    assert post(world.owner, body(spent_on="1989-12-31")).status_code == 422


@pytest.mark.parametrize(
    "overrides",
    [
        {"description": ""},
        {"description": "   "},
        {"description": "x" * 121},
        {"category": "animals"},
        {"category": ""},
        {"app": "both"},
        {"notes": "n" * 501},
        {"split": {"mode": "rack"}},
    ],
)
def test_other_bad_fields_are_422(client, world, post, overrides):
    assert post(world.owner, body(**overrides)).status_code == 422


def test_description_is_trimmed_and_blank_notes_become_null(client, world, post):
    out = post(world.owner, body(description="  Zoo Med bulb ", notes="   ")).json()
    assert out["description"] == "Zoo Med bulb"
    assert out["notes"] is None
    assert post(world.owner, body(description="x" * 120)).status_code == 201


# ── update ───────────────────────────────────────────────────────────────────

def _targets(out):
    return [s["target_id"] for s in out["shares"]]


def test_amount_only_edit_keeps_targets_even_if_one_died_since(client, world, post):
    db, owner = world.db, world.owner
    a, b, c = (mk_invert(db, owner) for _ in range(3))
    made = post(owner, body(amount="10.00", split={"mode": "animals", "invert_ids": [str(a.id), str(b.id), str(c.id)]})).json()
    assert [dec(s["amount"]) for s in made["shares"]] == [Decimal("3.34"), Decimal("3.33"), Decimal("3.33")]

    b.died_at = datetime.now(timezone.utc)
    db.commit()
    r = client.put(f"{URL}{made['id']}", json={"amount": "20.00"}, headers=hdr(owner))
    assert r.status_code == 200, r.text
    out = r.json()
    assert _targets(out) == _targets(made)  # the dead animal keeps its slot
    assert [dec(s["amount"]) for s in out["shares"]] == [Decimal("6.67"), Decimal("6.67"), Decimal("6.66")]
    assert sum(dec(s["amount"]) for s in out["shares"]) == Decimal("20.00")
    assert out["split_mode"] == "animals" and out["share_count"] == 3
    assert out["description"] == "Crickets"  # untouched


def test_amount_only_edit_keeps_a_null_target_slot(client, world, post):
    db, owner = world.db, world.owner
    a, b = mk_invert(db, owner), mk_invert(db, owner)
    made = post(owner, body(amount="3.00", split={"mode": "animals", "invert_ids": [str(a.id), str(b.id)]})).json()
    db.delete(a)
    db.commit()
    out = client.put(f"{URL}{made['id']}", json={"amount": "5.00"}, headers=hdr(owner)).json()
    assert [s["target_kind"] for s in out["shares"]] == [None, "invert"]
    assert [s["name"] for s in out["shares"]][0] == "Removed animal"
    assert [dec(s["amount"]) for s in out["shares"]] == [Decimal("2.50"), Decimal("2.50")]


def test_edit_without_amount_or_split_leaves_shares_alone(client, world, post):
    db, owner = world.db, world.owner
    a, b = mk_invert(db, owner), mk_invert(db, owner)
    made = post(owner, body(amount="3.01", split={"mode": "collection"})).json()
    out = client.put(f"{URL}{made['id']}", json={"description": "Renamed", "category": "other",
                                                  "spent_on": "2026-02-03"}, headers=hdr(owner)).json()
    assert out["description"] == "Renamed" and out["category"] == "other" and out["spent_on"] == "2026-02-03"
    assert out["shares"] == made["shares"]


def test_split_change_reresolves(client, world, post):
    db, owner = world.db, world.owner
    a, b, c = (mk_invert(db, owner, location="Rack A" if i < 2 else None) for i in range(3))
    made = post(owner, body(amount="9.00", split={"mode": "collection"})).json()
    assert made["share_count"] == 3

    c.died_at = datetime.now(timezone.utc)  # closed since: drops out of a re-resolve
    db.commit()
    out = client.put(f"{URL}{made['id']}", json={"split": {"mode": "collection"}}, headers=hdr(owner)).json()
    assert out["share_count"] == 2
    assert set(_targets(out)) == {str(a.id), str(b.id)}
    assert [dec(s["amount"]) for s in out["shares"]] == [Decimal("4.50"), Decimal("4.50")]

    out = client.put(f"{URL}{made['id']}", json={"split": {"mode": "animals", "invert_ids": [str(a.id)]}},
                     headers=hdr(owner)).json()
    assert _targets(out) == [str(a.id)] and dec(out["shares"][0]["amount"]) == Decimal("9.00")

    out = client.put(f"{URL}{made['id']}", json={"split": {"mode": "location", "location": "rack a"}},
                     headers=hdr(owner)).json()
    assert out["split_mode"] == "location" and out["split_label"] == "Rack A" and out["share_count"] == 2

    out = client.put(f"{URL}{made['id']}", json={"split": {"mode": "none"}}, headers=hdr(owner)).json()
    assert out["split_mode"] == "none" and out["split_label"] is None
    assert out["share_count"] == 0 and out["shares"] == []
    assert db.query(ExpenseShare).filter(ExpenseShare.expense_id == uuid.UUID(made["id"])).count() == 0


def test_put_split_null_keeps_the_current_split(client, world, post):
    """`split: null` is the same as leaving it out: the shares stay."""
    db, owner = world.db, world.owner
    mk_invert(db, owner), mk_invert(db, owner)
    made = post(owner, body(amount="4.00", split={"mode": "collection"})).json()
    r = client.put(f"{URL}{made['id']}", json={"split": None}, headers=hdr(owner))
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["split_mode"] == "collection" and out["share_count"] == 2
    assert out["shares"] == made["shares"]


def test_split_and_amount_together_use_the_new_amount(client, world, post):
    db, owner = world.db, world.owner
    mk_invert(db, owner), mk_invert(db, owner)
    made = post(owner, body(amount="1.00")).json()
    out = client.put(f"{URL}{made['id']}", json={"amount": "5.01", "split": {"mode": "collection"}},
                     headers=hdr(owner)).json()
    assert [dec(s["amount"]) for s in out["shares"]] == [Decimal("2.51"), Decimal("2.50")]


def test_update_can_clear_notes_and_refuses_null_required_fields(client, world, post):
    made = post(world.owner, body(notes="hello")).json()
    r = client.put(f"{URL}{made['id']}", json={"notes": None}, headers=hdr(world.owner))
    assert r.status_code == 200 and r.json()["notes"] is None
    for field in ("amount", "description", "category", "spent_on"):
        r = client.put(f"{URL}{made['id']}", json={field: None}, headers=hdr(world.owner))
        assert r.status_code == 422, (field, r.text)


def test_update_validates_like_create(client, world, post):
    made = post(world.owner, body()).json()
    for payload in ({"amount": "0.004"}, {"amount": "100001"}, {"description": " "},
                    {"spent_on": (today() + timedelta(days=2)).isoformat()}, {"category": "pets"}):
        assert client.put(f"{URL}{made['id']}", json=payload, headers=hdr(world.owner)).status_code == 422
    a = mk_invert(world.db, world.owner)
    r = client.put(f"{URL}{made['id']}",
                   json={"split": {"mode": "collection", "invert_ids": [str(a.id)]}}, headers=hdr(world.owner))
    assert r.status_code == 400
    assert r.json()["detail"] == "Ids are only used when splitting across picked animals"


# ── detail, deleted animals, delete ──────────────────────────────────────────

def test_deleted_invert_shows_as_removed_animal_in_detail(client, world, post):
    db, owner = world.db, world.owner
    a, b = mk_invert(db, owner, name="Goner"), mk_invert(db, owner, name="Stayer")
    made = post(owner, body(amount="4.00", split={"mode": "collection"})).json()
    db.delete(a)
    db.commit()
    r = client.get(f"{URL}{made['id']}", headers=hdr(owner))
    assert r.status_code == 200
    shares = r.json()["shares"]
    assert shares[0] == {"target_kind": None, "target_id": None, "name": "Removed animal", "amount": "2.00"}
    assert shares[1]["name"] == "Stayer" and shares[1]["target_kind"] == "invert"
    assert r.json()["share_count"] == 2  # the purchase still adds up


def test_share_names_follow_the_fallback_chain(client, world, post):
    db, owner = world.db, world.owner
    first = mk_invert(db, owner, common_name="Greenbottle", scientific_name="C. cyaneopubescens")
    second = mk_invert(db, owner, scientific_name="Aphonopelma sp.")
    first.name = second.name = None  # mk_invert always names its rows
    db.commit()
    names = [s["name"] for s in post(owner, body(amount="2.00", split={"mode": "collection"})).json()["shares"]]
    assert names == ["Greenbottle", "Aphonopelma sp."]


def test_created_by_name_falls_back_to_username_then_none(client, world, post):
    out = post(world.owner, body()).json()
    assert out["created_by_name"] == "Olivia Owner"
    o2 = mk_user(world.db, "plain")  # no display_name
    make_premium(world.db, o2, TV)
    made = post(o2, body()).json()
    assert made["created_by_name"] == o2.username
    world.db.query(Expense).filter(Expense.id == uuid.UUID(made["id"])).update({Expense.created_by: None})
    world.db.commit()
    assert client.get(f"{URL}{made['id']}", headers=hdr(o2)).json()["created_by_name"] is None


def test_unknown_expense_is_404(client, world):
    for call in (client.get, client.delete):
        r = call(f"{URL}{uuid.uuid4()}", headers=hdr(world.owner))
        assert r.status_code == 404 and r.json()["detail"] == "Expense not found"
    r = client.put(f"{URL}{uuid.uuid4()}", json={"amount": "1"}, headers=hdr(world.owner))
    assert r.status_code == 404


def test_delete_removes_the_expense_and_its_shares(client, world, post):
    mk_invert(world.db, world.owner)
    made = post(world.owner, body(split={"mode": "collection"})).json()
    r = client.delete(f"{URL}{made['id']}", headers=hdr(world.owner))
    assert r.status_code == 204 and r.content == b""
    assert client.get(f"{URL}{made['id']}", headers=hdr(world.owner)).status_code == 404
    assert world.db.query(ExpenseShare).count() == 0


def test_requests_without_a_token_are_401(client):
    assert client.get(URL, params={"app": TV}).status_code in (401, 403)
    assert client.post(URL, json=body()).status_code in (401, 403)


# ── access ───────────────────────────────────────────────────────────────────

ROLES = [("owner", 0), ("keeper", 0), ("logger", 403), ("viewer", 403), ("stranger", 404)]


def _who(w, name):
    return getattr(w, name)


def _expect(code_if_ok, deny):
    return code_if_ok if deny == 0 else deny


@pytest.mark.parametrize("who,deny", ROLES)
def test_access_list(client, world, post, who, deny):
    post(world.owner, body())
    r = client.get(URL, params={"app": TV, "collection": str(world.owner.id)}, headers=hdr(_who(world, who)))
    assert r.status_code == _expect(200, deny), r.text
    if deny == 0:
        assert r.json()["total"] == 1


@pytest.mark.parametrize("who,deny", ROLES)
def test_access_detail(client, world, post, who, deny):
    made = post(world.owner, body()).json()
    r = client.get(f"{URL}{made['id']}", headers=hdr(_who(world, who)))
    assert r.status_code == _expect(200, deny), r.text


@pytest.mark.parametrize("who,deny", ROLES)
def test_access_create(client, world, post, who, deny):
    r = post(_who(world, who), body(collection=str(world.owner.id)))
    assert r.status_code == _expect(201, deny), r.text
    if deny == 0:
        row = world.db.get(Expense, uuid.UUID(r.json()["id"]))
        assert row.owner_id == world.owner.id            # the OWNER's ledger
        assert row.created_by == _who(world, who).id     # who logged it
    else:
        assert world.db.query(Expense).count() == 0


@pytest.mark.parametrize("who,deny", ROLES)
def test_access_update(client, world, post, who, deny):
    made = post(world.owner, body()).json()
    r = client.put(f"{URL}{made['id']}", json={"description": "Edited"}, headers=hdr(_who(world, who)))
    assert r.status_code == _expect(200, deny), r.text
    expected = "Edited" if deny == 0 else "Crickets"
    assert world.db.get(Expense, uuid.UUID(made["id"])).description == expected


@pytest.mark.parametrize("who,deny", ROLES)
def test_access_delete(client, world, post, who, deny):
    made = post(world.owner, body()).json()
    r = client.delete(f"{URL}{made['id']}", headers=hdr(_who(world, who)))
    assert r.status_code == _expect(204, deny), r.text
    assert (world.db.get(Expense, uuid.UUID(made["id"])) is None) == (deny == 0)


def test_a_keeper_logging_for_the_owner_is_named_in_created_by_name(client, world, post):
    made = post(world.keeper, body(collection=str(world.owner.id))).json()
    assert made["created_by_name"] == "Kay Keeper"
    seen = client.get(f"{URL}{made['id']}", headers=hdr(world.owner)).json()
    assert seen["created_by_name"] == "Kay Keeper"


def test_a_keeper_splits_over_the_owners_animals_not_their_own(client, world, post):
    db = world.db
    mine = mk_invert(db, world.keeper, name="Keeper's own")
    theirs = mk_invert(db, world.owner, name="Owner's")
    out = post(world.keeper, body(collection=str(world.owner.id), split={"mode": "collection"})).json()
    assert _targets(out) == [str(theirs.id)] and str(mine.id) not in _targets(out)


def test_a_stranger_on_another_collection_is_404_not_403(client, world):
    r = client.get(URL, params={"app": TV, "collection": str(world.owner.id)}, headers=hdr(world.stranger))
    assert r.status_code == 404


def test_memberships_are_per_app(client, world, post):
    hv_owner = mk_user(world.db, "hvowner")
    make_premium(world.db, hv_owner, HV)
    # The TV keeper has no HV membership with this owner.
    r = post(world.keeper, body(app=HV, collection=str(hv_owner.id)))
    assert r.status_code == 404


# ── premium ──────────────────────────────────────────────────────────────────

def test_premium_gate_blocks_create_and_update_only(client, world, post):
    free = mk_user(world.db, "free")
    # An expense that predates a lapse (inserted directly).
    row = Expense(id=uuid.uuid4(), owner_id=free.id, created_by=free.id, app=TV, spent_on=today(),
                  description="Old", category="other", amount=Decimal("5.00"), split_mode="none")
    world.db.add(row)
    world.db.commit()

    r = post(free, body())
    assert r.status_code == 403
    assert r.json() == PREMIUM_BODY
    r = client.put(f"{URL}{row.id}", json={"description": "New"}, headers=hdr(free))
    assert r.status_code == 403 and r.json() == PREMIUM_BODY
    assert world.db.get(Expense, row.id).description == "Old"

    lst = client.get(URL, params={"app": TV}, headers=hdr(free))
    assert lst.status_code == 200
    assert lst.json()["can_add"] is False and lst.json()["total"] == 1
    assert client.get(f"{URL}{row.id}", headers=hdr(free)).status_code == 200
    assert client.delete(f"{URL}{row.id}", headers=hdr(free)).status_code == 204


def test_premium_check_comes_after_validation_of_access_not_before(client, world, post):
    # A stranger on a free owner's collection gets 404, never the premium message.
    free_owner = mk_user(world.db, "freeowner")
    r = post(world.stranger, body(collection=str(free_owner.id)))
    assert r.status_code == 404


def test_can_add_is_true_for_a_premium_owner(client, world):
    r = client.get(URL, params={"app": TV}, headers=hdr(world.owner))
    assert r.json() == {"items": [], "total": 0, "can_add": True}


def test_the_owners_premium_covers_a_free_cokeeper(client, world, post):
    assert not world.keeper.is_premium_for_app(TV)
    r = post(world.keeper, body(collection=str(world.owner.id)))
    assert r.status_code == 201, r.text
    lst = client.get(URL, params={"app": TV, "collection": str(world.owner.id)}, headers=hdr(world.keeper))
    assert lst.json()["can_add"] is True


def test_tv_premium_does_not_unlock_herpetoverse(client, world, post):
    r = post(world.owner, body(app=HV))
    assert r.status_code == 403 and r.json() == PREMIUM_BODY
    lst = client.get(URL, params={"app": HV}, headers=hdr(world.owner))
    assert lst.status_code == 200 and lst.json()["can_add"] is False


def test_a_bundle_plan_covers_both_apps(client, world, post):
    both = mk_user(world.db, "both")
    make_premium(world.db, both, "both")
    assert post(both, body(app=TV)).status_code == 201
    assert post(both, body(app=HV)).status_code == 201


def test_a_keeper_of_an_owner_whose_premium_lapsed_is_read_only(client, world, post):
    made = post(world.owner, body()).json()
    sub = world.db.query(UserSubscription).filter(UserSubscription.user_id == world.owner.id).one()
    sub.expires_at = datetime.now(timezone.utc) - timedelta(days=1)  # lapsed
    world.db.commit()
    assert not world.owner.is_premium_for_app(TV)

    h = hdr(world.keeper)
    r = client.get(URL, params={"app": TV, "collection": str(world.owner.id)}, headers=h)
    assert r.status_code == 403  # `require` resolves them to viewer; no special case here
    assert client.get(f"{URL}{made['id']}", headers=h).status_code == 403
    # The owner still reads, deletes (and can't add).
    lst = client.get(URL, params={"app": TV}, headers=hdr(world.owner))
    assert lst.status_code == 200 and lst.json()["can_add"] is False


# ── apps are separate; list filters and order ────────────────────────────────

def test_apps_are_separate(client, world, post):
    hv = mk_user(world.db, "hv2")
    make_premium(world.db, hv, "both")
    tv = post(hv, body(app=TV, description="TV thing")).json()
    hvx = post(hv, body(app=HV, description="HV thing")).json()
    tv_list = client.get(URL, params={"app": TV}, headers=hdr(hv)).json()
    hv_list = client.get(URL, params={"app": HV}, headers=hdr(hv)).json()
    assert [i["id"] for i in tv_list["items"]] == [tv["id"]]
    assert [i["id"] for i in hv_list["items"]] == [hvx["id"]]
    # Opening an expense under the other app's membership rules: a TV keeper has no HV rights.
    other = mk_user(world.db, "tvkeeper")
    join(world.db, hv, other, "keeper", TV)
    assert client.get(f"{URL}{hvx['id']}", headers=hdr(other)).status_code == 404
    assert client.get(f"{URL}{tv['id']}", headers=hdr(other)).status_code == 200


def test_app_is_required_and_validated_on_list(client, world):
    assert client.get(URL, headers=hdr(world.owner)).status_code == 422
    assert client.get(URL, params={"app": "both"}, headers=hdr(world.owner)).status_code == 422


def _seed(db, owner, rows):
    made = []
    for i, (spent_on, category, desc) in enumerate(rows):
        e = Expense(id=uuid.uuid4(), owner_id=owner.id, created_by=owner.id, app=TV,
                    spent_on=spent_on, description=desc, category=category, amount=Decimal("1.00"),
                    split_mode="none", created_at=BASE + timedelta(minutes=i))
        db.add(e)
        made.append(e)
    db.commit()
    return made


def test_list_filters_and_order(client, world):
    d = date
    _seed(world.db, world.owner, [
        (d(2026, 3, 1), "feeders", "A"),
        (d(2026, 3, 1), "other", "B"),        # same day as A, logged later -> before A
        (d(2026, 5, 20), "feeders", "C"),
        (d(2026, 1, 15), "health_vet", "D"),
        (d(2026, 4, 10), "feeders", "E"),
    ])
    other = mk_user(world.db, "other")
    make_premium(world.db, other, TV)
    _seed(world.db, other, [(d(2026, 3, 1), "feeders", "NOT MINE")])

    def get(**params):
        r = client.get(URL, params={"app": TV, **params}, headers=hdr(world.owner))
        assert r.status_code == 200, r.text
        return r.json()

    full = get()
    assert [i["description"] for i in full["items"]] == ["C", "E", "B", "A", "D"]
    assert full["total"] == 5
    item = full["items"][0]
    assert set(item) == {"id", "spent_on", "description", "category", "amount", "notes",
                         "split_mode", "split_label", "share_count", "created_by_name"}

    assert [i["description"] for i in get(**{"from": "2026-03-01"})["items"]] == ["C", "E", "B", "A"]
    assert [i["description"] for i in get(to="2026-03-01")["items"]] == ["B", "A", "D"]
    assert [i["description"] for i in get(**{"from": "2026-03-01", "to": "2026-04-10"})["items"]] == ["E", "B", "A"]
    assert [i["description"] for i in get(category="feeders")["items"]] == ["C", "E", "A"]
    assert get(category="feeders")["total"] == 3

    page = get(limit=2, offset=1)
    assert [i["description"] for i in page["items"]] == ["E", "B"] and page["total"] == 5
    assert get(limit=2, offset=4)["items"][0]["description"] == "D"
    assert get(offset=50)["items"] == []

    assert client.get(URL, params={"app": TV, "limit": 101}, headers=hdr(world.owner)).status_code == 422
    assert client.get(URL, params={"app": TV, "limit": 0}, headers=hdr(world.owner)).status_code == 422
    assert client.get(URL, params={"app": TV, "offset": -1}, headers=hdr(world.owner)).status_code == 422
    assert client.get(URL, params={"app": TV, "category": "pets"}, headers=hdr(world.owner)).status_code == 422


def test_list_reports_share_counts(client, world, post):
    mk_invert(world.db, world.owner), mk_invert(world.db, world.owner)
    post(world.owner, body(description="Split", split={"mode": "collection"}))
    post(world.owner, body(description="Whole"))
    items = {i["description"]: i for i in client.get(URL, params={"app": TV}, headers=hdr(world.owner)).json()["items"]}
    assert items["Split"]["share_count"] == 2 and items["Whole"]["share_count"] == 0


# ── structure ────────────────────────────────────────────────────────────────

def test_access_policy_structural_includes_the_expense_routes():
    from app.routers import expenses

    routes = [r for r in expenses.router.routes if getattr(r, "endpoint", None)]
    assert len(routes) >= 5
    for route in routes:
        assert getattr(route.endpoint, "__access_policy__", None) == "keeper", route.path


def test_expense_router_is_registered_under_v1():
    from app.main import app

    paths = {r.path for r in app.routes}
    assert "/api/v1/expenses/" in paths and "/api/v1/expenses/{expense_id}" in paths


def test_router_module_does_not_use_postponed_annotations():
    import app.routers.expenses as mod

    lines = open(mod.__file__, encoding="utf-8").read().splitlines()
    # slowapi needs real annotations (the module docstring/comment may mention it).
    assert not any(l.startswith("from __future__") for l in lines)


# ── summary + animal-cost (Task 4) ───────────────────────────────────────────

SUMMARY = "/api/v1/expenses/summary"
ANIMAL_COST = "/api/v1/expenses/animal-cost"
D = date


def add_expense(db, owner, spent_on, category, amount, shares=None, app=TV, mode=None, desc="Item", minute=0):
    """A ledger row written straight to the DB. `shares` = [(target_or_None, amount)]."""
    shares = shares or []
    e = Expense(
        id=uuid.uuid4(), owner_id=owner.id, created_by=owner.id, app=app, spent_on=spent_on,
        description=desc, category=category, amount=Decimal(str(amount)),
        split_mode=mode or ("animals" if shares else "none"),
        created_at=BASE + timedelta(minutes=minute),
    )
    for pos, (target, part) in enumerate(shares):
        kw = {}
        if isinstance(target, Invert):
            kw["invert_id"] = target.id
        elif isinstance(target, Colony):
            kw["colony_id"] = target.id
        elif isinstance(target, Animal):
            kw["animal_id"] = target.id
        e.shares.append(ExpenseShare(id=uuid.uuid4(), amount=Decimal(str(part)), position=pos, **kw))
    db.add(e)
    db.commit()
    return e


def months_back(n: int) -> date:
    """First day of the month `n` calendar months before the current one (UTC)."""
    t = today()
    idx = t.year * 12 + (t.month - 1) - n
    return date(idx // 12, idx % 12 + 1, 1)


def get_summary(client, user, **params):
    params.setdefault("app", TV)
    return client.get(SUMMARY, params=params, headers=hdr(user))


@pytest.fixture()
def ledger(world):
    """A fixed ledger with hand-checkable arithmetic (see test_summary_arithmetic)."""
    db, o = world.db, world.owner
    world.a = mk_invert(db, o, name="Alpha", location="Rack 1")
    world.b = mk_invert(db, o, name="Bravo", location="Shelf 2")
    world.c = mk_invert(db, o, name="Charlie")                      # no location
    world.d = mk_colony(db, o, name="Delta", location="Rack 1")
    add_expense(db, o, D(2026, 3, 5), "feeders", "30.00")                                   # unsplit
    add_expense(db, o, D(2026, 3, 20), "substrate_decor", "20.01", [(world.a, "10.01"), (world.b, "10.00")])
    add_expense(db, o, D(2026, 4, 2), "health_vet", "45.00", [(world.a, "45.00")])
    add_expense(db, o, D(2026, 4, 10), "feeders", "10.00",
                [(world.a, "3.34"), (world.c, "3.33"), (world.d, "3.33")], mode="collection")
    add_expense(db, o, D(2026, 4, 15), "feeders", "5.00", [(None, "5.00")])                 # animal deleted
    add_expense(db, o, D(2025, 12, 31), "feeders", "99.00")                                  # before the window
    add_expense(db, o, D(2026, 3, 6), "feeders", "77.00", app=HV)                            # other app
    stranger_ledger = mk_user(db, "ledger2")
    add_expense(db, stranger_ledger, D(2026, 3, 7), "feeders", "55.00")                      # other owner
    return world


def test_summary_arithmetic(client, ledger):
    r = get_summary(client, ledger.owner, **{"from": "2026-01-01", "to": "2026-12-31"})
    assert r.status_code == 200, r.text
    out = r.json()
    assert set(out) == {"total", "by_category", "by_month", "by_location", "top_animals",
                        "unallocated_total", "can_add"}
    assert dec(out["total"]) == Decimal("110.01")
    assert {k: dec(v) for k, v in out["by_category"].items()} == {
        "feeders": Decimal("45.00"), "substrate_decor": Decimal("20.01"), "health_vet": Decimal("45.00"),
    }
    assert [(m["month"], dec(m["total"])) for m in out["by_month"]] == [
        ("2026-03", Decimal("50.01")), ("2026-04", Decimal("60.00")),
    ]
    assert [(x["location"], dec(x["total"])) for x in out["by_location"]] == [
        ("Rack 1", Decimal("61.68")), ("Shelf 2", Decimal("10.00")), ("No location", Decimal("3.33")),
    ]
    a, b, c, d = ledger.a, ledger.b, ledger.c, ledger.d
    assert [(t["target_kind"], t["target_id"], t["name"], dec(t["total"])) for t in out["top_animals"]] == [
        ("invert", str(a.id), "Alpha", Decimal("58.35")),
        ("invert", str(b.id), "Bravo", Decimal("10.00")),
        ("invert", str(c.id), "Charlie", Decimal("3.33")),    # ties on total break by name
        ("colony", str(d.id), "Delta", Decimal("3.33")),
    ]
    assert dec(out["unallocated_total"]) == Decimal("35.00")   # 30.00 unsplit + 5.00 removed animal
    assert out["can_add"] is True


def test_summary_money_fields_are_strings(client, ledger):
    out = get_summary(client, ledger.owner, **{"from": "2026-01-01", "to": "2026-12-31"}).json()
    assert out["total"] == "110.01" and out["unallocated_total"] == "35.00"
    assert out["by_category"]["feeders"] == "45.00"
    assert out["by_month"][0]["total"] == "50.01" and out["by_location"][0]["total"] == "61.68"
    assert out["top_animals"][0]["total"] == "58.35"


def test_summary_window_filters_on_spent_on(client, ledger):
    out = get_summary(client, ledger.owner, **{"from": "2026-04-01", "to": "2026-04-10"}).json()
    assert dec(out["total"]) == Decimal("55.00")               # 45.00 vet + 10.00 collection split
    assert [m["month"] for m in out["by_month"]] == ["2026-04"]
    assert dec(out["unallocated_total"]) == Decimal("0.00")
    # both bounds are inclusive
    assert dec(get_summary(client, ledger.owner, **{"from": "2025-12-31", "to": "2025-12-31"}).json()["total"]) == Decimal("99.00")


def test_summary_ascending_months_across_a_year_boundary(client, ledger):
    out = get_summary(client, ledger.owner, **{"from": "2025-01-01", "to": "2026-12-31"}).json()
    assert [m["month"] for m in out["by_month"]] == ["2025-12", "2026-03", "2026-04"]


def test_summary_default_window_is_twelve_calendar_months(client, world):
    db, o = world.db, world.owner
    start = months_back(11)
    add_expense(db, o, start - timedelta(days=1), "feeders", "100.00")          # just outside
    add_expense(db, o, start, "feeders", "1.00")                                 # first day, inside
    add_expense(db, o, today(), "shipping", "2.00")                              # today, inside
    add_expense(db, o, today() + timedelta(days=2), "other", "4.00")             # beyond anything the API accepts
    out = get_summary(client, o).json()
    assert dec(out["total"]) == Decimal("3.00")
    months = [m["month"] for m in out["by_month"]]
    assert months[0] == start.strftime("%Y-%m") and months[-1] == today().strftime("%Y-%m")
    assert set(out["by_category"]) == {"feeders", "shipping"}
    # an explicit window overrides the default
    wide = get_summary(client, o, **{"from": (start - timedelta(days=1)).isoformat()}).json()
    assert dec(wide["total"]) == Decimal("103.00")


@pytest.mark.requires_postgres
def test_summary_default_window_includes_utc_tomorrow(client, world):
    """A keeper east of UTC can log UTC today + 1 (the newest accepted date); the
    default summary window must count it, in the total and in by_month."""
    db, o = world.db, world.owner
    tomorrow = today() + timedelta(days=1)
    add_expense(db, o, tomorrow, "feeders", "5.00")
    out = get_summary(client, o).json()
    assert dec(out["total"]) == Decimal("5.00")
    assert [m["month"] for m in out["by_month"]] == [tomorrow.strftime("%Y-%m")]
    assert dec(out["by_month"][0]["total"]) == Decimal("5.00")
    assert out["by_category"] == {"feeders": "5.00"}


def test_summary_of_an_empty_ledger(client, world):
    out = get_summary(client, world.owner).json()
    assert out["total"] == "0.00" and out["unallocated_total"] == "0.00"
    assert out["by_category"] == {} and out["by_month"] == []
    assert out["by_location"] == [] and out["top_animals"] == []


def test_summary_only_lists_categories_with_spending(client, ledger):
    out = get_summary(client, ledger.owner, **{"from": "2026-04-01", "to": "2026-04-30"}).json()
    assert set(out["by_category"]) == {"feeders", "health_vet"}


def test_summary_top_animals_is_capped_at_ten_and_ordered(client, world):
    db, o = world.db, world.owner
    herd = [mk_invert(db, o, name=f"Spider {i:02d}") for i in range(12)]
    add_expense(db, o, today(), "feeders", "78.00", [(h, str(i + 1)) for i, h in enumerate(herd)])
    out = get_summary(client, o).json()
    assert len(out["top_animals"]) == 10
    assert [dec(t["total"]) for t in out["top_animals"]] == [Decimal(n) for n in range(12, 2, -1)]
    assert out["top_animals"][0]["name"] == "Spider 11"


def test_summary_name_fallbacks_and_removed_targets_stay_out_of_top_animals(client, world):
    db, o = world.db, world.owner
    nameless = mk_invert(db, o, name=None, common_name="Curly Hair")
    nameless.name = None
    db.commit()
    gone = mk_invert(db, o, name="Gone")
    add_expense(db, o, today(), "feeders", "9.00", [(nameless, "4.00"), (gone, "5.00")])
    db.delete(gone)
    db.commit()
    out = get_summary(client, o).json()
    assert [t["name"] for t in out["top_animals"]] == ["Curly Hair"]
    assert dec(out["unallocated_total"]) == Decimal("5.00")           # the orphaned share
    assert dec(out["total"]) == Decimal("9.00")


def test_summary_blank_location_counts_as_no_location(client, world):
    db, o = world.db, world.owner
    blank = mk_invert(db, o, name="Blank", location="   ")
    unset = mk_invert(db, o, name="Unset")
    add_expense(db, o, today(), "feeders", "6.00", [(blank, "2.00"), (unset, "4.00")])
    assert [(x["location"], dec(x["total"])) for x in get_summary(client, o).json()["by_location"]] == [
        ("No location", Decimal("6.00")),
    ]


def test_summary_location_is_the_targets_current_one(client, world):
    db, o = world.db, world.owner
    mover = mk_invert(db, o, name="Mover", location="Rack 1")
    add_expense(db, o, today(), "feeders", "8.00", [(mover, "8.00")])
    mover.location = "Rack 9"
    db.commit()
    assert [x["location"] for x in get_summary(client, o).json()["by_location"]] == ["Rack 9"]


def test_summary_herpetoverse_uses_animals(client, world):
    db = world.db
    hv_owner = mk_user(db, "hvowner")
    make_premium(db, hv_owner, HV)
    snake = mk_animal(db, hv_owner, name="Noodle", location="Rack A")
    add_expense(db, hv_owner, today(), "feeders", "12.00", [(snake, "12.00")], app=HV)
    add_expense(db, hv_owner, today(), "feeders", "50.00", app=TV)         # TV row never shows on HV
    out = get_summary(client, hv_owner, app=HV).json()
    assert dec(out["total"]) == Decimal("12.00")
    assert [(t["target_kind"], t["name"]) for t in out["top_animals"]] == [("animal", "Noodle")]
    assert out["by_location"][0]["location"] == "Rack A" and out["can_add"] is True


def test_summary_can_add_is_the_owners_plan(client, world):
    free = mk_user(world.db, "freeowner")
    assert get_summary(client, free).json()["can_add"] is False
    # a free co-keeper reads a premium owner's summary and sees can_add true
    r = get_summary(client, world.keeper, collection=str(world.owner.id))
    assert r.status_code == 200 and r.json()["can_add"] is True


def test_summary_reads_the_owners_ledger_for_a_keeper(client, ledger):
    r = get_summary(client, ledger.keeper, collection=str(ledger.owner.id), **{"from": "2026-01-01", "to": "2026-12-31"})
    assert r.status_code == 200 and dec(r.json()["total"]) == Decimal("110.01")


SUMMARY_ROLES = [("owner", 0), ("keeper", 0), ("logger", 403), ("viewer", 403), ("stranger", 404)]


@pytest.mark.parametrize("who,deny", SUMMARY_ROLES)
def test_access_summary(client, world, who, deny):
    add_expense(world.db, world.owner, today(), "feeders", "3.00")
    r = get_summary(client, _who(world, who), collection=str(world.owner.id))
    assert r.status_code == _expect(200, deny), r.text
    if deny == 0:
        assert dec(r.json()["total"]) == Decimal("3.00")


def test_summary_validates_params_and_needs_a_token(client, world):
    assert client.get(SUMMARY, headers=hdr(world.owner)).status_code == 422                       # app required
    assert get_summary(client, world.owner, app="both").status_code == 422
    assert get_summary(client, world.owner, **{"from": "not-a-date"}).status_code == 422
    assert client.get(SUMMARY, params={"app": TV}).status_code in (401, 403)
    assert client.get(ANIMAL_COST, params={"invert_id": str(uuid.uuid4())}).status_code in (401, 403)


def test_summary_is_not_parsed_as_an_expense_id(client, world):
    assert get_summary(client, world.owner).status_code == 200      # not 422 "invalid uuid"


# ── animal-cost ──────────────────────────────────────────────────────────────

def get_cost(client, user, **params):
    return client.get(ANIMAL_COST, params=params, headers=hdr(user))


def test_animal_cost_for_an_invert_adds_purchase_price_and_shares(client, world):
    db, o = world.db, world.owner
    t = mk_invert(db, o, name="Rosie", price_paid=Decimal("40.00"))
    other = mk_invert(db, o, name="Other")
    e1 = add_expense(db, o, D(2026, 2, 1), "substrate_decor", "20.00", [(t, "10.00"), (other, "10.00")], desc="Coco fibre", minute=1)
    e2 = add_expense(db, o, D(2026, 5, 9), "health_vet", "5.50", [(t, "5.50")], desc="Mite check", minute=2)
    add_expense(db, o, D(2026, 5, 10), "feeders", "99.00", [(other, "99.00")])          # someone else's share
    add_expense(db, o, D(2026, 5, 11), "feeders", "8.00")                                # unsplit: not hers
    r = get_cost(client, o, invert_id=str(t.id))
    assert r.status_code == 200, r.text
    out = r.json()
    assert set(out) == {"can_add", "purchase_price", "shares_total", "by_category", "total", "shares"}
    assert out["purchase_price"] == "40.00" and out["shares_total"] == "15.50" and out["total"] == "55.50"
    assert {k: dec(v) for k, v in out["by_category"].items()} == {
        "substrate_decor": Decimal("10.00"), "health_vet": Decimal("5.50"),
    }
    assert out["shares"] == [     # newest first; the amount is HER cut, not the purchase
        {"expense_id": str(e2.id), "spent_on": "2026-05-09", "description": "Mite check",
         "category": "health_vet", "amount": "5.50"},
        {"expense_id": str(e1.id), "spent_on": "2026-02-01", "description": "Coco fibre",
         "category": "substrate_decor", "amount": "10.00"},
    ]
    assert out["can_add"] is True


def test_animal_cost_is_all_time(client, world):
    db, o = world.db, world.owner
    t = mk_invert(db, o, name="Old", price_paid=Decimal("1.00"))
    add_expense(db, o, D(1995, 6, 1), "other", "2.00", [(t, "2.00")])
    add_expense(db, o, today(), "other", "3.00", [(t, "3.00")])
    out = get_cost(client, o, invert_id=str(t.id)).json()
    assert out["total"] == "6.00" and len(out["shares"]) == 2


def test_animal_cost_without_a_purchase_price(client, world):
    t = mk_invert(world.db, world.owner, name="Gift")
    add_expense(world.db, world.owner, today(), "feeders", "4.00", [(t, "4.00")])
    out = get_cost(client, world.owner, invert_id=str(t.id)).json()
    assert out["purchase_price"] is None and out["shares_total"] == "4.00" and out["total"] == "4.00"


def test_animal_cost_with_nothing_logged(client, world):
    t = mk_invert(world.db, world.owner, name="Fresh", price_paid=Decimal("12.50"))
    out = get_cost(client, world.owner, invert_id=str(t.id)).json()
    assert out["purchase_price"] == "12.50" and out["shares_total"] == "0.00" and out["total"] == "12.50"
    assert out["by_category"] == {} and out["shares"] == []
    bare = mk_invert(world.db, world.owner, name="Bare")
    out = get_cost(client, world.owner, invert_id=str(bare.id)).json()
    assert out["purchase_price"] is None and out["total"] == "0.00"


def test_animal_cost_for_a_colony_has_no_purchase_price(client, world):
    c = mk_colony(world.db, world.owner, name="Dubia")
    add_expense(world.db, world.owner, today(), "feeders", "7.25", [(c, "7.25")])
    out = get_cost(client, world.owner, colony_id=str(c.id)).json()
    assert out["purchase_price"] is None and out["shares_total"] == "7.25" and out["total"] == "7.25"
    assert out["shares"][0]["amount"] == "7.25"


def test_animal_cost_for_an_hv_animal(client, world):
    db = world.db
    hv_owner = mk_user(db, "hvowner2")
    make_premium(db, hv_owner, HV)
    snake = mk_animal(db, hv_owner, name="Noodle", price_paid=Decimal("150.00"))
    add_expense(db, hv_owner, today(), "heat_lighting", "30.00", [(snake, "30.00")], app=HV)
    out = get_cost(client, hv_owner, animal_id=str(snake.id)).json()
    assert out["purchase_price"] == "150.00" and out["total"] == "180.00" and out["can_add"] is True


@pytest.mark.parametrize("n_ids", [0, 2, 3])
def test_animal_cost_needs_exactly_one_id(client, world, n_ids):
    db, o = world.db, world.owner
    params = {}
    if n_ids >= 1:
        params["invert_id"] = str(mk_invert(db, o).id)
    if n_ids >= 2:
        params["colony_id"] = str(mk_colony(db, o).id)
    if n_ids >= 3:
        params["animal_id"] = str(mk_animal(db, o).id)
    r = get_cost(client, o, **params)
    assert r.status_code == 400
    assert r.json()["detail"] == "Pass exactly one of invert_id, colony_id or animal_id"


def test_animal_cost_unknown_or_wrong_kind_of_id_is_404(client, world):
    assert get_cost(client, world.owner, invert_id=str(uuid.uuid4())).status_code == 404
    snake = mk_animal(world.db, world.owner)
    assert get_cost(client, world.owner, invert_id=str(snake.id)).status_code == 404     # an HV id is not an invert
    assert get_cost(client, world.owner, invert_id="nope").status_code == 422


@pytest.mark.parametrize("who,deny", SUMMARY_ROLES)
def test_access_animal_cost(client, world, who, deny):
    t = mk_invert(world.db, world.owner, name="Rosie", price_paid=Decimal("9.00"))
    r = get_cost(client, _who(world, who), invert_id=str(t.id))
    assert r.status_code == _expect(200, deny), r.text
    if deny == 0:
        assert r.json()["total"] == "9.00" and r.json()["can_add"] is True


def test_animal_cost_access_for_colonies_and_hv_animals(client, world):
    db = world.db
    c = mk_colony(db, world.owner)
    assert get_cost(client, world.logger, colony_id=str(c.id)).status_code == 403
    assert get_cost(client, world.stranger, colony_id=str(c.id)).status_code == 404
    hv_owner = mk_user(db, "hvowner3")
    snake = mk_animal(db, hv_owner)
    assert get_cost(client, world.stranger, animal_id=str(snake.id)).status_code == 404
    # TV co-keeper role does not carry over to HV (memberships are per app)
    assert get_cost(client, world.keeper, animal_id=str(snake.id)).status_code == 404


def test_animal_cost_can_add_is_the_owners_plan(client, world):
    free = mk_user(world.db, "freeowner2")
    t = mk_invert(world.db, free, name="Mine")
    assert get_cost(client, free, invert_id=str(t.id)).json()["can_add"] is False


def test_summary_and_animal_cost_routes_carry_the_keeper_policy():
    from app.routers import expenses

    found = {r.path: r.endpoint for r in expenses.router.routes if getattr(r, "endpoint", None)}
    for path in ("/summary", "/animal-cost"):
        assert getattr(found[path], "__access_policy__", None) == "keeper", path
    order = [r.path for r in expenses.router.routes if getattr(r, "endpoint", None)]
    assert order.index("/summary") < order.index("/{expense_id}")
    assert order.index("/animal-cost") < order.index("/{expense_id}")


# ── P1 hardening (expense polish) ────────────────────────────────────────────

def raw_put(client, user, expense_id, raw):
    return client.put(f"{URL}{expense_id}", content=raw,
                      headers={**hdr(user), "Content-Type": "application/json"})


@pytest.mark.parametrize("field, token", [
    ("description", "NaN"), ("description", "Infinity"), ("description", "-Infinity"),
    ("notes", "NaN"), ("notes", "Infinity"), ("category", "Infinity"), ("spent_on", "NaN"),
])
def test_non_finite_in_other_fields_is_422_never_stored_on_create(client, world, field, token):
    """Only `amount` is sanitised: a bare NaN/Infinity elsewhere is a plain 422 (not a 500,
    not stored as the text "nan")."""
    marker = "__NONFINITE__"
    raw = json.dumps({**body(), field: marker}).replace(f'"{marker}"', token)
    r = client.post(URL, content=raw, headers={**hdr(world.owner), "Content-Type": "application/json"})
    assert r.status_code == 422, r.text
    assert any(field in e["loc"] for e in r.json()["detail"]), r.text
    assert world.db.query(Expense).count() == 0


def test_non_finite_nested_in_split_is_422(client, world):
    raw = json.dumps({**body(), "split": {"mode": "location", "location": "__X__"}}).replace('"__X__"', "NaN")
    r = client.post(URL, content=raw, headers={**hdr(world.owner), "Content-Type": "application/json"})
    assert r.status_code == 422, r.text
    assert world.db.query(Expense).count() == 0


@pytest.mark.parametrize("field, token", [
    ("description", "NaN"), ("description", "Infinity"), ("notes", "Infinity"), ("notes", "NaN"),
    ("category", "-Infinity"),
])
def test_non_finite_in_other_fields_is_422_never_stored_on_update(client, world, post, field, token):
    made = post(world.owner, body(description="Original", notes="keep")).json()
    marker = "__NONFINITE__"
    raw = json.dumps({field: marker}).replace(f'"{marker}"', token)
    r = raw_put(client, world.owner, made["id"], raw)
    assert r.status_code == 422, r.text
    world.db.expire_all()
    row = world.db.get(Expense, uuid.UUID(made["id"]))
    assert row.description == "Original" and row.notes == "keep"


@pytest.mark.parametrize("token", ["NaN", "Infinity", "-Infinity"])
def test_non_finite_amount_on_update_is_422(client, world, post, token):
    made = post(world.owner, body()).json()
    r = raw_put(client, world.owner, made["id"], '{"amount": %s}' % token)
    assert r.status_code == 422, r.text
    world.db.expire_all()
    assert world.db.get(Expense, uuid.UUID(made["id"])).amount == Decimal("10.00")


@pytest.mark.parametrize(
    "sent",
    ["1e30", 1e30, "9" * 29, "0.004", "NaN", "-5", "Infinity", "-Infinity", 0, "abc", 100001],
)
def test_put_amount_422_list_mirrors_post(client, world, post, sent):
    made = post(world.owner, body()).json()
    r = client.put(f"{URL}{made['id']}", json={"amount": sent}, headers=hdr(world.owner))
    assert r.status_code == 422, r.text
    world.db.expire_all()
    assert world.db.get(Expense, uuid.UUID(made["id"])).amount == Decimal("10.00")


def test_put_amount_rounds_half_up(client, world, post):
    made = post(world.owner, body()).json()
    r = client.put(f"{URL}{made['id']}", json={"amount": "30.005"}, headers=hdr(world.owner))
    assert r.status_code == 200, r.text
    assert r.json()["amount"] == "30.01"


def _amount_msgs(resp):
    return [e["msg"] for e in resp.json()["detail"] if "amount" in e["loc"]]


@pytest.mark.parametrize("sent", [-5, "-5", "-0.01", -1e30, "-1e30", "-" + "9" * 29])
def test_negative_amount_message(client, world, post, sent):
    r = post(world.owner, body(amount=sent))
    assert r.status_code == 422, r.text
    assert _amount_msgs(r) == ["Value error, Amount must be more than $0"], r.text
    made = post(world.owner, body()).json()
    r = client.put(f"{URL}{made['id']}", json={"amount": sent}, headers=hdr(world.owner))
    assert r.status_code == 422
    assert _amount_msgs(r) == ["Value error, Amount must be more than $0"], r.text


@pytest.mark.parametrize("sent", [0, "0", "0.004"])
def test_zero_amount_message(client, world, post, sent):
    r = post(world.owner, body(amount=sent))
    assert r.status_code == 422, r.text
    assert _amount_msgs(r) == ["Value error, Amount must be more than $0"], r.text
    made = post(world.owner, body()).json()
    r = client.put(f"{URL}{made['id']}", json={"amount": sent}, headers=hdr(world.owner))
    assert r.status_code == 422, r.text
    assert _amount_msgs(r) == ["Value error, Amount must be more than $0"], r.text


@pytest.mark.parametrize("token", ["NaN", "Infinity", "-Infinity"])
def test_bare_non_finite_split_is_422_on_create(client, world, token):
    raw = json.dumps({**body(), "split": "__X__"}).replace('"__X__"', token)
    r = client.post(URL, content=raw, headers={**hdr(world.owner), "Content-Type": "application/json"})
    assert r.status_code == 422, r.text
    assert world.db.query(Expense).count() == 0


@pytest.mark.parametrize("token", ["NaN", "Infinity", "-Infinity"])
def test_bare_non_finite_split_on_update_is_422_and_keeps_the_split(client, world, post, token):
    db, owner = world.db, world.owner
    for _ in range(3):
        mk_invert(db, owner)
    made = post(owner, body(amount="30", split={"mode": "collection"})).json()
    assert made["split_mode"] == "collection" and made["share_count"] == 3
    r = raw_put(client, owner, made["id"], '{"split": %s}' % token)
    assert r.status_code == 422, r.text
    db.expire_all()
    row = db.get(Expense, uuid.UUID(made["id"]))
    assert row.split_mode == "collection"
    assert db.query(ExpenseShare).filter(ExpenseShare.expense_id == row.id).count() == 3


@pytest.mark.parametrize("raw", ["[NaN]", "NaN", "[Infinity, -Infinity]", "Infinity"])
def test_non_dict_body_with_non_finite_is_422_not_500(client, world, post, raw):
    headers = {**hdr(world.owner), "Content-Type": "application/json"}
    r = client.post(URL, content=raw, headers=headers)
    assert r.status_code == 422, r.text
    made = post(world.owner, body()).json()
    r = raw_put(client, world.owner, made["id"], raw)
    assert r.status_code == 422, r.text


@pytest.mark.parametrize("sent", [100001, "100000.005", 1e30, "9" * 29])
def test_over_the_cap_message_is_unchanged(client, world, post, sent):
    r = post(world.owner, body(amount=sent))
    assert r.status_code == 422, r.text
    assert _amount_msgs(r) == ["Value error, Amount can be at most $100,000.00"], r.text


def test_animal_cost_ignores_another_owners_expense_with_a_share_on_my_invert(client, world):
    db, o = world.db, world.owner
    t = mk_invert(db, o, name="Rosie")
    mine = add_expense(db, o, D(2026, 2, 1), "feeders", "5.00", [(t, "5.00")], desc="Mine")
    intruder = mk_user(db, "intruder")
    add_expense(db, intruder, D(2026, 2, 2), "health_vet", "70.00", [(t, "70.00")], desc="Planted")
    out = get_cost(client, o, invert_id=str(t.id)).json()
    assert out["shares_total"] == "5.00" and out["total"] == "5.00"
    assert out["by_category"] == {"feeders": "5.00"}
    assert [s["expense_id"] for s in out["shares"]] == [str(mine.id)]


def test_animal_cost_ignores_an_hv_app_expense_with_a_share_on_a_tv_invert(client, world):
    db, o = world.db, world.owner
    t = mk_invert(db, o, name="Rosie")
    colony = mk_colony(db, o, name="Isos")
    add_expense(db, o, D(2026, 2, 1), "feeders", "5.00", [(t, "5.00")], desc="Mine")
    add_expense(db, o, D(2026, 2, 3), "shipping", "9.00", [(t, "9.00")], app=HV, desc="WrongApp")
    add_expense(db, o, D(2026, 2, 3), "shipping", "4.00", [(colony, "4.00")], app=HV, desc="WrongApp")
    out = get_cost(client, o, invert_id=str(t.id)).json()
    assert out["shares_total"] == "5.00" and out["by_category"] == {"feeders": "5.00"}
    assert [s["description"] for s in out["shares"]] == ["Mine"]
    assert get_cost(client, o, colony_id=str(colony.id)).json()["shares"] == []


def test_animal_cost_for_an_hv_animal_ignores_other_owner_and_tv_app_rows(client, world):
    db = world.db
    hv_owner = mk_user(db, "hvowner3")
    make_premium(db, hv_owner, HV)
    snake = mk_animal(db, hv_owner, name="Noodle")
    add_expense(db, hv_owner, today(), "heat_lighting", "30.00", [(snake, "30.00")], app=HV, desc="Mine")
    add_expense(db, hv_owner, today(), "heat_lighting", "11.00", [(snake, "11.00")], app=TV, desc="WrongApp")
    other = mk_user(db, "hvother")
    add_expense(db, other, today(), "heat_lighting", "22.00", [(snake, "22.00")], app=HV, desc="Planted")
    out = get_cost(client, hv_owner, animal_id=str(snake.id)).json()
    assert out["shares_total"] == "30.00" and out["total"] == "30.00"
    assert [s["description"] for s in out["shares"]] == ["Mine"]


def test_animal_cost_for_a_cokeeper_view_is_pinned_to_the_animals_owner(client, world):
    """A keeper reads the OWNER's animal; the keeper's own ledger rows never count."""
    db, o = world.db, world.owner
    t = mk_invert(db, o, name="Rosie")
    add_expense(db, o, D(2026, 2, 1), "feeders", "5.00", [(t, "5.00")])
    add_expense(db, world.keeper, D(2026, 2, 2), "feeders", "6.00", [(t, "6.00")], desc="KeeperOwn")
    out = get_cost(client, world.keeper, invert_id=str(t.id)).json()
    assert out["shares_total"] == "5.00"
