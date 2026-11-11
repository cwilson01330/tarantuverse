# Effortless Logging (Stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three per-keeper switches (per-animal reminders with Fed/Refused/Tomorrow buttons, refusal restarts the wait, post-molt pause) that change nothing for existing keepers and are on for new ones.

**Architecture:** All rule changes live in `services/feeding_status.py::compute_feeding_status`, which loads each owner's switches itself, so every caller (Feeding Day, Analytics, badges, digest) follows them without signature changes. The digest builds per-animal pushes through a pure helper; a new idempotent `reminder-action` endpoint does the logging. Mobile registers notification categories at runtime (OTA-safe on the 1.9.0 binary).

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic (Postgres), Expo SDK 54 / expo-notifications 0.32 / expo-router, Next.js 14.

**Spec:** `docs/superpowers/specs/2026-11-10-effortless-logging-design.md`

## Global Constraints

- Never run git write commands in the real repo (`C:\Users\gwiza\Desktop\Dev\tarantuverse`). "Commit" steps commit in the shadow repo under `/tmp`; Cory commits the real repo from the handover commands.
- Neon is read-only. Tests run on the local Postgres via `outputs/sdd/day-one/env/with-pg.sh` (rebuild with `bootstrap.sh db` after a sandbox reset).
- **Switches off ⇒ every output identical to today.** Existing `notification_preferences` rows get all three switches `false`; rows created by `ensure_notification_preferences` get `true`. No prefs row ⇒ treat as all off.
- Migration id: `eff_20261110_effortless_logging`, `down_revision = "ros_20261110_restore_offspring_status"`, reversible.
- Default post-molt windows (days) — tarantula sling 7 / juvenile 10 / adult 14; scorpion 4 / 7 / 7; true_spider 7 / 7 / 7; mantis 3 / 3 / 3; every other taxon: none. Unknown life stage → adult. Sources (URLs) live in a comment in `utils/post_molt_pause.py`: https://tarantulaheaven.com/how-long-should-you-wait-to-feed-your-tarantula-after-a-molt , https://arachnoboards.com/threads/feeding-after-molt-how-long-to-wait.166523 , https://bowmanrainglevers.blogspot.com/2022/10/how-long-to-wait-after-molt-to-feed.html , https://arachnoboards.com/threads/post-molt-feeding-h-longimanus.363598/ , https://arachnoboards.com/threads/how-long-after-molt.98326/ , https://mantidforum.net/threads/how-long-do-you-wait-after-a-molt.42646 , https://siegfriedt-survey.umb.edu/pti/breaking-down-how-long-can-a-jumping-spider-go-without-food-the-untold-side
- Per-animal reminders only when the switch is on AND 1–3 TV animals are due AND 0 HV animals are due; otherwise today's summary (with `categoryId: "feeding_summary"` only when the switch is on).
- Exact copy:
  - Settings titles/lines: "Reminders for each animal" — "When 1–3 animals are due, get a reminder for each with Fed, Refused and Tomorrow buttons. With more due, you get one summary." / "A refusal restarts the wait" — "A refused meal counts as an offer, so you're not reminded again until the next normal feeding time." / "Pause after a molt" — "Feeding reminders pause for a few days after a logged molt while the fangs harden." Group heading: "Feeding reminders".
  - Per-animal push body: `Due for a meal · last ate {N}` | `Due for a meal · last offered {N}` | `Due for a meal · no meal logged yet`, where `{N}` = "today" | "1 day ago" | "{n} days ago".
  - Action results: `Logged: {name} ate` | `Logged: {name} refused` | `We'll remind you tomorrow` | `Already logged from this reminder`.
  - Molt form: `Feeding reminders pause until {Mon D} — check the fangs are fully black before offering food.` with a `Change` control offering a date or `Don't pause`.
  - Label: `Paused after molt · until {Mon D}`.
