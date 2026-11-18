# Herpetoverse day one + smart reminders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Herpetoverse (HV) Tarantuverse's (TV) first-day experience and smart feeding reminders on one shared due-date rule, with notifications reaching the right app.

**Architecture:** A pure due-date core (`services/feeding_rule.py`) is extracted from TV's `compute_feeding_status`; TV's loader and a new HV loader both call it. Push addresses become per-app rows; every notification is routed by app. HV clients mirror TV's day-one and reminder pieces. Two release steps: Step 1 = Tasks 1–6, Step 2 = Tasks 7–10.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic + pytest (apps/api); Next.js 14 + Tailwind (apps/web-herpetoverse, apps/web); Expo Router + jest-expo (apps/mobile-herpetoverse, apps/mobile).

**Spec:** `docs/superpowers/specs/2026-11-17-hv-day-one-and-smart-reminders-design.md` (read it first; §5 calls 1–12 are binding).

## Global Constraints

- TV behaviour must not change: every existing TV feeding/digest/reminder test passes unmodified (list in Task 2).
- Plant-eaters: linked species `diet_type == "herbivore"` → no interval (never due/overdue, no reminders) unless `animals.feeding_interval_days` is set. Unlinked species = no change.
- No pause around sheds. Brumation, keeper pause, died/transferred behave exactly as today.
- HV first-feeding cutoff constant `HV_FIRST_FEEDING_DUE_FROM = date(2026, 11, 18)` (the planned Step 1 API deploy; animals created before it never turn due while never-fed). TV keeps `FIRST_FEEDING_DUE_FROM = date(2026, 10, 28)`.
- Apps are named exactly `tarantuverse` and `herpetoverse`.
- Push addresses: one per (user, app). Register without `app` = `tarantuverse`. Sending picks the notification's app; if the account has only the other app's address, use that. Social (DM, follow, forum) = tarantuverse.
- Existing addresses on migration: account with HV animals and no inverts → herpetoverse; otherwise tarantuverse.
- Email: one email per app with something due, own once-a-day guard per app, both count toward `DIGEST_EMAIL_DAILY_CAP`; HV email uses `HERPETOVERSE` brand + `https://herpetoverse.com` links (`/app/feeding-day`, `/app/settings/notifications`, `/unsubscribe/<token>`).
- Smart-reminder switches: one set per account. Step 2 backfills `smart_reminders_enabled` and `refusal_restarts_wait` ON for accounts with HV animals and no inverts; others unchanged.
- Reminder "Fed" copies `food_type`/`food_size` from the animal's most recent ACCEPTED meal (not `prey_weight_g`); "Refused" logs no prey.
- HV per-animal deeplink: `/reptile/<id>` (mobile route); HV web maps it to `/app/reptiles/<id>`.
- Copy mirrors TV (`FIRST_FEEDING_COPY`, reminder copy), with "Herpetoverse" where TV says the product name; no emoji.
- Repo rules: no git writes by agents; API tests via `with-pg.sh`; JS checks in the mirror after `js-sync.sh`; never install into the repo; web dark-mode classes on new elements (HV web is dark-first — follow its existing classes); mobile theme colours only; no new native modules (OTA-safe; `expo-notifications` is already a plugin in both apps).

## Review Focus

1. A TV keeper's due/overdue results, digest text and per-animal pushes are byte-for-byte what they were — Task 2 runs the full TV feeding test list unchanged.
2. An old HV app (before its OTA) re-registers its push address without `app`; an HV-only keeper must still get HV reminders on their phone — Task 1 `test_old_client_without_app_still_reaches_hv_only_keeper`.
3. Release day: never-fed HV animals created before the cutoff must not appear as due anywhere (dashboard, Feeding Day, digest) — Task 2 `test_hv_never_fed_before_cutoff_never_due_anywhere`.
4. A uromastyx with no keeper interval never shows due; with a keeper interval of 2 it does — Task 2 `test_herbivore_no_schedule_unless_keeper_interval`.
5. Two taps (or two phones) on the same HV reminder log one feeding — Task 7 `test_hv_reminder_action_idempotent`.

