"""Jumping spiders, Task 2: hatch a sac into a group, split slings out, parentage.

POST /egg-sacs/{id}/hatch turns a sac into a colony ("Sally slings") in one
transaction; POST /colonies/{id}/split-out turns part of a group into numbered
individual animals, with offspring rows back to the sac. Both are free, keeper
role, and refuse before writing anything (cap, totals, closed groups).
"""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from app.models.colony import Colony, ColonyEvent
from app.models.collection_member import CollectionMember
from app.models.egg_sac import EggSac
from app.models.invert import Invert
from app.models.molt_log import MoltLog
from app.models.offspring import Offspring
from app.models.pairing import Pairing
from app.models.subscription import SubscriptionPlan, UserSubscription
from app.models.user import User
from app.utils.auth import create_access_token
from app.utils.rate_limit import limiter

pytestmark = pytest.mark.requires_postgres


@pytest.fixture(autouse=True)
def _fresh_limiter():
    limiter.reset()
    yield
    limiter.reset()


def mk_user(db, tag="t2"):
    u = User(
        id=uuid.uuid4(),
        email=f"{tag}-{uuid.uuid4().hex[:8]}@test.local",
        username=f"{tag}_{uuid.uuid4().hex[:8]}",
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    return u


def hdr(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.id)})}"}


def mk_animal(client, user, name="Sally", taxon="true_spider", sex="female", **extra):
    body = {"taxon": taxon, "name": name, **extra}
    if sex is not None:
        body["sex"] = sex
    r = client.post("/api/v1/inverts/", json=body, headers=hdr(user))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _make_premium(db, user):
    plan = SubscriptionPlan(name=f"plan-{uuid.uuid4().hex[:10]}", display_name="Premium", app="tarantuverse")
    db.add(plan)
    db.commit()
    db.add(UserSubscription(user_id=user.id, plan_id=plan.id, status="active"))
    db.commit()


def _member(db, owner, member, role):
    db.add(CollectionMember(
        owner_user_id=owner.id, member_user_id=member.id, app="tarantuverse", role=role,
        invited_email=member.email, status="active", accepted_at=datetime.now(timezone.utc),
    ))
    db.commit()


def _fill(db, user, n):
    """n plain animals straight in the table (fast way to reach the cap)."""
    for i in range(n):
        db.add(Invert(id=uuid.uuid4(), user_id=user.id, taxon="isopod", name=f"filler {i}"))
    db.commit()


def post_sac(client, user, aid, laid="2026-10-01", **extra):
    r = client.post(f"/api/v1/inverts/{aid}/egg-sacs", json={"laid_date": laid, **extra}, headers=hdr(user))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def hatch(client, user, sac_id, count=40, hatched_on="2026-11-01", **extra):
    return client.post(
        f"/api/v1/egg-sacs/{sac_id}/hatch",
        json={"count": count, "hatched_on": hatched_on, **extra},
        headers=hdr(user),
    )


def split(client, user, colony_id, count, split_on="2026-11-10", **extra):
    return client.post(
        f"/api/v1/colonies/{colony_id}/split-out",
        json={"count": count, "split_on": split_on, **extra},
        headers=hdr(user),
    )


def mk_group(client, user, count=10, mother="Sally", taxon="true_spider"):
    aid = mk_animal(client, user, name=mother, taxon=taxon)
    sac_id = post_sac(client, user, aid)
    r = hatch(client, user, sac_id, count=count)
    assert r.status_code == 201, r.text
    return aid, sac_id, r.json()["colony"]["id"]


def _events(db, colony_id):
    return db.query(ColonyEvent).filter(ColonyEvent.colony_id == uuid.UUID(colony_id)).all()


@pytest.fixture()
def owner(db_session):
    return mk_user(db_session)


# ---------- hatch ----------

