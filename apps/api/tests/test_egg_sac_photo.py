"""Egg-sac photo: POST/DELETE /egg-sacs/{id}/photo.

One photo per sac, uploaded through the same sanitising path as animal photos
(StorageService.upload_photo), free and NOT counted by the 5-photo cap. Files
are removed AFTER the commit and only when nothing else still points at them.
"""
import io
import uuid
from datetime import date, datetime, timezone

import pytest
from PIL import Image

from app.models.collection_member import CollectionMember
from app.models.egg_sac import EggSac
from app.models.invert import Invert
from app.models.pairing import Pairing
from app.models.photo import Photo
from app.models.subscription import SubscriptionPlan, UserSubscription
from app.models.user import User
from app.utils import limits as lim
from app.utils.auth import create_access_token
from app.utils.rate_limit import limiter

pytestmark = pytest.mark.requires_postgres

BASE = "https://photos.tarantuverse.com"


class FakeStorage:
    use_r2 = True
    public_url_base = BASE

    def __init__(self):
        self.uploaded: list[tuple[str, str]] = []
        self.deleted: list[str] = []
        self.seen_bytes: list[bytes] = []

    async def upload_photo(self, file_data, filename, content_type="image/jpeg"):
        self.seen_bytes.append(file_data)
        # Like the real helper the bytes must be a decodable image; mimic its ValueError.
        try:
            Image.open(io.BytesIO(file_data)).load()
        except Exception:
            raise ValueError("not an image")
        n = uuid.uuid4()
        pair = (f"{BASE}/photos/{n}.jpg", f"{BASE}/thumbnails/thumb_{uuid.uuid4()}.jpg")
        self.uploaded.append(pair)
        return pair

    async def delete_file(self, url):
        self.deleted.append(url)


@pytest.fixture()
def storage(monkeypatch):
    fake = FakeStorage()
    import app.routers.egg_sacs as router
    import app.services.storage as storage_mod

    monkeypatch.setattr(router, "storage_service", fake)
    monkeypatch.setattr(storage_mod, "storage_service", fake)
    return fake


@pytest.fixture(autouse=True)
def _fresh_limiter():
    limiter.reset()
    yield
    limiter.reset()


def mk_user(db, tag="sp"):
    u = User(id=uuid.uuid4(), email=f"{tag}-{uuid.uuid4().hex[:8]}@test.local",
             username=f"{tag}_{uuid.uuid4().hex[:8]}", is_active=True, is_verified=True)
    db.add(u)
    db.commit()
    return u


def hdr(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.id)})}"}


def mk_animal(client, user, name="Sally", taxon="true_spider", sex="female"):
    r = client.post("/api/v1/inverts/", json={"taxon": taxon, "name": name, "sex": sex}, headers=hdr(user))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def mk_sac(client, user, aid):
    r = client.post(f"/api/v1/inverts/{aid}/egg-sacs", json={"laid_date": "2026-11-01"}, headers=hdr(user))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _member(db, owner, member, role):
    db.add(CollectionMember(
        owner_user_id=owner.id, member_user_id=member.id, app="tarantuverse", role=role,
        invited_email=member.email, status="active", accepted_at=datetime.now(timezone.utc),
    ))
    db.commit()


def _make_premium(db, user):
    plan = SubscriptionPlan(name=f"plan-{uuid.uuid4().hex[:10]}", display_name="Premium", app="tarantuverse")
    db.add(plan)
    db.commit()
    db.add(UserSubscription(user_id=user.id, plan_id=plan.id, status="active"))
    db.commit()


def png(size=(40, 30)):
    buf = io.BytesIO()
    Image.new("RGB", size, (200, 30, 30)).save(buf, format="PNG")
    return buf.getvalue()


def upload(client, user, sac_id, data=None, name="sac.png"):
    return client.post(
        f"/api/v1/egg-sacs/{sac_id}/photo",
        files={"file": (name, io.BytesIO(data if data is not None else png()), "image/png")},
        headers=hdr(user),
    )


@pytest.fixture()
def owner(db_session):
    return mk_user(db_session)


def stored(db_session, sac_id):
    db_session.expire_all()
    return db_session.query(EggSac).filter(EggSac.id == uuid.UUID(sac_id)).one().photo_url


def test_upload_sets_photo_url_and_returns_response(client, db_session, owner, storage):
    aid = mk_animal(client, owner)
    sac = mk_sac(client, owner, aid)
    r = upload(client, owner, sac)
    assert r.status_code == 200, r.text
    url, thumb = storage.uploaded[0]
    assert r.json()["photo_url"] == url
    assert r.json()["id"] == sac
    assert stored(db_session, sac) == url
    # The thumbnail the helper always makes is not used for a sac: removed again.
    assert storage.deleted == [thumb]