- Dark mode on every new web/mobile UI; mobile colours via ThemeContext only (design-token gate must pass without re-baselining).
- No new native modules (stage 1 ships by OTA). Run `pnpm run check:bundle` before any `eas update`.

## Review Focus

- A keeper with the switches off sees byte-identical feeding status, digest pushes and badges to today → Task 2 snapshot test + Task 3 digest test.
- Two taps on the same reminder (or two phones, or Fed then Refused) create exactly one log → Task 3 test with a concurrent second insert hitting the unique index.
- A molt logged weeks after the fact, a deleted molt, a future-dated molt and a keeper-set pause → Task 2 tests (no pause / pause gone / window from today / keeper pause wins).
- A co-keeper viewing the owner's collection sees the owner's rule, not their own switches → Task 2 test.
- A notification button tapped while signed out, or for an animal that has since died → Task 3 (409 path) and Task 4 (helper returns the server message; no log when signed out).

---

### Task 1: Schema, switches and preferences API

**Files:**
- Create: `apps/api/alembic/versions/eff_20261110_effortless_logging.py`
- Modify: `apps/api/app/models/notification_preferences.py`, `models/molt_log.py`, `models/feeding_log.py`, `models/invert.py`, `app/schemas/notification_preferences.py`, `app/services/notification_prefs.py`
- Test: `apps/api/tests/test_effortless_switches.py`

**Interfaces:**
- Produces columns: `notification_preferences.smart_reminders_enabled`, `.refusal_restarts_wait`, `.post_molt_pause_enabled` (bool NOT NULL, server_default false); `molt_logs.feeding_pause_days` (Integer NULL, CHECK 0–60); `feeding_logs.reminder_date` (Date NULL) + unique partial index `uq_feeding_logs_reminder` on `(invert_id, reminder_date) WHERE reminder_date IS NOT NULL`; `inverts.reminder_snoozed_until` (Date NULL).
- Prefs schemas: the three booleans on Base/Response and optional on Update.

- [ ] **Step 1: Write failing tests** — `test_existing_rows_default_off` (insert a prefs row via raw SQL without the columns → all three false), `test_new_rows_from_ensure_are_on` (`ensure_notification_preferences` on a new user → all three true), `test_put_toggles_each_switch` (PUT `{refusal_restarts_wait: true}` changes only that field), `test_get_returns_switches`, `test_migration_round_trip` (downgrade then upgrade leaves the columns and index present).
- [ ] **Step 2: Run** `bash env/with-pg.sh python3 -m pytest -q tests/test_effortless_switches.py` → FAIL (columns missing).
- [ ] **Step 3: Implement** the migration (all four tables), model columns, schema fields, and the three `True` values in `ensure_notification_preferences`.
- [ ] **Step 4: Run** the test file (after `alembic upgrade head`) → PASS; also `tests/test_day_one_reminders.py` → PASS.
- [ ] **Step 5: Commit** (shadow repo) `feat(api): effortless-logging switches and columns`.

### Task 2: The due rule (refusal restart, post-molt pause) + molt override

**Files:**
- Create: `apps/api/app/utils/post_molt_pause.py`
- Modify: `apps/api/app/services/feeding_status.py`, `app/schemas/invert.py` (`InvertFeedingStatusItem`), `app/schemas/molt.py` (Create/Update/Response), molt create/update routes in `app/routers/molts.py` (`/tarantulas/{id}/molts`, `/inverts/{id}/molts`, `PUT /molts/{id}`) and `app/routers/enclosures.py` (`/{enclosure_id}/molts`) so `feeding_pause_days` is stored; new route in `app/routers/inverts.py`
- Test: `apps/api/tests/test_effortless_rules.py`

