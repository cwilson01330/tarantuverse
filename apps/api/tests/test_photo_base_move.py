"""Photos move from the bucket's r2.dev address to photos.tarantuverse.com.

Every link stored before the move starts with the old address; new uploads use
the new one. Until rewrite_photo_urls.py has moved every stored link — and for
any stray old link after — the code that decides "is this ours?" must accept
both: deletes (or an animal's old photos stay public forever), the full export
(or old photos go missing from backups), share cards and care sheets (or old
heroes vanish from them). Only an exact leading address counts.
"""
import asyncio
import uuid
from types import SimpleNamespace as NS

from app.utils import photo_cleanup as pc
from app.utils.storage_urls import is_our_photo_url, key_for_url, photo_bases, url_variants

NEW = "https://photos.tarantuverse.com"
OLD = "https://pub-739a81bdc01a40bb8cfce4a58b122d17.r2.dev"


def run(coro):
    return asyncio.run(coro)


def _k(area="photos", prefix=""):
    return f"{area}/{prefix}{uuid.uuid4()}.jpg"


# ── the helper ───────────────────────────────────────────────────────────────

def test_bases_current_first_deduped_https_only():
    assert photo_bases(NEW + "/", f"{OLD}, {NEW},http://insecure.example, ") == [NEW, OLD]
    assert photo_bases("", OLD) == [OLD]


def test_default_bases_follow_settings(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "R2_PUBLIC_URL", NEW)
    monkeypatch.setattr(settings, "R2_LEGACY_PUBLIC_URLS", OLD)
    assert photo_bases() == [NEW, OLD]
    # Local dev (no bucket address): nothing is a bucket link.
    monkeypatch.setattr(settings, "R2_PUBLIC_URL", "")
    assert photo_bases() == []


def test_the_shipped_default_is_the_old_r2_dev_address():
    from app.config import Settings

    assert Settings(_env_file=None).R2_LEGACY_PUBLIC_URLS == OLD


def test_key_for_either_address_and_nothing_else():
    key = _k()
    bases = [NEW, OLD]
    assert key_for_url(f"{NEW}/{key}", bases) == key
    assert key_for_url(f"{OLD}/{key}", bases) == key
    for bad in (
        f"{OLD}.evil.com/{key}",                 # look-alike host
        f"https://evil.example/{OLD}/{key}",     # address inside the path
        f"{NEW}{key}",                           # no slash after the host
        f"{NEW}/",                               # no key at all
        "", None,
    ):
        assert key_for_url(bad, bases) is None
        assert not is_our_photo_url(bad, bases)


def test_url_variants_cover_every_address():
    assert url_variants("photos/a.jpg", [NEW, OLD]) == [f"{NEW}/photos/a.jpg", f"{OLD}/photos/a.jpg"]


# ── deleting files ───────────────────────────────────────────────────────────

class FakeStorage:
    use_r2 = True
    public_url_base = NEW

    def __init__(self):
        self.deleted = []

    async def delete_file(self, url):
        self.deleted.append(url)


class Q:
    def __init__(self, used, sink):
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


def test_old_address_photos_are_still_cleaned_up(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "R2_LEGACY_PUBLIC_URLS", OLD)
    st = FakeStorage()
    p, t = f"{OLD}/{_k()}", f"{OLD}/{_k('thumbnails', 'thumb_')}"
    assert run(pc.delete_files(DB(), [(p, t)], storage=st)) == 2
    assert st.deleted == [p, t]


def test_a_reference_under_the_other_address_keeps_the_file(monkeypatch):
    """Mid-move, one row may store the new link and another the old link to
    the SAME object (a transfer copy shares nothing, but a hero photo_url and
    its photo row can). Deleting one must not delete the file under the other."""
    from app.config import settings

    monkeypatch.setattr(settings, "R2_LEGACY_PUBLIC_URLS", OLD)
    key = _k()
    st = FakeStorage()
    run(pc.delete_files(DB(used={f"{OLD}/{key}"}), [(f"{NEW}/{key}", None)], storage=st))
    assert st.deleted == []
    run(pc.delete_files(DB(used={f"{NEW}/{key}"}), [(f"{OLD}/{key}", None)], storage=st))
    assert st.deleted == []


def test_storage_layer_deletes_old_address_keys_only_when_leading(monkeypatch):
    from app.config import settings
    from app.services.storage import StorageService

    monkeypatch.setattr(settings, "R2_LEGACY_PUBLIC_URLS", OLD)
    calls = []
    svc = StorageService.__new__(StorageService)
    svc.use_r2 = True
    svc.public_url_base = NEW
    svc.bucket_name = "b"
    svc.s3_client = NS(delete_object=lambda **kw: calls.append(kw["Key"]))
    victim = _k()
    run(svc._delete_from_r2(f"https://evil.example/{OLD}/{victim}"))
    run(svc._delete_from_r2(f"{OLD}.evil.com/{victim}"))
    assert calls == []
    run(svc._delete_from_r2(f"{OLD}/{victim}"))
    run(svc._delete_from_r2(f"{NEW}/{victim}"))
    assert calls == [victim, victim]


def test_transfer_copy_reads_an_old_address_source(monkeypatch):
    from app.config import settings
    from app.services.storage import StorageService

    monkeypatch.setattr(settings, "R2_LEGACY_PUBLIC_URLS", OLD)
    copies = []
    svc = StorageService.__new__(StorageService)
    svc.use_r2 = True
    svc.public_url_base = NEW
    svc.bucket_name = "b"
    svc.s3_client = NS(copy_object=lambda **kw: copies.append((kw["CopySource"]["Key"], kw["Key"])))
    src = _k()
    assert svc._copy_in_r2(f"{OLD}/{src}", "photos/new.jpg") == f"{NEW}/photos/new.jpg"
    assert copies == [(src, "photos/new.jpg")]
    import pytest

    with pytest.raises(ValueError):
        svc._copy_in_r2(f"https://evil.example/{src}", "photos/x.jpg")


# ── share cards, care sheets, export ────────────────────────────────────────

def test_share_cards_accept_both_addresses_by_default(monkeypatch):
    from app.config import settings
    from app.services import storage as storage_mod
    from app.services.share_card import allowed_photo_url

    monkeypatch.setattr(settings, "R2_LEGACY_PUBLIC_URLS", OLD)
    monkeypatch.setattr(storage_mod.storage_service, "use_r2", True, raising=False)
    monkeypatch.setattr(storage_mod.storage_service, "public_url_base", NEW, raising=False)
    old, new = f"{OLD}/{_k()}", f"{NEW}/{_k()}"
    assert allowed_photo_url(old) == old
    assert allowed_photo_url(new) == new
    assert allowed_photo_url(f"{OLD}.evil.com/x.jpg") is None
    assert allowed_photo_url("http://169.254.169.254/latest") is None


def test_export_fetches_from_both_addresses_only():
    from app.services.export_service import _is_our_photo_url

    bases = [NEW, OLD]
    assert _is_our_photo_url(f"{OLD}/{_k()}", bases)
    assert _is_our_photo_url(f"{NEW}/{_k()}", bases)
    assert not _is_our_photo_url(f"{OLD}.evil.com/x.jpg", bases)
    assert not _is_our_photo_url("http://169.254.169.254/latest/meta-data", bases)
    assert not _is_our_photo_url(f"{NEW}/x.jpg", [])
    assert not _is_our_photo_url("http://insecure.example/x.jpg", ["http://insecure.example"])
