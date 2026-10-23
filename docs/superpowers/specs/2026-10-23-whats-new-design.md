# What's new — design

**Date:** 2026-10-23
**Status:** Approved in conversation, awaiting written-spec review
**Apps:** Tarantuverse (web + mobile) and Herpetoverse (web + mobile), one API

## Why

Features ship fast (photo dates, care sheets, cost per feeding, expenses in one
week) and most keepers never find them. A short in-app "What's new" — at most
once a week, only when there is something worth saying — tells current keepers
what changed and lets a free keeper see what Premium adds.

Success: after a push that ships something keeper-facing, every existing keeper
sees one dismissible card on Home listing it, with a button that opens the
feature; dismissing it on one device clears it everywhere; the full history is
one tap away.

## Decisions (from Cory)

| # | Decision |
|---|---|
| D1 | Highlights live in a file in the repo; Cory's commit is the approval; the Render push publishes. No admin screen (option A). |
| D2 | The Home card shows only highlights published **after the keeper signed up** (a brand-new keeper sees no card until the next publish). The page lists everything for anyone. |
| D3 | The API serves the file; all four apps read one endpoint; "seen" is stored server-side per keeper per app (option 1). |
| D4 | Claude drafts the entries for now; Cory may take this over. |
| D5 | Premium features are labelled "Premium" — honest labelling that also shows free keepers what Premium adds. |

