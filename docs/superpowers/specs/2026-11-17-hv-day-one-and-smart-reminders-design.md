# Herpetoverse: day one + smart feeding reminders — design

Date: 2026-11-17 · Status: approach C chosen by Cory; builder check done (answers in §5 calls 6–12); awaiting Cory's review
Products: Herpetoverse (HV) — API, HV web (`apps/web-herpetoverse`), HV mobile (`apps/mobile-herpetoverse`). Tarantuverse (TV) only where shared code is touched; TV behaviour must not change.

## 1. Why

Cory posted a uromastyx on HV's social accounts and expects new sign-ups. TV got a much better first experience (2026-10-28, "Day one") and smarter reminders (2026-11-10, "Effortless logging stage 1"); HV got neither. Cory's order: first-day experience, then smart reminders. Goal: the keepers this post brings in get a good start, and keepers who log feedings get reminders that respect how reptiles are actually kept.

What HV does today (code + production data, 2026-11-17):
- 28 HV keepers (27 use HV only), 65 animals, 15 never fed, 8 keepers logged in the last 30 days, 19 have a push address.
- **One push address per account.** `notification_preferences.expo_push_token` is a single column; TV and HV are different Expo projects and overwrite each other's address (last app opened wins).
- HV mobile asks the OS notification permission right after sign-in (`AuthContext.tsx` push-token effect), with no explanation.
- No welcome screen, no "When did it last eat?" on add, no last-fed column in the HV importer.
- Never-fed animals are never due (`routers/animals.py::list_feeding_status`, "Never-fed is NOT overdue"), so a new keeper's first animal never reminds them.
- The reminder email is TV-branded, links to TV, and never names HV animals; HV has no email opt-in, no unsubscribe page, no timezone sync on web.
- The daily digest counts HV due animals but only as a summary; any HV due animal forces the summary path; no per-animal pushes, no Fed/Refused buttons, no snooze, no refusal restart.
- Herbivores get the same overdue rule as carnivores (`diet_type` is display-only). With the new uromastyx guides ("Every 1-2 days"), a uromastyx would be overdue after 2 days.

## 2. Goals, non-goals, anti-goals

Goals:
1. One shared due-date core used by TV and HV, so the two apps follow the same rule.
2. Notifications reach the right app: one push address per app.
3. HV first day: welcome screen, "When did it last eat?" on add, first-feeding rule, a sensible notification-permission moment, first-feeding card, email reminder opt-in with HV branding, timezone sync on web, last-fed in the importer.
4. HV smart reminders: per-animal pushes with Fed / Refused / Tomorrow, snooze, refusal restarts the wait.
5. Plant-eaters (species `diet_type = herbivore`) get no feeding reminders or overdue state unless the keeper sets their own interval (Cory's call, like TV's grazers).

Non-goals: a greens stock tracker (Cory: a possible next addition, like feeder tracking); a pause around sheds (see §5); multiple devices per app per account; home-screen widgets or background actions (TV stage 2); changing TV behaviour.

