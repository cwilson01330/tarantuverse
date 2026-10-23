# Expense tracking — design

**Date:** 2026-10-22
**Status:** Approved in conversation, awaiting written-spec review
**Apps:** Tarantuverse (web + mobile) and Herpetoverse (web + mobile), one API

## Why

A keeper asked to set their own cost per feeding (shipped 2026-10-22). Cory then
pointed at the bigger gap: keepers and breeders spend money on more than
feeders — substrate, rotted wood and leaf litter, enclosures, heat, vet bills,
shipping — and the apps have nowhere to record it. Today the only money fields
are `price_paid` on animals, `sale_price` on transfers, `price_sold` on
offspring, and the single per-feeding figure on TV Advanced Analytics.

Success: a keeper logs "$30 rotted wood, split across every millipede and
isopod enclosure" in one entry and can then see monthly spend by category and
what each animal has cost to keep.

## Decisions (from Cory)

| # | Decision | Notes |
|---|---|---|
| D1 | **Premium feature** | The collection OWNER's plan for that app decides (`owner.is_premium_for_app(app)`), like the photo cap. Co-keepers never need premium. |
| D2 | **Shared purchases are split evenly** across the chosen animals | Weighted splits are out of scope. |
| D3 | **Owner and keeper-role co-keepers** can view and add expenses | Loggers, viewers, sitters: no access. A trusted keeper or business partner logs purchases. |
| D4 | **One ledger per app** | TV expenses live in TV, HV in HV. A shared item is logged in the app it mostly belongs to. |
| D5 | **Shares are stored, resolved at save time** (approach 1) | History stays true: later animals don't absorb old purchases; died animals keep their costs. |

Made by Claude, accepted by Cory:

- When premium lapses: viewing, export and delete keep working; create and edit are refused.
- Deleting an animal keeps its shares with an empty target ("removed animal") so purchase totals still add up.
- No "animals" category — an animal's own cost stays on `price_paid` and is never counted twice.

## 1. Data

Migration `exp_20261022_expenses`, `down_revision = "fcm_20261022_feeding_cost"`. Additive only.

### `expenses`

| column | type | rule |
|---|---|---|
| `id` | UUID PK | |
| `owner_id` | UUID FK users, `ON DELETE CASCADE`, indexed | the collection owner, also when a co-keeper logs it |
| `created_by` | UUID FK users, `ON DELETE SET NULL`, nullable | who logged it |
| `app` | VARCHAR(20) | CHECK `IN ('tarantuverse','herpetoverse')` |
| `spent_on` | DATE, indexed | keeper's local date; 1990-01-01 ≤ value ≤ today + 1 day |
| `description` | VARCHAR(120) NOT NULL | trimmed, non-empty |
| `category` | VARCHAR(30) NOT NULL | CHECK `IN ('feeders','substrate_decor','enclosures_equipment','heat_lighting','health_vet','shipping','other')` |
| `amount` | NUMERIC(10,2) NOT NULL | CHECK `amount > 0 AND amount <= 100000`; rounded half-up to cents on write |
| `notes` | TEXT nullable | ≤ 500 chars (schema) |
| `split_mode` | VARCHAR(20) NOT NULL default `none` | CHECK `IN ('none','animals','location','collection')` |
| `split_label` | VARCHAR(40) nullable | the canonical location name when `split_mode='location'`, else NULL |
| `created_at`, `updated_at` | timestamptz | |

Index: `(owner_id, app, spent_on DESC)`.

### `expense_shares`

| column | type | rule |
|---|---|---|
| `id` | UUID PK | |
| `expense_id` | UUID FK expenses `ON DELETE CASCADE`, indexed | |
| `invert_id` | UUID FK inverts `ON DELETE SET NULL`, nullable, indexed | TV animal |
| `colony_id` | UUID FK colonies `ON DELETE SET NULL`, nullable, indexed | TV colony |
| `animal_id` | UUID FK animals `ON DELETE SET NULL`, nullable, indexed | HV animal |
| `amount` | NUMERIC(10,2) NOT NULL | ≥ 0.00 |
| `position` | INTEGER NOT NULL | 0-based order within the expense, so the extra pennies land on the same shares on every re-divide |

CHECK: at most one of `invert_id`, `colony_id`, `animal_id` is non-null
(`num_nonnulls(...) <= 1`). All three null = a share whose animal was deleted.

Models: `app/models/expense.py` (`Expense`, `ExpenseShare`, `EXPENSE_CATEGORIES`,
`EXPENSE_SPLIT_MODES`), registered in `app/models/__init__.py`.

### Split resolution — `app/services/expense_split.py`

Pure-ish service, one job: turn a split request into a list of
`(target_kind, target_id)` for the owner, then divide the amount.