Made by Claude, accepted by Cory: separate feeds per app (each app's own words);
entries = title + body + optional button + premium flag; no push notifications
for it; card capped at 3 entries + "See all"; unseen capped at the two most
recent weeks; any card button or ✕ marks the week seen.

## 1. Content and API

### File

`apps/api/app/content/whats_new.json`:

```json
{
  "tarantuverse": [
    {
      "id": "2026-10-23-expenses",
      "published_on": "2026-10-23",
      "title": "Track what your collection costs",
      "body": "Log feeders, substrate, enclosures and vet bills, split a purchase across the animals it's for, and see what each one costs to keep.",
      "premium": true,
      "action": { "label": "Open Expenses", "target": "expenses" }
    }
  ],
  "herpetoverse": []
}
```

Rules (enforced by a test, see §4):
- top-level keys exactly `tarantuverse`, `herpetoverse`; each a list (may be empty)
- `id`: unique within the file, `^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$`, ≤ 80 chars
- `published_on`: ISO date, not before 2026-10-01
- `title`: 1–60 chars; `body`: 1–220 chars; plain text (no HTML/markdown)
- `premium`: boolean
- `action`: optional; `label` 1–30 chars; `target` ∈ `TARGETS` = `expenses`, `feeding_day`, `analytics_advanced`, `collection`, `species`, `settings`
- entries may be in any order in the file; the API sorts

Loader `app/services/whats_new.py`: reads + validates the file once (module-level cache, `functools.lru_cache`), returns per-app lists sorted by `published_on` desc then `id`. Invalid file at startup → raise (the test catches it before deploy). Week grouping key = the Monday of `published_on`'s ISO week.

### Seen state

Migration `whn_20261023_whats_new_seen` (`down_revision = "exp_20261022_expenses"`): two nullable `DATE` columns on `users`: `whats_new_seen_tv`, `whats_new_seen_hv`. NULL = never dismissed.

### Routes — `app/routers/whats_new.py`, prefix `/api/v1/whats-new`

| route | auth | returns |
|---|---|---|
| `GET /whats-new/?app=tarantuverse\|herpetoverse` | signed in | `{weeks: [{week_of: date, entries: [Entry]}], unseen: [Entry]}` |
| `POST /whats-new/seen` body `{app}` | signed in | `{seen_through: date \| null}` |

`unseen` (the card's content): entries with `published_on > cutoff`, where
`cutoff = max(user.created_at (UTC date), seen_column)` (seen NULL → just the
signup date), and `published_on >=` the Monday of the week **one before** the
newest entry's week (i.e. at most the two most recent weeks), and
`published_on <=` UTC today (an entry dated in the future is never shown
anywhere — lets a draft be committed ahead of its date). Sorted newest first.

`weeks` (the page): all entries with `published_on <= UTC today`, grouped by
week, newest week first.

`POST /seen` sets the app's column to the newest `published_on <= today` (or
leaves NULL if the feed is empty) — idempotent; never moves backwards.

Access: plain `get_current_user` — this is per-user, non-collection data, so
the router is NOT added to `COLLECTION_ROUTERS` in
`tests/test_access_policies.py` and needs no `@policy` tag (the structural test only covers collection
routers). Rate limit `POST` 30/minute.

## 2. Clients

Per app a `whats-new` lib (`apps/web/src/lib/whatsNew.ts`,
`apps/web-herpetoverse/src/lib/whatsNew.ts`, `apps/mobile/src/lib/whats-new.ts`,
`apps/mobile-herpetoverse/src/lib/whats-new.ts`): types, `getWhatsNew()`,
`markWhatsNewSeen()`, `TARGET_ROUTES: Record<Target, string>` (each app's own
screens), and a session cache so Home, the Profile dot and the page share ONE
`GET` per app session (refetch only on a fresh session / sign-in, or after
`markWhatsNewSeen`, which updates the cache locally without refetching).

Target → screen (initial):

| target | TV web | TV mobile | HV web | HV mobile |
|---|---|---|---|---|
| expenses | /dashboard/expenses | /expenses | /app/expenses | /expenses |
| feeding_day | /dashboard/feeding-day | /feeding-day | /app/feeding-day | /feeding-day |
| analytics_advanced | /dashboard/analytics/advanced | /analytics/advanced | — (no button) | — |
| collection | /dashboard/tarantulas | /(tabs)/collection | /app/reptiles | /(tabs) (the Collection tab, `index`) |
| species | /species | /(tabs)/species | /app/species | /(tabs)/species |
| settings | /dashboard/settings | /settings | /app/settings | /settings |

A target an app can't serve maps to `null` → the entry shows without a button.

**Card** (`WhatsNewCard`): on Home — TV web `/dashboard`, HV web `/app`, TV mobile Home tab, HV mobile `(tabs)/dashboard`. Renders only when `unseen.length > 0`: heading "What's new", up to 3 entries (title, body, "Premium" label when `premium`, action button), "See all" when there are more or always (links to the page), ✕ to dismiss. ✕ or any action button → `markWhatsNewSeen(app)` (fire and forget; card hides immediately), then navigate for actions.

**Page**: TV web `/dashboard/whats-new`, HV web `/app/whats-new`, mobile `app/whats-new.tsx` in both apps. Weeks newest first ("Week of Oct 19"), every entry with its label and button. Opening the page does not mark anything seen.

**Entry points**: web sidebar item `{ icon: '✨', label: "What's new" }` — TV directly after Achievements, HV directly before Settings — with a small dot when `unseen` is non-empty; mobile Profile / You row "What's new" (TV and HV: in the same section as "Export your data") with the same dot.

Styling: TV web light + dark (theme classes like neighbouring dashboard cards); HV web dark-only; mobile theme tokens/primitives only (token gate). JS only — OTA-safe.

## 3. Weekly routine (D1, D4)

- Entries are written only for features already live for keepers. Anything that needs an app update to reach phones waits until that update is out (or is dated for the day it will be).
- Fixes and behind-the-scenes work don't get entries.
- A new entry's `published_on` must be later than the newest entry already live in that app's feed — never add an entry to a date that has already been published (keepers who dismissed that day would never see it on the card).
- Free vs premium is checked in the code before an entry is labelled.
- Copy follows the honesty principle: describes what the app does today, keeper terms, no hype, no prices, never mentions other platforms (App Store rule).

### Launch entries (week of 2026-10-19; `published_on` = the deploy date)

Tarantuverse:
1. `…-expenses` — **Track what your collection costs** (premium) — "Log feeders, substrate, enclosures and vet bills, split a purchase across the animals it's for, and see what each one costs to keep." → Open Expenses (`expenses`)
2. `…-care-sheets` — **Printable sitter care sheets** — "Going away? Print or save a care sheet for the animals you pick, with feeding, water and safety notes for whoever is looking after them." → Open your collection (`collection`)
3. `…-photo-timeline` — **Photo timeline** — "Flip through an animal's photos in date order, with each molt marked, and compare the first and latest side by side. Wrong date on a photo? You can fix it now." → Open your collection (`collection`)
4. `…-feeding-cost` — **Your own cost per feeding** (premium) — "Advanced Analytics can now use what you actually pay per feeding instead of a flat 50¢ guess." → Open Advanced Analytics (`analytics_advanced`)
5. `…-millipede-photos` — **Photos for millipede care guides** — "Eleven more millipede care guides now have photos, all openly licensed and credited." → Browse species (`species`)

Herpetoverse:
1. `…-expenses` — **Track what your collection costs** (premium) — "Log feeders, substrate, enclosures, heating and vet bills, split a purchase across the animals it's for, and see what each one costs to keep." → Open Expenses
2. `…-care-sheets` — **Printable sitter care sheets** — same body as TV → Open your collection
3. `…-photo-timeline` — **Photo timeline** — "Flip through an animal's photos in date order, with each shed marked, and compare the first and latest side by side. Wrong date on a photo? You can fix it now." → Open your collection

(Verified 2026-10-23: care sheets and photo timeline have no premium gate; expenses and Advanced Analytics do.)

## 4. Testing

API (`tests/test_whats_new.py`):
- file validation: the real file passes; a temp file with a duplicate id / bad date / long title / unknown target / extra top-level key fails with a message naming the entry
- `unseen`: signup cutoff (keeper created after an entry never sees it on the card, sees it on the page); seen marker; two-week cap; future-dated entries hidden everywhere; per-app separation; empty feed
- `POST /seen`: sets newest live date, idempotent, per app, never moves backwards
- auth required (401 without token); structural policy test passes

Target sync (`tests/test_whats_new_targets_in_sync.py`, pattern of `test_taxon_lists_in_sync.py`): reads the four client libs and fails if any `TARGETS` value is missing from an app's `TARGET_ROUTES` (an explicit `null` counts as handled).

Clients: tsc ×4, eslint on changed files, TV mobile token gate, `check:bundle` ×2.

## Out of scope (v1)

Admin/publish UI, push notifications, images in entries, per-entry dismissal,
analytics on card clicks (PostHog event `whats_new_action` is a natural
follow-up for measuring upsell), localisation, a public changelog page.
