# Expense Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Premium, per-app expense log with even splits across animals, a per-animal "cost of keeping", and monthly totals — API plus all four clients.

**Architecture:** Two new tables (`expenses`, `expense_shares`) behind one router. A small service resolves who a split covers (from the existing `active_*_query` helpers) and divides the amount to the cent; shares are stored at save time. Clients share one helper lib (four identical copies) and add an Expenses screen, an add/edit form and a Cost of keeping card.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, Postgres; Next.js (TV web, HV web); Expo Router React Native (TV mobile, HV mobile).

**Spec:** `docs/superpowers/specs/2026-10-22-expense-tracking-design.md` — read it first; this plan only adds file names, signatures and tests.

## Global Constraints

- **No git write commands.** Never `git add/commit/push`. Each task ends by listing the files it changed in the ledger; Cory commits.
- Migration id `exp_20261022_expenses`, `down_revision = "fcm_20261022_feeding_cost"`.
- Categories exactly: `feeders, substrate_decor, enclosures_equipment, heat_lighting, health_vet, shipping, other`. Labels: Feeders · Substrate & decor · Enclosures & equipment · Heat & lighting · Health & vet · Shipping · Other.
- Split modes exactly: `none, animals, location, collection`. Max 500 shares.
- `amount`: `> 0` and `<= 100000` AFTER rounding half-up to cents. `description` 1–120 chars trimmed; `notes` ≤ 500; `spent_on` between 1990-01-01 and server UTC today + 1 day.
- Premium = `owner.is_premium_for_app(app)` (the collection OWNER's plan). 403 body: `{"detail": "Expense tracking is a premium feature", "code": "premium_required"}`. Create + update only.
- Access: stranger 404, co-keeper below keeper 403 (`app.utils.access.require` / `scope_collection` / `load_*` with `need="keeper"`). Every route gets `@policy("keeper")`.
- Router file must NOT use `from __future__ import annotations` (slowapi). Writes `@limiter.limit("60/minute")`. Collection endpoints use trailing slashes in clients. `.model_dump()`, never `.dict()`.
- Mobile: JS only — no new native modules (OTA must reach runtime TV 1.1.0 / HV 1.3.0). Use theme tokens / ThemeContext colors, never hardcoded colors.
- TV web: light AND dark (`dark:` variants). HV web: dark-only, match neighbouring pages.
- Money display: `$` prefix + 2 decimals, like the feeding-cost card.
- Scratch work only under `/tmp/tv` with its own `node_modules`; never symlink into the repo; installs with `CI=true`.
- DB-backed tests are marked `@pytest.mark.requires_postgres`. Before Task 1 the controller provides a migrated disposable Postgres (sandbox: `apt-get install -y postgresql`, `initdb`/`pg_ctl` under `/tmp/tv/pg`, `TEST_DATABASE_URL=...`, `alembic upgrade head`) so these tests actually run.

## Review Focus

1. **Sub-cent and string amounts** — `0.004` rounds to `0.00` and must be refused (422), `30` and `"30.005"` store `30.00` / `30.01`. Test in Task 3.
2. **Location spelling** — `"rack 2 "` must match animals stored as `"Rack 2"` (canonicalise with `canonical_location`, compare `lower()`). Test in Task 2.
3. **Edit after animals die** — an amount-only edit keeps a share on an animal that has since died; changing the split excludes it. Test in Task 3.
4. **Owner lapses** — owner can still list, view, delete and export; create/update → 403 `premium_required`; a keeper co-keeper of a lapsed owner (read_only → viewer) gets 403 on list. Test in Task 3.
5. **Late-evening local dates** — a keeper west of UTC logging "today" sends a date that is tomorrow in UTC; today+1 must be accepted, today+2 refused. Test in Task 3.

---

### Task 1: Tables and models

**Files:**
- Create: `apps/api/alembic/versions/exp_20261022_expenses.py`
- Create: `apps/api/app/models/expense.py`
- Modify: `apps/api/app/models/__init__.py` (export `Expense`, `ExpenseShare`)
- Test: `apps/api/tests/test_expense_models.py`

**Interfaces:**
- Produces: `Expense`, `ExpenseShare` (columns exactly as spec §1), `EXPENSE_CATEGORIES: tuple[str, ...]`, `EXPENSE_SPLIT_MODES: tuple[str, ...]`, `EXPENSE_APPS = ("tarantuverse", "herpetoverse")`, `MAX_EXPENSE_SHARES = 500`. Relationship `Expense.shares` (cascade `all, delete-orphan`, ordered by `ExpenseShare.id` insertion — add an integer `position` column, NOT NULL, to keep penny order deterministic).

- [ ] **Step 1: Write failing tests**
  - `test_constants_match_spec`: the three tuples equal the Global Constraints lists.
  - `@requires_postgres test_check_constraints`: inserting `amount=0`, `category='animals'`, `app='both'`, `split_mode='rack'`, a share with both `invert_id` and `colony_id` each raise `IntegrityError`.
  - `@requires_postgres test_deleting_an_invert_keeps_its_share`: create invert + expense + share → delete invert → share row still exists with all three targets NULL.
- [ ] **Step 2: Run** `cd apps/api && pytest tests/test_expense_models.py -v` — FAIL (import error).
- [ ] **Step 3: Implement** model + migration (indexes per spec; share CHECK `num_nonnulls(invert_id, colony_id, animal_id) <= 1`; FK `ON DELETE SET NULL` on the three targets, `CASCADE` on `expense_id` and `owner_id`). Downgrade drops both tables.
- [ ] **Step 4: Run** `alembic upgrade head && alembic downgrade -1 && alembic upgrade head` against the test DB, then the tests — PASS.
- [ ] **Step 5:** ledger: files changed.

### Task 2: Split service

**Files:**
- Create: `apps/api/app/services/expense_split.py`
- Test: `apps/api/tests/test_expense_split.py`

**Interfaces:**
- Consumes: `Expense`/`ExpenseShare`, `MAX_EXPENSE_SHARES` (Task 1); `active_inverts_query`, `active_colonies_query`, `active_animals_query` (`app.utils.limits`); `canonical_location`, `SCOPE_TARANTUVERSE`, `SCOPE_HERPETOVERSE` (`app.utils.locations`).
- Produces:
  - `divide_amount(amount: Decimal, n: int) -> list[Decimal]`
  - `Target = tuple[str, UUID]` where kind ∈ `"invert" | "colony" | "animal"`
  - `resolve_targets(db, owner_id: UUID, app: str, mode: str, *, invert_ids=(), colony_ids=(), animal_ids=(), location: str | None = None) -> tuple[list[Target], str | None]` — returns targets and the `split_label` (canonical location or None). Raises `HTTPException` 400/404 per spec.
  - `build_shares(amount: Decimal, targets: list[Target]) -> list[ExpenseShare]` (sets `position`, the right FK column, and the divided amount).

- [ ] **Step 1: Write failing tests** (pure — monkeypatch the three `active_*_query` names inside `expense_split` with fakes, like `tests/test_care_sheets.py::_active`):
  - `test_divide_exact`: `divide_amount(Decimal("10.00"), 3) == [Decimal("3.34"), Decimal("3.33"), Decimal("3.33")]`; `(Decimal("0.01"), 3) == [0.01, 0.00, 0.00]`; `(Decimal("30.00"), 15)` all `2.00`; sum always equals input.
  - `test_collection_tv_includes_open_inverts_and_colonies_only` (died, transferred, archived, ended excluded — the fakes return only active rows; assert the service uses those queries, not raw tables).
  - `test_collection_hv_uses_animals_and_never_colonies`.
  - `test_location_matches_case_and_spacing`: animals at `"Rack 2"`, request `"rack 2 "` → both matched, label `"Rack 2"`.
  - `test_location_with_no_animals_is_400`.
  - `test_animals_mode_rejects_foreign_closed_or_other_app_ids_404` and `test_animals_mode_dedupes`.
  - `test_colony_ids_on_herpetoverse_is_400`, `test_animal_ids_on_tarantuverse_is_400`.
  - `test_more_than_500_is_400`, `test_animals_mode_with_no_ids_is_400`, `test_none_mode_returns_no_targets`.
  - `test_order_is_inverts_or_animals_then_colonies_by_created_at_then_id`.
- [ ] **Step 2: Run** `pytest tests/test_expense_split.py -v` — FAIL.
- [ ] **Step 3: Implement.** `divide_amount`:
  ```python
  cents = int((amount * 100).to_integral_value(ROUND_HALF_UP))
  base, extra = divmod(cents, n)
  return [Decimal(base + (1 if i < extra else 0)) / 100 for i in range(n)]  # quantize to 0.01
  ```
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5:** ledger.

### Task 3: Schemas + CRUD router

**Files:**
- Create: `apps/api/app/schemas/expense.py`
- Create: `apps/api/app/routers/expenses.py`
- Modify: `apps/api/app/main.py` (import + `app.include_router(expenses.router, prefix="/api/v1/expenses", tags=["expenses"])` next to the care-sheets include)
- Test: `apps/api/tests/test_expenses.py`

**Interfaces:**
- Consumes: Task 1 models, Task 2 `resolve_targets` / `build_shares` / `divide_amount`; `scope_collection`, `require`, `policy` (`app.utils.access`); `limiter` (`app.utils.rate_limit`); `get_current_user`, `get_db`.
- Produces (schemas): `ExpenseSplitIn{mode, invert_ids: list[UUID]=[], colony_ids=[], animal_ids=[], location: str|None}`, `ExpenseCreate{app, collection: UUID|None, spent_on: date, description, category, amount: Decimal, notes: str|None, split: ExpenseSplitIn = mode none}`, `ExpenseUpdate` (all optional, `split: ExpenseSplitIn|None`), `ExpenseShareOut{target_kind: str|None, target_id: UUID|None, name: str, amount: Decimal}`, `ExpenseListItem{id, spent_on, description, category, amount, notes, split_mode, split_label, share_count, created_by_name: str|None}`, `ExpenseDetail(ExpenseListItem){shares: list[ExpenseShareOut]}`, `ExpenseList{items, total, can_add: bool}`. Amount validator: quantize half-up to 0.01, then `0 < x <= 100000`.
- Produces (routes): `GET /`, `GET /{expense_id}`, `POST /` (201), `PUT /{expense_id}`, `DELETE /{expense_id}` (204). Helper `_load_expense(db, user, expense_id) -> tuple[Expense, Access]` (404 "Expense not found"). Helper `premium_or_403(owner, app)`.
- Names in `ExpenseShareOut.name`: invert → `name or common_name or scientific_name`; colony → `name`; animal → `name or common_name`; null target → `"Removed animal"`.

- [ ] **Step 1: Write failing tests** — `@requires_postgres`, through `TestClient` with real users/inverts/colonies/animals and `collection_members` rows; make premium by inserting an active `UserSubscription` on a plan with `app` set (or monkeypatch `User.is_premium_for_app`):
  - `test_create_split_across_collection_stores_shares` ($30, 15 open inverts → 15 × 2.00; died + transferred inverts excluded).
  - `test_amount_rounding_and_floor`: `"30.005"` → `30.01`; `30` → `30.00`; `"0.004"` → 422.
  - `test_spent_on_today_plus_one_ok_plus_two_422`.
  - `test_amount_only_edit_keeps_targets_even_if_one_died_since` and `test_split_change_reresolves`.
  - `test_deleted_invert_shows_as_removed_animal_in_detail`.
  - `test_access`: owner 200, keeper co-keeper 200/201, logger 403, viewer 403, stranger 404 — for list, detail, create, update, delete.
  - `test_premium`: owner not premium → create/update 403 with `code == "premium_required"`; list/detail/delete still work; `can_add` false. Owner premium + co-keeper without premium → co-keeper create 201. TV premium only → HV create 403. Keeper co-keeper of an owner whose premium lapsed (membership read-only) → list 403.
  - `test_apps_are_separate`: TV expense not in `GET /?app=herpetoverse`.
  - `test_list_filters_and_order`: `from`/`to`/`category`, `limit`/`offset`, newest first.
  - `test_access_policy_structural`: run the existing `tests/test_access_policies.py` — must pass with the new router.
- [ ] **Step 2: Run** `pytest tests/test_expenses.py tests/test_access_policies.py -v` — FAIL.
- [ ] **Step 3: Implement** router per spec §2. `created_by = current_user.id`, `owner_id = access.owner.id`. Update: if `split` is None re-divide over existing shares in `position` order (null-target shares keep their slot); else replace shares.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5:** ledger.

### Task 4: Summary and animal-cost endpoints

**Files:**
- Modify: `apps/api/app/routers/expenses.py`, `apps/api/app/schemas/expense.py`
- Test: `apps/api/tests/test_expenses.py` (append)

**Interfaces:**
- Consumes: Task 3 router helpers; `load_invert`, `load_colony`, `load_animal` (`app.utils.access`).
- Produces: `GET /summary` → `ExpenseSummary{total, by_category: dict[str, Decimal], by_month: list[{month: "YYYY-MM", total}], by_location: list[{location, total}], top_animals: list[{target_kind, target_id, name, total}], unallocated_total, can_add}`; `GET /animal-cost` → `AnimalCost{can_add, purchase_price: Decimal|None, shares_total, by_category, total, shares: list[{expense_id, spent_on, description, category, amount}]}`. Both routes declared BEFORE `/{expense_id}`.
- `by_location` groups shares by the target's CURRENT `location` (null → "No location"); `unallocated_total` = sum of expenses with `split_mode='none'` plus null-target shares.

- [ ] **Step 1: Write failing tests:** summary arithmetic over a fixed set (two months, three categories, one unsplit, one location split) with exact expected Decimals; default window = last 12 months; `top_animals` capped at 10; animal-cost for an invert with `price_paid=40` and two shares → `total = 40 + shares`; colony → `purchase_price is None`; `invert_id` with `app` mismatch / two ids given → 400; logger 403, stranger 404.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. **Step 5:** ledger.

### Task 5: Privacy, export, Advanced Analytics

**Files:**
- Modify: `apps/api/app/services/export_service.py` (gather `expenses` + `shares` for both apps; JSON key `expenses` with nested `shares`; CSV/ZIP files `expenses.csv`, `expense_shares.csv`; preview counts)
- Modify: `apps/api/app/routers/analytics.py`, `apps/api/app/schemas/analytics.py` (`AdvancedAnalyticsResponse.spent_this_month: float = 0.0`, `feeders_spent_this_month: float = 0.0`; owner's TV expenses whose `spent_on` falls in the current month at the request's `tz_offset_minutes`, same handling as the existing advanced route)
- Test: `apps/api/tests/test_expense_privacy.py`, append to `tests/test_feeding_cost.py` or new `tests/test_expense_analytics.py`

**Interfaces:** Consumes Task 1 models. Produces the two analytics fields used by Tasks 7–8.

- [ ] **Step 1: Write failing tests:**
  - Privacy sentinels (pattern of `tests/test_care_sheets.py` / `tests/test_public_keeper_privacy.py`): an expense with description and notes `SENTINEL-EXPENSE-7f3` on an animal → the string never appears in: `share_card.compose_card(...)` output, `public_card` payload, sitter pass payload (`sitter_passes.build_pass_payload`), care sheet read payload, `/keepers/{username}/collection/` JSON, transfer preview JSON.
  - Static guard: none of `routers/share_cards.py, sitter_passes.py, care_sheets.py, keepers.py, animal_transfers.py` (and `services/share_card.py`, `services/sitter_card.py`) import `app.models.expense`.
  - Export: JSON contains `expenses[0].shares`; ZIP contains `expenses.csv` + `expense_shares.csv`.
  - Analytics: two TV feeder expenses this month + one last month + one HV expense → `spent_this_month` = TV this-month total, `feeders_spent_this_month` = feeders only.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. **Step 5:** ledger.

### Task 6: Client libs ×4 + upgrade source

**Files:**
- Create (identical apart from API-base/auth import lines): `apps/web/src/lib/expenses.ts`, `apps/mobile/src/lib/expenses.ts`, `apps/web-herpetoverse/src/lib/expenses.ts`, `apps/mobile-herpetoverse/src/lib/expenses.ts`
- Create: `apps/mobile/src/lib/__tests__/expenses.test.ts`
- Modify: the four `upgrade-tracking.ts` (add `'expenses'` to the source vocabulary next to `'feeding_day_intro'`)

**Interfaces:**
- Produces (each copy): `EXPENSE_CATEGORIES: {key: ExpenseCategory; label: string}[]`, `categoryLabel(key)`, `splitAmount(amount: number, n: number): number[]` (cents math identical to `divide_amount`), `formatMoney(n: number): string` (`"$30.00"`), types `Expense`, `ExpenseDetail`, `ExpenseList`, `ExpenseSummary`, `AnimalCost`, `ExpenseInput`, and API functions `listExpenses(params)`, `getExpense(id)`, `createExpense(body)`, `updateExpense(id, body)`, `deleteExpense(id)`, `getExpenseSummary(params)`, `getAnimalCost({invert_id?|colony_id?|animal_id?})`. A 403 with `code === 'premium_required'` throws `PremiumRequiredError`. Each copy uses its app's existing fetch/auth helper (copy the pattern from that app's `careSheet`/`care-sheet` lib).