def test_replace_deletes_old_file_after_commit(client, db_session, owner, storage):
    aid = mk_animal(client, owner)
    sac = mk_sac(client, owner, aid)
    upload(client, owner, sac)
    first = storage.uploaded[0][0]
    storage.deleted.clear()
    r = upload(client, owner, sac)
    assert r.status_code == 200, r.text
    second = storage.uploaded[1][0]
    assert stored(db_session, sac) == second
    assert first in storage.deleted
    assert second not in storage.deleted


def test_delete_photo_clears_and_deletes_file(client, db_session, owner, storage):
    aid = mk_animal(client, owner)
    sac = mk_sac(client, owner, aid)
    upload(client, owner, sac)
    url = storage.uploaded[0][0]
    storage.deleted.clear()
    r = client.delete(f"/api/v1/egg-sacs/{sac}/photo", headers=hdr(owner))
    assert r.status_code == 204
    assert stored(db_session, sac) is None
    assert storage.deleted == [url]
    # A second delete is harmless.
    assert client.delete(f"/api/v1/egg-sacs/{sac}/photo", headers=hdr(owner)).status_code == 204


def test_sac_delete_deletes_its_file(client, db_session, owner, storage):
    aid = mk_animal(client, owner)
    sac = mk_sac(client, owner, aid)
    upload(client, owner, sac)
    url = storage.uploaded[0][0]
    storage.deleted.clear()
    assert client.delete(f"/api/v1/egg-sacs/{sac}", headers=hdr(owner)).status_code == 204
    assert url in storage.deleted


def test_mother_delete_deletes_sac_files(client, db_session, owner, storage):
    aid = mk_animal(client, owner)
    s1, s2 = mk_sac(client, owner, aid), mk_sac(client, owner, aid)
    upload(client, owner, s1)
    upload(client, owner, s2)
    urls = [storage.uploaded[0][0], storage.uploaded[1][0]]
    storage.deleted.clear()
    r = client.delete(f"/api/v1/inverts/{aid}", headers=hdr(owner))
    assert r.status_code == 204, r.text
    assert db_session.query(EggSac).filter(EggSac.user_id == owner.id).count() == 0
    for u in urls:
        assert u in storage.deleted


def test_file_still_referenced_elsewhere_is_not_deleted(client, db_session, owner, storage):
    aid = mk_animal(client, owner)
    sac = mk_sac(client, owner, aid)
    upload(client, owner, sac)
    url = storage.uploaded[0][0]
    # An animal photo row points at the very same file.
    db_session.add(Photo(id=str(uuid.uuid4()), invert_id=aid, url=url, thumbnail_url=None))
    db_session.commit()
    storage.deleted.clear()
    assert client.delete(f"/api/v1/egg-sacs/{sac}/photo", headers=hdr(owner)).status_code == 204
    assert url not in storage.deleted


def test_animal_file_pointed_at_by_a_sac_is_not_deleted(client, db_session, owner, storage):
    """Deleting an animal photo must not remove a file a sac still shows."""
    from app.utils.photo_cleanup import delete_files
    import asyncio

    aid = mk_animal(client, owner)
    sac = mk_sac(client, owner, aid)
    upload(client, owner, sac)
    url = storage.uploaded[0][0]
    storage.deleted.clear()
    asyncio.run(delete_files(db_session, [(url, None)], storage=storage))
    assert storage.deleted == []


def test_non_image_is_400(client, db_session, owner, storage):
    aid = mk_animal(client, owner)
    sac = mk_sac(client, owner, aid)
    r = upload(client, owner, sac, data=b"this is not an image at all", name="x.png")
    assert r.status_code == 400, r.text
    assert storage.uploaded == []
    assert stored(db_session, sac) is None


def test_roles_and_strangers(client, db_session, owner, storage):
    _make_premium(db_session, owner)  # co-keepers belong to a Premium collection
    aid = mk_animal(client, owner)
    sac = mk_sac(client, owner, aid)
    keeper, logger_, viewer, stranger = (mk_user(db_session, t) for t in ("kp", "lg", "vw", "st"))
    _member(db_session, owner, keeper, "keeper")
    _member(db_session, owner, logger_, "logger")
    _member(db_session, owner, viewer, "viewer")
    assert upload(client, keeper, sac).status_code == 200
    assert upload(client, logger_, sac).status_code == 403
    assert upload(client, viewer, sac).status_code == 403
    assert upload(client, stranger, sac).status_code == 404
    assert client.delete(f"/api/v1/egg-sacs/{sac}/photo", headers=hdr(logger_)).status_code == 403
    assert client.delete(f"/api/v1/egg-sacs/{sac}/photo", headers=hdr(stranger)).status_code == 404
    assert client.delete(f"/api/v1/egg-sacs/{sac}/photo", headers=hdr(keeper)).status_code == 204