Anti-goals:
- Any change to TV due/overdue results, digests or pushes (TV's existing tests are the proof).
- A flood of "due" on release day for existing never-fed HV animals.
- A notification arriving on the wrong app, or the same reminder twice.
- Nagging herbivore keepers.
- The OS permission prompt before the keeper has a reason to say yes.
- Old app versions breaking (both apps have store binaries that only update by OTA).

## 3. Approaches (chosen: C)

- A. Move HV onto TV's existing `compute_feeding_status`: one rule, but reworks heavily tested TV code that real keepers rely on.
- B. Teach HV's own rule the same tricks: TV untouched, but two copies of the logic that will drift (the project notes forbid copying the rule).
- **C. One shared pure core, two thin wrappers (chosen).** Extract the pure decision from TV's rule into one function; TV's loader and HV's loader each gather their own animals/logs and call it. TV results stay identical (proved by its tests); HV gets the same rule.

Shipped in two steps from one design: Step 1 = shared core + per-app push addresses + day one. Step 2 = smart reminders.

## 4. The shared core

- A pure function (no DB) that takes, for one animal: last accepted meal day, last offered (refused) day, baseline day (later of the owner-local created day and `date_acquired`), interval days (or none), pause state (keeper pause / brumation / post-molt pause window), today (owner-local), the owner's rule switches, and the first-feeding cutoff date — and returns due/overdue, days since last meal, `needs_first_feeding`, `days_since_baseline`, and the next due day.
- TV's `services/feeding_status.py::compute_feeding_status` becomes a loader that calls it; every TV test stays green unchanged (anti-goal 1).
- HV's `routers/animals.py::list_feeding_status`, the per-animal HV feeding status (`routers/weight_logs.py`), the digest's `_animal_overdue_count` and anything else that decides HV due/overdue all call the same core (today these disagree with each other — they must agree after this).
- HV first-feeding cutoff: its own constant, the HV release date (animals created before it never become due while never-fed; they get the first-feeding card instead). TV keeps `FIRST_FEEDING_DUE_FROM = 2026-10-28`.
- HV interval resolution keeps its existing order (`_animal_feeding_interval`: keeper interval → CGD → weight brackets → keeper schedule text → species frequency), with one new step right after the keeper interval: species `diet_type == "herbivore"` → no interval (no reminders, never overdue). An unlinked species changes nothing.

## 5. Calls I made (Cory to check)

1. No pause around sheds: snakes refuse in the blue phase and eat after shedding; "a refusal restarts the wait" covers it. Brumation and the keeper's own pause keep suppressing as today.
2. The herbivore rule keys off the linked species' `diet_type` only. Bearded dragons (omnivore) and others keep reminders.
3. One push address per app per account (not per device): a new `app` dimension on push addresses.
4. A TV+HV keeper gets each app's reminders on that app; social/community notifications go to TV.
5. The three smart-reminder switches stay one set per account (shared by both apps); HV settings show the two that apply (smart reminders, refusal restarts the wait), not the post-molt one.
6. Email reminders: one email per app that has something due, each branded and linked to its app; both count toward the existing daily cap. The once-a-day guard becomes per app (HV gets its own last-sent date), so a keeper due in both apps gets both emails.
7. HV's due/overdue becomes the shared core's day-based rule everywhere (Feeding Day, dashboard, digest, per-animal status). The HV interval resolver, brumation, keeper pause and died/transferred handling stay exactly as they are. The per-animal "eat again in X–Y days" window display (`routers/weight_logs.py`) may stay as a display, but its due/overdue verdict comes from the core. Some HV animals' overdue state may shift by a day as the rules unify — accepted.
8. Smart-reminder switches for existing accounts: ON for accounts that keep only HV animals (27 of 28 HV keepers — they have nothing on TV to change), unchanged (as backfilled, OFF) for accounts with TV animals, ON for new accounts (as TV already does).
9. HV first-feeding cutoff = the date Step 1's API deploys (a constant set at release). The 15 never-fed animals created before it never turn due while never-fed; they get the first-feeding card.
10. "Fed" from a reminder copies prey type and size from the animal's most recent accepted meal (not prey weight), so snake prey history stays useful; "Refused" logs no prey. Neither resets anything beyond what a normal logged feeding/refusal does.
11. Herbivores on Feeding Day and the dashboard look like TV's grazers: listed and feedable, labelled "no schedule", never due or overdue; the add form's "When did it last eat?" chips are hidden for them.
12. Existing push addresses: accounts that keep only HV animals → their address is HV's (18 accounts); accounts with only TV animals → TV (108); accounts with both (1) → TV, and the HV app re-registers on its next launch after the OTA.

## 6. Step 1 — notifications to the right app + day one

**Push addresses per app.** Store one push address per (account, app). The register route takes an `app` field; old clients that don't send it are treated as TV (TV clients sent it first; HV's OTA ships alongside and re-registers on launch). Every notification send picks the address for its app (digest, reminders, sitter activity → HV when it concerns HV animals; DMs/follows/forums → TV); if the account only has one app's address, use it. Existing addresses are attributed by what the account keeps (§5 call 12); the HV client doesn't send any identifying header today, so the data decides.

