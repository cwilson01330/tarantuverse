"""Colony import (B6d): header mapping, counts, estimates, taxon, dedupe, cap,
and that rows go through the same create helper the colony route uses."""
from __future__ import annotations

import asyncio
import inspect
import uuid
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.routers import colonies as cr
from app.routers import import_export as ie
from app.schemas.colony import ColonyCreate
from app.services import colony_import_service as cis


def csv_bytes(text: str) -> bytes:
    return text.strip().encode("utf-8")


ISO = NS(id=uuid.uuid4(), taxon="isopod", scientific_name="Porcellio laevis",
         common_names=["Dairy cow isopod"], times_kept=0)
DUBIA = NS(id=uuid.uuid4(), taxon="roach", scientific_name="Blaptica dubia",
           common_names=["Dubia roach"], times_kept=0)


@pytest.fixture(autouse=True)
def fake_catalog(monkeypatch):
    """Species matching without a database: by scientific name, then common."""
    catalog = [ISO, DUBIA]

    def by_sci(db, text):
        low = (text or "").strip().lower()
        return next((s for s in catalog if s.scientific_name.lower() == low), None)

    def by_common(db, text, taxon=None):
        low = (text or "").strip().lower()
        return next((s for s in catalog if any(c.lower() == low for c in s.common_names)), None)

    monkeypatch.setattr(cis, "match_species", by_sci)
    monkeypatch.setattr(cis, "match_species_by_common_name", by_common)
    monkeypatch.setattr(cis, "existing_colony_keys", lambda db, uid: set())


def analyze(text: str, default_taxon="isopod"):
    return cis.analyze_colonies(None, NS(id=uuid.uuid4()), csv_bytes(text), "c.csv", default_taxon)


def mapping_of(result):
    return {c["header"]: c["suggested_field"] for c in result["columns"]}


# ── header mapping ───────────────────────────────────────────────────────────

def test_headers_map_to_colony_fields():
    r = analyze(
        "Colony,Species,Adults,Juveniles,Babies,Count,Estimated,Founded,Source,Location,Notes\n"
        "Bin 1,Porcellio laevis,40,100,20,160,no,2025-03-01,bred,Rack A,fine\n"
    )
    assert mapping_of(r) == {
        "Colony": "name", "Species": "scientific_name", "Adults": "stage_adults",
        "Juveniles": "stage_juveniles", "Babies": "stage_young", "Count": "count",
        "Estimated": "count_is_estimated", "Founded": "founded_date", "Source": "source",
        "Location": "location", "Notes": "notes",
    }
    assert r["summary"]["new"] == 1 and r["summary"]["species_matched"] == 1


def test_female_is_never_filed_under_male():
    r = analyze("Name,Males,Females,Adult females\nA,1,2,3\n")
    m = mapping_of(r)
    assert m["Males"] == "stage_males" and m["Females"] == "stage_females"
    assert m["Adult females"] == "stage_adult_females"


def test_filler_words_still_find_the_stage():
    r = analyze("Name,Number of adults,Nymph count\nA,3,4\n")
    assert mapping_of(r)["Number of adults"] == "stage_adults"
    assert mapping_of(r)["Nymph count"] == "stage_nymphs"


def test_an_exports_id_column_does_not_claim_the_name():
    r = analyze("id,name,total_count\n6f1c,Bin 1,10\n")
    assert mapping_of(r)["name"] == "name" and mapping_of(r)["id"] is None


# ── counts ───────────────────────────────────────────────────────────────────

def norm(headers_to_fields, row, taxon="isopod"):
    return cis.normalize_colony_row(None, row, headers_to_fields, taxon)


@pytest.mark.parametrize("cell,expected_n,estimated", [
    ("~200", 200, True), ("200+", 200, True), ("approx. 200", 200, True),
    ("about 200", 200, True), ("1,200", 1200, False), (200, 200, False),
    (200.0, 200, False), ("200", 200, False),
])
def test_count_cells_and_the_estimate_marker(cell, expected_n, estimated):
    n = norm({"Name": "name", "Count": "count"}, {"Name": "A", "Count": cell})
    assert n["payload"]["stage_counts"] == {"mixed": expected_n}
    assert n["payload"]["count_is_estimated"] is estimated


@pytest.mark.parametrize("cell", ["lots", "100-150", "1.5", "-3"])
def test_an_unreadable_count_is_left_out_with_a_warning(cell):
    n = norm({"Name": "name", "Count": "count"}, {"Name": "A", "Count": cell})
    assert n["payload"]["stage_counts"] is None
    assert any("couldn" in w for w in n["warnings"]) and n["errors"] == []