- `collection` — TV: owner's inverts where `died_at IS NULL AND transferred_out_at IS NULL` + colonies where `is_active AND ended_at IS NULL AND transferred_out_at IS NULL`. HV: owner's animals where not died and not transferred.
- `location` — same set, filtered by `lower(location) = lower(canonical_location(...))`. Zero matches → 400 "No animals at that location".
- `animals` — exactly the ids sent; every id must be the owner's, in this app, and open (same predicates) else 404 "Animal not found". Duplicates removed. Zero ids → 400.
- `none` — no shares.
- More than 500 targets → 400.
- Ordering for determinism: inverts/animals then colonies, each by `created_at, id`.
- `divide(amount, n)`: `cents = round(amount*100)`; `base, extra = divmod(cents, n)`; the first `extra` shares get `base+1` cents, the rest `base`. Sum always equals `amount`.

Edits (`PUT`):
- `split` absent from the body → keep the existing target set (including null-target shares) and re-divide the (possibly new) amount across it.
- `split` present → resolve again from the current collection and replace all shares.

## 2. API

Router `app/routers/expenses.py`, prefix `/api/v1/expenses`, tag `expenses`.
Schemas in `app/schemas/expense.py`. Every route uses the access-policy
decorator like neighbouring routers.

| method + path | body / query | returns |
|---|---|---|
| `GET /expenses/` | `app` (req), `collection?`, `from?`, `to?`, `category?`, `limit` (≤100, default 50), `offset` | `{items: [ExpenseListItem], total, can_add}` (`can_add` = owner premium for `app`; clients show "Add" or the upgrade button from it — a co-keeper can't see the owner's plan any other way) newest first (`spent_on DESC, created_at DESC`). Item: id, spent_on, description, category, amount, notes, split_mode, split_label, share_count, created_by display name. |
| `GET /expenses/{id}` | | `ExpenseDetail` = item + `shares: [{target_kind, target_id, name, amount}]`; deleted targets → `target_kind=null`, name "Removed animal". |
| `POST /expenses/` | `ExpenseCreate`: `app`, `collection?`, `spent_on`, `description`, `category`, `amount`, `notes?`, `split: {mode, invert_ids?, colony_ids?, animal_ids?, location?}` | 201 `ExpenseDetail` |
| `PUT /expenses/{id}` | `ExpenseUpdate` (all optional; `split` optional, see edits) | `ExpenseDetail` |
| `DELETE /expenses/{id}` | | 204 |
| `GET /expenses/summary` | `app`, `collection?`, `from?`, `to?` (default: last 12 months) | `{total, by_category: {cat: amt}, by_month: [{month: "YYYY-MM", total}], by_location: [{location, total}], top_animals: [{target_kind, target_id, name, total}] (≤10), unallocated_total}` |
| `GET /expenses/animal-cost` | exactly one of `invert_id`, `colony_id`, `animal_id` | `{can_add, purchase_price, shares_total, by_category, total, shares: [{expense_id, spent_on, description, category, amount}]}`. Colonies have no purchase price (null). |

`app` validated against `tarantuverse|herpetoverse`; `invert_id`/`colony_id` only valid with TV, `animal_id` only with HV (400 otherwise).

### Access

