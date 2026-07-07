# ADR-012 — Herpetoverse Feeder Keeping (own feature, live + frozen)

Status: Accepted (2026-07-07) · Owner: Cory

## Context

Tarantuverse has a feeder-keeping feature (`feeder_species` + `feeder_colonies`
+ `feeder_care_logs`) for **live invert feeders** — crickets, dubia, larvae. Its
catalog categories (cricket | roach | larvae | other) and its "breeding colony"
framing don't fit reptile/amphibian/aquatic keepers, who feed **rodents, fish,
chicks, and larger insects** — much of it kept **frozen**, not bred live.

Cory's direction: HV should have its **own bonafide feeder feature**, not a view
onto TV's (avoids cross-app coupling + keeps mice/rats out of TV's cricket
catalog). The standout use case: **tracking frozen feeder stock at home** — "how
many adult mice / hoppers / pinkies are in my freezer right now" — with
decrement-on-feed and low-stock alerts.

## Decision

Build a **separate, HV-owned** feeder-keeping feature. Own tables, own catalog,
own routers + UI. Gated as an HV-premium feature (`is_premium_for_app('herpetoverse')`).

### Data model (HV-owned tables — clone/adapt of TV's, do NOT reuse TV's rows)

- **`hv_feeder_species`** — HV feeder catalog.
  - Categories: `rodent | fish | insect | chick | other` (vs TV's cricket/roach/larvae).
  - Care fields carried over (temp/humidity/care_level/care_notes) for LIVE feeders;
    plus `handling_notes` (thawing/food-safety for frozen), `typical_sizes` JSONB
    (ordered size ladder, e.g. mice: `["pinky","fuzzy","hopper","weanling","adult","jumbo"]`).
- **`hv_feeder_stocks`** — a keeper's stock of one feeder (replaces "colony"; the
  word "stock" covers both live and frozen).
  - `form`: `live | frozen` — frozen skips husbandry care, is pure inventory.
  - `inventory_mode`: `count | sized` — `sized` uses `sized_counts` JSONB keyed by
    the size ladder (e.g. `{"pinky":20,"hopper":8,"adult":12}`); `count` is a single int.
  - `storage_location` (e.g. "chest freezer", "rack 2"), `last_restocked`,
    `last_used`, `low_threshold`, `is_active`, `notes`.
- **`hv_feeder_logs`** — `log_type`: `restock | used | cleaned | bred | died |
  count_correction`; `size` (which bucket, for sized stock), `count_delta`,
  `logged_at`, `notes`. A `used`/`restock` log adjusts the stock's count/bucket.

### Endpoints (new routers, gated on HV premium)

- `/hv-feeder-species` — list (filter by category) + search + `/{id}` care sheet.
- `/hv-feeder-stocks` — CRUD + `/{id}/logs` + quick actions (`used`, `restock`).
- Low-stock: reuse the notification pipeline — when a bucket/count drops below
  `low_threshold`, surface a badge + optional local reminder ("low on adult mice").

### Catalog seed (researched + cited, honesty-first)

HV feeder species with honest care/handling data:
- **Rodents:** house mouse (size ladder pinky→jumbo), rat (pup→jumbo), ASF.
- **Aquatic:** rosy reds / feeder guppies, silversides (frozen).
- **Birds:** day-old chick, coturnix quail (frozen).
- **Insects (reptile-relevant):** dubia, crickets, hornworms, superworms, BSFL,
  nightcrawlers — same animals as TV but framed for reptile prey sizes.
Frozen entries carry thaw-safety notes; live entries carry husbandry.

### Gating & pricing

Feeder keeping is an **HV Premium** feature (per ADR / pricing decision:
Herpetoverse Premium $4.99, All-Access $6.99). Free keepers see the feature +
an upgrade prompt. Enforcement stays OFF in prod until HV's purchase path is live.

## Why not reuse TV's shared tables

`feeder_colonies` is user-scoped, so reuse would (a) leak rodents/fish into TV's
invert catalog, (b) couple two apps' gating to one dataset, and (c) blur the
"breeding colony" vs "frozen stock" models. Separate tables keep each app's
feeder feature coherent and independently gateable. Dual-app keepers maintaining
two feeder sets is acceptable — invert vs reptile feeders barely overlap.

## Build phases

1. **Backend foundation** — models (`hv_feeder_species`, `hv_feeder_stocks`,
   `hv_feeder_logs`) + migration. ← starting now
2. **Routers + schemas** — catalog + stocks CRUD + logs + quick actions, HV-gated.
3. **Catalog seed** — researched HV feeder species (cited).
4. **Web UI** (`apps/web-herpetoverse`) — catalog browse, my stocks, add/edit,
   quick log, low-stock badges.
5. **Mobile UI** (`apps/mobile-herpetoverse`) — same, + low-stock local reminder.
6. **Gating + upgrade prompt** wired to the HV premium entitlement.

## Non-goals (v1)

- No feeding-log linkage that auto-decrements from an animal feeding (Phase 2 —
  same deferral as TV's colony↔feeding integration, tasks 105/106).
- No marketplace / reorder integration.
