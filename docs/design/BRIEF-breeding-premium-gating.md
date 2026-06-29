# Engineering Brief — Breeding premium-gating rework

**Status:** ✅ Shipped 2026-06-15 (see §0)
**Date:** 2026-06-15
**Owner:** (assign)
**Scope:** Mobile + web breeding paywall UX, premium-gating parity, free-tier animal cap

---

## 0. Implementation status (shipped 2026-06-15)

All work items below were implemented, with three deltas from the original plan:

1. **Free animal cap landed at 15, not 8.** Product call (Cory): keep it gentle —
   only ~5 keepers (13%) sit at/above 15 vs. the 12 (32%) at 8. Hard enforcement,
   no grandfathering (no data loss — existing over-cap users keep everything, new
   creates 402 until they upgrade or drop below 15). Single source of truth:
   `app/models/user.py::FREE_TIER_MAX_ANIMALS = 15` (used by `utils/limits.py`),
   the `free` plan row via migration `cap_20260615_lower_free_animal_cap`, the seed,
   and all user-facing "20 animals" copy across web + mobile.

2. **§5 P2 was reframed: advanced analytics had NO server gate at all.** The brief's
   §3/§5 line reference (`analytics.py ~L45`) was stale — that line is the *breeding*
   analytics endpoint added earlier. `/advanced/` (L388) was client-teaser-gated only,
   returning the full payload to anyone who hit the URL. Fixed by adding
   `can_use_analytics` to the entitlement map (mirrors `can_use_breeding`, no migration)
   and enforcing 402 server-side. Both the web and mobile advanced-analytics screens
   now handle that 402 with an upsell instead of a misleading empty state / `[object Object]`.

3. **Added a web parity pass the brief didn't scope.** The brief's §4 framed the gap as
   mobile-only, but two web spots also needed the polish: the **invert/scorpion breeding
   panel** (`dashboard/inverts/[id]`) used a plain `alert()`, and the three breeding
   **create pages** (`pairings/add`, `egg-sacs/add`, `offspring/add`) did
   `throw new Error(detail-object)` → `[object Object]`. Both now use the web `UpgradeModal`
   with string-safe `detail.message` extraction. (Web's breeding *front-door wall* in
   `dashboard/breeding/page.tsx` was already correct and unchanged.)

**Note on the duplicate mobile breeding surface:** mobile has TWO breeding entry points —
the established `app/breeding/*` hub (tarantula-era) and the newer invert-detail breeding
panel + `app/invert/add-pairing.tsx` (ADR-010 Phase D, scorpion). Both were gated/hardened
this pass. Physically merging them remains a future cleanup, not done here.

Shared mobile helper added: `src/utils/errors.ts` (`getErrorMessage`, `isPaymentRequired`)
— funnel all axios errors through it before they reach a `<Text>`/`Alert`.

---

## 1. Objective

Make the premium paywall actually work where users hit it. Today breeding is the
intended premium centerpiece, but on **mobile** — which carries ~80% of recent
installs — the gate is effectively invisible and partially broken. This brief
fixes that, brings mobile to parity with web, and lowers the one broadly-reachable
wall (the animal cap) so meaningful numbers of users actually encounter an upgrade
prompt.

**Do not change pricing.** Analysis below shows exposure, not price, is the
conversion bottleneck.

---

## 2. Why now (evidence)

Pulled from PostHog + production DB on 2026-06-15:

- **Conversions are near-zero, but not because of price.** Real paid customers: 1
  Stripe lifetime + 3 Apple monthly (2 active, 1 churned). The other 17 "premium"
  rows are `admin_grant` promo comps. The price points *do* convert where users
  reach them.
- **Almost nobody reaches the paywall.** Pricing-page views: ~1–2 unique/month.
  Installs are growing fast (53 → 256 month-over-month) but that traffic is not
  reaching any upgrade surface.