---

## Step 1 — notifications to the right app + day one

### Task 1: Per-app push addresses and routing

**Files:**
- Create: `apps/api/alembic/versions/pta_20261118_push_tokens_per_app.py` (down_revision `pmv_20261117_premolt_v2`), `apps/api/app/models/push_token.py`, `apps/api/app/services/push_tokens.py`
- Modify: `apps/api/app/models/__init__.py`, `routers/notification_preferences.py` (push-token POST/DELETE take `app`), `schemas/notification_preferences.py` (`PushTokenBody.app`), `services/notification_service.py::create_notification` (new `app` param), callers: `routers/direct_messages.py`, `routers/follows.py`, `routers/forums.py`, `routers/sitter_passes.py` (`_notify_sitter_log`, `_notify_fed_while_paused`, `_notify_locked` — app from the pass target: HV animal → herpetoverse, else tarantuverse), `routers/transfers.py` (animal → herpetoverse; colony/invert → tarantuverse), `routers/collection_members.py::_notify` (`CollectionMember.app`)
- Client one-liners: `apps/mobile/src/services/notifications.ts::registerPushToken` sends `app: 'tarantuverse'`; HV is done in Task 4.
- Test: `apps/api/tests/test_push_tokens_per_app.py`

**Interfaces (Produces):**
- Table `push_tokens`: `id` UUID PK, `user_id` FK users CASCADE, `app` String(20) CHECK in (tarantuverse, herpetoverse), `token` String(255) not null, `updated_at`; UNIQUE (user_id, app).
- `push_token_for(db, user_id, app: str) -> Optional[str]` (own app's token, else the other app's, else legacy `notification_preferences.expo_push_token`, else None); `set_push_token(db, user_id, app, token)`; `clear_push_token(db, user_id, app)`.
- `create_notification(..., app: Optional[str] = None)`; `None` = tarantuverse. The send path uses `push_token_for`. The legacy column keeps being written for tarantuverse registrations (old code paths and GET responses keep working).
- Migration: create table; copy every non-null `notification_preferences.expo_push_token` into `push_tokens` with app by the Global Constraints rule; downgrade drops the table.

