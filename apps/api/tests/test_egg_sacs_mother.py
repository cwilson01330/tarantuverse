"""Jumping spiders, Task 1: egg sacs without a pairing.

POST /inverts/{id}/egg-sacs logs a sac straight on the mother (free; true_spider,
mantis, tarantula, scorpion; not males; not on a closed mother). Pairing-based
sacs lose their 402 and gain mother_invert_id. Access follows the mother:
owner + keeper co-keepers write, logger/viewer 403, strangers 404.
"""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from app.models.collection_member import CollectionMember
from app.models.egg_sac import EggSac
from app.models.invert import Invert
from app.models.pairing import Pairing
from app.models.subscription import SubscriptionPlan, UserSubscription
from app.models.user import User
from app.services.export_service import COLONY_FIELDS, EGG_SAC_FIELDS
from app.utils.auth import create_access_token
from app.utils.rate_limit import limiter

pytestmark = pytest.mark.requires_postgres


@pytest.fixture(autouse=True)
def _fresh_limiter():
    limiter.reset()
    yield
    limiter.reset()


def mk_user(db, tag="t1a"):
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


def post_sac(client, user, aid, laid="2026-11-01", **extra):
    return client.post(f"/api/v1/inverts/{aid}/egg-sacs", json={"laid_date": laid, **extra}, headers=hdr(user))


@pytest.fixture()
def owner(db_session):
    return mk_user(db_session)


def test_free_keeper_logs_sac_on_female(client, owner):
    aid = mk_animal(client, owner)
    r = post_sac(client, owner, aid)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["mother_invert_id"] == aid
    assert body["pairing_id"] is None
    assert body["outcome"] is None
    assert body["hatched_colony"] is None


def test_list_newest_first_includes_pairing_sacs(client, db_session, owner):
    _make_premium(db_session, owner)
    female = mk_animal(client, owner, name="Mum", taxon="tarantula")
    male = mk_animal(client, owner, name="Dad", taxon="tarantula", sex="male")
    pairing = Pairing(
        user_id=owner.id, male_id=uuid.UUID(male), female_id=uuid.UUID(female),
        male_invert_id=uuid.UUID(male), female_invert_id=uuid.UUID(female),
        paired_date=date(2026, 9, 1),
    )
    db_session.add(pairing)
    db_session.commit()
    r1 = client.post("/api/v1/egg-sacs/", json={"pairing_id": str(pairing.id), "laid_date": "2026-10-01"}, headers=hdr(owner))
    assert r1.status_code == 201, r1.text
    r2 = post_sac(client, owner, female, laid="2026-11-02")
    assert r2.status_code == 201, r2.text
    rows = client.get(f"/api/v1/inverts/{female}/egg-sacs", headers=hdr(owner))
    assert rows.status_code == 200
    got = rows.json()
    assert [g["laid_date"] for g in got] == ["2026-11-02", "2026-10-01"]
    assert got[1]["pairing_id"] == str(pairing.id)


def test_pairing_sac_no_longer_402s_and_sets_mother(client, db_session, owner):
    # Pairing creation is Premium, so insert the pairing directly for a free user.
    female = mk_animal(client, owner, name="Mum", taxon="tarantula")
    male = mk_animal(client, owner, name="Dad", taxon="tarantula", sex="male")
    pairing = Pairing(
        user_id=owner.id, male_id=uuid.UUID(male), female_id=uuid.UUID(female),
        male_invert_id=uuid.UUID(male), female_invert_id=uuid.UUID(female),
        paired_date=date(2026, 9, 1),
    )
    db_session.add(pairing)
    db_session.commit()
    r = client.post("/api/v1/egg-sacs/", json={"pairing_id": str(pairing.id), "laid_date": "2026-10-01"}, headers=hdr(owner))
    assert r.status_code == 201, r.text
    assert r.json()["mother_invert_id"] == str(pairing.female_invert_id)