- **The gates we have are either rarely hit or broken.** The 20-animal cap has
  been crossed by 3 real users *ever*. The photo cap is a non-lever (see §7).
  Breeding — the feature with real pull — is not surfaced as a paywall on mobile.

Full data appendix in §7.

---

## 3. Current gating architecture (reference — do not change unless noted)

Premium is a single boolean: a user is premium if they have an active,
non-expired subscription whose plan name != `"free"`.

**Entitlement source:** `apps/api/app/models/user.py::User.get_subscription_limits()`
returns:

| Key | Free default | Premium |
|---|---|---|
| `max_animals` | `20` | `-1` (unlimited) |
| `can_use_breeding` | `False` | `True` |
| `max_photos_per_tarantula` | `5` | `-1` |
| `has_priority_support` | `False` | `True` |
| `is_premium` | `False` | `True` |

**Server-enforced 402 sites** (all return `HTTP 402 PAYMENT_REQUIRED`):

| Feature | File | Gate check |
|---|---|---|
| Animal cap | `apps/api/app/utils/limits.py::enforce_collection_limit` | counts `inverts` rows vs `max_animals` |
| Breeding — pairing (legacy) | `routers/pairings.py` `create_pairing` (~L160) | `can_use_breeding` |
| Breeding — pairing (generic) | `routers/pairings.py` `create_invert_pairing` (~L90) | `can_use_breeding` |
| Breeding — egg sac | `routers/egg_sacs.py` (~L60) | `can_use_breeding` |
| Breeding — offspring | `routers/offspring.py` (~L27, ~L79) | `can_use_breeding` |
| Advanced analytics | `routers/analytics.py` `get_advanced_analytics` (~L388) | `can_use_analytics` (added 2026-06-15; mirrors `can_use_breeding`) — ⚠️ was UNGATED server-side before this brief |
| Photos | `routers/photos.py` (~L77) | `max_photos_per_tarantula` |

**402 response detail shapes** (the client must parse these — note they are
objects, not strings):

```jsonc
// breeding (pairings / egg sacs / offspring / analytics)
{ "message": "...", "feature": "breeding", "is_premium": false }

// collection / animal cap
{ "message": "...", "current_count": 20, "limit": 20, "is_premium": false }

// photos
{ "message": "...", "limit": 5, "is_premium": false }
```

---

## 4. The parity gap (the bug we're fixing)

**Web (correct):** `apps/web/src/app/dashboard/breeding/page.tsx` checks
`canUseBreeding()` and renders a full-screen 💎 "Breeding Module — Premium
Feature" wall with a "View Premium Plans" CTA → `/pricing`, **before** the user
can interact. Discoverable and desirable.

**Mobile (broken):**

1. `apps/mobile/app/breeding/index.tsx` has **no gate**. Free users walk in; the
   list 402s are swallowed by `.catch(() => ({ data: [] }))`, so it renders as an
   empty state, not a premium feature.
2. `apps/mobile/app/breeding/pairings/new.tsx` `handleSubmit` (~L226) catches the
   402 and does `setError(err?.response?.data?.detail || ...)`. **`detail` is an
   object**, so it renders as `[object Object]` in a `<Text>` node and risks the
   "Objects are not valid as a React child" Hermes crash. No upgrade prompt, no
   path to checkout.
3. The working `UpgradeModal` (`apps/mobile/src/components/UpgradeModal.tsx`) is
   wired into exactly **one** screen — `apps/mobile/app/tarantula/add.tsx` (the
   animal cap, the least-hit trigger) — and not even on the generic invert-add
   path.

Net: on the platform with most users, the premium centerpiece looks broken
instead of like an upsell.

---

## 5. Work items

### P0 — Fix mobile breeding 402 handling + wire UpgradeModal

Apply the **reference pattern already used in `tarantula/add.tsx`** (`handleSave`,
~L89–104) to every breeding create entry point. Reference:

