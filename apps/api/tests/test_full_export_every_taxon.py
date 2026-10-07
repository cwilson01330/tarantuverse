"""The full ZIP backup covers every taxon and colony (audit A3, 2026-10-07).

It used to walk the legacy `tarantulas` table only: a mantis or isopod
keeper's "complete backup" held no animals and no photos. These tests build
the ZIP from plain export data, with a fake photo fetcher, so they need no
database or network.
"""
import asyncio
import inspect
import io
import json
import zipfile

from app.services import export_service
from app.services.export_service import build_full_zip

T = "11111111-0000-0000-0000-000000000001"   # tarantula (dual-written)
M = "22222222-0000-0000-0000-000000000002"   # mantis
C = "33333333-0000-0000-0000-000000000003"   # colony


def _data():
    empty = {k: [] for k in (
        "animals", "animal_feeding_logs", "shed_logs", "weight_logs", "genotypes", "animal_photos",
        "reptile_pairings", "clutches", "reptile_offspring", "enclosures", "pairings", "egg_sacs",
        "offspring",
    )}
    return {
        **empty,
        "profile": {"username": "k"},
        "tarantulas": [{"id": T, "name": "Rosie", "enclosure_notes": "legacy-only field"}],
        "inverts": [
            {"id": T, "taxon": "tarantula", "name": "Rosie"},
            {"id": M, "taxon": "mantis", "name": "Ghost / 1"},
        ],
        "colonies": [{"id": C, "taxon": "isopod", "name": "Dairy cows"}],
        "colony_events": [{"id": "e1", "colony_id": C, "event_type": "birth"}],
        "feeding_logs": [
            {"id": "f1", "tarantula_id": T, "invert_id": T},   # dual-written: lands once
            {"id": "f2", "invert_id": M},                      # invert-only, the case that used to vanish
            {"id": "f3", "colony_id": C},
        ],
        "molt_logs": [{"id": "m1", "invert_id": M}],
        "substrate_changes": [],
        "care_logs": [{"id": "c1", "invert_id": M}, {"id": "c2", "colony_id": C}],
        "photos": [
            {"id": "p1aaaaaaaa", "invert_id": M, "url": "https://x.r2.dev/photos/a.webp?v=1"},
            {"id": "p2bbbbbbbb", "colony_id": C, "url": "https://x.r2.dev/photos/b.png"},
            {"id": "p3cccccccc", "invert_id": M, "url": "https://x.r2.dev/photos/broken.jpg"},
        ],
    }


async def _fetch(url):
    if "broken" in url:
        raise RuntimeError("unreachable")
    return b"img:" + url.encode()


def _zip():
    raw = asyncio.run(build_full_zip(_data(), "k", fetch_photo=_fetch))
    return zipfile.ZipFile(io.BytesIO(raw))


def _json(zf, prefix):
    name = next(n for n in zf.namelist() if n.startswith(prefix) and n.endswith("data.json"))
    return json.loads(zf.read(name))


def test_every_taxon_gets_a_folder_with_its_logs():
    zf = _zip()
    mantis = _json(zf, "mantids/")
    assert [f["id"] for f in mantis["feeding_logs"]] == ["f2"]
    assert [m["id"] for m in mantis["molt_logs"]] == ["m1"]
    assert [c["id"] for c in mantis["care_logs"]] == ["c1"]
    tarantula = _json(zf, "tarantulas/")
    assert [f["id"] for f in tarantula["feeding_logs"]] == ["f1"]
    assert tarantula["enclosure_notes"] == "legacy-only field"   # legacy row merged in


def test_photos_are_downloaded_for_animals_and_colonies():
    names = _zip().namelist()
    assert any(n.startswith("mantids/") and n.endswith("/photos/p1aaaaaa.webp") for n in names)
    assert any(n.startswith("colonies/") and n.endswith("/photos/p2bbbbbb.png") for n in names)
    # An unreachable photo is skipped, not fatal.
    assert not any("p3cccccc" in n for n in names)


def test_colony_folder_carries_events_and_logs():
    col = _json(_zip(), "colonies/")
    assert [e["id"] for e in col["events"]] == ["e1"]
    assert [f["id"] for f in col["feeding_logs"]] == ["f3"]
    assert [c["id"] for c in col["care_logs"]] == ["c2"]


def test_folder_names_are_safe():
    names = _zip().namelist()
    assert not any("/1_" in n and "Ghost /" in n for n in names)
    assert any(n.startswith("mantids/Ghost _ 1_22222222/") for n in names)


def test_all_animals_csv_has_every_taxon():
    csv = _zip().read("all_animals.csv").decode()
    assert "mantis" in csv and "tarantula" in csv


def test_full_zip_no_longer_walks_the_legacy_table():
    src = inspect.getsource(export_service.build_full_zip)
    assert 'data["inverts"]' in src
    assert 'for t in data["tarantulas"]:' not in src  # a per-animal loop over the legacy table


def test_preview_counts_every_taxon_once():
    from app.routers import import_export
    src = inspect.getsource(import_export.export_preview)
    assert '"inverts": len(inverts)' in src
    assert '"colonies"' in src and '"care_logs"' in src
    # The duplicate "animals" key that hid the all-taxa count is gone.
    assert src.count('"animals":') == 1
    assert "total_records" in src