- [ ] **Step 1: Write failing jest test:** `splitAmount(10, 3)` → `[3.34, 3.33, 3.33]`; `(0.01, 3)` → `[0.01, 0, 0]`; `(30, 15)` all `2`; sums equal input to the cent; `formatMoney(2)` → `"$2.00"`; `EXPENSE_CATEGORIES.map(c=>c.key)` equals the Global Constraints list.
- [ ] **Step 2: Run** `cd apps/mobile && npx jest src/lib/__tests__/expenses.test.ts` — FAIL. **Step 3: Implement** all four copies. **Step 4: Run** jest PASS; `diff` the four files ignoring import lines — only those differ. **Step 5:** ledger.

### Task 7: TV web

**Files:**
- Create: `apps/web/src/app/dashboard/expenses/page.tsx`, `apps/web/src/components/ExpenseForm.tsx`, `apps/web/src/components/CostOfKeepingCard.tsx`
- Modify: `apps/web/src/components/Sidebar.tsx` (item `{ icon: '🧾', label: 'Expenses', path: '/dashboard/expenses' }` after Analytics), `apps/web/src/app/dashboard/inverts/[id]/page.tsx`, `apps/web/src/app/dashboard/colonies/[id]/page.tsx`, `apps/web/src/app/dashboard/analytics/advanced/page.tsx`