```tsx
// apps/mobile/app/tarantula/add.tsx (existing, correct)
} catch (error: any) {
  if (error.response?.status === 402) {
    setShowUpgradeModal(true);
    setSaving(false);
    return;
  }
  const detail = error.response?.data?.detail;
  const message =
    typeof detail === 'object' && detail !== null
      ? detail.message || JSON.stringify(detail)
      : detail || 'Failed to add tarantula';
  Alert.alert('Error', message);
}
```

`UpgradeModal` API (`src/components/UpgradeModal.tsx`):

```tsx
<UpgradeModal
  visible={showUpgradeModal}
  onClose={() => setShowUpgradeModal(false)}
  title="Upgrade to Premium"
  message="Unlock the full breeding module"
  feature="Breeding"   // renders the purple feature callout
/>
// handleUpgrade() inside the modal already routes to /subscription
```

Screens to fix (every breeding create call site):

- [ ] `app/breeding/pairings/new.tsx` — POST `/pairings/`
- [ ] `app/invert/add-pairing.tsx` — POST `/inverts/pairings` (generic/cross-taxon path; **verify current catch block**)
- [ ] `app/breeding/pairings/[id]/egg-sacs/new.tsx` — POST `/egg-sacs/`
- [ ] `app/breeding/egg-sacs/[id]/offspring/new.tsx` — POST `/offspring/`
- [ ] Any add actions on the detail screens: `app/breeding/pairings/[id].tsx`, `app/breeding/egg-sacs/[id].tsx`, `app/breeding/offspring/[id].tsx`

For each: add `showUpgradeModal` state, branch on `error.response?.status === 402`
→ show modal, and harden the generic error path so an object `detail` never lands
in a `<Text>`/`setError` unguarded (extract `detail.message`).

**General-purpose hardening:** audit the whole mobile app for
`setError(...response.data.detail)` and `Alert.alert(..., detail)` where `detail`
can be an object. Same `[object Object]` / Hermes-crash risk anywhere a 402/422
detail object flows into render. Centralize with a small helper, e.g.
`getErrorMessage(err): string`.

### P0 — Gate the mobile breeding overview entry (web parity)

`app/breeding/index.tsx` should mirror the web wall: if the user is not premium,
render a premium upsell screen (💎 header, feature list, "View Plans" → push
`/subscription`) instead of the empty list. Use the existing entitlement signal
the mobile app already reads for `tarantula/add.tsx` (confirm how premium status
is exposed client-side — `useSubscription`/auth context — and reuse it; don't
re-derive). Keep the upsell consistent with `UpgradeModal`'s visual language.

Also: stop swallowing 402s into empty lists in `fetchAll` — a 402 should route to
the upsell, not look like "no records yet."

### P1 — Lower the free animal cap to 8–10

Recommended value: **8** (see §7 reachability table — moves from 3 → 12 users who
encounter the wall, while leaving 1–2 animal beginners untouched). 10 is the
conservative alternative.

> **SHIPPED at 15** (product call — see §0). Gentler exposure (~5 keepers / 13%);
> revisit downward later if conversion needs more reach.

Two places set the free cap and must stay in lockstep:

1. **Hardcoded fallbacks** in `models/user.py::get_subscription_limits()` — the
   free-tier default block returns `"max_animals": 20` in **multiple** return
   paths (no-session, no-subscription, no-plan fallbacks). Update all of them.
   Also `utils/limits.py` `.get("max_animals", 20)` default.
2. **The `free` plan row** in `subscription_plans.max_animals` — update via
   `seed_subscription_plans.py` and a data migration (Neon is read-only from
   tooling; ship the change through Alembic + the normal deploy). Premium plans
   keep `-1`.

Copy to update wherever the limit is shown to users: the 402 message string in
`enforce_collection_limit`, the mobile `UpgradeModal` premium-features list
("Unlimited animals"), pricing/limit copy driven by `max_animals`, and any
"X of N animals" UI.

