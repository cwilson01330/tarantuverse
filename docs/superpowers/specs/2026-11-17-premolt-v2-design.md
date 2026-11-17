# Premolt v2: a fasting signal, more taxa, keeper answers, and a hit-rate report — design

Date: 2026-11-17 · Status: approach B chosen by Cory, expansion approved; builder check done (all questions settled in §4–§5, marked in §9); awaiting Cory's review
Product: Tarantuverse (TV) only.

## 1. Why

Cory and Brooke asked whether premolt prediction improves itself. It doesn't: it is a fixed rule set (`services/premolt_service.py`), recomputed on every read, with nothing stored and no feedback. Cory's goal (stated): anything that improves our data and the keepers' experience is worth doing. Chosen: approach B — make it smarter, let keepers confirm it, measure it — and expand it beyond tarantulas.

Production data (2026-11-17, Neon, read-only):

- 606 molts on 369 animals from 60 keepers; 263 in the last 90 days. 360 (59%) were logged within 2 days of the molt date.
- Today's rule needs either a refusal streak or an average molt interval (3+ molts). Only 52 animals have 3+ molts. Of the 412 molts with feedings logged in the 60 days before, only 63 (15%) had 2+ refusals logged right before — keepers mostly stop offering rather than log refusals.
- The signal the logs DO carry is time since the last accepted meal. Animals that molt normally eat every 5 days (median; p90 15). At the molt the median was 14 days since the last accepted meal (IQR 6–23). Gaps between accepted meals that contained a logged molt: <8 d 1.5%, 8–13 d 9%, 14–20 d 38%, 21–34 d 76%, 35+ d 79% (inflated by post-molt fasting, but the pre-molt fast alone is ~14 days).
- Molt intervals: median 63 days; previous interval predicted the next within 25% in 61 of 96 pairs. Too little history to pick a better interval formula — out of scope.
- Premolt is tarantula-only: the service and `/premolt/dashboard` read the legacy `tarantulas` table, and `taxon-modules.ts` enables the `premolt` module for tarantula only. The 109 molts logged on jumping spiders (69) and mantids (40) get no prediction.
- Keepers already label premolt by hand: 29 animals are currently feeding-paused with reason `premolt`. Only the current pause is stored, no history.

## 2. Goals, non-goals, anti-goals

Goals:
1. A fasting signal: flag premolt when an animal has gone much longer than ITS OWN usual gap without an accepted meal, so most animals get a useful prediction, not only the 52 with 3+ molts.
2. Predictions for every taxon that eats live prey on a rhythm and molts, not just tarantulas.
3. Keeper answers on the premolt card — "Yes, pause feeding" / "Not yet" — that help the keeper (pause stops due-to-eat nagging; Not yet hides the alert) and label the data.
4. Store prediction episodes and answers so accuracy can be measured.
5. A read-only report that shows the hit rate (overall, by taxon, by rule branch) and the misses, so Cory can approve threshold changes from data.