**Interfaces:** Consumes Task 6 lib, `useCollectionRole` / `loadSharedWithMe` (`lib/coKeepers.ts`), `LocationPicker`, `UpgradeModal` (source `'expenses'`), Task 5 analytics fields.

- [ ] **Step 1:** Expenses page per spec §3 (totals from `/summary`, category bar, month-grouped list, category chips, collection picker = own + shared keeper non-read-only TV collections, free/lapsed states driven by `can_add`).
- [ ] **Step 2:** `ExpenseForm` dialog: fields, split segmented control, "Pick animals" grouped by taxon with per-group Select all (inverts from `/inverts/feeding-status` or the existing collection loader, colonies from the colonies lib), live preview text `"$30.00 across 15 animals · $2.00 each"` / `"… · $3.34 / $3.33 each"` from `splitAmount`. Edit mode shows "Split across N animals" and sends no `split` unless changed. Catches `PremiumRequiredError` → `UpgradeModal`.
- [ ] **Step 3:** `CostOfKeepingCard({kind: 'invert'|'colony', id})`: fetch only when `can(role,'keeper')`; render when `can_add || shares.length`; expandable list. Mount on invert + colony detail.
- [ ] **Step 4:** Advanced analytics: "Spent this month" card; feeding-cost card line "Feeders bought this month: $X" when > 0.
- [ ] **Step 5: Verify** `cd apps/web && npx tsc --noEmit && npm run lint` clean; both themes checked on every new element (`dark:` classes present). Ledger.