def test_estimate_column_sets_the_flag():
    m = {"Name": "name", "Count": "count", "Est": "count_is_estimated"}
    assert norm(m, {"Name": "A", "Count": "50", "Est": "yes"})["payload"]["count_is_estimated"] is True
    assert norm(m, {"Name": "A", "Count": "50", "Est": "no"})["payload"]["count_is_estimated"] is False


def test_per_stage_columns_become_buckets_and_total_fills_mixed():
    m = {"Name": "name", "A": "stage_adults", "J": "stage_juveniles", "T": "count"}
    n = norm(m, {"Name": "X", "A": "40", "J": "150", "T": "200"})
    assert n["payload"]["stage_counts"] == {"adults": 40, "juveniles": 150, "mixed": 10}
    assert any("mixed" in w for w in n["warnings"])


def test_a_total_smaller_than_the_stages_uses_the_stages():
    m = {"Name": "name", "A": "stage_adults", "T": "count"}
    n = norm(m, {"Name": "X", "A": "40", "T": "10"})
    assert n["payload"]["stage_counts"] == {"adults": 40}
    assert any("less than" in w for w in n["warnings"])


def test_matching_stage_total_adds_no_mixed_bucket_and_no_warning():
    m = {"Name": "name", "A": "stage_adults", "J": "stage_juveniles", "T": "count"}
    n = norm(m, {"Name": "X", "A": "4", "J": "6", "T": "10"})
    assert n["payload"]["stage_counts"] == {"adults": 4, "juveniles": 6}
    assert n["warnings"] == []


@pytest.mark.parametrize("taxon,bucket", [
    ("isopod", "mancae"), ("roach", "nymphs"), ("tarantula", "unsexed"),
    ("true_spider", "unsexed"), ("scorpion", "juveniles"), ("millipede", "juveniles"),
])
def test_babies_land_in_the_taxons_own_bucket(taxon, bucket):
    n = norm({"Name": "name", "B": "stage_young", "Tx": "taxon"},
             {"Name": "X", "B": "12", "Tx": taxon}, taxon="other")
    assert n["payload"]["stage_counts"] == {bucket: 12}


def test_stage_counts_json_from_an_export_round_trips():
    m = {"name": "name", "stage_counts": "stage_counts", "total_count": "count"}
    n = norm(m, {"name": "X", "stage_counts": {"Adults": 3, "nymphs": 9}, "total_count": 12})
    assert n["payload"]["stage_counts"] == {"adults": 3, "nymphs": 9}
    assert n["warnings"] == []


def test_no_count_still_imports_but_says_so():
    n = norm({"Name": "name"}, {"Name": "X"})
    assert n["errors"] == [] and n["payload"]["stage_counts"] is None
    assert any("no count" in w for w in n["warnings"])


# ── unknown columns ──────────────────────────────────────────────────────────

def test_an_unplaceable_headcount_column_is_warned_and_kept_out_of_the_numbers():
    r = analyze("Name,Adults,Subadults\nA,10,5\n")
    assert mapping_of(r)["Subadults"] is None
    assert any("Subadults" in w for w in r["summary"]["column_warnings"])
    n = cis.normalize_colony_row(None, {"Name": "A", "Adults": "10", "Subadults": "5"},
                                 {"Name": "name", "Adults": "stage_adults", "Subadults": None}, "isopod")
    assert n["payload"]["stage_counts"] == {"adults": 10}
    assert "Subadults: 5" in n["payload"]["notes"]


def test_an_unknown_count_ish_numeric_column_is_offered_as_the_total_at_low_confidence():
    r = analyze("Name,Animals in bin\nA,30\n")
    col = next(c for c in r["columns"] if c["header"] == "Animals in bin")
    assert col["suggested_field"] == "count" and col["confidence"] == "low"


def test_a_plain_text_column_is_not_mistaken_for_a_count():
    r = analyze("Name,Diet\nA,leaf litter\n")
    assert mapping_of(r)["Diet"] is None
    assert r["summary"]["column_warnings"] == []


# ── taxon ────────────────────────────────────────────────────────────────────

