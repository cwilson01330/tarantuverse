# Effortless logging — design

Date: 2026-11-10 · Status: approved in conversation (sections 1–6), awaiting spec review
Product: Tarantuverse (TV). Herpetoverse (HV) is out of scope except where noted.

## 1. Why

Production data (2026-11-10, Neon, test/merged/inactive accounts excluded):

- 71 signups in 30 days, 44 (62%) added an animal — activation is working.
- Of 180 accounts older than 60 days, **16 (9%)** logged a TV feeding in the last 30 days — retention is the problem.
- Keepers who stop say logging became a chore; the ones who keep going log mainly meals, refusals and molts (research: `docs/research/2026-10-27-feature-research.md`, opportunities #2 and #3).

Goal: logging the things that matter takes one tap, and reminders stop nagging when nothing is wrong (after a refusal, right after a molt).

Cory's constraints (stated):

- **Some keepers like the current flow.** Nothing changes for an existing keeper unless they turn it on.
- Two stages: stage 1 ships by OTA (no store build); stage 2 (widget, background buttons) waits for the next store build and starts with a feasibility spike.

Success: keepers with the switches on log more of their feedings from reminders, and their 30-day logging retention beats keepers without them (section 9).

## 2. Scope

**Stage 1 (this spec's implementation plan):**

1. Three per-keeper switches with "new keepers on, existing keepers off" defaults.
2. Refusal restarts the wait (switch).
3. Automatic feeding pause after a molt, by taxon + life stage, overridable per molt (switch).
4. Per-animal reminders with Fed / Refused / Tomorrow buttons when 1–3 TV animals are due; today's summary (plus an Open Feeding Day button) otherwise (switch).
5. Settings UI (mobile + web), molt-form copy, paused-after-molt labels, What's new entry, measurement report.

**Stage 2 (outline only, section 8):** home-screen widget, background (no-open) notification actions. Own spike + plan.

**Non-goals:** HV rule changes, streaks/XP, changing how anything works for a keeper whose switches are off, changing the summary text, changing premolt prediction.

## 3. Switches and defaults

New columns on `notification_preferences` (migration `eff_20261110_effortless_logging`):

| column | type | meaning |
|---|---|---|
| `smart_reminders_enabled` | bool NOT NULL | per-animal reminders with buttons |
| `refusal_restarts_wait` | bool NOT NULL | a refused meal restarts the due countdown |
| `post_molt_pause_enabled` | bool NOT NULL | automatic feeding pause after a molt |

- Migration: `server_default false`, so **every existing row is off** (existing keepers keep today's behaviour exactly).
- `services/notification_prefs.py::ensure_notification_preferences` creates new rows with all three **true**. Every account already has a row (day-one backfill), so in practice only accounts created after release get `true`.
- Exposed on `GET/PUT /notification-preferences/` (schemas updated, partial updates as today).
- The rule reads the **collection owner's** switches, so co-keepers and sitters see the same due list as the owner.

Copy (settings, mobile + web, group "Feeding reminders"):

- **Reminders for each animal** — "When 1–3 animals are due, get a reminder for each with Fed, Refused and Tomorrow buttons. With more due, you get one summary."
- **A refusal restarts the wait** — "A refused meal counts as an offer, so you're not reminded again until the next normal feeding time."
- **Pause after a molt** — "Feeding reminders pause for a few days after a logged molt while the fangs harden."

## 4. The due rule

All changes live in `services/feeding_status.py::compute_feeding_status` — the one rule Feeding Day, Analytics, collection badges, single-animal stats and the digest already share. The function gains the owner's switches (loaded once per owner; callers pass the owner id or the prefs). **With all switches off, output is identical to today** (test-pinned).

### 4.1 Refusal restarts the wait

- Switch on: the countdown runs from the latest feeding log of either kind (`max(fed_at)` over all logs). Switch off: from the latest accepted feeding, as today.
- `last_feeding_date` / `days_since_last_feeding` keep meaning "last meal" (UI labels unchanged). A new field `last_offered_date` carries the refusal-aware date; `is_overdue` uses it when the switch is on.
- Never-fed animals: a refusal is a log, so with the switch on the countdown runs from the refusal instead of the baseline. `needs_first_feeding` is unchanged.
- Premolt prediction is untouched (it reads refusals directly).

### 4.2 Post-molt pause

- Switch on: if the animal's newest molt (`molt_logs`, read via `invert_id` and the legacy tarantula link as `utils/legacy_logs.py` requires) has `molted_at` (keeper-local date) + window ≥ today, the animal is **paused after molt** until that date.
- Window = `molt_logs.feeding_pause_days` if set on that molt (0 = no pause), else the default table below by taxon + life stage. No entry → no automatic pause.
- A keeper-set pause (`feeding_paused_reason` / `feeding_paused_until`) always wins and keeps its own label.
- New status fields: `post_molt_pause_until` (date or null). While set: `is_overdue = false`, no nudge, no reminder; `is_feeding_paused` stays the keeper-pause flag (so existing "Paused" UI is unchanged) and clients show the new label from `post_molt_pause_until`.
- Back-dated molts: the window runs from the molt date, so a molt logged weeks late pauses nothing. Deleting the molt removes the pause (nothing is stored on the animal).

Default windows (`utils/post_molt_pause.py`, sources in comments; keeper rules of thumb — no veterinary standard exists, the copy says to check the fangs):

| taxon | sling | juvenile | adult |
|---|---|---|---|
| tarantula | 7 | 10 | 14 |
| scorpion | 4 | 7 | 7 |
| true_spider | 7 | 7 | 7 |
| mantis | 3 | 3 | 3 |
| all others | — | — | — |

Unknown life stage → the adult figure. Sources: Tarantula Heaven (adults ~10 days); a breeder blog (slings 1 week, larger 2 weeks); Arachnoboards threads (adults 7–14+, scorpions a few days to a week, check chelicerae are black); Mantid Forum (1–5 days); jumping spider guidance (live prey can injure for up to a week). URLs in the module.

### 4.3 Molt form

- New optional `feeding_pause_days` (int 0–60, null = default) on molt create/update schemas and `molt_logs` (same migration).
- Mobile + web molt forms (generic invert and tarantula), shown only when the owner's switch is on and the taxon has a default: "Feeding reminders pause until **Nov 24** — check the fangs are fully black before offering food." with **Change** → choose a date or "Don't pause" (stored as days; 0 = no pause).

### 4.4 Labels

Collection badge, Feeding Day row, animal detail: "Paused after molt · until Nov 24" using the existing paused styling (never the red overdue style). Mobile + web, light + dark.

## 5. Per-animal reminders (digest)

In `services/digest_service.py::run_feeding_digests`, at the keeper's digest hour, unchanged gating (enabled, active, hour, once per local day, quiet hours):

- Due set = today's items (owner's rule) minus animals whose `reminder_snoozed_until` ≥ the keeper's local today (per-animal pushes only; Feeding Day still lists them).
- **Switch on, 1–3 TV animals due, 0 HV animals due:** one notification per animal: title = animal name (fallback common/scientific name), body "Due for a meal · last ate 12 days ago" (or "· no meal logged yet" / "· last offered 9 days ago" when refusal-aware), deeplink `/invert/{id}`, data `{type: "feeding_due", invert_id, reminder_date}`, push `categoryId: "feeding_due"`.
- **Otherwise:** today's summary text; with the switch on it also carries `categoryId: "feeding_summary"` (Open Feeding Day button). Switch off: exactly today's push (no category).
- Each in-app notification row is created as today (one per push).

Push plumbing: `utils/push_notifications.py` / `create_notification` gain an optional `category_id` passed through as Expo's `categoryId`.

### 5.1 Reminder actions

`POST /api/v1/inverts/{invert_id}/reminder-action` body `{action: "fed" | "refused" | "tomorrow", reminder_date: "YYYY-MM-DD"}`:

- Access: the owner or a co-keeper with logging rights (existing scope helpers); 404 otherwise.
- `fed` / `refused`: closed animals → 409 with the existing messages (`utils/closed_animals.py`). Creates a feeding log through the same path as a normal invert feeding (so instar, pause-clearing, mirrors and achievements behave identically): `accepted` true/false, `food_type`/`food_size` copied from the animal's latest accepted feeding (else null), `fed_at` = now, notes "Logged from reminder".
- **Idempotent:** if a feeding log with the "Logged from reminder" marker already exists for this animal on `reminder_date` (keeper-local), return it with `created: false`. Implemented with a nullable `feeding_logs.reminder_date` column + unique partial index `(invert_id, reminder_date) WHERE reminder_date IS NOT NULL` (same migration) so two phones can't race. One reminder logs one outcome: the first of Fed / Refused wins and a later tap returns it (the keeper can edit the log in the app as with any feeding).
- `tomorrow`: sets `inverts.reminder_snoozed_until` = keeper-local today + 1 (new nullable date column, same migration). Not a feeding pause; does not change due status.
- Rate limit 60/hour per user. Response `{action, created, animal_name, message}`.

### 5.2 Mobile (OTA-safe; `expo-notifications` is already in the 1.9.0 binary)

- At startup register categories `feeding_due` (Fed, Refused, Tomorrow) and `feeding_summary` (Open Feeding Day), all `opensAppToForeground: true`.
- Response listener in `_layout.tsx`: a button tap calls `reminder-action` and shows a toast ("Logged: Rosie ate" / "Logged: Rosie refused" / "We'll remind you tomorrow" / the server's error message) on the current screen; a body tap navigates to the deeplink as today. Signed out → the existing sign-in redirect, nothing logged.
- Pure helper `src/lib/reminder-actions.ts` (action → request + toast text), jest-tested.
- Settings: three switches in notification settings.

### 5.3 Web

Settings switches (`/dashboard/settings/notifications`), molt-form line, paused-after-molt labels. No push buttons on web.

## 6. What's new

One TV entry dated the Monday after stage 1 is live: title "Smarter feeding reminders", body naming the three options and that they're off unless turned on, action `{label: "Turn them on", target: "settings"}`. Free for everyone.

## 7. Error handling and edge cases

- Switch reads failing (no prefs row) → treat as all off (today's behaviour).
- A molt with `molted_at` in the future (bad data) → window runs from today, not the future date.
- Animals that are died/transferred never get reminders (already excluded) and actions return 409.
- HV due animals present → always the summary (HV has no action endpoint).
- Quiet hours and `daily_digest_enabled` gate everything exactly as today.

## 8. Stage 2 (separate plan, after a spike)

- **Spike first** (real devices): iOS widget from an Expo project (`expo-widgets` / `@bacons/apple-targets`), Android widget (`react-native-android-widget`), and background notification actions that log without opening the app. Report findings before planning.
- Widget: "Due today", up to 4 animals (photo, name, days since meal) with a Fed button; "All fed" when nothing is due; refresh after logs and a few times a day.
- **Widget token:** a scoped, revocable token (read today's due list + reminder actions only), revoked by sign-out, account deletion and a "Signed-in widgets" list in settings. Never the keeper's full session token.
- Background buttons reuse `reminder-action`.

## 9. Testing, rollout, measurement

- API tests: switches off ⇒ identical output to today (snapshot over a fixture collection); defaults for new vs existing prefs rows; refusal restart (incl. never-fed); molt windows (stage, override, 0, back-dated, deleted molt, keeper pause wins, legacy tarantula molt link, future-dated molt); digest shape (1, 3, 4 due; HV present; snoozed; switch off unchanged; categoryId set); reminder-action (fed/refused/tomorrow, idempotent per day, closed 409, co-keeper scope, stranger 404, rate limit); full suite green.
- Mobile jest for `reminder-actions.ts` and the molt-pause date helper; tsc + design-token gate. Web tsc + node tests for the label helper.
- Rollout: push (Render migrates, Vercel deploys), then `pnpm run check:bundle` + `eas update --branch production` for TV mobile; What's new entry on the following Monday.
- Measurement: `apps/api/report_reminder_logging.py` (read-only, Render shell, 2 and 6 weeks after release): feedings logged from reminders, keepers with each switch on, 30-day logging retention with vs without.
