"""Expenses are private money data and never leave the owner's own views
(expense tracking spec §2 "Privacy", Task 5).

Expense data never appears in: share cards (`services/share_card.py`), card
links, link previews (`public_card`), sitter passes, care sheets, `/keepers/*`,
transfer previews and claims (a transfer never copies shares), the public QR
profiles, or search.

Two layers:
1. Sentinel tests. An expense whose description AND notes carry
   SENTINEL-EXPENSE-7f3 (and an odd amount) sits on a TV animal, a TV colony
   and an HV animal. Every public/shared output is driven end to end through
   the real routes on real rows; the whole response text must not contain the
   sentinel or the amounts. Each output also has to contain the animal's name
   (a positive control, so an empty or error body can't pass vacuously).
2. A static guard: none of the modules that build those outputs mentions
   expenses at all, so adding a field there fails here.
"""
import inspect
import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import text

from app.models.expense import Expense, ExpenseShare
from app.utils.auth import create_access_token
from tests.test_expenses import mk_animal, mk_colony, mk_invert, mk_user

SENTINEL = "SENTINEL-EXPENSE-7f3"
AMOUNTS = ("4321.99", "2160.99", "2161.00")   # whole expense, then the two TV shares
TV, HV = "tarantuverse", "herpetoverse"
APP_ROOT = Path(__file__).resolve().parents[1] / "app"


def hdr(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.id)})}"}


def assert_clean(label, payload, *, must_contain=None):
    """No expense text or amount anywhere in `payload`; and it is not an
    empty/error body (`must_contain`)."""
    text = payload if isinstance(payload, str) else json.dumps(payload, default=str)
    if must_contain:
        assert must_contain in text, f"{label}: expected {must_contain!r} in the output (vacuous test?)"
    assert SENTINEL not in text, f"{label} leaked the expense sentinel"
    for amount in AMOUNTS:
        assert amount not in text, f"{label} leaked an expense amount ({amount})"
    assert "expense" not in text.lower(), f"{label} mentions expenses"


@pytest.fixture()
def world(db_session):
    db = db_session
    owner = mk_user(db, "owner", display_name="Olivia Owner")
    owner.collection_visibility = "public"
    db.commit()
    rosie = mk_invert(db, owner, name="Rosie-px7", visibility="public", scientific_name="Brachypelma hamorii")
    bob = mk_invert(db, owner, name="Bob-px7", visibility="public")
    colony = mk_colony(db, owner, name="Cows-px7", visibility="public")
    snake = mk_animal(db, owner, name="Slinky-px7")

    today = datetime.now(timezone.utc).date()
    tv = Expense(
        id=uuid.uuid4(), owner_id=owner.id, created_by=owner.id, app=TV, spent_on=today,
        description=f"{SENTINEL} desc", notes=f"{SENTINEL} notes", category="feeders",
        amount=Decimal(AMOUNTS[0]), split_mode="animals",
    )
    hv = Expense(
        id=uuid.uuid4(), owner_id=owner.id, created_by=owner.id, app=HV, spent_on=today,
        description=f"{SENTINEL} hv", notes=f"{SENTINEL} hv notes", category="health_vet",
        amount=Decimal(AMOUNTS[0]), split_mode="none",
    )
    db.add_all([tv, hv])
    db.flush()
    db.add_all([
        ExpenseShare(id=uuid.uuid4(), expense_id=tv.id, invert_id=rosie.id, amount=Decimal(AMOUNTS[1]), position=0),
        ExpenseShare(id=uuid.uuid4(), expense_id=tv.id, colony_id=colony.id, amount=Decimal(AMOUNTS[2]), position=1),
        ExpenseShare(id=uuid.uuid4(), expense_id=hv.id, animal_id=snake.id, amount=Decimal(AMOUNTS[0]), position=0),
    ])
    db.commit()
    return dict(db=db, owner=owner, rosie=rosie, bob=bob, colony=colony, snake=snake, tv=tv, hv=hv)


# ── share cards, card links, link previews ───────────────────────────────────

ALL_TV_PROFILE = ["photo", "name", "species", "sex", "in_care", "molts", "size"]
ALL_HV_PROFILE = ["photo", "name", "species", "sex", "in_care", "weight", "length", "sheds"]
ALL_COLONY = ["photo", "name", "species", "population", "stages", "founded"]