def test_hatch_creates_group(client, db_session, owner):
    aid = mk_animal(client, owner, location="Rack A")
    sac_id = post_sac(client, owner, aid)
    r = hatch(client, owner, sac_id, count=40, count_is_estimated=True)
    assert r.status_code == 201, r.text
    body = r.json()
    col = body["colony"]
    assert col["taxon"] == "true_spider"
    assert col["location"] == "Rack A"
    assert col["name"] == "Sally slings"
    assert col["stage_counts"] == {"slings": 40}
    assert col["count_is_estimated"] is True
    assert col["source"] == "bred"
    assert col["founded_date"] == "2026-11-01"
    assert col["total_count"] == 40
    assert col["from_egg_sac"]["id"] == sac_id
    assert col["from_egg_sac"]["mother"]["name"] == "Sally"

    sac = body["egg_sac"]
    assert sac["outcome"] == "hatched"
    assert sac["hatch_date"] == "2026-11-01"
    assert sac["spiderling_count"] == 40
    assert sac["hatched_colony"]["id"] == col["id"]

    evs = _events(db_session, col["id"])
    assert len(evs) == 1
    assert evs[0].event_type == "added"
    assert evs[0].notes == "Hatched from egg sac"
    assert evs[0].count_delta == 40


def test_hatch_buckets_by_taxon_and_species(client, db_session, owner):
    mantis = mk_animal(client, owner, name="Mia", taxon="mantis")
    r = hatch(client, owner, post_sac(client, owner, mantis), count=80)
    assert r.status_code == 201, r.text
    assert r.json()["colony"]["stage_counts"] == {"nymphs": 80}
    assert r.json()["colony"]["name"] == "Mia nymphs"

    scorp = mk_animal(client, owner, name="Rita", taxon="scorpion")
    r = hatch(client, owner, post_sac(client, owner, scorp), count=20, name="  Rita's brood  ")
    assert r.status_code == 201, r.text
    assert r.json()["colony"]["stage_counts"] == {"scorplings": 20}
    assert r.json()["colony"]["name"] == "Rita's brood"


def test_hatch_twice_409(client, db_session, owner):
    aid = mk_animal(client, owner)
    sac_id = post_sac(client, owner, aid)
    assert hatch(client, owner, sac_id).status_code == 201
    r = hatch(client, owner, sac_id)
    assert r.status_code == 409, r.text
    assert db_session.query(Colony).filter(Colony.egg_sac_id == uuid.UUID(sac_id)).count() == 1
    assert db_session.query(Colony).filter(Colony.user_id == owner.id).count() == 1


def test_failed_sac_can_hatch(client, owner):
    aid = mk_animal(client, owner)
    sac_id = post_sac(client, owner, aid)
    assert client.post(f"/api/v1/egg-sacs/{sac_id}/fail", json={}, headers=hdr(owner)).status_code == 200
    r = hatch(client, owner, sac_id, count=5)
    assert r.status_code == 201, r.text
    assert r.json()["egg_sac"]["outcome"] == "hatched"


def test_hatch_works_on_died_mother(client, db_session, owner):
    aid = mk_animal(client, owner)
    sac_id = post_sac(client, owner, aid)
    inv = db_session.query(Invert).filter(Invert.id == uuid.UUID(aid)).first()
    inv.died_at = date(2026, 10, 20)
    db_session.commit()
    r = hatch(client, owner, sac_id)
    assert r.status_code == 201, r.text
    cid = r.json()["colony"]["id"]
    s = split(client, owner, cid, 2)
    assert s.status_code == 201, s.text


def test_hatch_needs_a_mother(client, db_session, owner):
    # A legacy pairing-only sac (no mother link), inserted directly.
    from app.models.pairing import Pairing
    sac = EggSac(user_id=owner.id, laid_date=date(2026, 10, 1))
    _make_premium(db_session, owner)
    female = mk_animal(client, owner, name="Mum", taxon="tarantula")
    male = mk_animal(client, owner, name="Dad", taxon="tarantula", sex="male")
    p = Pairing(user_id=owner.id, male_id=uuid.UUID(male), female_id=uuid.UUID(female),
                paired_date=date(2026, 9, 1))
    db_session.add(p)
    db_session.commit()
    sac.pairing_id = p.id
    db_session.add(sac)
    db_session.commit()
    r = hatch(client, owner, str(sac.id))
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "Link a mother first"


