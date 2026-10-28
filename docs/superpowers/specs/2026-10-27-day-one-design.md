# Day one works — design

Date: 2026-10-27 · Status: approved in conversation (sections 1–3), awaiting written review
Scope: Tarantuverse (API, TV mobile, TV web). Herpetoverse follows as its own project.
Research behind it: `docs/research/2026-10-27-feature-research.md`.

## Why

Production data (2026-10-27): 39% of accounts have no animals (25 of 63 signups in the
last 30 days); 59 of 147 keepers with animals have never logged a feeding; of 94 keepers
older than 60 days, 14 logged anything in the last 30; about 44% of keepers have no push
token. The code explains much of it:

- A never-fed animal is never "due" (`services/feeding_status.py`), the add form hides
  "Last fed" in a collapsed section, and the importer has no last-fed column. A new keeper's
  Home says "All animals are fed on schedule!" and the daily reminder never fires.
- The daily reminder only reaches keepers with a `notification_preferences` row, which is
  created lazily when they open notification settings. Web-only keepers never get one.
- The OS push prompt fires at first login, unexplained, before anything can be due.
- TV mobile password signup ends at "Go to Login" (web and HV sign in automatically).
- The welcome carousel and the empty screens never lead to adding or importing.

## Goals

1. A new keeper adds a first animal (or imports) within the first session.
2. Every animal gets a feeding baseline, so reminders work from day one.
3. Reminders reach keepers through a channel they chose: push (app) or email (web).
4. We ask for notifications once, with a reason, at a moment that makes sense.

Non-goals: the web add flow's taxon-first order and its two-required-names tarantula form;
reminder rules for refusals / post-molt pause (project 2); Herpetoverse (project 3);
email for HV; widgets; PostHog events (the database gives the numbers).

## 1. Feeding rule (API)

All in `compute_feeding_status` (the function Feeding Day and Analytics already share).