### Task 8: TV mobile

**Files:**
- Create: `apps/mobile/app/expenses/index.tsx`, `apps/mobile/app/expenses/edit.tsx`, `apps/mobile/src/components/CostOfKeepingCard.tsx`
- Modify: `apps/mobile/app/(tabs)/profile.tsx` (MenuRow `icon="receipt"` label "Expenses" → `/expenses`, near "Export your data"), `apps/mobile/app/analytics/advanced.tsx` (cards as Task 7 Step 4 + a link to `/expenses`), `apps/mobile/app/invert/[id].tsx`, `apps/mobile/app/colony/[id].tsx`

**Interfaces:** Consumes Task 6 lib, `useCollectionRole`/`can`/`loadSharedWithMe` (`src/lib/co-keepers.ts`), `LocationPicker`, `UpgradeModal`, `DateInput`, theme tokens/primitives (`src/components/ui`).

- [ ] **Step 1:** List screen (same content as Task 7 Step 1). **Step 2:** edit screen (`?id=` edits; same form rules; Pick animals as a grouped checklist modal). **Step 3:** Cost card on invert + colony detail (keeper+ only; not added to `refreshSlices` — it loads on focus with the rest). **Step 4:** analytics cards.
- [ ] **Step 5: Verify** `npx tsc --noEmit`, lint, the design-token gate, `pnpm run check:bundle` (one react-native). Ledger.