def test_hatch_at_cap_402(client, db_session, owner):
    aid = mk_animal(client, owner)
    sac_id = post_sac(client, owner, aid)
    _fill(db_session, owner, 14)  # 15 with the mother
    r = hatch(client, owner, sac_id)
    assert r.status_code == 402, r.text
    assert r.json()["detail"]["can_add"] == 0
    assert db_session.query(Colony).filter(Colony.user_id == owner.id).count() == 0
    sac = client.get(f"/api/v1/egg-sacs/{sac_id}", headers=hdr(owner)).json()
    assert sac["outcome"] is None
    assert sac["hatch_date"] is None
    assert sac["spiderling_count"] is None


def test_hatch_validates_body(client, owner):
    aid = mk_animal(client, owner)
    sac_id = post_sac(client, owner, aid)
    assert hatch(client, owner, sac_id, count=0).status_code == 422
    assert hatch(client, owner, sac_id, count=2001).status_code == 422
    assert hatch(client, owner, sac_id, name="x" * 101).status_code == 422


# ---------- split ----------

def test_split_creates_animals_and_event(client, db_session, owner):
    _aid, sac_id, cid = mk_group(client, owner, count=10)
    r = split(client, owner, cid, 3)
    assert r.status_code == 201, r.text
    body = r.json()
    assert [c["name"] for c in body["created"]] == ["Sally slings #1", "Sally slings #2", "Sally slings #3"]
    assert body["colony_total"] == 7

    ids = [uuid.UUID(c["id"]) for c in body["created"]]
    animals = db_session.query(Invert).filter(Invert.id.in_(ids)).all()
    assert len(animals) == 3
    for a in animals:
        assert a.taxon == "true_spider"
        assert str(a.sex).lower().endswith("unknown")
        assert a.life_stage == "sling"
        assert a.date_acquired == date(2026, 11, 10)
        assert str(a.source).lower().endswith("bred")

    col = client.get(f"/api/v1/colonies/{cid}", headers=hdr(owner)).json()
    assert col["total_count"] == 7
    splits = [e for e in _events(db_session, cid) if e.event_type == "split"]
    assert len(splits) == 1
    assert splits[0].count_delta == -3
    assert splits[0].destination == "Split out into individual enclosures"
    assert splits[0].occurred_at == date(2026, 11, 10)

    offs = db_session.query(Offspring).filter(Offspring.invert_id.in_(ids)).all()
    assert len(offs) == 3
    for o in offs:
        assert getattr(o.status, "value", o.status) == "kept"
        assert o.egg_sac_id == uuid.UUID(sac_id)
        assert o.status_date == date(2026, 11, 10)
        assert o.tarantula_id is None  # jumpers have no legacy row


def test_split_tarantula_writes_legacy_link(client, db_session, owner):
    _aid, _sac, cid = mk_group(client, owner, count=4, mother="Rosie", taxon="tarantula")
    r = split(client, owner, cid, 1, life_stage="juvenile")
    assert r.status_code == 201, r.text
    iid = uuid.UUID(r.json()["created"][0]["id"])
    off = db_session.query(Offspring).filter(Offspring.invert_id == iid).one()
    assert off.tarantula_id == iid
    assert db_session.query(Invert).filter(Invert.id == iid).one().life_stage == "juvenile"


def test_split_numbering_continues(client, db_session, owner):
    _aid, _sac, cid = mk_group(client, owner, count=10)
    r = split(client, owner, cid, 3)
    assert r.status_code == 201
    second = r.json()["created"][1]["id"]
    assert client.put(f"/api/v1/inverts/{second}", json={"name": "Speedy"}, headers=hdr(owner)).status_code == 200
    r = split(client, owner, cid, 2)
    assert r.status_code == 201, r.text
    assert [c["name"] for c in r.json()["created"]] == ["Sally slings #4", "Sally slings #5"]


