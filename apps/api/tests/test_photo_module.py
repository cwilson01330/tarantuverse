"""Photo module fixes (2026-09-29): storage cleanup and the free photo limit.

- Files are deleted when the rows owning them go — but only files in our own
  photo/thumbnail/avatar areas, only once nothing references them, and never
  in a way that can fail the delete the keeper asked for.
- The free "5 photos per animal" limit applies on every Tarantuverse upload
  path (it used to exist only on the legacy tarantula route the phone app
  doesn't use), decided by the animal OWNER's plan.
"""
import asyncio
import uuid
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.utils import limits as lim
from app.utils import photo_cleanup as pc

BASE = "https://photos.tarantuverse.com"


class FakeStorage:
    use_r2 = True
    public_url_base = BASE

    def __init__(self, fail_on=None):
        self.deleted: list[str] = []
        self.fail_on = fail_on or set()

    async def delete_file(self, url):
        if url in self.fail_on:
            raise RuntimeError("R2 is down")
        self.deleted.append(url)


class Q:
    """db.query(...) stand-in: `.first()` answers 'is this URL still used?'."""

    def __init__(self, used: set[str], sink: list):
        self.used, self.sink = used, sink

    def filter(self, *clauses):
        self.sink[:] = [str(c.compile(compile_kwargs={"literal_binds": True})) for c in clauses]
        return self

    def first(self):
        sql = " ".join(self.sink)
        return (1,) if any(f"'{u}'" in sql for u in self.used) else None


class DB:
    def __init__(self, used=()):
        self.used = set(used)

    def query(self, *_):
        return Q(self.used, [])


def run(coro):
    return asyncio.run(coro)


# ── delete_files ─────────────────────────────────────────────────────────────

def _k(area="photos", prefix=""):
    return f"{area}/{prefix}{uuid.uuid4()}.jpg"


def test_deletes_photo_and_thumbnail():
    st = FakeStorage()
    p, t = f"{BASE}/{_k()}", f"{BASE}/{_k('thumbnails', 'thumb_')}"
    n = run(pc.delete_files(DB(), [(p, t)], storage=st))
    assert n == 2 and st.deleted == [p, t]


def test_never_touches_species_images_or_other_hosts():
    """A hero photo_url can point at a species catalogue image, and old rows
    may point off-site. Neither is ours to delete, whatever the row says."""
    st = FakeStorage()
    run(pc.delete_files(DB(), [
        (f"{BASE}/species-images/b-hamorii-1a2b.jpg", None),
        (f"https://example.com/{_k()}", None),
        (f"{BASE}/appts/products/y.jpg", None),  # the shop shares the bucket
        (f"{BASE}/photos/not-a-uuid.jpg", None),
    ], storage=st))
    assert st.deleted == []


def test_crafted_urls_cannot_reach_another_users_file():
    """The review's attack: avatar_url is free text, so a user can store a URL
    that merely CONTAINS a victim's key. It must never be treated as ours —
    only exact, canonical keys are deletable."""
    victim = _k()
    st = FakeStorage()
    run(pc.delete_files(DB(), [
        (f"{BASE}/photos/{BASE}/{victim}", None),          # base repeated inside
        (f"{BASE}/{victim}?x=1", None),                   # query string
        (f"{BASE}/photos/../{victim}", None),              # traversal
        (f"{BASE}//{victim}", None),                      # double slash
        (f"/uploads/photos/../../{victim}", None),         # local traversal
        (f"{BASE}/{victim}/..", None),
    ], storage=st))
    assert st.deleted == []


def test_r2_delete_only_strips_a_leading_base():
    """Defence in depth at the storage layer: `str.replace` used to strip the
    base wherever it appeared, turning a crafted URL into a victim's key."""
    from app.services.storage import StorageService

    calls = []
    svc = StorageService.__new__(StorageService)
    svc.use_r2 = True
    svc.public_url_base = BASE
    svc.bucket_name = "b"
    svc.s3_client = NS(delete_object=lambda **kw: calls.append(kw["Key"]))
    victim = _k()
    run(svc._delete_from_r2(f"https://evil.example/{BASE}/{victim}"))
    assert calls == []
    run(svc._delete_from_r2(f"{BASE}/{victim}"))
    assert calls == [victim]


def test_local_delete_refuses_paths_outside_uploads(tmp_path, monkeypatch):
    from app.services.storage import StorageService

    monkeypatch.chdir(tmp_path)
    (tmp_path / "uploads" / "photos").mkdir(parents=True)
    precious = tmp_path / "precious.txt"
    precious.write_text("keep me")
    svc = StorageService.__new__(StorageService)
    run(svc._delete_from_local("/uploads/photos/../../precious.txt"))
    assert precious.exists()
    ok = tmp_path / "uploads" / "photos" / "x.jpg"
    ok.write_text("x")
    run(svc._delete_from_local("/uploads/photos/x.jpg"))
    assert not ok.exists()


def test_keeps_a_file_another_row_still_uses():
    """A transferred animal's copy, or a hero shared by rows, must survive —
    and so must a victim's file that an attacker's avatar_url points at."""
    shared = f"{BASE}/{_k()}"
    thumb = f"{BASE}/{_k('thumbnails', 'thumb_')}"
    st = FakeStorage()
    run(pc.delete_files(DB(used={shared}), [(shared, thumb)], storage=st))
    assert st.deleted == [thumb]


