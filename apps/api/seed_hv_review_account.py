#!/usr/bin/env python3
"""
Populate the Herpetoverse App Review demo account with a believable collection.

WHY: HV gates everything behind login. A reviewer signing into an empty account
sees empty states and can't evaluate the app. This fills the account with five
animals (exactly the free-tier cap, so the reviewer can also observe the upgrade
sheet by trying to add a sixth) plus back-dated feeding, weight and shed logs so
Feeding Day, the growth chart and the overdue badges all have real data.

RUN AGAINST THE DEMO ACCOUNT ONLY. It creates records; it deletes nothing.

Usage
-----
    # 1. Log in as reviewer@herpetoverse.com and copy the access token.
    #    Easiest: POST /api/v1/auth/login, or copy from the app's storage.
    export HV_TOKEN="eyJhbGciOi..."
    export HV_API="https://tarantuverse-api.onrender.com"   # optional

    python seed_hv_review_account.py            # dry run — prints the plan
    python seed_hv_review_account.py --commit   # actually writes

The token is read from the environment and never written to disk or logged.
"""
from __future__ import annotations

import os
import sys
import random
from datetime import datetime, timedelta, timezone

import httpx

API = os.environ.get("HV_API", "https://tarantuverse-api.onrender.com").rstrip("/")
TOKEN = os.environ.get("HV_TOKEN", "").strip()
COMMIT = "--commit" in sys.argv

random.seed(20260726)  # stable output across runs

now = datetime.now(timezone.utc)


def days_ago(n: int, hour: int = 18) -> datetime:
    return (now - timedelta(days=n)).replace(hour=hour, minute=0, second=0, microsecond=0)


# --------------------------------------------------------------------------
# The collection. Five animals across four taxa, so the taxon filter chips on
# the Collection tab have something to filter. Feeding intervals are realistic
# per species — a ball python every ~14 days, a crested gecko on CGD every ~3,
# a bearded dragon most days.
#
# `overdue` marks the one animal deliberately left past its interval, so the
# dashboard opens with a real "Needs Feeding" card rather than an empty state.
# --------------------------------------------------------------------------
ANIMALS = [
    {
        "name": "Nutmeg",
        "taxon": "snake",
        "common_name": "Ball Python",
        "scientific_name": "Python regius",
        "sex": "female",
        "source": "bred",
        "date_acquired": (now - timedelta(days=420)).date().isoformat(),
        "current_weight_g": 1240,
        "feed_every": 14,
        "food": ("Frozen/thawed rat", "small"),
        "weights": [980, 1050, 1120, 1190, 1240],
        "sheds": [96, 61, 28],
        "overdue": True,
    },
    {
        "name": "Marbles",
        "taxon": "lizard",
        "common_name": "Crested Gecko",
        "scientific_name": "Correlophus ciliatus",
        "sex": "unknown",
        "source": "bought",
        "date_acquired": (now - timedelta(days=210)).date().isoformat(),
        "current_weight_g": 46,
        "feed_every": 3,
        "food": ("Crested gecko diet", None),
        "weights": [31, 36, 40, 44, 46],
        "sheds": [],
    },
    {
        "name": "Kaiju",
        "taxon": "lizard",
        "common_name": "Bearded Dragon",
        "scientific_name": "Pogona vitticeps",
        "sex": "male",
        "source": "bought",
        "date_acquired": (now - timedelta(days=330)).date().isoformat(),
        "current_weight_g": 415,
        "feed_every": 2,
        "food": ("Dubia roaches", "medium"),
        "weights": [240, 300, 355, 390, 415],
        "sheds": [74, 40],
    },
    {
        "name": "Biscuit",
        "taxon": "frog",
        "common_name": "Pacman Frog",
        "scientific_name": "Ceratophrys ornata",
        "sex": "female",
        "source": "bought",
        "date_acquired": (now - timedelta(days=150)).date().isoformat(),
        "current_weight_g": 188,
        "feed_every": 5,
        "food": ("Nightcrawler", "large"),
        "weights": [96, 128, 154, 176, 188],
        "sheds": [],
    },
    {
        "name": "Tilly",
        "taxon": "tortoise",
        "common_name": "Russian Tortoise",
        "scientific_name": "Testudo horsfieldii",
        "sex": "female",
        "source": "bought",
        "date_acquired": (now - timedelta(days=600)).date().isoformat(),
        "current_weight_g": 720,
        "feed_every": 1,
        "food": ("Mixed greens", None),
        "weights": [640, 665, 690, 705, 720],
        "sheds": [],
    },
]