**Interfaces:**
- Consumes: Task 1 columns.
- Produces:
  - `post_molt_pause.DEFAULT_PAUSE_DAYS: dict[str, dict[str, int]]`; `default_pause_days(taxon: str, life_stage: Optional[str]) -> Optional[int]`; `pause_until(molted_on: date, today: date, days: Optional[int]) -> Optional[date]` (None when days is None/0 or the window has passed; a future `molted_on` is treated as `today`).
  - `feeding_status.FeedingRules` (frozen dataclass: `refusal_restarts_wait: bool = False`, `post_molt_pause: bool = False`) and `load_feeding_rules(db, owner_ids: Iterable[UUID]) -> dict[UUID, FeedingRules]` (missing row ⇒ all False).
  - `InvertFeedingStatusItem` gains `last_offered_date: Optional[datetime] = None`, `post_molt_pause_until: Optional[date] = None`. Existing field meanings unchanged.
  - `GET /api/v1/inverts/{invert_id}/post-molt-pause` (`@policy("logger")`) → `{"enabled": bool, "default_days": int | null}` (enabled = owner's switch; default_days from the table for the animal's taxon/stage).
  - `MoltLogCreate/Update/Response.feeding_pause_days: Optional[int]` (`ge=0, le=60`).

- [ ] **Step 1: Write failing tests:**
  - `test_switches_off_output_identical` — fixture collection with all switches off (fed 20 days ago interval 14; meal 20 days ago + refusal 3 days ago; never-fed created after the cutoff past its interval; never-fed created before the cutoff; keeper-paused; millipede grazer; adult tarantula molted 5 days ago and last fed 20 days ago). Assert per animal the literal `is_overdue` / `days_since_last_feeding` / `needs_first_feeding` / `is_feeding_paused` that today's rule gives (True/20/False/False, True/20/False/False, True/None/False/False, False/None/True/False, False/…/False/True, False/…/False/False, True/20/False/False), and `last_offered_date is None and post_molt_pause_until is None` for every item.
  - `test_refusal_restarts_wait` — adult tarantula interval 14, meal 20 days ago, refusal 3 days ago: off → overdue; on → not overdue, `last_offered_date` = refusal, `days_since_last_feeding == 20`.
  - `test_refusal_counts_for_never_fed` — never-fed new animal past its interval with a refusal 2 days ago: on → not overdue, `needs_first_feeding` False (unchanged rule).
  - `test_post_molt_pause_windows` — tarantula sling/juvenile/adult/unknown → 7/10/14/14; scorpion sling 4; mantis 3; millipede → no pause; molt 5 days ago adult tarantula → `post_molt_pause_until == molt_local + 14`, `is_overdue` False even when interval passed.
  - `test_post_molt_override` — `feeding_pause_days=3` 5 days ago → no pause; `=0` → no pause; `=30` → pause.
  - `test_backdated_and_deleted_molt` — molt dated 40 days ago logged today → no pause; deleting the only recent molt removes the pause.
  - `test_future_molt_runs_from_today` and `test_keeper_pause_wins` (keeper pause set → `is_feeding_paused` True, `post_molt_pause_until` None).
  - `test_legacy_tarantula_molt_counts` — molt with only `tarantula_id` set pauses the twin invert.
  - `test_co_keeper_sees_owner_rules` — owner switch on, co-keeper's own prefs off, `/inverts/feeding-status` as co-keeper shows the pause.
  - `test_post_molt_pause_endpoint` and `test_molt_routes_store_override` (all four create paths + PUT keep `feeding_pause_days`).