> ⚠️ This is a tightening change for existing free users who are between the new
> cap and 20 (currently ~9 users sit in 8–19). They won't lose data, but new
> creates will 402. Decide product-side whether to grandfather existing
> over-cap free users (e.g., allow existing rows, block new) or apply hard. The
> enforcement counts existing rows, so a hard cap simply blocks their next add.

### P1 — Extend UpgradeModal to the other live 402 sites

Same pattern, lower priority than breeding:

- [ ] Generic invert add (`app/invert/add.tsx`) — animal cap on the cross-taxon
      path (today only legacy `tarantula/add.tsx` shows the modal).
- [ ] Advanced analytics (`app/analytics/advanced.tsx`).
- [ ] Photo upload flow (cap = 5) — low value (see §7), but should still show the
      modal rather than a generic error.

### P2 — Separate analytics entitlement from breeding

`routers/analytics.py` gates advanced analytics on `can_use_breeding`. Functionally
fine today (single premium boolean), but it blocks ever pricing/packaging analytics
independently. Consider adding `can_use_analytics` to the plan model + entitlement
map now while you're in here, defaulted to mirror `can_use_breeding`, so a future
split is a config change rather than a code change.

---

## 6. Acceptance criteria

- [ ] As a **free** user on **mobile**, opening Breeding shows a premium upsell
      (not an empty list, not a broken error).
- [ ] As a free user, attempting to create a pairing / egg sac / offspring shows
      `UpgradeModal` (not `[object Object]`, no crash), with a working route to
      `/subscription`.
- [ ] No object-typed error detail can reach a `<Text>` node anywhere in the
      breeding flow (grep for `.data?.detail` usages; all guarded).
- [ ] As a **premium** user, all breeding flows work unchanged on both platforms.
- [ ] Web breeding gate behavior unchanged (still gated, still routes to pricing).
- [ ] Free animal cap is the new value everywhere it's enforced or displayed
      (backend fallback + free plan row + all copy), verified by creating animals
      up to the cap on both platforms.
- [ ] Both light and dark mode verified for the new mobile upsell + modal.
- [ ] EAS production build verified (static JSX branches only — no dynamic
      component patterns; this flow has bitten Hermes prod before).

---

## 7. Data appendix

All counts exclude the 1,221-animal internal/test account
(`user_id 11314163-…`). 38 active free keepers with ≥1 animal; 82 users total.

**Animal-cap reachability (the most reachable wall):**

| Cap value | Users who'd hit it | % of active keepers |
|---|---|---|
| 20 (current) | 3 | 8% |
| 15 | 5 | 13% |
| 10 | 10 | 26% |
| **8 (recommended)** | **12** | **32%** |
| 5 | 16 | 42% |

**Breeding eligibility:** 8 users (~21%) own at least one MALE and one FEMALE and
could theoretically run a pairing — a real audience, but only captured if the gate
is actually surfaced (it currently isn't on mobile). Note `inverts.sex` values are
UPPERCASE in prod (`MALE` / `FEMALE` / `UNKNOWN`); 1,432 UNKNOWN vs 55 FEMALE / 18
MALE — most animals are unsexed.

**Photo cap is a non-lever:** max photos on any single animal is exactly 5 (cap
binds), and only 9 animals in the entire DB have more than 3 photos. Photo
engagement is too low for the 5-photo wall to drive conversion. Do not invest here.

**Paid-customer reality (for context):** 1 Stripe lifetime ($149.99) + 3 Apple
monthly ($4.99; 2 active, 1 cancelled). 17 `admin_grant` comps are not revenue.
Pricing-page views ~1–2 unique/month.

**Caveat:** small N (38 active keepers). Treat percentages as direction, not
precision; rank order is reliable.

---

## 8. Out of scope / explicitly not doing

- No pricing changes (monthly $4.99 / yearly $44.99 / lifetime $149.99 stay).
- No new premium features — this is gating UX + reachability only.
- Sensor/import/other roadmap items unaffected.