def test_unknown_taxon_is_an_error_not_a_silent_default():
    r = analyze("Name,Taxon,Count\nA,dragon,5\nB,Roaches,5\nC,,5\n")
    st = [p["status"] for p in r["preview"]]
    assert st == ["error", "new", "new"]
    assert "unknown taxon" in r["preview"][0]["errors"][0]
    assert r["preview"][1]["taxon"] == "roach" and r["preview"][1]["taxon_source"] == "column"
    assert r["preview"][2]["taxon"] == "isopod" and r["preview"][2]["taxon_source"] == "default"


def test_taxon_comes_from_the_matched_species_when_no_column():
    r = analyze("Name,Species,Count\nA,Blaptica dubia,5\n", default_taxon="isopod")
    assert r["preview"][0]["taxon"] == "roach" and r["preview"][0]["taxon_source"] == "species"


def test_a_species_from_another_taxon_is_not_linked():
    n = norm({"Name": "name", "Sp": "scientific_name", "Tx": "taxon"},
             {"Name": "X", "Sp": "Blaptica dubia", "Tx": "isopod"})
    assert "species_id" not in n["payload"] and n["species_matched"] is False
    assert any("not linked" in w for w in n["warnings"])
    assert "Blaptica dubia" in n["payload"]["notes"]


def test_species_by_common_name_in_the_species_column():
    n = norm({"Species": "scientific_name"}, {"Species": "Dairy cow isopod"})
    assert n["species_matched"] and n["payload"]["species_id"] == str(ISO.id)
    assert n["payload"]["name"] == "Dairy cow isopod"


def test_unmatched_species_is_kept_in_notes():
    n = norm({"Name": "name", "Sp": "scientific_name"}, {"Name": "X", "Sp": "Armadillidium zzz"})
    assert n["species_matched"] is False
    assert "Species: Armadillidium zzz" in n["payload"]["notes"]
    assert any("catalog" in w for w in n["warnings"])


def test_a_row_with_no_name_or_species_is_an_error():
    n = norm({"Count": "count"}, {"Count": "5"})
    assert n["errors"] == ["needs a name or a species"]


def test_over_long_name_is_an_error():
    n = norm({"Name": "name"}, {"Name": "x" * 101})
    assert any("longer than" in e for e in n["errors"])


# ── dedupe ───────────────────────────────────────────────────────────────────

def test_duplicates_against_active_colonies_and_within_the_file(monkeypatch):
    monkeypatch.setattr(cis, "existing_colony_keys", lambda db, uid: {("dairy cow", "isopod")})
    r = analyze("Name,Count\nDairy Cow,5\nSpringtails,9\nspringtails,9\n")
    assert [p["status"] for p in r["preview"]] == ["duplicate", "new", "duplicate"]
    assert r["summary"]["new"] == 1 and r["summary"]["duplicate"] == 2
    assert r["summary"]["population_total"] == 9


def test_the_same_name_in_another_taxon_is_not_a_duplicate(monkeypatch):
    monkeypatch.setattr(cis, "existing_colony_keys", lambda db, uid: {("bin 1", "isopod")})
    r = analyze("Name,Taxon,Count\nBin 1,roach,5\n")
    assert r["preview"][0]["status"] == "new"


def test_dedupe_runs_against_active_colonies_only(monkeypatch):
    monkeypatch.undo()  # drop the catalog stub; read the real function
    src = inspect.getsource(cis.existing_colony_keys)
    assert "active_colonies_query" in src


def test_a_json_export_is_read_from_its_colonies_list():
    import json

    export = {"inverts": [{"name": "an animal"}],
              "colonies": [{"name": "Bin 1", "taxon": "isopod", "total_count": 10,
                            "stage_counts": {"adults": 10}, "count_is_estimated": True}]}
    r = cis.analyze_colonies(None, NS(id=uuid.uuid4()), json.dumps(export).encode(), "x.json")
    assert r["row_count"] == 1 and r["preview"][0]["display_name"] == "Bin 1"
    assert r["preview"][0]["stage_counts"] == {"adults": 10}
    assert r["preview"][0]["count_is_estimated"] is True and r["preview"][0]["warnings"] == []


# ── commit: shared helper, cap, duplicates ───────────────────────────────────

class StubDB:
    pass