def test_split_takes_largest_bucket_first(client, db_session, owner):
    _aid, _sac, cid = mk_group(client, owner, count=2)
    col = db_session.query(Colony).filter(Colony.id == uuid.UUID(cid)).one()
    col.stage_counts = {"slings": 2, "juveniles": 5}
    db_session.commit()
    r = split(client, owner, cid, 6)
    assert r.status_code == 201, r.text
    assert r.json()["colony_total"] == 1
    splits = sorted(
        ((e.stage, e.count_delta) for e in _events(db_session, cid) if e.event_type == "split"),
        key=lambda t: t[1],
    )
    assert splits == [("juveniles", -5), ("slings", -1)]
    db_session.refresh(col)
    assert col.stage_counts == {"slings": 1, "juveniles": 0}


def test_split_over_total_409(client, db_session, owner):
    _aid, _sac, cid = mk_group(client, owner, count=3)
    before = db_session.query(Invert).filter(Invert.user_id == owner.id).count()
    r = split(client, owner, cid, 4)
    assert r.status_code == 409, r.text
    assert db_session.query(Invert).filter(Invert.user_id == owner.id).count() == before


def test_split_over_cap_writes_nothing(client, db_session, owner):
    _aid, _sac, cid = mk_group(client, owner, count=10)  # mother + group = 2
    _fill(db_session, owner, 11)  # 13 counted
    before = db_session.query(Invert).filter(Invert.user_id == owner.id).count()
    r = split(client, owner, cid, 5)
    assert r.status_code == 402, r.text
    detail = r.json()["detail"]
    assert detail["can_add"] == 2
    assert detail["current_count"] == 13
    assert detail["message"] == "You can add 2 more animals on the free plan."
    assert db_session.query(Invert).filter(Invert.user_id == owner.id).count() == before
    col = client.get(f"/api/v1/colonies/{cid}", headers=hdr(owner)).json()
    assert col["stage_counts"] == {"slings": 10}
    assert not [e for e in _events(db_session, cid) if e.event_type == "split"]
    # Two still fit.
    assert split(client, owner, cid, 2).status_code == 201


def test_split_validates_body(client, owner):
    _aid, _sac, cid = mk_group(client, owner, count=100)
    assert split(client, owner, cid, 0).status_code == 422
    assert split(client, owner, cid, 51).status_code == 422
    assert split(client, owner, cid, 1, life_stage="egg").status_code == 422


def test_split_non_brood_colony_400(client, owner):
    r = client.post("/api/v1/colonies/", json={
        "name": "Dairy cows", "taxon": "isopod", "stage_counts": {"mixed": 30},
    }, headers=hdr(owner))
    assert r.status_code == 201, r.text
    assert split(client, owner, r.json()["id"], 2).status_code == 400


def test_split_bought_group_no_parentage(client, db_session, owner):
    r = client.post("/api/v1/colonies/", json={
        "name": "Communal Ts", "taxon": "tarantula", "stage_counts": {"slings": 6},
    }, headers=hdr(owner))
    assert r.status_code == 201, r.text
    s = split(client, owner, r.json()["id"], 2)
    assert s.status_code == 201, s.text
    ids = [uuid.UUID(c["id"]) for c in s.json()["created"]]
    assert db_session.query(Offspring).filter(Offspring.invert_id.in_(ids)).count() == 0
    detail = client.get(f"/api/v1/inverts/{ids[0]}", headers=hdr(owner)).json()
    assert detail["parentage"] is None


def test_split_refused_on_ended_colony_409(client, db_session, owner):
    _aid, _sac, cid = mk_group(client, owner, count=10)
    assert client.post(f"/api/v1/colonies/{cid}/end", json={"reason": "other"}, headers=hdr(owner)).status_code == 200
    assert split(client, owner, cid, 1).status_code == 409

    _aid2, _sac2, cid2 = mk_group(client, owner, count=10, mother="Bea")
    assert client.put(f"/api/v1/colonies/{cid2}", json={"is_active": False}, headers=hdr(owner)).status_code == 200
    assert split(client, owner, cid2, 1).status_code == 409

    _aid3, _sac3, cid3 = mk_group(client, owner, count=10, mother="Cleo")
    col = db_session.query(Colony).filter(Colony.id == uuid.UUID(cid3)).one()
    col.transferred_out_at = datetime.now(timezone.utc)
    db_session.commit()
    assert split(client, owner, cid3, 1).status_code == 409


# ---------- detail reads ----------

