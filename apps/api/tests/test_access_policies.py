"""Structural test for co-keeper access (PRD-shared-keeping T7).

Enumerates every route in the collection routers and checks that its declared
co-keeper policy (utils/access.policy) is actually enforced by its handler.
This is the control that stops a future endpoint from quietly letting a
co-keeper reach something — or letting anyone reach another keeper's data.

ENFORCE_ALL flips to True once every v1 router has migrated (build plan
step 2). Until then untagged routes are reported, not failed: they still use
their inline `user_id == current_user.id` filter, so a co-keeper gets a 404
from them — deny by default.
"""
from __future__ import annotations

import importlib
import inspect
import re

import pytest

from app.utils import access as ac

ENFORCE_ALL = True

# Every router that touches collection data (inventory, 2026-09-29).
COLLECTION_ROUTERS = [
    "inverts", "tarantulas", "scorpions", "centipedes", "whip_spiders",
    "colonies", "scorpion_colonies", "animals", "animal_events", "animal_genotypes",
    "care_logs", "feedings", "molts", "substrate_changes", "photos", "sheds", "weight_logs",
    "enclosures", "feeder_colonies", "hv_feeder_stocks",
    "pairings", "egg_sacs", "offspring", "clutches", "reptile_pairings", "reptile_offspring",
    "premolt", "analytics", "qr", "transfers", "import_export",
]

ACCESS_CALLS = ("load_invert(", "load_colony(", "load_animal(", "load_log_parent(", "require(", "scope_collection(")
INLINE_OWNER_FILTER = re.compile(r"\.user_id\s*==\s*current_user\.id")


def _routes():
    out = []
    for name in COLLECTION_ROUTERS:
        mod = importlib.import_module(f"app.routers.{name}")
        helpers = {n for n, f in vars(mod).items() if callable(f) and getattr(f, "__uses_access__", False)}
        for attr in ("router", "keeper_router"):
            r = getattr(mod, attr, None)
            if r is None:
                continue
            for route in r.routes:
                fn = getattr(route, "endpoint", None)
                if fn is None:
                    continue
                out.append((name, route, fn, helpers))
    return out


ROUTES = _routes()


def _label(name, route):
    return f"{name}: {sorted(getattr(route, 'methods', []) or [])} {route.path}"


def test_the_inventory_is_real():
    assert len(ROUTES) > 200


@pytest.mark.parametrize("name,route,fn,helpers", ROUTES, ids=[_label(n, r) for n, r, *_ in ROUTES])
def test_declared_policies_are_enforced(name, route, fn, helpers):
    level = getattr(fn, "__access_policy__", None)
    if level is None:
        if ENFORCE_ALL:
            pytest.fail(f"{_label(name, route)} has no @policy")
        pytest.skip("not migrated yet (owner-only by inline filter)")
    src = inspect.getsource(inspect.unwrap(fn))
    uses_access = any(c in src for c in ACCESS_CALLS) or any(f"{h}(" in src for h in helpers)
    if level in ("owner_only", "public"):
        assert not any(c in src for c in ("load_invert(", "load_colony(", "load_animal(", "scope_collection(")), \
            f"{_label(name, route)} is owner_only but resolves co-keeper access"
        return
    assert uses_access, f"{_label(name, route)} is {level!r} but never goes through utils/access"
    assert not INLINE_OWNER_FILTER.search(src), \
        f"{_label(name, route)} is {level!r} but still filters by current_user.id"


def test_report_migration_progress():
    tagged = sum(1 for *_, fn, _h in ROUTES if getattr(fn, "__access_policy__", None))
    print(f"\nco-keeper policy coverage: {tagged}/{len(ROUTES)} collection routes tagged")