### Task 9: HV web

**Files:**
- Create: `apps/web-herpetoverse/src/app/app/expenses/page.tsx`, `apps/web-herpetoverse/src/components/ExpenseForm.tsx`, `apps/web-herpetoverse/src/components/CostOfKeepingCard.tsx`
- Modify: `apps/web-herpetoverse/src/components/Sidebar.tsx` (`{ icon: '🧾', label: 'Expenses', path: '/app/expenses' }` after Feeders), `apps/web-herpetoverse/src/app/app/reptiles/[id]/AnimalDetailClient.tsx`

**Interfaces:** as Task 7 with HV's `lib/coKeepers.ts`, `LocationPicker`, `UpgradeModal`; split targets are `animal_ids` only (no colonies); app `herpetoverse`.

- [ ] **Steps 1–3:** page, form, card (mirroring Task 7, dark-only styling of neighbouring HV pages). **Step 4: Verify** tsc + lint. Ledger.

### Task 10: HV mobile

**Files:**
- Create: `apps/mobile-herpetoverse/app/expenses/index.tsx`, `apps/mobile-herpetoverse/app/expenses/edit.tsx`, `apps/mobile-herpetoverse/src/components/CostOfKeepingCard.tsx`
- Modify: `apps/mobile-herpetoverse/app/(tabs)/profile.tsx` (MenuRow "Expenses" near "Export your data"), `apps/mobile-herpetoverse/src/screens/AnimalDetailScreen.tsx`