def test_detail_parentage_and_group_banner(client, db_session, owner):
    aid, sac_id, cid = mk_group(client, owner, count=10)
    kid = split(client, owner, cid, 1).json()["created"][0]["id"]

    d = client.get(f"/api/v1/inverts/{kid}", headers=hdr(owner)).json()
    assert d["parentage"]["egg_sac_id"] == sac_id
    assert d["parentage"]["mother"] == {"id": aid, "name": "Sally"}
    assert d["parentage"]["colony"] == {"id": cid, "name": "Sally slings"}

    g = client.get(f"/api/v1/colonies/{cid}", headers=hdr(owner)).json()
    assert g["from_egg_sac"]["id"] == sac_id
    assert g["from_egg_sac"]["laid_date"] == "2026-10-01"
    assert g["from_egg_sac"]["mother"] == {"id": aid, "name": "Sally"}

    other = mk_animal(client, owner, name="Unrelated")
    assert client.get(f"/api/v1/inverts/{other}", headers=hdr(owner)).json()["parentage"] is None
    # Lists never carry it.
    rows = client.get("/api/v1/inverts/", headers=hdr(owner)).json()
    assert all(r.get("parentage") is None for r in rows)


def test_group_banner_survives_mother_and_group_deleted(client, db_session, owner):
    aid, sac_id, cid = mk_group(client, owner, count=10)
    # Group deleted: the sac says hatched with no group.
    assert client.delete(f"/api/v1/colonies/{cid}", headers=hdr(owner)).status_code == 204
    sac = client.get(f"/api/v1/egg-sacs/{sac_id}", headers=hdr(owner)).json()
    assert sac["outcome"] == "hatched" and sac["hatched_colony"] is None


def test_feeding_status_carries_instar_and_maturity(client, db_session, owner):
    aid = mk_animal(client, owner, name="Max", sex="male", current_instar=5)
    other = mk_animal(client, owner, name="Plain")
    db_session.add(MoltLog(invert_id=uuid.UUID(aid), molted_at=datetime(2026, 9, 1, 12, tzinfo=timezone.utc)))
    db_session.add(MoltLog(invert_id=uuid.UUID(aid), molted_at=datetime(2026, 10, 5, 12, tzinfo=timezone.utc),
                           is_ultimate=True))
    db_session.commit()
    rows = client.get("/api/v1/inverts/feeding-status", headers=hdr(owner)).json()
    by_id = {r["id"]: r for r in rows}
    assert by_id[aid]["current_instar"] == 5
    assert by_id[aid]["matured_at"] == "2026-10-05"
    assert by_id[other]["current_instar"] is None
    assert by_id[other]["matured_at"] is None


def test_matured_at_is_one_batched_query(client, db_session, owner):
    from sqlalchemy import event

    for i in range(4):
        aid = mk_animal(client, owner, name=f"M{i}", sex="male")
        db_session.add(MoltLog(invert_id=uuid.UUID(aid), molted_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
                               is_ultimate=True))
    db_session.commit()
    seen = []

    def spy(conn, cursor, statement, params, context, executemany):
        s = statement.lower().lstrip()
        if s.startswith("select") and "is_ultimate" in s:
            seen.append(statement)

    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", spy)
    try:
        rows = client.get("/api/v1/inverts/feeding-status", headers=hdr(owner)).json()
    finally:
        event.remove(engine, "before_cursor_execute", spy)
    assert len(rows) == 4 and all(r["matured_at"] == "2026-10-01" for r in rows)
    assert len(seen) == 1, seen


def test_public_routes_carry_no_parentage(client, db_session, owner):
    owner.collection_visibility = "public"
    db_session.commit()
    aid, sac_id, cid = mk_group(client, owner, count=10, mother="Secretmum")
    kid = split(client, owner, cid, 1).json()["created"][0]["id"]
    for model, rid in ((Invert, kid), (Colony, cid)):
        row = db_session.query(model).filter(model.id == uuid.UUID(rid)).one()
        row.visibility = "public"
    db_session.commit()

    pi = client.get(f"/api/v1/i/{kid}")
    pc = client.get(f"/api/v1/col/{cid}")
    pt = client.get(f"/api/v1/t/{kid}")
    assert pi.status_code == 200, pi.text
    assert pc.status_code == 200, pc.text
    # A jumper has no legacy tarantula row, so /t/ has nothing to show at all.
    assert pt.status_code == 404, pt.text
    for resp in (pi, pc, pt):
        text = resp.text
        assert "parentage" not in text
        assert "from_egg_sac" not in text
        assert "Secretmum" not in text.replace("Secretmum slings", "")
        assert sac_id not in text


