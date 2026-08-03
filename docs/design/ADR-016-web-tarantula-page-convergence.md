# ADR-016 — Web tarantula page convergence

**Status:** Accepted (problem statement). Work not started.
**Applies to:** Tarantuverse web only. Mobile already converged in ADR-013.
**Related:** ADR-005 (inverts consolidation), ADR-007 (generic invert UI),
ADR-013 (animal detail unification), ADR-015 (death and events)

---

## Context

Mobile unified tarantulas onto the generic invert detail screen in ADR-013. Web
never did. Tarantulas are the **only** taxon on web that still routes to a
bespoke page:

```
apps/web/src/app/dashboard/tarantulas/page.tsx:75
  { key: 'tarantula', …, detailPath: (id) => `/dashboard/tarantulas/${id}` }
  # every other taxon: `/dashboard/inverts/${id}`
```

This surfaced when the ADR-015 death flow was built on
`dashboard/inverts/[id]/page.tsx` and was unreachable for almost every animal in
the app — tarantulas are the overwhelming majority of records. The feature was
ported onto the legacy page rather than repointing the route, because a cutover
would have cost nine other features.

That decision was right for one feature and is wrong as a permanent state. Every
new animal-detail feature now has to be built twice on web, or built once and
silently miss most of the collection.

## The two pages

- **A (legacy, tarantula-only):** `dashboard/tarantulas/[id]/page.tsx` (~2500
  lines) plus `edit/` and `husbandry/` sub-routes. Reads the legacy
  `/api/v1/tarantulas/*` surface.
- **B (generic, every other taxon):** `dashboard/inverts/[id]/page.tsx` plus
  `edit/`, `add-feeding/`, `add-molt/`, `add-photo/`, `add-substrate-change/`.
  Reads the unified `/api/v1/inverts/*` surface.

Both resolve the **same animal by the same UUID** — dual-write preserves the id,
which is why ADR-015's `/inverts/{id}/died` works from either page.

---

## Decision

**Converge on B. Do not cut over until the regressions below are closed.**

Direction is not in question: B is the generic surface, it's where every other
taxon lives, and it's what mobile already did. What's in question is sequencing,
and shipping a cutover today would be a visible regression for nearly every user.

Until then, animal-detail features on web are built on **A first**, since that's
what tarantula keepers actually reach.

---

## What blocks the cutover

Nine regressions. All are **silent** — nothing errors, features simply vanish.

### 1. Premolt prediction disappears
A renders it twice (inline + sidebar card with confidence, refusal streak, molt
interval, progress). B renders none, despite `TAXON_MODULES.tarantula` including
`'premolt'`. `/api/v1/premolt/tarantulas/{id}/prediction` queries the
`Tarantula` model directly — **needs a generic route**, not just a UI port.

### 2. Historical molt data becomes unreadable
B renders a molt row as the literal string `'Molt'` plus a date. Leg span,
weight and molt photos entered over years remain in the database and become
invisible. B also truncates every log to the 8 most recent with no "view all".

**This is the regression most likely to be read as "the app lost my data."**

### 3. The molt unit label flips
A labels measurements **inches**; B labels the same column **cm**. Keepers would
begin entering centimetres into a column of inches, corrupting the data
silently. Whichever unit wins, this needs deciding and probably a data audit.

### 4. Feeding analytics disappear
`FeedingStatsCard` — acceptance rate, average interval, longest gap,
next-feeding prediction, prey distribution. `/api/v1/inverts/{id}/feeding-stats`
**already exists**; B just never calls it. Cheapest of the nine.

### 5. Feeding pause becomes unreachable
Columns are mirrored, but B has no pause UI. A currently-paused tarantula would
show no indication of why it isn't flagged overdue.

### 6. QR labels, visibility toggle and share link disappear
`QRModal` hardcodes `/api/v1/tarantulas/{id}/upload-session`. Anyone who has
printed enclosure labels loses the button; anyone with a public profile loses
the toggle and the URL.

### 7. Pricing / collection value disappears
`PricingCard` reads `/pricing/market-signals/tarantulas/{id}`.

### 8. Care sheet link and two identity facts break
`inverts_dualwrite.py:76` sets `species_id = None` **deliberately** for mirrored
tarantulas, and `current_instar` / `current_length_mm` aren't mirrored at all.
On B these render blank for every tarantula. Needs a backfill and a mirror fix.

### 9. Logging depth is lost
Inline forms become navigations; feeding loses `food_size` and time-of-day; molt
loses `premolt_started_at` and the molt photo; substrate loses the reason
dropdown. Husbandry loses last substrate change, misting schedule, last cleaning
and enclosure notes.

### Also in scope
- `dashboard/tarantulas/[id]/husbandry` (426 lines) becomes orphaned — already
  nearly dead, reachable only by typed URL.
- **Thirteen inbound links** to `/dashboard/tarantulas/{id}` across the app
  (dashboard, analytics, collection-value, enclosures, breeding offspring,
  `PremoltAlertsCard`, `PricingCard`, `/t/[id]`).
- `/t/[id]` deep-links with `?log=feeding` and `?log=molt`; B ignores both.
- There is **no redirect infrastructure** — `next.config` has only the www rule.

---

## What the cutover gains

Worth stating, because it's why this is worth doing rather than deleting B:
mark-as-died and the deceased archive, transfer/rehome claim links, provenance,
molt outcome, set-hero-photo, per-taxon labels, and honest per-source
loading/zero/error states (A swallows fetch errors and renders "No feedings
logged yet" on a network failure — the ADR-015 honesty rule, still unfixed on A).

---

## Sequencing

1. **Backend generalisation** — `/inverts/{id}/premolt`, pricing market-signals
   by invert id, QR upload-session by invert id. Three routes currently bound to
   the `Tarantula` model.
2. **Mirror + backfill** — populate `species_id`, `current_instar`,
   `current_length_mm` on mirrored tarantulas, and fix
   `_tarantula_to_invert_kwargs` so new rows carry them.
3. **Port to B** — premolt, feeding stats, pause, QR, share/visibility, pricing,
   full molt rows with measurements and photo, food size, photo lightbox and
   free-tier gating, un-truncated logs, the husbandry fields.
4. **Resolve the unit question** (inches vs cm) explicitly, with a data check.
5. **Cut over** — flip `detailPath`, and ship a `redirect()` from
   `tarantulas/[id]` rather than hunting the thirteen call sites, so bookmarks
   and the QR landing page keep working.
6. **Then** retire A and its sub-routes.

**Estimate:** 1–2 weeks. Steps 1 and 2 are the parts that can't be skipped or
faked; step 3 is bulk work.

---

## Consequences of *not* doing this

Accepted for now, but they compound:

- Every animal-detail feature on web is built twice, or built once and misses
  most of the collection. ADR-015's death flow is already two implementations.
- ADR-005 Phase D (dropping the legacy tables) **cannot proceed** while a live
  page reads `/api/v1/tarantulas/*`. This ADR is on that critical path.
- A and B will drift further apart with every change to either.

## Note for whoever picks this up

The trap that produced this ADR: on mobile, the generic invert screen *is* the
tarantula screen, so it's natural to assume the same on web. It isn't. Check
`detailPath` in `dashboard/tarantulas/page.tsx` before assuming which page a
tarantula reaches.