- **Never-fed** = no ACCEPTED feeding (today's rule for "no last feeding"). Within that,
  **no feeding log at all** (no refusal either) is what makes `needs_first_feeding` possible:
  an animal with only refusals gets no nudge (the keeper is clearly logging), but follows the
  same baseline due rule below. Refusal handling proper is project 2.
- **Baseline** = the later of the animal's `created_at` (keeper-local date) and its
  `date_acquired` (when set). A future acquired date pushes the baseline into the future.
- **New field** `needs_first_feeding: bool` on `InvertFeedingStatusItem`: true for an animal
  with no feeding log at all and a cadence (not a grazer) that is not due — i.e. its
  baseline + interval has not passed, or (see cutoff) it was created before the release.
- **Due**: a never-fed animal created on/after the release cutoff becomes `is_overdue` once
  local days since baseline >= interval, unless paused or a grazer. Then
  `needs_first_feeding` is false.
- **Release cutoff**: constant `FIRST_FEEDING_DUE_FROM` (a date, set to the merge day in the
  implementing commit) in `services/feeding_status.py`. Animals created before it never become
  due while never-fed — they get the nudge only. Once a feeding is logged, the normal rule
  applies to every animal. Reason: many keepers deliberately don't log feedings; their existing
  animals must not start generating daily "N due" reminders the day this ships.
- `days_since_last_feeding` stays `null` for never-fed animals. New field
  `days_since_baseline: int | null` is filled for never-fed animals (clients may ignore it).
- Sorting unchanged (never-fed first).
- **One rule**: `routers/inverts.py` single-animal feeding status (~line 804) and
  `services/digest_service.py::_overdue_count` stop restating the rule and call
  `compute_feeding_status`. HV (`_animal_overdue_count`) is unchanged.
- `feeding_status.py` uses `utils/feeding_pause.is_feeding_paused` instead of its inline
  copy (same behaviour).
- Analytics consumers (`/analytics/collection` due counts, `first_due`, `longest_gap`) keep
  working: anything that reads `days_since_last_feeding` must tolerate an overdue item with
  `null` there (use `days_since_baseline`). Covered by tests.

## 2. TV mobile first run

1. **Sign-up signs you in.** `app/register.tsx`: when the response's
   `requires_email_verification` is false, log in with the same credentials and go to
   `resolvePostAuthRoute(true)`. When true, keep the current "check your email" screen.
2. **One welcome screen** replaces the 4-screen carousel in `app/onboarding.tsx` (same route,
   same `onboarding_pending`/`onboarding_completed` flags): one short line and three buttons —
   **Add your first animal** (`/add`), **Import a spreadsheet** (`/import`), **Look around
   first** (`/(tabs)`). Each marks onboarding complete. The dead conditional `Stack.Screen`
   for onboarding in `_layout.tsx` goes.
3. **"When did it last eat?"** in `app/add.tsx`, directly under the species pick, not in a
   collapsed section. Chips **Today · Yesterday · Pick a date · Not sure** (default Not sure).
   Not shown in colony mode. Saved as local noon of the chosen day (shared helper, jest-tested),
   fixing the UTC-midnight off-by-one. "Not sure" logs nothing.
4. **First-animal notification ask.** After an animal is saved, if the OS permission is
   undetermined and this device has never shown the ask (for a new keeper that is their first
   animal; an existing keeper sees it once on their next add): show a sheet — "Want a heads-up when {name} is due to eat? At most one reminder a
   day." — **Turn on reminders** (OS prompt → register token) / **Not now**. Then open the new
   animal's page. Other saves navigate as today.
5. **No prompt at login.** `AuthContext` registers the push token only when permission is
   already granted (`getPermissionsAsync`), never requests. Settings → Notifications no longer
   requests on mount; when denied it shows **Open phone settings** (`Linking.openSettings()`).
6. **Second ask.** If the keeper chose Not now (or was never asked — existing keepers), the
   first time Home loads with an animal `is_overdue` and permission still undetermined, show the
   same sheet once ("{N} animals are due — want a daily reminder?"). After that, and after any
   OS denial, never ask again. State lives in AsyncStorage (permission is per device) in a small
   pure state helper (`src/lib/notification-ask.ts`, jest-tested).
7. **The nudge.** Home: card "First feeding not logged" listing up to 3 animals with
   `needs_first_feeding`, each with **When did it last eat?** → sheet with Today · Yesterday ·
   Pick a date · Not yet; a date logs one accepted feeding (`POST /inverts/{id}/feedings`) and
   refreshes the slice; Not yet closes. The card has a ✕ that hides it for 14 days on that
   device (keepers who deliberately don't log feedings shouldn't carry a permanent card).
   Collection cards: "First meal not logged" where
   days-since-fed would be. Feeding Day: same label on these animals.
8. **Empty screens.** Home and Collection with zero animals: **Add animal** and **Import a
   spreadsheet**. Remove the unused `GetStartedCard` (`collection.tsx`) and the unreachable
   `app/tarantula/add-feeding.tsx` (and its local reminder scheduling).

## 3. Web, email reminder, reminder plumbing

1. **Preferences for everyone.** A `notification_preferences` row is created on every
   account-creating path (password register, `/oauth-login` create). A migration inserts rows
   for existing users who have none (defaults: digest on, push per token). Effect: the daily
   reminder lands in the in-app bell for everyone.
2. **Time zone from the web.** TV web sends `tz_offset_minutes` once per session (new
   `PUT /notification-preferences/tz` or the existing PUT with only that field), so the digest
   runs at the keeper's local hour.
3. **Email reminder.** New columns on `notification_preferences`: `email_digest_enabled`
   (bool, default false). Sent in the same hourly run, after the in-app/push digest, only when
   something is due and the user is active with a real address. Content: "{N} animals are due
   today", up to 10 names, a **Open Feeding Day** button (`https://www.tarantuverse.com/dashboard/feeding-day`),
   and an unsubscribe link. Due counts include HV animals, as the push does.
   - **Unsubscribe**: signed token (HMAC, own derived key `digest-unsub|API_SECRET_KEY`,
     carries user id, no expiry) → public `GET`/`POST /notification-preferences/email-unsubscribe`
     turns `email_digest_enabled` off; web page `/unsubscribe/<token>` confirms. Emails carry
     `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers
     (`EmailService.send_email` gains an optional `headers`).
   - **Cap**: at most `DIGEST_EMAIL_DAILY_CAP` (default 80) digest emails per UTC day; the rest
     are skipped and logged as a count.
   - **Logging**: `EmailService` stops logging recipient addresses (and the mock body) —
     subject + outcome only.
4. **Web ask.** After the first animal is added on web (both add forms), a dialog: "Want an
   email when {name} is due? On days something is due, at most once a day." — **Email me** /
   **Not now**. One more ask the first time the dashboard shows something due; localStorage
   flag remembers.
5. **Settings.** Web `/dashboard/settings/notifications` and mobile Settings → Notifications
   get a "Daily email reminder" switch.
6. **Web parity.** "When did it last eat?" chips on `dashboard/tarantulas/add` and
   `dashboard/inverts/add`; the "First feeding not logged" card on `/dashboard` (same ✕ = hide
14 days, localStorage); the label on
   collection cards; **Import a spreadsheet** on the empty dashboard.
7. **Importer.** `services/import_service.py` reads a last-fed column (`last_fed`,
   `last_feeding`, `last fed date`, `fed`; same date parsing as other date columns); a valid date
   logs one accepted feeding at local noon. Both importers' column help mentions it.

## 4. Testing and measuring

- **API (pytest)**: never-fed rule (baseline from created/acquired, future acquired, cutoff,
  grazer, paused, refusal-only = no nudge but baseline due rule), single-animal + digest use the shared
  function, analytics tolerate null days, prefs row on register/oauth create, migration
  backfill, email digest (only when due, opt-in only, cap, inactive/merged skipped, headers),
  unsubscribe token (good, tampered, other key), importer last-fed, no recipient address in
  email logs.
- **Mobile (jest)**: last-fed chip → local-noon date helper; notification-ask state helper
  (first ask, second ask, never after denial).
- **Gates**: `tsc` on TV web + mobile, design-token gate, `check:bundle` before OTA,
  `test_taxon_lists_in_sync.py`.
- **Measure**: read-only `apps/api/report_activation.py` prints, per signup cohort week:
  share with an animal within 1 day, share with a logged feeding within 7 days, share with a
  push token or email reminder, and 60-day activity. Baseline = today's numbers above; re-run
  2 and 6 weeks after release.

## Rollout

API first (rule, prefs, email, unsubscribe, migration) → web → mobile OTA. Mobile changes are
JS-only (expo-notifications and `Linking` are already in the binary), so OTA reaches current
installs. What's new entry once live on all three. Resend free plan: 100 emails/day,
3,000/month, shared with password resets — hence the cap.