def _pairing_sac_group(client, db_session, owner, count=10):
    """A tarantula pairing -> sac -> hatched group; returns (mother_id, father_id, colony_id)."""
    mum = mk_animal(client, owner, name="Secretmum", taxon="tarantula")
    dad = mk_animal(client, owner, name="Secretdad", taxon="tarantula", sex="male")
    p = Pairing(
        user_id=owner.id,
        male_id=uuid.UUID(dad), female_id=uuid.UUID(mum),
        male_invert_id=uuid.UUID(dad), female_invert_id=uuid.UUID(mum),
        paired_date=date(2026, 8, 1),
    )
    db_session.add(p)
    db_session.commit()
    r = client.post("/api/v1/egg-sacs/", json={"pairing_id": str(p.id), "laid_date": "2026-10-01"},
                    headers=hdr(owner))
    assert r.status_code == 201, r.text
    h = hatch(client, owner, r.json()["id"], count=count)
    assert h.status_code == 201, h.text
    return mum, dad, h.json()["colony"]["id"]


def test_public_t_page_hides_split_tarantula_parents(client, db_session, owner):
    """Spec §8: a split-out tarantula on a PUBLIC collection must not show its
    parents on /t/ to anyone outside the collection; the owner and co-keepers do."""
    _make_premium(db_session, owner)
    owner.collection_visibility = "public"
    db_session.commit()
    _mum, _dad, cid = _pairing_sac_group(client, db_session, owner)
    kid = split(client, owner, cid, 1).json()["created"][0]["id"]
    row = db_session.query(Invert).filter(Invert.id == uuid.UUID(kid)).one()
    row.visibility = "public"
    db_session.commit()

    anon = client.get(f"/api/v1/t/{kid}")
    assert anon.status_code == 200, anon.text
    assert anon.json()["lineage"] == {}
    # The kid's own default name ("Secretmum slings #1") is not lineage.
    assert "Secretmum" not in anon.text.replace("Secretmum slings", "")
    assert "Secretdad" not in anon.text

    stranger = mk_user(db_session, "out")
    other = client.get(f"/api/v1/t/{kid}", headers=hdr(stranger))
    assert other.status_code == 200, other.text
    assert other.json()["lineage"] == {}
    # The kid's own default name ("Secretmum slings #1") is not lineage.
    assert "Secretmum" not in other.text.replace("Secretmum slings", "")
    assert "Secretdad" not in other.text

    mine = client.get(f"/api/v1/t/{kid}", headers=hdr(owner))
    assert mine.status_code == 200, mine.text
    lineage = mine.json()["lineage"]
    assert lineage["mother"]["display_name"] == "Secretmum"
    assert lineage["father"]["display_name"] == "Secretdad"

    viewer = mk_user(db_session, "v")
    _member(db_session, owner, viewer, "viewer")
    cok = client.get(f"/api/v1/t/{kid}", headers=hdr(viewer))
    assert cok.status_code == 200, cok.text
    assert cok.json()["lineage"]["mother"]["display_name"] == "Secretmum"


# ---------- 30-day change on the collection list ----------

def _change_30d(client, owner, cid):
    r = client.get("/api/v1/colonies/", headers=hdr(owner))
    assert r.status_code == 200, r.text
    return next(c for c in r.json() if c["id"] == cid)["change_30d"]