def _share(client, w, app, kind, animal, fields, **extra):
    r = client.post("/api/v1/share-cards/", headers=hdr(w["owner"]), json={
        "app": app, "kind": kind, "animal_id": str(animal.id), "fields": fields, **extra,
    })
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.requires_postgres
@pytest.mark.parametrize("app,kind,target,fields,name", [
    (TV, "profile", "rosie", ALL_TV_PROFILE, "Rosie-px7"),
    (TV, "colony", "colony", ALL_COLONY, "Cows-px7"),
    (HV, "profile", "snake", ALL_HV_PROFILE, "Slinky-px7"),
])
def test_share_card_render_data_and_card_link_carry_no_expenses(client, world, app, kind, target, fields, name):
    out = _share(client, world, app, kind, world[target], fields, link=True)
    # The renderer's data feed (compose_card, fed by the render token).
    token = out["image_url"].rsplit("/", 1)[-1]
    data = client.get(f"/api/v1/share-cards/{token}/data")
    assert data.status_code == 200, data.text
    assert_clean(f"share-card data {app}/{kind}", data.text, must_contain=name)
    # The frozen snapshot behind the shared link.
    link = client.get(f"/api/v1/card-links/{out['code']}")
    assert link.status_code == 200, link.text
    assert_clean(f"card-link {app}/{kind}", link.text, must_contain=name)
    # The create response itself.
    assert_clean("share-card create", out)


@pytest.mark.requires_postgres
def test_public_card_link_preview_carries_no_expenses(client, world):
    r = client.get(f"/api/v1/public-card/{TV}/{world['rosie'].id}")
    assert r.status_code == 200, r.text
    assert_clean("public_card TV", r.text, must_contain="Rosie-px7")
    r = client.get(f"/api/v1/public-card/{TV}/colonies/{world['colony'].id}")
    assert r.status_code == 200, r.text
    assert_clean("public_card colony", r.text, must_contain="Cows-px7")
    # HV animals preview only when the owner's collection is public (it is).
    r = client.get(f"/api/v1/public-card/{HV}/{world['snake'].id}")
    assert r.status_code == 200, r.text
    assert_clean("public_card HV", r.text, must_contain="Slinky-px7")


@pytest.mark.requires_postgres
def test_public_qr_profiles_carry_no_expenses(client, world):
    for path, name in (
        (f"/api/v1/i/{world['rosie'].id}", "Rosie-px7"),
        (f"/api/v1/col/{world['colony'].id}", "Cows-px7"),
        (f"/api/v1/a/{world['snake'].id}", "Slinky-px7"),
    ):
        for headers in ({}, hdr(world["owner"])):   # a visitor, and the owner's full view
            r = client.get(path, headers=headers)
            assert r.status_code == 200, (path, r.text)
            assert_clean(f"{path} ({'owner' if headers else 'visitor'})", r.text, must_contain=name)


# ── sitter pass ──────────────────────────────────────────────────────────────

@pytest.mark.requires_postgres
def test_sitter_pass_payload_carries_no_expenses(client, world):
    w = world
    expires = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    r = client.post("/api/v1/sitter-passes/", headers=hdr(w["owner"]), json={
        "app": TV, "expires_at": expires,
        "animals": [{"kind": "invert", "id": str(w["rosie"].id)}, {"kind": "colony", "id": str(w["colony"].id)}],
    })
    assert r.status_code == 201, r.text
    created = r.json()
    # What the sitter sees: the public exchange, then the pass read.
    ex = client.post("/api/v1/sitter/exchange", json={"token": created["token"]})
    assert ex.status_code == 200, ex.text
    page = client.get("/api/v1/sitter/pass", headers={"Authorization": f"Bearer {ex.json()['session']}"})
    assert page.status_code == 200, page.text
    assert_clean("sitter pass (sitter)", page.text, must_contain="Rosie-px7")
    # And the keeper's own preview, built by the same function.
    prev = client.get(f"/api/v1/sitter-passes/{created['id']}/preview", headers=hdr(w["owner"]))
    assert prev.status_code == 200, prev.text
    assert_clean("sitter pass (preview)", prev.text, must_contain="Rosie-px7")
    # HV pass.
    r = client.post("/api/v1/sitter-passes/", headers=hdr(w["owner"]), json={
        "app": HV, "expires_at": expires, "animals": [{"kind": "animal", "id": str(w["snake"].id)}],
    })
    assert r.status_code == 201, r.text
    prev = client.get(f"/api/v1/sitter-passes/{r.json()['id']}/preview", headers=hdr(w["owner"]))
    assert_clean("sitter pass HV (preview)", prev.text, must_contain="Slinky-px7")


# ── care sheets ──────────────────────────────────────────────────────────────

@pytest.mark.requires_postgres
def test_care_sheet_read_carries_no_expenses(client, world):
    w = world
    for body, name in (
        ({"app": TV, "animal_ids": [str(w["rosie"].id)], "colony_ids": [str(w["colony"].id)], "note": "Back Sunday"},
         "Rosie-px7"),
        ({"app": HV, "animal_ids": [str(w["snake"].id)]}, "Slinky-px7"),
    ):
        made = client.post("/api/v1/care-sheets/", headers=hdr(w["owner"]), json=body)
        assert made.status_code == 201, made.text
        sheet = client.get(f"/api/v1/care-sheets/{made.json()['token']}")
        assert sheet.status_code == 200, sheet.text
        assert_clean(f"care sheet {body['app']}", sheet.text, must_contain=name)
        assert_clean("care sheet create", made.json())


# ── /keepers/* ───────────────────────────────────────────────────────────────