def run_commit(text, created_calls, *, stop_after=None, existing=None, mapping=None, monkeypatch=None):
    user = NS(id=uuid.uuid4())
    seen_calls = []

    def fake_create(db, owner, payload, enforce_limit=True, **kw):
        if stop_after is not None and len(created_calls) >= stop_after:
            raise HTTPException(status_code=402, detail={"message": "cap"})
        created_calls.append((owner, payload, enforce_limit, kw))
        return NS(id=uuid.uuid4(), name=payload.name, taxon=payload.taxon)

    async def fake_activity(**kw):
        seen_calls.append(kw)

    monkeypatch.setattr(ie, "create_colony_row", fake_create)
    monkeypatch.setattr(ie, "create_activity", fake_activity)
    monkeypatch.setattr(cis, "existing_colony_keys", lambda db, uid: set(existing or ()))
    headers = [h for h in text.splitlines()[0].split(",")]
    col_map = mapping or {h: cis._header_field(h) for h in headers}
    out = asyncio.run(ie._import_commit_colonies(
        StubDB(), user, csv_bytes(text), "c.csv", col_map, "isopod", True))
    return user, out, seen_calls


def test_commit_creates_rows_through_the_shared_helper(monkeypatch):
    calls = []
    user, out, activity = run_commit(
        "Name,Adults,Count,Location\nBin 1,10,~50,Rack A\nBin 2,,7,\n", calls, monkeypatch=monkeypatch)
    assert out["imported"] == 2 and out["cap_reached"] is False
    assert [c[0] for c in calls] == [user, user]          # the keeper, not someone else
    assert all(c[2] is True for c in calls)                # cap enforced per colony
    first = calls[0][1]
    assert isinstance(first, ColonyCreate)
    assert first.stage_counts == {"adults": 10, "mixed": 40} and first.count_is_estimated is True
    assert first.location == "Rack A" and first.visibility == "private"
    assert [c["name"] for c in out["created"]] == ["Bin 1", "Bin 2"]
    assert activity and activity[0]["metadata"]["target"] == "colony"


def test_the_importer_and_the_create_route_share_one_helper():
    assert ie.create_colony_row is cr.create_colony_row
    assert "create_colony_row(db, owner, payload" in inspect.getsource(cr.create_colony)


def test_imported_colonies_mark_their_starting_count_as_imported(monkeypatch):
    calls = []
    run_commit("Name,Count\nA,5\n", calls, monkeypatch=monkeypatch)
    assert calls[0][3] == {"starting_note": "Starting count (imported)"}


def test_cap_stops_the_run_and_is_reported(monkeypatch):
    calls = []
    _u, out, _a = run_commit("Name,Count\nA,1\nB,2\nC,3\n", calls, stop_after=1, monkeypatch=monkeypatch)
    assert out["imported"] == 1 and out["cap_reached"] is True
    assert [c[1].name for c in calls] == ["A"]            # B hit the cap; C never tried


def test_a_non_cap_http_error_is_not_swallowed(monkeypatch):
    def boom(db, owner, payload, enforce_limit=True, **kw):
        raise HTTPException(status_code=404, detail="Enclosure not found")

    monkeypatch.setattr(ie, "create_colony_row", boom)
    monkeypatch.setattr(cis, "existing_colony_keys", lambda db, uid: set())
    with pytest.raises(HTTPException) as e:
        asyncio.run(ie._import_commit_colonies(
            StubDB(), NS(id=uuid.uuid4()), csv_bytes("Name,Count\nA,1\n"), "c.csv",
            {"Name": "name", "Count": "count"}, "isopod", True))
    assert e.value.status_code == 404


def test_commit_skips_duplicates_in_db_and_in_file(monkeypatch):
    calls = []
    _u, out, _a = run_commit(
        "Name,Count\nDairy Cow,5\nNew,1\nnew,1\n", calls,
        existing={("dairy cow", "isopod")}, monkeypatch=monkeypatch)
    assert out["imported"] == 1 and out["skipped_duplicates"] == 2
    assert [c[1].name for c in calls] == ["New"]


def test_commit_reports_error_rows_and_never_creates_them(monkeypatch):
    calls = []
    _u, out, _a = run_commit(
        "Name,Taxon,Count\nGood,isopod,5\nBad,dragon,5\n", calls, monkeypatch=monkeypatch)
    assert out["imported"] == 1 and out["error_rows"] == 1
    assert "unknown taxon" in out["errors"][0]


def test_commit_reports_row_warnings_for_created_rows(monkeypatch):
    calls = []
    _u, out, _a = run_commit("Name,Count\nA,lots\n", calls, monkeypatch=monkeypatch)
    assert out["imported"] == 1 and out["warning_rows"] == 1
    assert "couldn" in out["warnings"][0]


