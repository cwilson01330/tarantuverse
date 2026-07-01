# Google Play — Store Listing & Release Notes (Tarantuverse)

First production Android release. Keep this in sync as the listing evolves.

---

## "What's new" / Release notes (500 char max)

> First public release — write this as a welcome, not a changelog. Switch to a
> real changelog format for v2+.

### Option A — full (~480 chars, fits the limit)

```
Welcome to Tarantuverse — the husbandry tracker built for invertebrate keepers. 🕷️

Keep your whole collection in one place: tarantulas, scorpions, centipedes, mantises, millipedes, roaches and more. Log feedings, molts and substrate changes, get premolt predictions and feeding reminders, and browse care sheets for hundreds of species. Add photos, track growth over time, print QR enclosure labels, and connect with fellow keepers.

Free to use. Happy keeping!
```

### Option B — concise (~250 chars)

```
Welcome to Tarantuverse! 🕷️ Track your inverts — tarantulas, scorpions, centipedes, mantises and more — with feeding, molt & substrate logs, premolt predictions, species care sheets, photos, growth charts, QR enclosure labels, and a keeper community. Free to use.
```

---

### Current update — "What's new" (matches iOS 1.0, ≤500 chars)

> Use this for the next Android store release so Play and the App Store match. ~450 chars.

```
Big update! A much bigger care-sheet library — 300+ species across 9 groups (tarantulas, scorpions, centipedes, mantises, true spiders, millipedes, vinegaroons, whip spiders, roaches). Browse the full catalog with search and filters. Smoother typing everywhere, fixed messaging, collection improvements (all taxa counted, feeding badges, filters), calendar date pickers, and in-app updates from Settings. Plus lots of polish and bug fixes. Happy keeping!
```

---

## Short description (80 char max)

```
Track tarantulas, scorpions & more — feeding, molts, care sheets & community.
```
(76 chars)

---

## Full description (4000 char max)