@pytest.mark.requires_postgres
def test_keeper_routes_carry_no_expenses(client, world):
    w = world
    username = w["owner"].username
    for headers in ({}, hdr(w["owner"])):
        who = "owner" if headers else "visitor"
        r = client.get(f"/api/v1/keepers/{username}/collection/", headers=headers)
        assert r.status_code == 200, r.text
        assert_clean(f"keepers collection ({who})", r.text, must_contain="Rosie-px7")
        for path in (f"/api/v1/keepers/{username}/", f"/api/v1/keepers/{username}/stats/", "/api/v1/keepers/"):
            r = client.get(path, headers=headers)
            assert r.status_code == 200, (path, r.text)
            assert_clean(f"{path} ({who})", r.text)


# ── transfers ────────────────────────────────────────────────────────────────

@pytest.mark.requires_postgres
def test_transfer_preview_and_claim_never_carry_or_copy_expenses(client, world):
    w = world
    db = w["db"]
    made = client.post(f"/api/v1/inverts/{w['rosie'].id}/transfer", headers=hdr(w["owner"]), json={})
    assert made.status_code == 200, made.text
    token = made.json()["token"]
    assert_clean("transfer create", made.json())
    for headers in ({}, hdr(w["owner"])):
        prev = client.get(f"/api/v1/transfers/{token}", headers=headers)
        assert prev.status_code == 200, prev.text
        assert_clean("transfer preview", prev.text, must_contain="Rosie-px7")

    buyer = mk_user(db, "buyer")
    # A claim notifies the seller. `app.models` doesn't export Notification, so
    # a schema built from model metadata alone lacks the table (alembic-built
    # databases have it; checkfirst makes this a no-op there, and the DDL is
    # rolled back with the test's transaction).
    from app.models.notification import Notification
    Notification.__table__.create(bind=db.connection(), checkfirst=True)
    claim = client.post(f"/api/v1/transfers/{token}/claim", headers=hdr(buyer), json={})
    assert claim.status_code == 200, claim.text
    assert_clean("transfer claim", claim.text)

    # The buyer inherits no money records; the seller's history stays put.
    assert db.query(Expense).filter(Expense.owner_id == buyer.id).count() == 0
    buyer_animal_ids = [
        r[0] for r in db.execute(
            text("SELECT id FROM inverts WHERE user_id = :u"), {"u": str(buyer.id)}
        )
    ]
    assert buyer_animal_ids, "claim should have created the buyer's animal"
    shares = db.query(ExpenseShare).filter(ExpenseShare.invert_id.in_(buyer_animal_ids)).count()
    assert shares == 0
    assert db.query(Expense).filter(Expense.owner_id == w["owner"].id).count() == 2
    assert db.query(ExpenseShare).filter(ExpenseShare.expense_id == w["tv"].id).count() == 2
    assert (
        db.query(ExpenseShare).filter(ExpenseShare.invert_id == w["rosie"].id).one().amount
        == Decimal(AMOUNTS[1])
    )


# ── search (the expense text is not indexed anywhere) ────────────────────────

@pytest.mark.requires_postgres
def test_global_search_does_not_find_expenses(client, world):
    r = client.get("/api/v1/search", params={"q": SENTINEL}, headers=hdr(world["owner"]))
    assert r.status_code == 200, r.text
    body = r.json()   # the response echoes the query, so check the results, not the text
    assert body["total_results"] == 0
    assert all(body[k] == [] for k in ("tarantulas", "animals", "species", "keepers", "forums"))
    r = client.get("/api/v1/search", params={"q": "Rosie-px7"}, headers=hdr(world["owner"]))
    assert r.status_code == 200 and "Rosie-px7" in r.text   # control: search does work


# ── static guard ─────────────────────────────────────────────────────────────

# Everything that builds a public or shared output. None may mention expenses
# at all (import, query, field name, comment). `animal_transfers.py` in the
# task text is `transfers.py` in this repo.
GUARDED = (
    "routers/share_cards.py", "routers/sitter_passes.py", "routers/care_sheets.py",
    "routers/keepers.py", "routers/transfers.py", "routers/qr.py",
    "routers/activity.py", "routers/search.py", "routers/discover.py", "routers/achievements.py",
    "services/share_card.py", "services/sitter_card.py",
    "services/activity_service.py", "services/achievement_service.py",
    "schemas/share_card.py", "schemas/sitter_pass.py", "schemas/care_sheet.py", "schemas/transfer.py",
    "utils/care_sheet_token.py", "utils/share_token.py",
)


@pytest.mark.parametrize("rel", GUARDED)
def test_public_builders_never_touch_expenses(rel):
    path = APP_ROOT / rel
    assert path.exists(), f"{rel} moved or was renamed - update GUARDED"
    src = path.read_text(encoding="utf-8")
    assert not re.search(r"expense", src, re.IGNORECASE), f"{rel} mentions expenses"
    assert "app.models.expense" not in src
