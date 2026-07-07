# Herpetoverse Free-Tier Cap & Subscription — Decisions & Open Questions

Built 2026-07-07 (autonomous session). This captures the decisions I made so you
can confirm or change them, and the pieces intentionally left for you.

## What I built (done, in the working tree — not yet pushed)

**Backend**
- `HV_FREE_TIER_MAX_ANIMALS = 5` (`models/user.py`).
- `active_animals_query` + `enforce_animal_limit` (`utils/limits.py`) — mirror of
  the invert cap. Counts active (non-transferred) rows in `animals`. Raises
  HTTP 402 with `{ message, current_count, limit, is_premium }` when a free
  keeper is at the cap.
- Wired into `POST /animals/` (create) and the animal **import** commit
  (stops + reports `cap_reached`). The transfer **claim** path is exempt
  (same as TV — claiming is the growth loop, never capped).
- `GET /animals/limits` → `{ limit (-1 if premium), current_count, is_premium,
  remaining, at_limit }` for proactive UI.

**Web (`apps/web-herpetoverse`)**
- `UpgradeModal` component; `/pricing` info page; 402 caught on the reptile-add
  flow → modal; `cap_reached` callout re-added to the import result; "X / 5"
  counter on the collection header.

**Mobile (`apps/mobile-herpetoverse`)**
- `UpgradeModal` component; 402 caught on `reptile/add` → modal; import
  cap-reached CTA opens `herpetoverse.com/pricing`; "X / 5" counter on the
  Collection header; `getAnimalLimits()` lib fn. No new native deps.

## Decisions (updated per your direction: HV bills separately)

1. **HV free cap = 5 animals**, counted only against the `animals` table —
   independent of TV's 15-invert cap. A keeper gets 15 free inverts (TV) **and**
   5 free animals (HV) = your "20 across both apps."
2. **Premium is APP-SCOPED** (revised — you confirmed HV needs its own path to
   finances since keepers may use only one app). A subscription now carries an
   `app` scope: `'tarantuverse' | 'herpetoverse' | 'both'`. HV premium requires
   an HV-scoped (or `'both'`) subscription — a TV-only subscriber does **not**
   get HV free, and vice versa. Resolved by `User.is_premium_for_app('herpetoverse')`.
   **Built:** `subscription_plans.app` column (migration `hvs_20260707`, existing
   rows backfilled to `'tarantuverse'`), the per-app resolver, and HV's cap +
   `/animals/limits` now read it. With no HV plans yet, every HV user is on the
   free tier — correct.
3. **The upgrade CTA is honest/informational** — there is **no** working
   checkout in HV yet. The modal and pricing page say premium is "coming soon"
   and never imply a purchase that doesn't exist.

## Left for you / next (HV's own purchase flow)

The entitlement plumbing is app-scoped and ready. To actually let HV keepers pay,
the remaining pieces (most need YOUR store setup first):

1. **Create HV store products** — an HV subscription in App Store Connect + Play
   Console (its own product IDs), and an HV Stripe product/price for web. Decide
   the price(s).
2. **Seed HV plan rows** — `subscription_plans` rows with `app='herpetoverse'`
   (and optionally a `app='both'` bundle) carrying `max_animals=-1` + whatever
   premium unlocks. I can write the seed once you give product IDs + prices.
3. **Wire the purchase flow** — HV web Stripe checkout (mirror TV's) + HV mobile
   IAP (mirror TV's `iap.ts` + `/subscriptions` receipt validation, with the HV
   product IDs). Then flip the UpgradeModal CTA from "coming soon" to a real
   Subscribe button.
4. **The TV-subscriber add-on** — model it as either an `app='both'` bundle plan
   or a discounted `app='herpetoverse'` plan surfaced to existing TV subscribers.
   Pricing/positioning is your call; the schema already supports both.

## FINALIZED 2026-07-07 (your call)

**Pricing** (HV standalone matches TV; bundle is the add-on):
| Plan | Scope | Monthly | Yearly | Lifetime |
|------|-------|---------|--------|----------|
| Herpetoverse Premium | `herpetoverse` | $4.99 | $44.99 | $149.99 |
| All-Access (both apps) | `both` | $6.99 | $69.99 | $249 |

Seed written: `apps/api/seed_hv_subscription_plans.py` (idempotent; run on Render
shell). Adds `herpetoverse_premium` + `bundle_premium` rows. The bundle doubles
as the TV-subscriber add-on (upgrade to All-Access).

**HV Premium unlocks** (beyond unlimited animals): **breeding** (reptile
pairings / clutches / genetics), **feeder-keeping**, and **detailed analytics**.
All ride the single `can_use_breeding` premium boolean (same as TV), so
`get_subscription_limits().can_use_analytics` follows it.

**Gating plan (next build — enforce with `is_premium_for_app('herpetoverse')`, 402 → UpgradeModal):**
- ✅ Clearly HV-owned → gate: `reptile_pairings`, `reptile_offspring`,
  `animal_genotypes` (breeding + morphs), and any HV-specific detailed-analytics
  endpoint.
- ⚠️ **Boundary question for you:** `feeder_colonies` / `feeder_species` and the
  main `analytics` router are **shared with Tarantuverse**. Gating them on
  HV-premium would also affect TV. Options: (a) treat feeders/analytics as HV
  premium only when accessed in the HV context (needs an app signal on the
  request), or (b) keep the shared routes as-is and gate only HV-exclusive
  surfaces. Tell me which and I'll wire it. Until then I'll gate only the
  unambiguous HV-owned breeding/genetics routes.

**Reminder:** don't *enforce* any of this (cap or feature gates) in production
until HV's purchase path is live — otherwise free keepers hit walls with no way
to pay. Build-ready ≠ enforced.

**Recommendation:** don't *enforce* the 5-cap in production until HV's purchase
path is live (otherwise free keepers hit a wall with no way out). It's a
one-constant bridge (`HV_FREE_TIER_MAX_ANIMALS`) until then.

## Also worth noting

- TV's free cap is already **15** (`FREE_TIER_MAX_ANIMALS = 15`), matching your
  "15 inverts in TV." No TV change was needed.
- The 402 detail shape is identical across both apps, so the same UpgradeModal
  pattern works everywhere.