> Plain text (Play doesn't render markdown). ~2,050 chars — well under the limit.

```
Tarantuverse is a husbandry tracker built for invertebrate keepers — a calm, organized home for your whole collection and the care that goes into it.

Whether you keep a single sling or a room full of enclosures, Tarantuverse helps you remember what matters: when each animal last ate, when it molted, when the substrate was changed, and how it's growing over time.

KEEP YOUR WHOLE COLLECTION
Track many invertebrates in one place — tarantulas, scorpions, centipedes, whip spiders, vinegaroons, true spiders (including jumping spiders), millipedes, mantises, and roaches. Every animal gets its own profile with photos, husbandry details, and a full history.

LOG THE CARE THAT COUNTS
- Feeding logs — what you offered, accepted or refused
- Molt logs — with optional measurements to track growth
- Substrate changes and enclosure notes
- Smart feeding reminders so nobody gets forgotten

UNDERSTAND YOUR ANIMALS
- Premolt predictions from feeding patterns and molt history
- Growth charts built from your molt measurements
- Feeding stats and collection insights

SPECIES CARE SHEETS
Browse 300+ species care sheets across all nine groups — temperament, temperature and humidity ranges, enclosure guidance, feeding by life stage, and honest safety and venom notes. Search and filter by care level, and link an animal to its species to compare your setup against the guide. New species are added regularly.

PHOTOS & QR LABELS
Build a photo timeline for each animal. Generate printable QR enclosure labels and upload photos straight from your phone by scanning the label.

A COMMUNITY OF KEEPERS
Share a public profile, follow other keepers, join the forums, and message fellow hobbyists. Keep your collection private or public — your call.

YOUR DATA, YOUR CALL
Export your full collection anytime and delete your account whenever you like. We keep care and species information honest — if we don't know something, we leave it blank rather than guess.

Tarantuverse is free to use. Premium unlocks an unlimited collection and advanced analytics for serious keepers and breeders.

We're a small, growing project built by a keeper who wanted a better way to care for these incredible animals — adding species and features all the time. We'd love to have you along.

Happy keeping.
```

---

## Honesty guardrails (keep listing accurate)

- Species count is 326 across 9 taxa (2026-07). "300+ across nine groups" is accurate and only grows, so it's safe to state; bump the number only upward.
- No invented user counts, ratings, or "trusted by thousands" claims.
- Don't imply features that aren't shipped.

---

## Future release-note template (v2+)

```
New: <feature>.
Improved: <change>.
Fixed: <bug>.
```

---

## Android in-app products (reference)

Two separate auto-renewing subscriptions — product IDs must match
`apps/mobile/src/services/iap.ts` exactly. Backend accepts both via
`product_to_plan_map` in `routers/subscriptions.py`.

| Product ID | Name | Base plan ID | Period | Price (USD) |
|---|---|---|---|---|
| `com.tarantuverse.premium.monthly` | Tarantuverse Premium (Monthly) | `monthly` | P1M | $4.99 |
| `com.tarantuverse.premium.yearly` | Tarantuverse Premium (Yearly) | `yearly` | P1Y | $44.99 |

Notes:
- Two separate subscriptions (one base plan each) — NOT two base plans under one
  product — because `iap.ts` references two distinct product IDs.
- Each base plan: auto-renewing, grace period + account hold on, then **Activate**.
- `LIFETIME_SKU` (`com.tarantuverse.lifetime`) exists in `iap.ts` but is not
  surfaced in the mobile subscription UI — skip creating it for v1.
- Android receipt validation is currently MVP (trust-the-client). Follow-up:
  server-side verification via the Google Play Developer API (mirror the iOS
  App Store Server API hardening).
- Products only return from `fetchProducts` once Active in Play AND the app is
  on a track — test purchases via the Internal testing track.

---

## Where to edit (Play Console nav)

- **Store listing** — Grow → Store presence → Store listings → Main store listing
  (name, short/full description, graphics). Category + contact → Store settings.
- **Data safety / declarations** — Policy → App content (Data safety, Content
  rating, Target audience & content, Ads, App access all live here).

---

## Data safety form (paste-ready mapping)

Honesty-first. Third-party SDKs count: **PostHog** (analytics) and **Cloudflare
R2** (photo storage) + our own API (Render/Neon). PostHog and R2 act as service
providers/processors for us, so data is **collected** but not **shared** (Google
defines "shared" as transfer for a third party's own use, which doesn't apply).

**Does your app collect or share user data?** → **Yes**

**Is all collected data encrypted in transit?** → **Yes** (HTTPS everywhere)

**Do you provide a way to request data deletion?** → **Yes** — in-app account
deletion + full data export. (Provide the in-app path / `/delete-account` URL.)

### Data types to declare (all: Collected = Yes, Shared = No)

| Data type | Collected | Purpose(s) | Linked to user? | Optional/Required |
|---|---|---|---|---|
| Name (username / display name) | Yes | Account management, App functionality | Linked | Username required; display name optional |
| Email address | Yes | Account management | Linked | Required |
| User IDs | Yes | Account management, Analytics | Linked | Required |
| Photos | Yes | App functionality | Linked | Optional |
| App interactions (events, screen views) | Yes | Analytics, App functionality | Linked | Required* |
| Other user-generated content (collection logs, forum posts, DMs, profile) | Yes | App functionality | Linked | Optional |
| Device or other IDs (PostHog distinct_id) | Yes | Analytics | Linked | Required* |
| Approximate location | Yes | Analytics | Linked | Required* |
| Purchase history (subscription status) | Yes | App functionality | Linked | Optional |

\* "Required" here means collected automatically as part of using the app (not
user-toggleable), which is how Google's form treats analytics/diagnostics.

### Notes / decisions

- **Approximate location** is only collected because PostHog does IP-based
  geolocation by default. Two honest options:
  1. **Declare it** (as above) — no code change, ship now. ✅ simplest
  2. **Avoid it** — set `disableGeoip: true` in `initPostHog()` (src/services/
     posthog.ts); then you can leave Approximate location OFF the form. Cleaner
     privacy story; do as a follow-up if desired.
- **Payment info:** NOT collected by us — Google Play handles billing. Only the
  resulting subscription *status* is stored (covered by "Purchase history").
- **Session replay** is disabled (`enableSessionReplay: false`) — no screen
  recording to declare.
- Keep the form consistent with the privacy policy URL on the listing
  (`/privacy` on the web app).