def test_commit_never_updates_existing_colonies(monkeypatch):
    calls = []
    _u, out, _a = run_commit("Name,Count\nA,5\n", calls, existing={("a", "isopod")},
                             monkeypatch=monkeypatch)
    assert out["updated"] == 0 and out["skipped_duplicates"] == 1 and calls == []


# ── the shared helper itself ─────────────────────────────────────────────────

class _Q:
    def __init__(self, row=None):
        self.row = row

    def filter(self, *a, **k):
        return self

    def first(self):
        return self.row


class HelperDB:
    def __init__(self, species):
        self.species, self.added, self.commits = species, [], 0

    def query(self, model, *_):
        return _Q(self.species)

    def add(self, o):
        self.added.append(o)

    def commit(self):
        self.commits += 1

    def refresh(self, o):
        pass


def test_create_colony_row_caps_canonicalises_location_and_bumps_times_kept(monkeypatch):
    sp = NS(times_kept=2)
    db = HelperDB(sp)
    owner = NS(id=uuid.uuid4())
    capped = []
    monkeypatch.setattr(cr, "enforce_collection_limit", lambda d, u: capped.append(u))
    monkeypatch.setattr(cr, "canonical_location", lambda d, uid, raw: "Rack A" if raw else None)
    monkeypatch.setattr(cr, "_verify_species", lambda d, sid: None)
    payload = ColonyCreate(name="Bin", taxon="isopod", species_id=uuid.uuid4(), location="rack a ")
    colony = cr.create_colony_row(db, owner, payload)
    assert capped == [owner]
    assert colony.location == "Rack A" and colony.user_id == owner.id
    assert colony.visibility == "private" or colony.visibility is None
    assert sp.times_kept == 3 and db.commits == 1


def test_create_colony_row_can_skip_the_cap_for_callers_that_gate_it_themselves(monkeypatch):
    capped = []
    monkeypatch.setattr(cr, "enforce_collection_limit", lambda d, u: capped.append(u))
    monkeypatch.setattr(cr, "canonical_location", lambda d, uid, raw: raw)
    cr.create_colony_row(HelperDB(None), NS(id=uuid.uuid4()),
                         ColonyCreate(name="Bin", taxon="isopod"), enforce_limit=False)
    assert capped == []


# ── common-name lookup builds valid SQL ──────────────────────────────────────

def test_common_name_query_compiles_for_postgres(monkeypatch):
    # Undo the autouse stub to exercise the real function against a recording DB.
    monkeypatch.undo()
    seen = {}

    class Rec:
        def query(self, *_):
            return self

        def filter(self, expr):
            seen["sql"] = str(expr.compile(dialect=postgresql.dialect()))
            return self

        def limit(self, n):
            return self

        def all(self):
            return [ISO]

    hit = cis.match_species_by_common_name(Rec(), "Dairy Cow Isopod", "isopod")
    assert hit is ISO
    assert "array_to_string" in seen["sql"] and "lower" in seen["sql"]


def test_two_species_sharing_a_common_name_are_not_guessed(monkeypatch):
    monkeypatch.undo()
    other = NS(id=uuid.uuid4(), taxon="isopod", scientific_name="Armadillidium vulgare",
               common_names=["Dairy cow isopod"])

    class Rec:
        def query(self, *_):
            return self

        def filter(self, *_):
            return self

        def limit(self, n):
            return self

        def all(self):
            return [ISO, other]

    assert cis.match_species_by_common_name(Rec(), "dairy cow isopod", "isopod") is None


def test_imports_are_bounded():
    """Row and size caps keep one import inside a request on a 512 MB instance."""
    import inspect
    import pytest
    from fastapi import HTTPException
    from app.routers import import_export
    from app.services import import_service

    big = ("name\n" + "x\n" * (import_service.MAX_IMPORT_ROWS + 1)).encode()
    with pytest.raises(HTTPException) as e:
        import_service.parse_bytes(big, "big.csv")
    assert e.value.status_code == 413
    ok = ("name\n" + "x\n" * 10).encode()
    assert len(import_service.parse_bytes(ok, "ok.csv")[1]) == 10
    assert "MAX_IMPORT_BYTES + 1" in inspect.getsource(import_export._read_source)


def test_cancel_cannot_overwrite_a_claim():
    import inspect
    from app.routers import transfers
    src = inspect.getsource(transfers.cancel_transfer)
    assert 'AnimalTransfer.status == "pending"' in src and ".update(" in src