def test_refuses_wrong_taxon_and_male(client, owner):
    centipede = mk_animal(client, owner, name="Cent", taxon="centipede")
    assert post_sac(client, owner, centipede).status_code == 400
    male = mk_animal(client, owner, name="Mr", sex="male")
    assert post_sac(client, owner, male).status_code == 400
    unknown = mk_animal(client, owner, name="Unk", sex=None)
    assert post_sac(client, owner, unknown).status_code == 201


def test_refuses_new_sac_on_died_mother(client, db_session, owner):
    aid = mk_animal(client, owner)
    sac_id = post_sac(client, owner, aid).json()["id"]
    inv = db_session.query(Invert).filter(Invert.id == uuid.UUID(aid)).first()
    inv.died_at = datetime.now(timezone.utc)
    db_session.commit()
    assert post_sac(client, owner, aid, laid="2026-11-05").status_code == 409
    r = client.put(f"/api/v1/egg-sacs/{sac_id}", json={"notes": "after she died"}, headers=hdr(owner))
    assert r.status_code == 200, r.text
    assert r.json()["notes"] == "after she died"


def test_roles(client, db_session, owner):
    _make_premium(db_session, owner)
    aid = mk_animal(client, owner)
    keeper, logger_u, stranger = mk_user(db_session, "k"), mk_user(db_session, "l"), mk_user(db_session, "s")
    _member(db_session, owner, keeper, "keeper")
    _member(db_session, owner, logger_u, "logger")
    r = post_sac(client, keeper, aid)
    assert r.status_code == 201, r.text
    sac_id = r.json()["id"]
    assert post_sac(client, logger_u, aid).status_code == 403
    assert post_sac(client, stranger, aid).status_code == 404
    assert client.put(f"/api/v1/egg-sacs/{sac_id}", json={"notes": "x"}, headers=hdr(logger_u)).status_code == 403
    assert client.put(f"/api/v1/egg-sacs/{sac_id}", json={"notes": "x"}, headers=hdr(stranger)).status_code == 404
    assert client.put(f"/api/v1/egg-sacs/{sac_id}", json={"notes": "x"}, headers=hdr(keeper)).status_code == 200
    assert client.delete(f"/api/v1/egg-sacs/{sac_id}", headers=hdr(keeper)).status_code == 204


def test_fail_sets_outcome(client, owner):
    aid = mk_animal(client, owner)
    sac_id = post_sac(client, owner, aid, notes="first").json()["id"]
    r = client.post(f"/api/v1/egg-sacs/{sac_id}/fail", json={"notes": "mould"}, headers=hdr(owner))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["outcome"] == "failed"
    assert "first" in body["notes"] and "mould" in body["notes"]


def test_export_has_new_columns():
    assert "mother_invert_id" in EGG_SAC_FIELDS and "outcome" in EGG_SAC_FIELDS
    assert "egg_sac_id" in COLONY_FIELDS


def test_put_partial_edit_and_null_laid_date_refused(client, owner):
    aid = mk_animal(client, owner)
    r = post_sac(client, owner, aid, notes="first")
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    # Partial edit: only what is sent changes.
    e = client.put(
        f"/api/v1/egg-sacs/{sid}",
        json={"laid_date": "2026-10-20", "expected_hatch_date": "2026-11-20", "notes": "moved"},
        headers=hdr(owner),
    )
    assert e.status_code == 200, e.text
    body = e.json()
    assert (body["laid_date"], body["expected_hatch_date"], body["notes"]) == ("2026-10-20", "2026-11-20", "moved")
    # Clearing the laid date is a validation error, not a 500.
    bad = client.put(f"/api/v1/egg-sacs/{sid}", json={"laid_date": None}, headers=hdr(owner))
    assert bad.status_code == 422, bad.text
    assert client.get(f"/api/v1/egg-sacs/{sid}", headers=hdr(owner)).json()["laid_date"] == "2026-10-20"