**Interfaces:** as Task 8 with HV's `src/lib/co-keepers.ts`, HV `LocationPicker`, HV `UpgradeModal`; dates via a YYYY-MM-DD `ThemedInput` like HV's other forms.

- [ ] **Steps 1–3:** list, edit, card. **Step 4: Verify** tsc, lint, token gate, `pnpm run check:bundle`. Ledger.

### Task 11: Whole-branch verification + docs + handover

**Files:**
- Modify: `CLAUDE.md` — "Expenses (2026-10-22)" bullet under Security Hardening: tables + migration, owner-plan premium rule, keeper-role access (logger/viewer 403, stranger 404), shares resolved at save time, never on cards/passes/care sheets/keepers/transfers (`tests/test_expense_privacy.py`), four `expenses.ts` copies in lockstep (jest-tested).

- [ ] **Step 1:** Full API suite with Postgres: `cd apps/api && pytest -q` — all pass, none of the new tests skipped.
- [ ] **Step 2:** jest (TV mobile), `tsc --noEmit` ×4, lint ×4, token gate, `check:bundle` ×2 — clean.
- [ ] **Step 3:** CLAUDE.md entry.
- [ ] **Step 4:** Handover for Cory: list of every changed file; PowerShell-safe git commands one per line; deploy order Render → (Vercel auto) → `eas update` TV then HV, each after `pnpm run check:bundle`.