- List, summary, create: `scope_collection(db, user, app, collection, need="keeper")`.
- `{id}` routes: load the expense, then `require(db, user, expense.owner_id, expense.app, "keeper", not_found="Expense not found")`.
- `animal-cost`: `load_invert` / `load_colony` / `load_animal` with `need="keeper"`.
- No access at all (stranger) → 404; a co-keeper below keeper (logger, viewer, or a keeper whose owner's premium lapsed and is read-only) → 403. Both are the existing `require` behaviour.
- Create and update: if `not owner.is_premium_for_app(app)` → **403** `{"detail": "Expense tracking is a premium feature", "code": "premium_required"}`. List, detail, summary, animal-cost, delete and export stay open.
- Rate limit: create/update/delete `60/minute` via `utils/rate_limit.limiter`.

### Privacy

Expense data never appears in: share cards (`services/share_card.py`), card links, link previews (`public_card`), sitter passes, care sheets (`/care-sheets/`), `/keepers/*`, transfer previews and claims (a transfer never copies shares; the seller's history stays with the seller's record), activity feed, search, discover, achievements. No new code touches those paths; tests prove it.

### Export

`services/export_service.py`: JSON gets `expenses` (with nested `shares`); CSV/ZIP get `expenses.csv` and `expense_shares.csv`. Both apps' rows are exported, each with its `app`.

## 3. Clients

Penny-split helper `splitAmount(amount: number, n: number): number[]` (cents
math identical to the server), in four identical copies:
`apps/web/src/lib/expenses.ts`, `apps/mobile/src/lib/expenses.ts`,
`apps/web-herpetoverse/src/lib/expenses.ts`, `apps/mobile-herpetoverse/src/lib/expenses.ts`.
Each lib also holds `EXPENSE_CATEGORIES` (key + label), API calls and types.
Jest test: `apps/mobile/src/lib/__tests__/expenses.test.ts`.

Category labels: Feeders · Substrate & decor · Enclosures & equipment · Heat & lighting · Health & vet · Shipping · Other.

### Screens

| client | list | add/edit |
|---|---|---|
| TV web | `app/dashboard/expenses/page.tsx` (Sidebar item "Expenses") | `ExpenseForm` dialog component |
| HV web | `app/app/expenses/page.tsx` (nav item) | `ExpenseForm` dialog |
| TV mobile | `app/expenses/index.tsx` (from Profile menu + Analytics) | `app/expenses/edit.tsx` (`?id=` to edit) |
| HV mobile | You tab → Expenses screen | edit screen |

List screen: this month + last month totals, category bar (from `/summary`),
list grouped by month, category filter chips, "Add expense". Keeper-role
co-keepers get a collection picker: own collection + `loadSharedWithMe()`
collections for this app where `role === 'keeper' && !read_only`. Free users see an explainer and an
upgrade button (tracking source `expenses`, added to all four
`upgrade-tracking.ts` vocabularies); with existing history (lapsed), they see
the history read-only and the upgrade button in place of "Add".

Form: description, amount, date (default local today), category pills, notes,
"Split across" — Nothing / Whole collection / A location (existing
`LocationPicker`) / Pick animals (grouped by taxon with per-group "Select all";
TV includes colonies). Live preview: "$30.00 across 15 animals · $2.00 each"
(or "$3.34 / $3.33 each" when uneven). Editing shows the current split
("Split across 15 animals") and keeps it unless the keeper changes it.

### Cost of keeping card

On TV invert detail (web `dashboard/inverts/[id]`, mobile `app/invert/[id].tsx`),
TV colony detail (web + mobile) and HV animal detail (web + mobile):
purchase price, supplies share by category, total; tap → list of the expenses
behind it. Shown on died and transferred animals. The client already resolves
the caller's role (`useCollectionRole`, present in all four clients'
`co-keepers.ts` / `coKeepers.ts`) and calls `animal-cost` only when role ≥ keeper — loggers,
viewers and visitors cost no request. The card renders when `can_add` is true
or `shares` is non-empty; otherwise nothing (no upgrade prompt on detail pages).

### Advanced Analytics (TV)

`/analytics/advanced/` adds `spent_this_month` and `feeders_spent_this_month`
(owner's TV expenses, current local month — use the existing
`tz_offset_minutes` pattern). Web + mobile advanced pages: a "Spent this month"
card; the Est. Monthly Feeding Cost card shows "Feeders bought this month: $X"
when that is > 0. The estimate itself is unchanged.

Display: "$" prefix like the feeding-cost card; plain number in the keeper's
own currency. Dark mode on TV web/mobile; HV web is dark-only.

## 4. Testing

`apps/api/tests/test_expenses.py`:
- divide: sums exactly; 10.00/3 → 3.34, 3.33, 3.33; 0.01/3 → 0.01, 0.00, 0.00.
- resolution: collection/location/animals sets; died, transferred, archived, ended excluded; foreign or other-app ids → 404; >500 → 400; empty location → 400.
- edits: amount-only re-divides same targets (incl. null-target shares); new split replaces.
- deleted invert/colony/animal → share kept with null target, totals unchanged.
- access: owner + keeper ok; logger and viewer → 403; stranger → 404, on every route.
- premium: owner's plan per app decides; co-keeper without premium can add when owner is premium; lapsed → list/detail/summary/delete/export ok, create/update 403 `premium_required`.
- app isolation: TV list never returns HV rows; `animal_id` on TV → 400.
- summary and animal-cost arithmetic.
- privacy sentinels: an expense description `SENTINEL-EXPENSE-…` never appears in share-card compose, `public_card`, sitter pass payload, care-sheet payload, `/keepers/{u}/collection/`, transfer preview.
- export contains expenses + shares.
- `/analytics/advanced/` month totals.

Clients: jest for `splitAmount`; `tsc` ×4; lint; token gate; `pnpm run check:bundle` in both mobile apps.

## 5. Rollout

1. Render deploy (migration runs in `start.sh`).
2. Web (Vercel, automatic) — TV + HV.
3. OTA: TV mobile then HV mobile (JS only; `check:bundle` first).
4. CLAUDE.md: an "Expenses (2026-10-22)" entry under Security Hardening listing tables, access rule, privacy guarantee, and the four lib copies.

## Out of scope (v1)

Breeder profit-and-loss per pairing/clutch (data supports it — follow-up),
receipt photos, recurring expenses, weighted splits, currency selection,
budgets/alerts, a combined TV+HV ledger.