def client() -> httpx.Client:
    return httpx.Client(
        base_url=f"{API}/api/v1",
        headers={"Authorization": f"Bearer {TOKEN}"},
        timeout=45.0,
    )


def build_logs(spec: dict) -> tuple[list, list, list]:
    """Back-date ~4 months of history for one animal."""
    every = spec["feed_every"]
    food_type, food_size = spec["food"]

    # Start the feeding series far enough back to fill the growth window, and
    # stop short of today for the animal we want showing as overdue.
    #
    # `overdue` uses 2x the interval, not 3x: enough to trip the badge, not so
    # much that the demo collection looks neglected to a reviewer.
    span = 120
    first_gap = every * 2 if spec.get("overdue") else max(1, every - 1)

    # Cap the series so daily feeders (tortoise on greens) don't generate 120
    # POSTs each — slow against a cold Render dyno, and the charts don't need
    # that density to look right.
    MAX_FEEDINGS = 40

    # Herbivores grazing on greens don't "refuse" the way a snake does, so
    # only apply a refusal rate to animals fed discrete prey items.
    refusal_rate = 0.0 if food_size is None and every <= 1 else 0.12

    feedings = []
    d = first_gap
    while d <= span and len(feedings) < MAX_FEEDINGS:
        # A small number of refusals — real collections have them, and it lets
        # the reviewer see refusals rendered distinctly from accepted meals.
        accepted = random.random() > refusal_rate
        feedings.append(
            {
                "fed_at": days_ago(d).isoformat(),
                "food_type": food_type,
                "food_size": food_size,
                "quantity": 1,
                "accepted": accepted,
                "notes": None if accepted else "Refused — offered again next session.",
            }
        )
        d += every

    weights = [
        {
            "weighed_at": days_ago(int(span - i * (span / max(1, len(spec["weights"]) - 1)))).isoformat(),
            "weight_g": w,
            "context": "routine",
        }
        for i, w in enumerate(spec["weights"])
    ]

    sheds = [
        {
            "shed_at": days_ago(d).isoformat(),
            "is_complete_shed": i != 0,
            "has_retained_shed": i == 0,
            "notes": "Eye caps retained — soaked overnight, came away clean."
            if i == 0
            else None,
        }
        for i, d in enumerate(spec["sheds"])
    ]
    return feedings, weights, sheds


def main() -> int:
    if not TOKEN:
        print("HV_TOKEN is not set. Export the demo account's access token first.")
        return 1

    print(f"API    : {API}")
    print(f"Mode   : {'COMMIT' if COMMIT else 'DRY RUN (pass --commit to write)'}\n")

    with client() as c:
        me = c.get("/auth/me")
        if me.status_code != 200:
            print(f"Token rejected ({me.status_code}). Log in again and re-export HV_TOKEN.")
            return 1
        who = me.json()
        print(f"Signed in as: {who.get('email')} (@{who.get('username')})")
        if "review" not in (who.get("email") or "").lower():
            print("\n  ⚠  This does NOT look like the review account.")
            print("     Refusing to seed a real keeper's collection.")
            if COMMIT:
                return 1

        existing = c.get("/animals/")
        n_existing = len(existing.json()) if existing.status_code == 200 else "?"
        print(f"Existing animals: {n_existing}\n")

        for spec in ANIMALS:
            feedings, weights, sheds = build_logs(spec)
            label = f"{spec['name']} ({spec['common_name']})"
            print(
                f"  {label:34} {len(feedings):>3} feedings  "
                f"{len(weights)} weights  {len(sheds)} sheds"
                + ("   [left overdue]" if spec.get("overdue") else "")
            )
            if not COMMIT:
                continue

            payload = {
                k: spec[k]
                for k in (
                    "name", "taxon", "common_name", "scientific_name",
                    "sex", "source", "date_acquired", "current_weight_g",
                )
            }
            r = c.post("/animals/", json=payload)
            if r.status_code == 402:
                print("     free-tier cap reached — stopping here.")
                break
            if r.status_code not in (200, 201):
                print(f"     FAILED {r.status_code}: {r.text[:180]}")
                continue
            aid = r.json()["id"]

            for path, rows in (
                (f"/animals/{aid}/feedings", feedings),
                (f"/animals/{aid}/weight-logs", weights),
                (f"/animals/{aid}/sheds", sheds),
            ):
                for row in rows:
                    rr = c.post(path, json=row)
                    if rr.status_code not in (200, 201):
                        print(f"     {path} -> {rr.status_code}: {rr.text[:140]}")
                        break

    print("\nDone." if COMMIT else "\nDry run only — nothing was written.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