def test_free_user_ok_and_photo_cap_not_consulted(client, db_session, owner, storage, monkeypatch):
    def boom(*a, **k):
        raise AssertionError("the 5-photo cap must not apply to a sac")

    monkeypatch.setattr(lim, "enforce_photo_cap", boom)
    monkeypatch.setattr(lim, "count_animal_photos", boom)
    aid = mk_animal(client, owner)
    sac = mk_sac(client, owner, aid)
    for _ in range(7):  # more than the free limit, replaced each time
        assert upload(client, owner, sac).status_code == 200


def test_died_mother_can_still_get_a_photo(client, db_session, owner, storage):
    aid = mk_animal(client, owner)
    sac = mk_sac(client, owner, aid)
    inv = db_session.query(Invert).filter(Invert.id == uuid.UUID(aid)).one()
    inv.died_at = datetime.now(timezone.utc)
    db_session.commit()
    assert upload(client, owner, sac).status_code == 200


def test_public_mother_response_has_no_sac_photo(client, db_session, owner, storage):
    owner.collection_visibility = "public"
    db_session.commit()
    aid = mk_animal(client, owner)
    sac = mk_sac(client, owner, aid)
    upload(client, owner, sac)
    url = storage.uploaded[0][0]
    key = url.rsplit("/", 1)[1]
    inv = db_session.query(Invert).filter(Invert.id == uuid.UUID(aid)).one()
    inv.visibility = "public"
    db_session.commit()
    r = client.get(f"/api/v1/i/{aid}")
    assert r.status_code == 200, r.text
    assert key not in r.text and "egg_sac" not in r.text


def test_rate_limit_is_20_per_hour():
    import inspect
    from app.routers import egg_sacs

    src = inspect.getsource(egg_sacs)
    i = src.index("async def upload_egg_sac_photo")
    assert '@limiter.limit("20/hour", key_func=user_or_ip)' in src[max(0, i - 200):i]


def _paired_sac(client, db_session, owner):
    """A pairing-linked sac with a photo. Returns (female, male, pairing, sac, url)."""
    female = mk_animal(client, owner, name="Mum", taxon="tarantula")
    male = mk_animal(client, owner, name="Dad", taxon="tarantula", sex="male")
    pairing = Pairing(
        user_id=owner.id, male_id=uuid.UUID(male), female_id=uuid.UUID(female),
        male_invert_id=uuid.UUID(male), female_invert_id=uuid.UUID(female),
        paired_date=date(2026, 9, 1),
    )
    db_session.add(pairing)
    db_session.commit()
    r = client.post("/api/v1/egg-sacs/", json={"pairing_id": str(pairing.id), "laid_date": "2026-10-01"},
                    headers=hdr(owner))
    assert r.status_code == 201, r.text
    sac = r.json()["id"]
    assert upload(client, owner, sac).status_code == 200
    return female, male, pairing, sac, stored(db_session, sac)


def test_mother_delete_deletes_pairing_linked_sac_file(client, db_session, owner, storage):
    female, _male, _p, sac, url = _paired_sac(client, db_session, owner)
    storage.deleted.clear()
    assert client.delete(f"/api/v1/inverts/{female}", headers=hdr(owner)).status_code == 204
    assert db_session.query(EggSac).filter(EggSac.id == uuid.UUID(sac)).count() == 0
    assert url in storage.deleted


def test_father_delete_deletes_pairing_linked_sac_file(client, db_session, owner, storage):
    _f, male, _p, sac, url = _paired_sac(client, db_session, owner)
    storage.deleted.clear()
    assert client.delete(f"/api/v1/inverts/{male}", headers=hdr(owner)).status_code == 204
    assert db_session.query(EggSac).filter(EggSac.id == uuid.UUID(sac)).count() == 0
    assert url in storage.deleted


def test_pairing_delete_deletes_its_sac_files(client, db_session, owner, storage):
    _f, _m, pairing, sac, url = _paired_sac(client, db_session, owner)
    storage.deleted.clear()
    r = client.delete(f"/api/v1/pairings/{pairing.id}", headers=hdr(owner))
    assert r.status_code == 204, r.text
    assert db_session.query(EggSac).filter(EggSac.id == uuid.UUID(sac)).count() == 0
    assert url in storage.deleted