- [ ] **Step 1: Failing tests** (`requires_postgres`): register with app herpetoverse/tarantuverse stores two rows; register without app → tarantuverse; DELETE with app clears only that app; `create_notification(app="herpetoverse")` sends to the HV token (monkeypatch `PushNotificationService.send_notification` to record calls); TV notification for an account with only an HV token goes to the HV token; DM/follow/forum route with app tarantuverse; sitter log on an HV animal pass routes herpetoverse; migration attribution helper (test the SQL/function on seeded rows: HV-only account → herpetoverse, mixed → tarantuverse); `test_old_client_without_app_still_reaches_hv_only_keeper` (HV-only keeper's HV row deleted, old client re-registers without app → HV digest push still delivered to that token).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, `alembic upgrade head` on the test DB, check downgrade/upgrade. **Step 4: Run** new file + `test_access_policies.py`, `test_day_one_reminders.py`, `test_reminder_pushes.py`, sitter/transfer/collection-member test files (grep) → PASS.
- [ ] **Step 5: Snapshot.**

### Task 2: Shared due-date core + HV loader + herbivore rule

**Files:**
- Create: `apps/api/app/services/feeding_rule.py`, `apps/api/app/services/animal_feeding_status.py`
- Modify: `services/feeding_status.py` (TV loader calls the core), `routers/animals.py` (`_animal_feeding_interval` herbivore step; `list_feeding_status` uses the HV loader), `routers/weight_logs.py` (per-animal `status` verdict from the core: `overdue`/`due`/... consistent with the board; keep the window fields), `services/digest_service.py::_animal_overdue_count` (via the HV loader), `schemas/animal.py::AnimalFeedingStatusItem` (+ `needs_first_feeding: bool = False`, `days_since_baseline: Optional[int]`, `last_offered_date: Optional[date]`, `no_schedule: bool = False`), `routers/sitter_passes.py` HV card interval (if it reads `_animal_feeding_interval`, it inherits the herbivore rule — fine)
- Test: `apps/api/tests/test_feeding_rule_core.py`, `apps/api/tests/test_hv_feeding_status.py`

**Interfaces (Produces):**
- `feeding_rule.decide(*, last_accepted: Optional[date], last_offered: Optional[date], baseline: date, interval_days: Optional[int], paused: bool, today: date, created_local: date, cutoff: date, refusal_restarts_wait: bool, has_any_log: bool, post_pause_until: Optional[date] = None) -> FeedingDecision` (frozen dataclass: `is_overdue`, `days_since_last_feeding`, `needs_first_feeding`, `days_since_baseline`, `wait_from: Optional[date]`). Pure — exactly the arithmetic now inline in `compute_feeding_status` lines 241–297 (post-molt forcing included via `post_pause_until`).
- `animal_feeding_status.compute_animal_feeding_status(db, animals: List[Animal], tz_offset_minutes: Optional[int]) -> List[AnimalFeedingStatusItem]` — batch loads (last accepted, last offered, any-log, owner rules via `feeding_status.load_feeding_rules`), interval via `_animal_feeding_interval` (lazy import), paused = keeper pause (`utils/feeding_pause.is_feeding_paused`) OR `brumation_active`, cutoff `HV_FIRST_FEEDING_DUE_FROM`, baseline = later of owner-local created day and `date_acquired`; fills existing fields (`status_mode`, `fed_today`, `is_brumating`, `feeds_on_cgd`, `interval_days`) as today plus the new ones; `no_schedule = interval is None and species diet_type == "herbivore" and not keeper interval`.
- `_animal_feeding_interval`: after the keeper-interval branch, `if species and species.diet_type == "herbivore": return None`.
- `HV_FIRST_FEEDING_DUE_FROM = date(2026, 11, 18)` in `animal_feeding_status.py` (read at call time so tests can monkeypatch).

- [ ] **Step 1: Failing tests:** core unit tests (fed / never-fed after & before cutoff / refusal restart / pause / post-pause / interval None); HV: `test_hv_never_fed_before_cutoff_never_due_anywhere` (board, per-animal status, digest count), `test_hv_never_fed_after_cutoff_due_after_interval` (+ `needs_first_feeding` before then), `test_herbivore_no_schedule_unless_keeper_interval` (U. geyri-linked: `no_schedule`, never overdue; keeper interval 2 → overdue on day 2), `test_brumation_and_pause_unchanged`, `test_board_and_detail_and_digest_agree` (same animal, same verdict on all three), refusal restart with the switch on/off for HV.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** new files + every TV file: `test_first_feeding_rule.py`, `test_effortless_rules.py`, `test_day_one_reminders.py`, `test_analytics_collection_v2.py`, `test_egg_sac_hatch_split.py`, `test_feeding_mode_fallback.py`, `test_import_last_fed.py`, `test_premolt_v2.py`, `test_reminder_pushes.py`, `test_active_lists_and_keeper_profiles.py`, plus HV `test_hv_audit2_animals.py`, `test_hv_collection_status.py`, `test_herpetoverse_sprint3.py`, `test_seed_herp_uromastyx.py`, sitter-pass tests → PASS with no TV test edits.
- [ ] **Step 5: Snapshot.**

### Task 3: Digest + email per app, HV importer last-fed

**Files:**
- Modify: `services/digest_service.py` (per app: TV items + HV items each → their own summary push with `app=`; Step 2 adds per-animal HV), `services/digest_email.py` (`DigestEmail.app`; `_build` by app: brand/origin/links; HV names from HV due items), `models/notification_preferences.py` + migration `pta_...` OR a new one `hve_20261118_hv_email_guard` (down_revision = Task 1's) adding `email_digest_last_sent_on_hv` (Date), `routers/notification_preferences.py` (GET `email-unsubscribe` accepts `?app=herpetoverse` → redirect to `https://herpetoverse.com/unsubscribe/<token>`), `services/import_service.py` (HV `last_fed` field + exact synonyms as TV; add TV's no-loose-match guard to `suggest_animal_mapping` for `last_fed`), `routers/import_export.py::_import_commit_animals` (pop `last_fed`, write one accepted feeding at 12:00 UTC via an `animal_id` twin of `_add_imported_feeding`; `only_if_newer` on update), `utils/frontend_origin.py` if a helper is needed
- Test: `apps/api/tests/test_hv_digest_email.py`, `apps/api/tests/test_hv_import_last_fed.py`

**Interfaces:** Consumes Task 1 `create_notification(app=)`, Task 2 `compute_animal_feeding_status`. Produces `DigestEmail.app: str = "tarantuverse"`.

- [ ] **Step 1: Failing tests:** keeper with TV+HV due gets two summary pushes (TV to TV token, HV to HV token) and two emails; HV email subject/body name HV animals, HV origin links, HV brand colour, `List-Unsubscribe` URL carries `app=herpetoverse`; HV once-a-day guard independent of TV's; cap counts both; HV-only keeper's digest = HV summary only; GET email-unsubscribe with app redirects to HV; TV email output unchanged (snapshot of subject/links); importer: HV `last_fed` writes one accepted feeding at noon UTC, bad/future → row error, other rows import, "last feeding" header no longer maps to `feeding_schedule`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** new files + `test_day_one_reminders.py`, `test_reminder_pushes.py`, `test_import_last_fed.py`, importer tests (grep `import_`) → PASS.
- [ ] **Step 5: Snapshot.**

### Task 4: HV mobile — welcome, notification ask, add-form chips, first-feeding card

**Files (apps/mobile-herpetoverse):**
- Create (mirroring TV `apps/mobile` files of the same names, HV wording): `src/lib/onboarding.ts`, `app/onboarding.tsx`, `src/lib/notification-ask.ts`, `src/components/NotificationAskSheet.tsx`, `src/lib/first-feeding.ts`, `src/components/FirstFeedingCard.tsx`, tests `src/lib/__tests__/onboarding.test.ts`, `notification-ask.test.ts`, `first-feeding.test.ts` (follow `expense-form.test.ts`'s `@jest/globals` pattern)
- Modify: `src/services/notifications.ts` (add `getPermissionStatus()`; `getExpoPushToken()` must NOT prompt; add `registerPushToken()` = only when granted, POST `/notification-preferences/push-token` `{token, tz_offset_minutes, app: 'herpetoverse'}`), `src/contexts/AuthContext.tsx` (effect calls `registerPushToken()`, never prompts), `app/register.tsx` + `app/login.tsx` + `app/index.tsx` (post-auth route via `resolvePostAuthRoute`, keeping `takePostAuthRoute()` claim precedence), `app/reptile/add.tsx` ("When did it last eat?" chips — hidden when the picked species is herbivore and no interval is entered; after create POST `/animals/{id}/feedings` `{fed_at, accepted: true}` non-fatal; then `maybeAskAfterSave`), `app/(tabs)/dashboard.tsx` (FirstFeedingCard from `needs_first_feeding` rows, ≤3; `maybeAskWhenDue(anyDue)`), `src/lib/animals.ts` (`AnimalFeedingStatus` + new fields), `app/feeding-day.tsx` (pill "No schedule" when `no_schedule`, before the never-fed branch; not in Overdue/Never-fed filters), `app/notification-preferences.tsx` (daily digest + hour, email reminder switch disabled while digest off, banner "Open phone settings" when denied — mirror TV settings), `src/components/LogFeedingScreen` untouched
- Test: jest files above

- [ ] **Step 1:** Write lib tests first (RED), then libs, then screens.
- [ ] **Step 2: Verify** js-sync → `cd /tmp/tv/repo/apps/mobile-herpetoverse && node_modules/.bin/tsc --noEmit -p . && CI=true node_modules/.bin/jest`; TV mobile `tsc` (registerPushToken change) → PASS.
- [ ] **Step 3: Snapshot.**

### Task 5: HV web — chips, card, email ask, timezone, unsubscribe, settings

**Files (apps/web-herpetoverse):**
- Create (mirroring TV `apps/web`): `src/lib/firstFeeding.ts` (+ `tests/firstFeeding.test.mts`), `src/components/FirstFeedingCard.tsx`, `src/components/EmailReminderDialog.tsx`, `src/components/LastFedField.tsx`, `src/components/TimezoneSync.tsx`, `src/app/unsubscribe/[token]/page.tsx` (button-press only; POST `/api/v1/notification-preferences/email-unsubscribe?token=` with `referrerPolicy: 'no-referrer'`), `src/components/DashboardFeedingNudge.tsx` (client component on `app/app/page.tsx`: fetch `listAnimalFeedingStatus(tz)`, render FirstFeedingCard for `needs_first_feeding`, open EmailReminderDialog `due` variant per TV rules)
- Modify: `src/app/app/page.tsx` (mount the nudge), `components/AppShell.tsx` (mount TimezoneSync), `src/app/app/reptiles/add/page.tsx` (LastFedField; hidden for herbivore species without an interval; after-save email ask), `src/app/app/feeding-day/page.tsx` ("No schedule" pill), `src/app/app/settings/notifications/page.tsx` (email reminder switch, disabled while digest off), `src/lib/animals.ts` (new status fields), `next.config.js` (`/unsubscribe/:token*`: `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, `Cache-Control: private, no-store`), `public/robots.txt` (`Disallow: /unsubscribe/` in both groups), `components/PostHogProvider.tsx` + `components/SafeAnalytics.tsx` (exclude `/unsubscribe/`), `src/lib/deeplinks.ts` (no change in Step 1)
- [ ] **Step 1:** firstFeeding lib test first (RED), then implement.
- [ ] **Step 2: Verify** js-sync → `cd /tmp/tv/repo/apps/web-herpetoverse && node_modules/.bin/tsc --noEmit -p . && node --test --experimental-strip-types tests/*.test.mts` + `next lint --file` on touched files → PASS.
- [ ] **Step 3: Snapshot.**

### Task 6: Step 1 docs + What's new + verification

**Files:** `apps/api/app/content/whats_new.json` (herpetoverse entry dated the next Monday after Step 1 is live — use `2026-11-23` unless the release slips; title ≤60, body ≤220, e.g. new animals ask when they last ate, reminders for animals never fed yet, an optional daily reminder email; plant-eaters like uromastyx aren't nagged unless you set a schedule; compact one-line `action`, target `feeding_day`), `CLAUDE.md` bullet "HV day one (2026-11-17)" (push_tokens + routing rule + migration attribution, shared core + HV loader + cutoff, herbivore rule, per-app email + guard + HV unsubscribe, importer, client files).
- [ ] **Step 1:** Entry + bullet; `test_whats_new.py` + `test_whats_new_targets_in_sync.py` PASS.
- [ ] **Step 2: Full verification:** API `run-suite.sh 0..3`; HV web tsc + node tests; TV web tsc; HV mobile tsc + jest; TV mobile tsc + jest + token gate; `check:bundle` for HV mobile and TV mobile → all PASS.
- [ ] **Step 3: Snapshot.**

## Step 2 — smart reminders

### Task 7: HV reminder action, snooze, per-animal pushes

**Files:**
- Create: migration `hvr_20261118_hv_reminders` (down_revision = the last Step 1 migration): `animals.reminder_snoozed_until` Date; unique partial index `uq_feeding_logs_reminder_animal` on (`animal_id`, `reminder_date`) WHERE `reminder_date IS NOT NULL`; backfill `smart_reminders_enabled = true, refusal_restarts_wait = true` for prefs rows of accounts with HV animals and no inverts.
- Modify: `models/animal.py`, `models/feeding_log.py` (index in `__table_args__`), `routers/feedings.py` (`POST /animals/{animal_id}/reminder-action`: `@limiter.limit("60/hour", key_func=user_or_ip)`, `@policy("logger")`, `load_animal(..., "logger")`, `refuse_if_closed`; tomorrow → `reminder_snoozed_until = owner_today + 1`; fed/refused → one `FeedingLog(animal_id=…, reminder_date=…, notes=REMINDER_NOTE, accepted=…)`, fed copies prey from the latest accepted meal, refused no prey; `resume_if_accepted`; savepoint + IntegrityError → existing log; same `ReminderActionResponse`), `services/reminder_pushes.py` (generalise: `plan_reminder_pushes(due_items, smart_on, reminder_date, summary_body, *, id_key: str, deeplink_prefix: str, snoozed_ids, tz_offset_minutes, now, other_due: int = 0)` — TV call keeps `id_key="invert_id"`, `"/invert/"` and its current `hv_due` semantics so TV output is unchanged; HV call `id_key="animal_id"`, `"/reptile/"`), `services/digest_service.py` (HV: plan per-animal pushes with `app="herpetoverse"` using HV due items and HV snoozes), `services/notification_service.py` (`TYPE_DEEPLINK_PATTERNS["feeding_due"]` also allows `^/reptile/[0-9a-fA-F-]+$`), `report_activation.py` + `report_reminder_logging.py` (`--app tarantuverse|herpetoverse`, default tarantuverse = current output)
- Test: `apps/api/tests/test_hv_reminders.py` (+ existing TV reminder tests unchanged)

- [ ] **Step 1: Failing tests:** `test_hv_reminder_action_idempotent` (two taps, refused after fed → one log, first outcome wins); fed copies prey type/size not weight; refused no prey; tomorrow snoozes and the digest skips that animal; roles (logger ok, viewer 403, stranger 404, died 409); HV keeper with 1–3 due + switch on → per-animal pushes on the HV token with category `feeding_due`, data `animal_id`, deeplink `/reptile/<id>`; >3 → HV summary; TV+HV keeper → TV plan unchanged + HV plan separate; switch backfill applied only to HV-only accounts; reports `--app herpetoverse` count HV rows.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, upgrade/downgrade the test DB. **Step 4: Run** new file + `test_reminder_pushes.py`, `test_reminder_actions.py`, `test_day_one_reminders.py`, `test_effortless_rules.py`, `test_report_reminder_logging.py`, `test_report_activation*.py`, `test_tv_closed_inverts.py` / `test_hv_closed_*` (add the route to the HV closed-route list if one exists), `test_access_policies.py` → PASS.
- [ ] **Step 5: Snapshot.**

### Task 8: HV mobile reminders

**Files (apps/mobile-herpetoverse):** Create `src/services/reminder-notifications.ts`, `src/lib/reminder-actions.ts`, `src/components/ReminderToast.tsx` (+ jest tests mirroring TV's), mirroring TV with `data.animal_id` and POST `/animals/{id}/reminder-action`; modify `app/_layout.tsx` (ReminderBridge: `registerReminderCategories()`, response listener, cold-start `getLastNotificationResponseAsync`, `ReminderToast` mounted), `src/lib/deeplinks.ts` (`/reptile/<id>` passthrough), `app/notification-preferences.tsx` ("Feeding reminders" group: "Reminders for each animal" (disabled while digest off) + "A refusal restarts the wait"; no post-molt switch).
- [ ] **Step 1:** Tests first (RED), then implement.
- [ ] **Step 2: Verify** HV mobile tsc + jest → PASS.
- [ ] **Step 3: Snapshot.**

### Task 9: HV web reminders settings + deeplink

**Files (apps/web-herpetoverse):** `src/app/app/settings/notifications/page.tsx` (same two switches, smart reminders locked while digest off), `src/lib/deeplinks.ts` (`/reptile/<id>` → `/app/reptiles/<id>`) + a node test for the mapping.
- [ ] **Step 1: Verify** tsc + node tests + lint → PASS. **Step 2: Snapshot.**

### Task 10: Step 2 docs + What's new + verification + final review

**Files:** `whats_new.json` (herpetoverse entry for per-animal reminders with Fed / Refused / Tomorrow, dated the next Monday after Step 2 is live — `2026-11-30` unless it slips; free; target `settings`), `CLAUDE.md` bullet "HV smart reminders (2026-11-17)".
- [ ] **Step 1:** Entry + bullet; whats_new tests PASS.
- [ ] **Step 2: Full verification** as Task 6 Step 2 → PASS.
- [ ] **Step 3: Snapshot**, then the final whole-branch review.