def test_storage_failure_never_raises():
    """The DB delete already committed; a storage outage must not turn the
    keeper's successful delete into an error."""
    bad, good = f"{BASE}/{_k()}", f"{BASE}/{_k()}"
    st = FakeStorage(fail_on={bad})
    n = run(pc.delete_files(DB(), [(bad, None), (good, None)], storage=st))
    assert n == 1 and st.deleted == [good]


def test_local_dev_paths():
    st = FakeStorage()
    st.use_r2 = False
    p, t = f"/uploads/{_k()}", f"/uploads/{_k('thumbnails', 'thumb_')}"
    run(pc.delete_files(DB(), [(p, t), ("/static/logo.png", None)], storage=st))
    assert st.deleted == [p, t]


def test_avatars_are_deletable():
    st = FakeStorage()
    a = f"{BASE}/{_k('avatars', 'avatar_')}"
    run(pc.delete_files(DB(), [(a, None)], storage=st))
    assert st.deleted == [a]


def test_legacy_uppercase_extensions_still_clean_up():
    """Before the fix, keys kept the client's extension (e.g. .JPG, .jpeg)."""
    st = FakeStorage()
    a, b = f"{BASE}/photos/{uuid.uuid4()}.JPG", f"{BASE}/photos/{uuid.uuid4()}.jpeg"
    run(pc.delete_files(DB(), [(a, b)], storage=st))
    assert st.deleted == [a, b]


# ── every delete route reads the files first and removes them after commit ──

@pytest.mark.parametrize("module,func", [
    ("inverts", "delete_invert"),
    ("tarantulas", "delete_tarantula"),
    ("scorpions", "delete_scorpion"),
    ("centipedes", "delete_centipede"),
    ("whip_spiders", "delete_whip_spider"),
    ("animals", "delete_animal"),
    ("colonies", "delete_colony"),
    ("auth", "delete_account"),
])
def test_delete_routes_clean_up_files_after_commit(module, func):
    import importlib
    import inspect

    src = inspect.getsource(getattr(importlib.import_module(f"app.routers.{module}"), func))
    collect = src.find("_photo_files = collect_for_")
    commit = src.rfind("db.commit()")
    cleanup = src.find("await delete_files(db, _photo_files)")
    assert collect != -1, f"{func} must read photo files before deleting"
    assert cleanup != -1, f"{func} must delete photo files"
    assert collect < commit < cleanup, f"{func}: collect → commit → delete files"


def test_single_photo_delete_commits_before_removing_files():
    import inspect
    from app.routers import photos

    src = inspect.getsource(photos.delete_photo)
    assert "storage_service.delete_photo" not in src
    assert src.find("db.commit()") < src.find("await delete_files(db, files)")


# ── free photo limit ─────────────────────────────────────────────────────────

class Owner:
    def __init__(self, premium: bool):
        self.premium = premium
        self.id = uuid.uuid4()

    def is_premium_for_app(self, app):
        assert app == "tarantuverse", "the TV limit is decided by TV premium only"
        return self.premium


def test_free_owner_is_stopped_at_five(monkeypatch):
    monkeypatch.setattr(lim, "count_animal_photos", lambda db, aid: 5)
    with pytest.raises(HTTPException) as e:
        lim.enforce_photo_cap(None, Owner(False), uuid.uuid4())
    assert e.value.status_code == 402
    assert e.value.detail["limit"] == 5 and e.value.detail["current_count"] == 5


def test_free_owner_under_the_limit_can_upload(monkeypatch):
    monkeypatch.setattr(lim, "count_animal_photos", lambda db, aid: 4)
    lim.enforce_photo_cap(None, Owner(False), uuid.uuid4())


def test_premium_owner_is_never_counted(monkeypatch):
    def boom(*_):
        raise AssertionError("premium must not even count")
    monkeypatch.setattr(lim, "count_animal_photos", boom)
    lim.enforce_photo_cap(None, Owner(True), uuid.uuid4())


def test_count_matches_legacy_ids_too():
    """Old tarantula photos may carry only tarantula_id; the phone app's carry
    invert_id. Both are the same animal and both count."""
    seen = {}

    class CQ:
        def filter(self, clause):
            seen["sql"] = str(clause)
            return self

        def count(self):
            return 3

    aid = uuid.uuid4()
    assert lim.count_animal_photos(NS(query=lambda *_: CQ()), aid) == 3
    for col in ("invert_id", "tarantula_id", "scorpion_id"):
        assert f"photos.{col}" in seen["sql"]


def test_invert_upload_route_uses_the_owners_plan():
    import inspect
    from app.routers import photos

    assert "enforce_photo_cap(db, access.owner, invert_id)" in inspect.getsource(photos.upload_invert_photo)


@pytest.mark.parametrize("func", [
    "upload_photo", "upload_scorpion_photo", "upload_centipede_photo",
    "upload_whip_spider_photo", "upload_invert_photo",
])
def test_every_tv_upload_route_checks_the_limit(func):
    import inspect
    from app.routers import photos

    assert "enforce_photo_cap(" in inspect.getsource(getattr(photos, func))


def test_hv_and_colony_uploads_are_not_capped():
    """HV plans never advertised a photo limit; adding one would be policy."""
    import inspect
    from app.routers import photos

    assert "enforce_photo_cap" not in inspect.getsource(photos.upload_animal_photo)
    assert "enforce_photo_cap" not in inspect.getsource(photos.upload_colony_photo)


def test_qr_upload_checks_the_limit_for_tv_animals():
    import inspect
    from app.routers import qr

    assert "enforce_photo_cap(" in inspect.getsource(qr.upload_photo_via_token)