def test_hatched_group_is_not_growth_in_change_30d(client, db_session, owner):
    """The hatch event is a starting count: a fresh group of 40 isn't "+40",
    and after splitting 3 out it has only shrunk."""
    today = date.today()
    aid = mk_animal(client, owner)
    sac_id = post_sac(client, owner, aid, laid=(today - timedelta(days=20)).isoformat())
    r = hatch(client, owner, sac_id, count=40, hatched_on=(today - timedelta(days=3)).isoformat())
    assert r.status_code == 201, r.text
    cid = r.json()["colony"]["id"]
    assert _change_30d(client, owner, cid) is None
    s = split(client, owner, cid, 3, split_on=today.isoformat())
    assert s.status_code == 201, s.text
    assert _change_30d(client, owner, cid) == -3


def test_hatch_event_counts_as_starting_count_in_history():
    from types import SimpleNamespace as NS
    from app.services import colony_history_service as h
    from app.utils.colony_counts import HATCH_NOTE, STARTING_COUNT_NOTES
    assert HATCH_NOTE in STARTING_COUNT_NOTES
    assert h._is_starting_count(NS(event_type="added", notes=HATCH_NOTE))
    assert not h._is_starting_count(NS(event_type="added", notes="Bought 5 more"))


# ---------- roles ----------

def test_keeper_cokeeper_can_hatch_and_split_logger_cannot(client, db_session, owner):
    _make_premium(db_session, owner)
    aid = mk_animal(client, owner)
    keeper, logger_u, stranger = mk_user(db_session, "k"), mk_user(db_session, "l"), mk_user(db_session, "s")
    _member(db_session, owner, keeper, "keeper")
    _member(db_session, owner, logger_u, "logger")
    s1 = post_sac(client, owner, aid)
    assert hatch(client, logger_u, s1).status_code == 403
    assert hatch(client, stranger, s1).status_code == 404
    r = hatch(client, keeper, s1)
    assert r.status_code == 201, r.text
    cid = r.json()["colony"]["id"]
    assert split(client, logger_u, cid, 1).status_code == 403
    assert split(client, stranger, cid, 1).status_code == 404
    s = split(client, keeper, cid, 2)
    assert s.status_code == 201, s.text
    # The animals are the owner's.
    for c in s.json()["created"]:
        assert db_session.query(Invert).filter(Invert.id == uuid.UUID(c["id"])).one().user_id == owner.id


# ---------- split lock ----------

def test_split_locks_the_group_row(client, db_session, owner):
    """Two taps / two phones must queue on the group row: the split re-reads
    the colony with SELECT ... FOR UPDATE before the total and cap checks."""
    from sqlalchemy import event

    _aid, _sac_id, cid = mk_group(client, owner, count=10)
    seen = []

    def spy(conn, cursor, statement, params, context, executemany):
        s = " ".join(statement.lower().split())
        if s.startswith("select") and "from colonies" in s and "for update" in s:
            seen.append(statement)

    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", spy)
    try:
        r = split(client, owner, cid, 2)
    finally:
        event.remove(engine, "before_cursor_execute", spy)
    assert r.status_code == 201, r.text
    assert len(seen) == 1, seen


def test_split_refused_rechecks_after_lock(client, db_session, owner):
    """A second split that asks for more than is left after the first gets
    409 from the fresh (locked) counts, not the stale copy."""
    _aid, _sac_id, cid = mk_group(client, owner, count=3)
    assert split(client, owner, cid, 2).status_code == 201
    r = split(client, owner, cid, 2)
    assert r.status_code == 409, r.text
    assert "only has 1" in r.json()["detail"]


def test_cap_message_for_a_batch():
    from app.utils.limits import _cap_message
    # One at a time: the exact old sentence (other callers depend on it).
    assert _cap_message(current_count=15, cap=15, lapsed=False) == (
        "You've reached the limit of 15 animals on the free plan. "
        "Upgrade to premium for unlimited tracking!"
    )
    assert _cap_message(current_count=15, cap=15, lapsed=False, adding=3).startswith(
        "You've reached the limit of 15"
    )
    # A batch while under the cap says how many still fit.
    assert _cap_message(current_count=14, cap=15, lapsed=False, adding=3) == (
        "You can add 1 more animal on the free plan."
    )
    assert _cap_message(current_count=10, cap=15, lapsed=True, adding=8).endswith(
        "You can add 5 more animals on the free plan."
    )