**First-feeding rule.** Via the shared core (§4): a never-fed HV animal created on/after the HV cutoff becomes due once its interval has passed from the baseline. Feeding Day, the HV dashboard and the digest all agree.

**HV mobile.**
- Welcome screen once after sign-up: "Add your first animal" / "Import a spreadsheet" / "Look around first" (mirror TV `app/onboarding.tsx`).
- No OS prompt at sign-in. Ask through a pre-ask sheet only once after the first animal is saved, or the first time something is due (mirror TV `NotificationAskSheet` + `notification-ask` state); any OS refusal = never ask again; settings shows "Open phone settings".
- Add form: "When did it last eat?" chips — Today / Yesterday / Pick a date / Not sure — writing one accepted feeding at local noon (mirror TV `first-feeding.ts`). Hidden for herbivores (no reminders to start) unless the keeper set an interval.
- First-feeding card on the dashboard: "First meal not logged" with a tap to log, ✕ hides for 14 days.

**HV web.** Same chips and card; email reminder dialog ("Email me" turns on the daily digest + email digest and sends the browser's timezone); timezone sync for signed-in keepers; an unsubscribe page `herpetoverse.com/unsubscribe/[token]` that acts only on the button press, noindex, robots-disallowed, `Referrer-Policy: no-referrer`; settings gain the email reminder switch (disabled while the daily digest is off).

**Email.** HV-branded email (HV origin, colours, Feeding Day link, settings link, HV unsubscribe page) naming HV animals; TV email unchanged for TV animals.

**Importer.** Optional `last_fed` column for HV animals (exact synonyms only), written as one accepted feeding at 12:00 UTC; unparseable or future → row error, other rows still import.

## 7. Step 2 — smart reminders

- Per-animal pushes for HV: when the smart-reminder switch is on and 1–3 HV animals are due that day, one push per animal with buttons Fed / Refused / Tomorrow on the HV app; otherwise one HV summary. Planned per app (a TV+HV keeper gets TV's and HV's plans independently).
- Body copy mirrors TV: "Due for a meal · last ate N" / "last offered N" / "no meal logged yet".
- Snooze: `animals.reminder_snoozed_until` = first day the animal is reminded again (not a feeding pause).
- `POST /animals/{id}/reminder-action` (`fed|refused|tomorrow`, logger role, 409 for died/transferred), writing one feeding with notes "Logged from reminder" and `reminder_date`; idempotent through a unique partial index on (animal_id, reminder_date) — a second tap or second phone returns the first log.
- Refusal restarts the wait (switch) through the shared core.
- HV mobile: notification categories registered at runtime + a response bridge (mirror TV `ReminderBridge`; no new native module, OTA-safe); signed out = no log.
- HV settings (web + mobile): "Feeding reminders" group with the two switches.
- Measurement: extend `report_activation.py` and `report_reminder_logging.py` with an app filter (read-only), run 2 and 6 weeks after each step.

## 8. Rollout

Step 1: API (migration for push addresses + HV cutoff constant), then HV web, then the HV and TV OTAs (both register with `app`), `pnpm run check:bundle` before each `eas update`. Step 2 the same. What's new (HV) entries after each step is live, dated the next Monday. CLAUDE.md bullets per step.

## 9. Left to the builder

Exact function signature of the core, file names, how existing push addresses are attributed on migration (within §6's rule), component structure, test names, and copy for the welcome screen and pre-ask sheet (mirror TV's, with HV wording).