Non-goals: a push notification (later, once the report shows it's reliable); a trained model; changing the molt-interval maths; changing the due-to-eat rule in `feeding_status.py`; Herpetoverse (sheds are a different signal); colonies.

Anti-goals (failure even if it "works"):
- Flagging an animal that just molted, or one that has matured and won't molt again.
- Flagging every animal of a keeper who simply stopped logging (a silent keeper is not a fasting spider).
- An alert that comes back the day after the keeper said "Not yet".
- Any copy that overstates certainty ("is in premolt"); the card says "may be" and shows why.
- Predictions or answers leaking onto public routes (share cards, `/i`, `/t`, keeper profiles, care sheets). Sitter cards may keep their existing boolean.

## 3. Approaches (chosen: B)

- A. Quietly smarter: fasting signal + stored predictions + report, no UI change. Cheapest, but the only answer key is whether a molt is ever logged.
- **B. Smarter + keeper confirmation (chosen):** A plus "Yes, pause feeding" / "Not yet" on the premolt card. "Yes" turns on the existing premolt feeding pause. Each tap is a labelled answer and does something useful for the keeper.
- C. B + push notification. Deferred until the report shows a reliable hit rate — a wrong push costs trust.

## 4. The prediction (server)

One function stays the single source: `services/premolt_service.py`. It moves from the legacy `Tarantula` row to the `Invert` row (shared primary key, so tarantula ids keep working), and reads logs with the existing either-parent helpers (`utils/legacy_logs.py`, `invert_id` for every taxon).

**Eligible animals:** active (not died, not transferred), taxon eats on a rhythm (`utils/feeding_mode.py` effective mode is not detritivore — so millipede, isopod, roach and grazer-species are out), and not matured:
- matured = an ultimate molt is logged (existing rule, `molt_logs.is_ultimate`, which the final-molt checkbox already records for taxa that have one), OR `life_stage == 'adult'` for a taxon whose adults don't molt. An animal with no stage set and no ultimate molt is eligible (we can't know it's matured; the post-molt and still-logging guards and the "Not yet" button cover the rest). Taxa whose adults keep molting: tarantula (females), centipede, whip_spider. Taxa whose adults don't: true_spider, mantis, scorpion, vinegaroon. (Builder: keep this list in one place, both client registries in lockstep, pinned in `test_taxon_lists_in_sync.py`; `other` is treated as "adults may molt".)
- Ineligible animals return a prediction with `is_premolt_likely: false` and a reason, never an error.

**Existing branches stay** (refusal streak ≥3 past the post-molt window; ≥2 refusals and ≥60% of the average interval; ≥110% overdue with no refusals). Their thresholds don't change in this work.

**New branch — fasting:**
- `usual_gap` = median gap in days between this animal's accepted meals over the last 180 days, needing at least 4 accepted meals; otherwise fall back to the interval feeding status already uses for this animal (`feeding_status._recommended_feeding_interval_with_source(life_stage, species, feeding_interval_days, taxon=)` — keeper override, then species, then taxon/stage default), so animals with few logs on every predator taxon still get the branch. No interval at all → branch off. The 2.5× / 14-day thresholds come from all molting animals in the 2026-11-17 data (jumpers and mantids included); the report splits results by taxon so a per-taxon threshold can be added later if the data asks for it.
- `days_fasting` = local calendar days since the last accepted meal (same `tz_offset_minutes` handling as feeding status).
- Fires when `days_fasting ≥ max(FAST_MULTIPLIER × usual_gap, FAST_MIN_DAYS)` with initial values `FAST_MULTIPLIER = 2.5`, `FAST_MIN_DAYS = 14`, AND the post-molt window has passed (same gate as branch 1), AND the keeper is still logging: at least one feeding logged (by anyone — owner, co-keeper or sitter) on any of the owner's Tarantuverse animals in the last 7 days. Herpetoverse activity doesn't count.
- A refusal logged during the fast is supporting evidence: fasting + ≥1 refusal = medium confidence; fasting alone = low; existing high/medium rules unchanged.
- Constants live in one module with a comment saying they are tuned from `report_premolt_accuracy.py`, and carry a `RULE_VERSION` string (start `"2026-11-v2"`) that is stored with every episode.

**The response gains:** `branch` (which rule fired: refusals | refusals_interval | overdue | fasting | none), `days_fasting`, `usual_gap_days`, `reason` (one plain sentence the card can show, e.g. "No accepted meal in 23 days — usually eats every 6."), `keeper_answer` for the open episode (yes | not_yet | null), `premolt_snoozed_until`, `paused_for_premolt` (feeding pause reason = premolt). An animal paused for premolt or snoozed still gets the computed fields, but clients don't show the alert buttons.

**Routes:** generic `GET /premolt/inverts/{id}` (single) and `/premolt/dashboard` (batch, now every eligible taxon, uses the collection-scope access it uses today). The old `/premolt/tarantulas/{id}/prediction` keeps working as an alias. Snoozed animals and animals paused for premolt don't count in `premolt_likely_count` (Home tile).

## 5. Episodes and answers (storage)

New table `premolt_episodes` (migration): `id`, `invert_id` (FK, CASCADE), `user_id` (owner), `opened_on` (date), `closed_on` (date, null while open), `close_reason` (molted | ate | keeper_not_yet | cleared | animal_closed | null), `branch`, `signals` JSONB (snapshot at open: refusal streak, days fasting, usual gap, interval progress, confidence, taxon, life stage), `rule_version`, `keeper_answer` (yes | not_yet | null), `answered_at`, `answered_by` (user id). At most one open episode per animal (partial unique index).

New column `inverts.premolt_snoozed_until` (date, null).

**Who opens and closes episodes:** a separate pass that rides on the existing digest cron run but does NOT depend on digest settings: once per UTC day (guarded by a stored last-run date so hourly cron runs don't repeat it), it evaluates every eligible animal of every active Tarantuverse account (excluding test-domain and `@merged.invalid` accounts, like the digest), with `tz_offset_minutes` taken from the owner's stored offset where one exists, else UTC. `user_id` on an episode is always the collection owner. It:
- opens an episode when the prediction turns likely and none is open;
- closes the open episode with `molted` when a molt is logged after `opened_on`, `ate` when an accepted meal is logged after `opened_on` (and no molt), `cleared` when the rule stops firing with neither, `animal_closed` when the animal died/transferred. A "Yes" episode is not closed by `cleared` — it stays open until a molt or a meal, since the keeper confirmed it; after 120 days with neither it closes as `stale` (add to `close_reason`).
- A manual premolt pause counts as a keeper "yes": when an animal is feeding-paused with reason `premolt` (set by hand through the pause sheet), the pass records `keeper_answer = yes` with `answer_source = pause` on its open episode, opening one with the current signals if none is open. Answers from the card carry `answer_source = card`. (Add `answer_source` to the table.) This turns the 29 existing manual pauses into labelled data.
- Reads don't write. The card's prediction is computed live; the episode is the daily record.

**Answer route:** `POST /premolt/inverts/{id}/answer` `{answer: "yes" | "not_yet"}`, same role as the existing feeding-pause route; 409 for died/transferred animals; idempotent for the same answer.
- yes → sets the existing feeding pause with reason `premolt` and NO end date (the pause sheet's "blank = indefinite"; the existing accepted-meal auto-resume ends it, as for a manual premolt pause), so reminders and due status behave exactly as a manual premolt pause; records the answer on the open episode (opens one with the current signals if the daily job hasn't yet), returns the updated prediction.
- not_yet → sets `premolt_snoozed_until = today + 14`, records the answer, closes the episode with `keeper_not_yet`. While snoozed, the animal is not counted or shown as an alert; when the snooze ends, the next daily run can open a new episode.
- Changing an answer: a later "yes" after "not yet" is allowed (new episode); un-pausing still happens through the existing pause controls.
- Who: the buttons show only to people the route allows (owner and co-keepers with the pause route's role); viewers see the card without buttons. Pause and snooze are per animal, shared by everyone who sees it; `answered_by` records who tapped.

**Privacy:** episodes and answers are the keeper's own data — included in the JSON export, never on public routes, share cards, card links, keeper profiles, care sheets or transfers.

## 6. Clients (TV web + TV mobile, parity)

- Enable the `premolt` module for every eligible taxon in both registries (`apps/mobile/src/lib/taxon-modules.ts`, `apps/web/src/lib/inverts.ts`), lockstep; the generic invert detail renders the premolt card for them.
- Premolt card (mobile `PremoltPredictionCard` / `PremoltAlertCard`, web `PremoltPredictionSection` / `PremoltAlertsCard`), when likely and not paused/snoozed:
  - headline "May be in premolt", the `reason` sentence, confidence as today;
  - two buttons: **"Yes, pause feeding"** and **"Not yet"**; after Yes the card shows the existing "Paused · premolt" state; after Not yet the alert disappears with a one-line toast "Hidden for 2 weeks".
- Home "Premolt" tile counts across taxa using the batch route (no new request).
- Copy: "may be", never "is"; no countdown; no emoji. Dark mode on web; theme tokens on mobile; no new native modules (OTA-safe).

## 7. The report

`apps/api/report_premolt_accuracy.py` (read-only, run in the Render shell; `--since YYYY-MM-DD`, default 30 days):
- episodes opened; closes by reason; keeper answers (yes / not yet / none);
- hit rate = episodes followed by a logged molt within 45 days of `opened_on`, plus "confirmed" = keeper said yes; both overall, by taxon, by branch, by rule version;
- misses = molts logged in the window with no episode opened in the 45 days before (by taxon);
- lead time = days from `opened_on` to the molt (median, IQR);
- a short "suggested thresholds" section: for `FAST_MULTIPLIER` 2.0 / 2.5 / 3.0 and `FAST_MIN_DAYS` 10 / 14 / 21, replay the fasting branch over the window's logs and show hits/misses/false alarms, so Cory can approve a change. It never changes anything itself.
- Run 2 and 6 weeks after release, then monthly.

## 8. Rollout

API first (migration additive; the daily job starts recording), then web and the mobile OTA. What's new entry after all three are live (next Monday), plain copy: premolt alerts now cover more animals, notice long fasts, and let you pause feeding in one tap. CLAUDE.md bullet: rule location, constants + `RULE_VERSION`, eligibility list, episodes table, answer route, report.

## 9. Calls I made (Cory to check while reading)

1. Initial fasting thresholds 2.5 × usual gap, at least 14 days — from today's data (normal p90 gap 15 days, median fast at molt 14). The report tunes them.
2. "Still logging" guard = any feeding logged for the owner's animals in the last 7 days.
3. "Not yet" hides the alert for 14 days.
4. Hit = a molt logged within 45 days of the alert opening.
5. Adults that don't molt (true spiders, mantids, scorpions, vinegaroons) are never flagged; centipedes, whip spiders and tarantula females are.
6. Grazers (millipedes, isopods, roaches) stay out.
7. Episodes are written once a day by the existing daily job, not on every page view.
8. The card shows the reason sentence, to earn trust and help keepers judge the alert.
9. Episodes are recorded for every active keeper, not only those with the daily digest on, so the report covers everyone.
10. A premolt pause set by hand counts as a "yes" answer, so the 29 existing pauses become labelled data.
11. "Yes, pause feeding" sets an open-ended pause that ends on the next accepted meal, like a manual premolt pause; a confirmed episode with no molt or meal for 120 days closes as stale.
12. Animals with no life stage set and no final molt logged stay eligible.

## 10. Left to the builder

Component structure, exact card layout, test file names, how the daily job batches its queries, the alias mechanics for the old route, and wording of the reason sentence per branch (plain, honest, short).

## Build notes (2026-11-17)

What changed during the build, and why. Where these differ from the text above, these win.

- **Fasting clock (§3):** days fasting count from the later of the last accepted meal and (newest molt + its post-molt window), not from the last meal alone. The window is the molt's keeper-set `feeding_pause_days`, else the `utils/post_molt_pause` default for the taxon and stage, else 0. Why: the anti-goal "never flag an animal that just molted" outranks the literal definition; a molt 14 days ago with the last meal 30 days ago is not flagged. Cost: alerts after a molt come a week or two later.
- **Overdue episodes (§5):** an episode on the `overdue` branch is not closed by `ate` (that branch ignores meals by design); it closes on `molted`, `cleared` or `animal_closed`. Why: otherwise it churns on every meal and corrupts the hit rate.
- **Manual premolt pause as "yes" (§5):** a leftover pause does not count: when the newest molt is on or after the newest accepted meal, the pass records no label. One label per pause. Since the final review a new molt clears the pause (below), so this guard is a safety net for pauses that predate that fix, molts whose date is edited later, and a premolt pause set after a molt.
- **"Not yet" while paused (§5):** a no-op for an animal already paused for premolt.
- **Answer route (§5):** 409 for died/transferred first, then 400 for an animal premolt does not apply to (grazer, matured).
- **Sitter cards (§4):** stay tarantula-only and keep the old three branches; the fasting branch is ignored (`likely and branch != "fasting"`).
- **Snoozed card (§6):** shows "Hidden for 2 weeks" as its status, with no reason sentence and no buttons, rather than disappearing.
- **Reason sentence (§4):** when the usual gap comes from the feeding interval (fewer than 4 meal days) it says "its feeding interval is N days", not "usually eats every N"; gaps round half-up.
- **Daily pass:** runs through `run_in_threadpool`, claims the day by reading and writing the `premolt.episodes_last_run_on` row directly (not through the settings cache), and uses non-key row locks.
- **Report (§7):** animals closed with no molt are excluded from the hit-rate denominator and shown separately; the replay applies production's post-molt gate and uses molts strictly before the fire day.

Final-review fix wave (2026-11-17, after the whole-branch review):

- **A molt ends a premolt pause (§5):** logging a molt that becomes the animal's newest (on or after every other molt, the instar rule) clears a feeding pause whose reason is `premolt` — both columns, legacy twin too (`utils/feeding_pause.end_premolt_pause_for_molt`). Covered: every per-animal molt-create route in `routers/molts.py` (`/inverts/{id}/molts`, `/tarantulas/…`, `/scorpions/…`, `/centipedes/…`, `/whip-spiders/…`). Not covered, on purpose: colony and enclosure molts (no per-animal pause), molt edits (`PUT /molts/{id}`; an edit is a correction, not a new molt), sitter logging and the importer (neither creates molts). A back-dated molt and other pause reasons are untouched. Why: a molt ends premolt by definition; otherwise a "Yes" pause silenced reminders until a meal was logged. Cost if wrong: a keeper re-pauses by hand.
- **Adult male tarantulas are matured (§4):** tarantula + sex male + life stage adult = no prediction (`is_matured(..., sex)`, the shared `Sex` enum compared by value), in the single, batch and daily paths and the report replay. Why: §4 says only tarantula females keep molting. Cost if wrong: a rare post-ultimate molt of an adult male isn't predicted.
- **Other pause reasons (§4, §5):** fasting never fires while the animal is feeding-paused for any reason other than premolt (owner-local today). The response carries `paused_other`; clients hide the answer buttons; the answer route returns 400 "Premolt answers aren't available for this animal." Other branches may still fire. Why: the keeper is withholding food on purpose, and "Yes" would overwrite their reason.
- **Staleness cap (§4):** no fasting fire past `FAST_MAX_DAYS = 120` days fasting (120 fires, 121 doesn't); the report replay applies the same cap through `fasting_fires`. Why: anti-goal "silent keeper" — a record nobody updates in an otherwise active collection. Cost if wrong: a fast longer than 120 days isn't flagged by the fasting branch (refusal / overdue branches still can).
- **Reason honesty (§4):** when the fasting clock started at the molt + window rather than the last meal, the sentence is "No accepted meal since its molt N days ago." (N = owner-local days since that molt); "1 days" is now "1 day" in both other sentences.