- [ ] **Step 2: Run** `bash env/with-pg.sh python3 -m pytest -q tests/test_effortless_rules.py` → FAIL.
- [ ] **Step 3: Implement** `post_molt_pause.py`, then in `compute_feeding_status`: one grouped query for `max(fed_at)` over all logs (only when any owner has the refusal switch), one query for each animal's newest molt (matching `invert_id` OR `tarantula_id` like `utils/legacy_logs.py::tarantula_logs`, taking `molted_at` and `feeding_pause_days`; only when any owner has the molt switch), `load_feeding_rules` for the distinct `inv.user_id`s; overdue uses `last_offered` when the owner's switch is on; a non-null `post_molt_pause_until` (only when the owner's switch is on and no keeper pause) forces `is_overdue=False` and `needs_first_feeding=False`. Keep the queries batched (no N+1).
- [ ] **Step 4: Run** the new file → PASS; then `tests/test_first_feeding_rule.py tests/test_day_one_reminders.py tests/test_legacy_tarantula_logs.py` → PASS.
- [ ] **Step 5: Commit** `feat(api): refusal restart and post-molt pause in the one due rule`.

### Task 3: Per-animal reminders and the reminder-action endpoint

**Files:**
- Create: `apps/api/app/services/reminder_pushes.py`
- Modify: `apps/api/app/utils/push_notifications.py` (`send_notification(..., category_id: Optional[str] = None)` → `message["categoryId"]`), `app/services/notification_service.py` (`create_notification(..., push_category_id: Optional[str] = None)` passed through), `app/services/digest_service.py`, `app/routers/feedings.py` (reminder-action route next to `create_invert_feeding_log`, reusing its body via an extracted helper `_create_invert_feeding(db, invert, data, current_user, reminder_date=None) -> FeedingLog`)
- Test: `apps/api/tests/test_reminder_actions.py`, `apps/api/tests/test_reminder_pushes.py`

**Interfaces:**
- Consumes: Task 2 status fields and `load_feeding_rules`; Task 1 `reminder_date`, `reminder_snoozed_until`, `smart_reminders_enabled`.
- Produces:
  - `reminder_pushes.ReminderPush` (dataclass: `title, body, deeplink, data: dict, category_id: Optional[str]`); `ago_phrase(days: int) -> str`; `plan_reminder_pushes(due: list[InvertFeedingStatusItem], hv_due: int, smart_on: bool, reminder_date: date, summary_body: str) -> list[ReminderPush]` — per-animal when `smart_on and 1 <= len(due) <= 3 and hv_due == 0`, else one summary (`categoryId "feeding_summary"` only when `smart_on`, deeplink `/feeding-day`, data `{"overdue": n}`).
  - Per-animal push: title = name or common or scientific name, body per Global Constraints, deeplink `/invert/{id}`, data `{"type": "feeding_due", "invert_id": str, "reminder_date": "YYYY-MM-DD"}`, `category_id "feeding_due"`.
  - `POST /api/v1/inverts/{invert_id}/reminder-action` body `ReminderActionRequest {action: Literal["fed","refused","tomorrow"], reminder_date: date}` → `ReminderActionResponse {action, created: bool, animal_name: str, message: str}`; `@policy("logger")`, `@limiter.limit("60/hour", key_func=user_or_ip)`.

- [ ] **Step 1: Write failing tests** — pushes: `test_one_to_three_due_get_one_each` (bodies for last ate / last offered / never fed; `ago_phrase(0)=="today"`, `(1)=="1 day ago"`, `(5)=="5 days ago"`), `test_four_due_get_summary_with_button`, `test_hv_due_forces_summary`, `test_switch_off_is_todays_push` (no category, today's body), `test_snoozed_animal_skipped_from_pushes` (digest run: snoozed until tomorrow → not pushed, still counted due elsewhere), `test_category_id_reaches_expo_payload` (monkeypatch `PushNotificationService.send_notification`, assert `category_id`). Actions: `test_fed_creates_accepted_log_with_last_food`, `test_refused_creates_refusal`, `test_second_tap_returns_existing` (same date, `created False`, message "Already logged from this reminder", one row), `test_unique_index_blocks_race` (insert a row with the same `(invert_id, reminder_date)` directly, then call → existing returned, no 500), `test_tomorrow_sets_snooze` (`reminder_snoozed_until == local_today + 1`, no log), `test_closed_animal_409`, `test_stranger_404`, `test_co_keeper_logger_allowed`, `test_rate_limited_route` (static: the route carries `@limiter.limit("60/hour"`).
- [ ] **Step 2: Run** both files → FAIL.
- [ ] **Step 3: Implement** the helper module, push plumbing, digest switch (read `prefs.smart_reminders_enabled`; filter snoozed for per-animal only; one `create_notification` per planned push), and the endpoint (fed/refused copy food_type/food_size from the latest accepted feeding; `notes = "Logged from reminder"`; insert inside a savepoint and on `IntegrityError` return the existing row).
- [ ] **Step 4: Run** both files + `tests/test_day_one_reminders.py tests/test_tv_closed_inverts.py` → PASS.
- [ ] **Step 5: Commit** `feat(api): per-animal reminders with Fed/Refused/Tomorrow actions`.

### Task 4: Mobile — helpers, notification buttons, settings

**Files:**
- Create: `apps/mobile/src/lib/reminder-actions.ts`, `src/lib/__tests__/reminder-actions.test.ts`, `src/lib/post-molt.ts`, `src/lib/__tests__/post-molt.test.ts`, `src/components/ReminderToast.tsx`, `src/services/reminder-notifications.ts`
- Modify: `apps/mobile/app/_layout.tsx` (mount a `ReminderBridge` + `ReminderToast`), `app/settings/notifications.tsx` (three switches + group)

**Interfaces:**
- Consumes: Task 3 endpoint + push data; Task 1 prefs fields.
- Produces:
  - `reminder-actions.ts`: `type ReminderAction = 'fed' | 'refused' | 'tomorrow'`; `actionFromIdentifier(id: string): ReminderAction | null` (button ids `fed`, `refused`, `tomorrow`; `open_feeding_day` → null); `toastFor(result: {message: string} | null, error?: string): string`.
  - `post-molt.ts`: `pauseUntil(moltedOn: string /*YYYY-MM-DD*/, days: number | null): string | null`; `pauseLabel(until: string | null): string | null` → `Paused after molt · until Nov 24`; `moltFormLine(until: string): string` (exact copy).
  - `reminder-notifications.ts`: `registerReminderCategories(): Promise<void>` (categories `feeding_due` [fed, refused, tomorrow], `feeding_summary` [open_feeding_day], all `opensAppToForeground: true`; wrapped in try/catch); `handleNotificationResponse(response, deps: {post, navigate, showToast, isSignedIn}): Promise<void>` (button → POST action + toast; `open_feeding_day` → `/feeding-day`; body tap → `resolveDeeplink(data.deeplink)`; signed out → navigate only, never post).
  - `ReminderToast`: `showReminderToast(text: string)` module-level emitter + component (themed, top of screen, 3 s).

- [ ] **Step 1: Write failing jest tests** for every exported helper above, incl. `handleNotificationResponse` with fake deps: fed → POSTs `{action:'fed', reminder_date}` and toasts the server message; signed out → no POST; server 409 → toasts its detail; body tap → navigates to `/invert/<id>`.
- [ ] **Step 2: Run** jest for the two files in the JS mirror (`bash env/bootstrap.sh mirror`, `install-N` until "INSTALL COMPLETE", then `bash env/js-sync.sh` and `npx jest src/lib/__tests__/reminder-actions.test.ts src/lib/__tests__/post-molt.test.ts` in the mirror's `apps/mobile`) → FAIL.
- [ ] **Step 3: Implement** the helpers, the service, `ReminderBridge` (registers categories once, subscribes `addNotificationResponseReceivedListener`, and processes `getLastNotificationResponseAsync()` once on cold start), the toast, and the settings switches (PUT on toggle, optimistic with revert on error, Global Constraints copy).
- [ ] **Step 4: Run** jest (all) + `tsc --noEmit` + `node scripts/check-design-tokens.js` → PASS.
- [ ] **Step 5: Commit** `feat(mobile): reminder buttons, toast, settings switches`.

### Task 5: Mobile — molt form line and paused-after-molt labels

**Files:**
- Modify: `apps/mobile/app/invert/add-molt.tsx`, `app/tarantula/add-molt.tsx`, `app/(tabs)/collection.tsx`, `app/feeding-day.tsx`, `app/invert/[id].tsx`, `src/lib/inverts.ts` (status type gains `last_offered_date`, `post_molt_pause_until`)

**Interfaces:**
- Consumes: Task 2 `GET /inverts/{id}/post-molt-pause`, `feeding_pause_days`, status fields; Task 4 `post-molt.ts`.

- [ ] **Step 1: Extend** `post-molt.test.ts` with `test('override wins: 0 → no line, 21 → 21 days')` for a `effectivePauseDays(defaultDays, override)` helper (add it to `post-molt.ts`) → FAIL.
- [ ] **Step 2: Implement** the helper; molt forms fetch the endpoint once, show `moltFormLine` only when `enabled && default_days`, `Change` opens a date pick / `Don't pause` (sends `feeding_pause_days`); labels render `pauseLabel(post_molt_pause_until)` with the existing paused styling wherever the keeper-pause pill shows, never the overdue style.
- [ ] **Step 3: Run** jest + tsc + token gate → PASS; manual check light + dark in the simulator notes.
- [ ] **Step 4: Commit** `feat(mobile): post-molt pause in molt forms and labels`.

### Task 6: Web — settings, molt form, labels

**Files:**
- Create: `apps/web/src/lib/postMolt.ts`, `apps/web/tests/postMolt.test.mts`
- Modify: `apps/web/src/app/dashboard/settings/notifications/page.tsx`, `app/dashboard/inverts/[id]/add-molt/page.tsx`, `src/components/InvertFeedingStatus.tsx`, `app/dashboard/feeding-day/page.tsx`, `app/dashboard/tarantulas/page.tsx`, `app/dashboard/inverts/[id]/page.tsx`

**Interfaces:**
- Consumes: Tasks 1–2 API; produces `postMolt.ts` with the same exports as mobile `post-molt.ts` (`pauseUntil`, `pauseLabel`, `moltFormLine`, `effectivePauseDays`).

- [ ] **Step 1: Write failing node tests** for the four helpers (same cases as mobile).
- [ ] **Step 2: Run** `node --test apps/web/tests/postMolt.test.mts` → FAIL.
- [ ] **Step 3: Implement** helpers; settings "Feeding reminders" group with three switches (Global Constraints copy, dark mode); molt form line + Change; labels.
- [ ] **Step 4: Run** node tests + web `tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(web): effortless-logging settings, molt pause line, labels`.

### Task 7: What's new, measurement report, docs, full verification

**Files:**
- Create: `apps/api/report_reminder_logging.py`, `apps/api/tests/test_report_reminder_logging.py`
- Modify: `apps/api/app/content/whats_new.json`, `CLAUDE.md`

- [ ] **Step 1: Write failing test** — `test_report_counts` on a fixture: feedings with notes "Logged from reminder" counted per switch state; keepers with each switch on; 30-day logging retention split by `smart_reminders_enabled`; the script opens no write transaction (asserts it uses a read-only session / `SET TRANSACTION READ ONLY`).
- [ ] **Step 2: Implement** the script (`--csv` flag like `report_activation.py`), the What's new entry (`id "2026-11-16-smarter-reminders"`, `published_on "2026-11-16"` — a Monday not yet live; title `Smarter feeding reminders`; body `Get a reminder for each due animal with Fed and Refused buttons, let a refusal restart the wait, and pause reminders after a molt. Turn them on in Settings.`; `premium false`; action `{label "Turn them on", target "settings"}`), and a CLAUDE.md bullet describing switches/defaults, the rule, the endpoint and the report.
- [ ] **Step 3: Run** the full API suite (`run-suite.sh 0..3`), mobile jest + tsc + token gate, web tsc + node tests, `tests/test_whats_new.py` → all PASS.
- [ ] **Step 4: Commit** `docs: effortless logging, What's new, report`.
