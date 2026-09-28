# PRD — Shared keeping: sitter pass & co-keepers

**Status:** Phase 1 decisions made; ready to build (privacy-policy copy due before ship) · **Date:** 2026-09-28 · **Apps:** Tarantuverse + Herpetoverse (app + web)
**Related:** Premium Scope feature 08 (`design_handoff_keeper_apps_redesign/Premium Scope (standalone).html`), QR upload sessions (`routers/qr.py`), Feeding Day (`/inverts/feeding-status`), upgrade tracking (`shared_keeping` source key)

---

## Decisions up front

These answer the three questions this scope started from.

**1. No guest accounts under the keeper.** There are exactly two kinds of shared access, and neither is a sub-account:

| | Who | Identity | How they get in |
|---|---|---|---|
| **Sitter pass** (rungs 1–2) | A friend or neighbour feeding while you're away | None. No account, no email, no password | A link or QR that the keeper creates, that expires, and that can be revoked |
| **Co-keeper** (rung 3) | A partner or employee who keeps with you | Their **own** normal Tarantuverse/Herpetoverse account | An email invite they accept while signed in |

Keeper-owned guest accounts are rejected because they break identity at every seam:

- Whose password is it, and where does a reset email go?
- Whose data is it under GDPR?
- Apple and Google sign-in can't attach to an account someone else created.
- They inflate user counts and trip caps and emails.
- A sitter who later wants their own collection can't cleanly become a real keeper.

A pass plus an optional "make your own account" path covers the same need without any of that.

**2. Web first-class, no install required.** A pass opens in any browser at `tarantuverse.com/sit` or `herpetoverse.com/sit`, and in the app when it's installed. The web page is the product; the app handling is a convenience.

**3. Link and QR are the same thing.** One URL, delivered two ways: through the share sheet (text, WhatsApp, email) or as a QR the keeper shows on their phone or prints and tapes to the rack.

---

## Problem

Keepers travel, and animals still need feeding. Today the keeper either writes instructions on paper, texts them piecemeal, or hands over their own login. The last is common, and the worst option: full account access, including billing, deletion and messages. Nothing that gets fed while they're away makes it back into the records, so feeding history, cadence and premolt signals all develop a hole exactly when the keeper isn't watching.

Larger collections are rarely kept by one person. A partner or an employee who helps with feeding has no way to log it without sharing one account.

The Premium Scope competitor note: Exoden has ruled multi-user out on principle, so this is open ground.

## Goals

1. **A keeper can hand off feeding for a trip in under a minute**, without sharing their login. Measured: create-to-share time from PostHog funnel events.
2. **Records stay whole while the keeper is away.** Feedings done during a pass window are logged, attributed, and count toward cadence and premolt like any other feeding.
3. **Nobody gets more access than the job needs.** Sitters see only the chosen animals and only what feeding requires; co-keepers never get owner-only powers.
4. **The free sitter link brings in new keepers.** Target: some share of sitters create their own account within 30 days (baseline set after launch).
5. **The premium rungs convert.** Tracked with the `shared_keeping` source key from launch.

## Non-goals

- **Keeper-owned sub-accounts.** Rejected above.
- **Merging collections.** A co-keeper sees the shared collection separately ("Cory's collection"), never mixed into their own list, so counts, caps and exports stay unambiguous.
- **Sitters editing or deleting anything they didn't create.** Sitters only add entries. The keeper corrects mistakes.
- **Real-time chat between keeper and sitter.** DMs exist for account holders; sitters use whatever they already text with.
- **Organisation or business accounts with billing seats.** This is P2; the member model below shouldn't rule it out, but v1 has no seat billing.
- **Offline logging for sitters.** P1 at most; the web pass needs a connection in v1.

---

## Personas

- **Keeper (owner):** owns the collection and the subscription. Creates passes, invites co-keepers, sees everything that happened.
- **Sitter:** has no account and may never have heard of the app. Opens a link on their phone, possibly outdoors, possibly next to the enclosure with a feeder in one hand. Must understand the page instantly.
- **Co-keeper:** has their own account (free is fine). Helps regularly, logs from their own phone, is known by name in the records.

## The three rungs

| Rung | What | Tier | Needs an account | Effort |
|---|---|---|---|---|
| **1. Sitter link** | Read-only, time-limited feeding list for chosen animals | **Free** | No | S (~1 week, both apps) |
| **2. Sitter logging** | The same pass can log feedings back, attributed to the sitter | **Premium** (`can_use_sitter_logging`) | No | M (~1 week) |
| **3. Co-keepers** | Invite a person with roles (viewer / logger / keeper) | **Premium** (`can_use_co_keepers`) | Yes, their own | L (multi-week; see authorization refactor) |

Entitlement keys default to the premium boolean, as `can_use_analytics` does, per Premium Scope.

---

## Security model

This section drives the architecture. Every requirement below traces to one of these threats.

### Architectural rule: a pass is never a user

A sitter pass authenticates as its **own principal type**. It never mints or carries a user JWT, never passes `get_current_user`, and can only call a dedicated, allowlisted `/pass/*` API. This matters for two reasons:

- A leaked pass can do only what those few endpoints allow, no matter what bugs exist in the ~260 owner-scoped checks across 70 routers.
- Rungs 1 and 2 don't have to touch those 260 checks at all. Only rung 3 does.

### Threats and controls

| # | Threat | Controls |
|---|---|---|
| **T1** | **The link leaks.** It gets forwarded, screenshotted, or the QR is photographed. | Expiry is **mandatory**: 7-day default, 30-day max. Revocable instantly. Scoped to chosen animals. Data minimisation: no price paid, no location, no owner email, no private notes unless the keeper writes a sitter note. **Write-capable passes require a PIN** shared separately (see T4). |
| **T2** | **Tokens stolen from the database or backups.** | Store only a **SHA-256 hash** of the token, plus a short display prefix. Show the full token once, at creation. 256 bits of entropy (`secrets.token_urlsafe(32)`). *Note: existing QR upload sessions store tokens in plaintext; acceptable at 20 minutes, not for a multi-day pass, and worth hardening separately.* |
| **T3** | **The token leaks through URLs**: server logs, analytics, Referer headers, search engines. | The token lives in the **URL fragment**: `tarantuverse.com/sit#<token>`. Fragments are never sent to servers, so they stay out of Vercel logs, link-preview fetches and Referer headers. The page exchanges the fragment for a short-lived pass session through a **POST body** and then **strips the fragment** from the address bar. **PostHog is disabled on `/sit`**: today's web provider sends `$pathname` on every route, and posthog-js attaches `$current_url` to every event, which would capture the fragment. `/sit` also sends `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`. |
| **T4** | **Brute force.** | Guessing a 256-bit token is infeasible. The exchange endpoint is still rate-limited per IP. **PIN:** 4–6 digits, hashed. 5 wrong attempts lock the pass and notify the keeper. |
| **T5** | **Link-preview bots trigger actions.** iMessage, Slack and WhatsApp fetch URLs to build previews. | `GET /sit` is side-effect free and shows nothing without the fragment, so previews reveal nothing and consume nothing. All actions are POSTs, sent from the page after the exchange. |
| **T6** | **Privilege escalation through a pass.** | Separate principal (above). Pass endpoints are an allowlist: read the feeding list, log feeding or refusal, undo *own* entry within 60 minutes. Nothing else exists to call. |
| **T7** | **Co-keeper IDOR** (rung 3). One keeper reaches another's data through a missed check. | Central access resolver, **deny by default**. Co-keeper access is enabled **only on resources whose routers have migrated** to the resolver (allowlist). A **structural test enumerates every route** and fails if a route that can serve a co-keeper doesn't use the resolver, the same approach used for the cross-taxon tests. |
| **T8** | **Destructive or escalating actions by helpers.** | Sitters are add-only. Co-keepers can never: delete animals or the collection, transfer or sell animals, export data, touch billing, create passes, or invite others (v1). |
| **T9** | **Access outlives the relationship.** | The keeper sees all active passes and members in one place. Revoking a pass or removing a member takes effect **on the next request**: pass sessions re-check pass status every call, and member access is looked up, never cached in a token. |
| **T10** | **Can't see what happened.** | Every write records `logged_via_pass_id` or `logged_by_user_id`. The keeper gets an activity view per pass and per member, plus an optional push when a sitter logs. |
| **T11** | **Invite hijack** (rung 3). | Invite tokens are hashed, single-use and valid 7 days. They can only be accepted by a signed-in account **whose verified email matches the invite**, which builds on the verification flow reworked on 2026-09-28. |
| **T12** | **Billing lapse strands a sitter mid-trip.** | Welfare rule from Premium Scope: a write-capable pass created under premium **keeps logging until it expires**, even if the subscription lapses. Only new passes are affected. For rung 3, a lapse turns co-keepers read-only rather than locking them out. |

---

## Requirements

### Rung 1 — Sitter link (free)

**P0**

- **Create a pass.** Pick animals (default: all active; filters by enclosure or taxon), a start and end date (default 7 days, max 30) and a sitter name (optional, free text). Each animal's **care card** comes along automatically (see "The sitter care card" below).
  - [ ] End date is required; no "never expires" option exists
  - [ ] Colonies can be included (ADR-010)
  - [ ] Works for TV inverts/colonies and HV animals
- **Share it.** The share sheet, a copy-link button, and a full-screen QR (reusing the existing QR components).
  - [ ] The QR encodes the same fragment URL as the link
  - [ ] The full token is shown only at creation; afterwards the keeper can re-share only by creating a new pass or rotating it
- **The pass page** (web, mobile-responsive; opens in the app if installed):
  - [ ] Groups animals into **Due today**, **Overdue** and **Coming up**, using the same feeding-status logic as Feeding Day
  - [ ] Per animal: name, photo, species common name, and its **care card** (safety, today, feeding, water, heat, leave-alone, keeper's note)
  - [ ] The collection routine and emergency info sit above the animal list
  - [ ] Shows the pass's end date and the keeper's display name, nothing else about the keeper
  - [ ] Paused animals (feeding pause) show "Don't feed — paused: {reason}"
  - [ ] No price paid, location, private notes, breeding data or photos beyond the hero
- **Manage passes.** List active and expired passes; extend, rotate or revoke.
  - [ ] Revoke takes effect on the sitter's next request
- **Expired, revoked or invalid link:** a friendly page ("This feeding list has ended. Ask {keeper} for a new link.") that never says which of the three it was.

**P1**

- A "Make your own collection" call to action on the pass page. This is the acquisition loop.
- The keeper adds an emergency contact line to the pass (free text).
- A printable QR card (reuse the label renderer from `QRModal`).

### The sitter care card (part of rung 1, free)

Every animal on a pass gets a **care card**: a play-by-play of how *this keeper* keeps *this animal*, in the order a sitter needs it while standing at the enclosure. Every pass also gets a **collection routine**: how to do the whole round. Together they replace the sheet of paper taped to the fridge.

It's free because it's welfare. A sitter who doesn't know a tarantula is in premolt can kill it with a live cricket, and that must never sit behind a paywall (Premium Scope rule 1).

#### Principles

1. **Your records first, the species sheet second, clearly labelled** *(decided 2026-09-28)*. A card line is built, in order, from:
   - the keeper's written note
   - the keeper's own records (cadence, prey actually fed, husbandry fields)
   - the species care sheet

   The source is always shown ("From your records" / "From the *B. hamorii* care sheet" / "Your note"). If none of the three has an answer, **the line is left out**, never guessed. This is the same honesty rule as ADR-014 and ADR-017.
2. **Safety can't be edited away.** Venom, urticating hairs, defensive secretions and escape risk come from the species record and always show, at the top. The keeper can add to them, not remove them.
3. **Private fields never leak.** `notes`, `enclosure_notes`, `price_paid`, `source`, provenance and anything location-like are **never** put on a card automatically. The keeper can copy text into the sitter note deliberately.
4. **Plain language.** Written for someone who has never kept an invertebrate. Hobby terms get a one-line explanation the first time they appear ("premolt: getting ready to shed its skin, when it stops eating").
5. **Deterministic, not AI.** A server-side composer (`services/sitter_card.py`) builds each card from fields and rules, so the same data always produces the same card, and every line can be tested.

#### What a card says, in order

| Section | Built from | Example |
|---|---|---|
| **⚠️ Safety** | Species flags: `medically_significant_venom`, `venom_severity`, `urticating_hairs`, `defensive_secretion`, `can_climb_smooth`, `can_fly`; HV `handleability` | "Don't handle. Venom is medically significant; open the lid with tongs, never your hand." · "Can climb glass. Check the lid is latched every time you close it." · "Kicks irritating hairs. Keep your face away when the lid is open." |
| **Today** | Feeding status (Feeding Day logic), `feeding_paused_reason`/`until`, premolt signal, HV `brumation_active` | "**Feed today.**" · "**Don't feed** — paused: premolt. If food goes in by mistake, remove any live prey within 24 hours; live prey can injure a molting spider." · "**Don't feed** — brumating (winter rest)." |
| **Feeding** | Last N feeding logs (`food_type`, `food_size`, `quantity`), keeper cadence `feeding_interval_days`; species prey size, supplementation, `supplemental_calcium_required`, `feeds_on_cgd` | "2 medium crickets, every 7 days. Last fed Tue." · "Dust insects with calcium first." · "Mix gecko diet (CGD) with water to a ketchup texture; replace after 24 hours." · "Remove uneaten prey the next day." |
| **Water & humidity** | `water_dish`, `misting_schedule`, target humidity; species `moisture_gradient_required`, `humidity_shed_boost_*` | "Top up the water dish." · "Mist one side lightly, twice a week." · "Keep one corner of the substrate damp — never soak it all." |
| **Heat & light** | Keeper targets `target_temp_*`; HV species basking/cool/night ranges and UVB | "Thermometer should read 72–78°F." · "Basking spot 95–105°F. The UVB light should be on during the day." |
| **Leave alone** | Default for every card; keeper can add | "Don't rehouse, clean or change the substrate. If something looks wrong, message me first." |
| **Your note** | `sitter_note` on the animal | "She's shy — food at the burrow entrance, then step back." |

**Colonies** (isopods, roaches, springtails; ADR-010) get a population card instead of a per-animal one: moisture, food and leaf-litter top-ups, "don't try to count them", and escape notes for roaches.

**Reptiles** add shed support ("If she's cloudy-eyed, she's about to shed: raise humidity, don't handle") and brumation when it applies.

#### The collection routine and emergency info

Written once by the keeper and reused for every trip:

- **The round, step by step:** where the feeders are kept, which rack to start at, which room. It's an ordered list the keeper writes, shown above the animal list with an automatic summary: "Today: feed 6 · mist 3 · water 9 · leave 2 alone."
- **If something goes wrong:** sensible built-in defaults the keeper can edit — escape (close the room, check under furniture, shake out shoes), an animal on its back ("probably molting — don't touch it, don't feed it"), a death ("close the enclosure, don't remove anything, message me") — plus the keeper's contact line and an optional vet or local-keeper contact.

#### Requirements

**P0**

- [ ] The composer builds every card from the three sources in priority order, and **omits** a line when no source has the fact
- [ ] Each line carries its source, and the UI shows it
- [ ] Safety lines always render and can't be hidden
- [ ] **Preview as sitter:** the keeper sees exactly the page the sitter will see before sharing, from the pass screen and from each animal
- [ ] A `sitter_note` on the animal (TV invert, colony, HV animal) that **persists between trips**, so the next pass reuses it
- [ ] The collection routine and emergency section are saved per keeper per app and reused
- [ ] Snapshot tests assert that `notes`, `enclosure_notes`, `price_paid`, `source` and provenance never appear in any pass payload
- [ ] Composer tests per taxon: tarantula (premolt, urticating hairs), scorpion and centipede (venom tiers), millipede (secretion, moisture), mantis (can fly), isopod colony, gecko (CGD, calcium), snake (no-handle during shed)

**P1**

- [ ] Hide individual non-safety auto lines per animal ("don't mention misting for her")
- [ ] A **printable sitter guide**: one page per enclosure plus the routine, with the pass QR in the corner. Covers sitters who'd rather work from paper.
- [ ] Co-keepers (rung 3) see the same cards, useful for new staff

**P2**

- [ ] Per-trip overrides ("this week only: skip the adult female")

#### Data model additions

```
inverts.sitter_note, colonies.sitter_note, animals.sitter_note     TEXT NULL

sitter_guides                -- one per keeper per app
  owner_user_id, app, routine_steps JSONB (ordered list of strings),
  emergency_text, contact_line, vet_contact, updated_at
```

Cards are composed **live** when the sitter opens the pass, not snapshotted. That way a feeding logged by the keeper before leaving, or a new premolt pause, shows up immediately.

### Rung 2 — Sitter logging (premium)

**P0**

- **Enable logging on a pass.** The keeper turns on "can log feedings". This **requires setting a PIN**, which the keeper tells the sitter separately.
- **Log from the pass page:** fed or refused, prey (pre-filled from the animal's usual), an optional note.
  - [ ] The log counts toward cadence, stats and premolt exactly like the keeper's own
  - [ ] It's attributed on screen: "Fed by Sam (sitter pass)"
  - [ ] The sitter can undo their own entry for 60 minutes; after that only the keeper can change it
- **Keeper awareness:** an optional push per sitter log or a daily digest (reuse ADR-009 digest), plus an activity list on the pass.
- **Schema:** `logged_via_pass_id` (nullable FK) and `logged_by_user_id` (nullable FK) on feeding logs, which today record no author at all. Add both now so rung 3 needs no second migration.
- **Rate limit:** per pass, e.g. 60 writes per hour, which is well above any real feeding round.

**P1**

- "Report something" (an observation, a possible molt, an escaped animal) goes to the keeper as a notification and event, **not** a molt or health log. The keeper decides what it was.
- Water and misting care logs from the pass.

### Rung 3 — Co-keepers (premium)

**P0**

- **Invite by email** with a role:
  - **Viewer:** sees the shared collection, logs nothing
  - **Logger:** logs feedings, molts, care, photos and events
  - **Keeper:** logger rights plus editing animal details and husbandry, and adding animals
  - Owner-only, always: delete animals or collection, transfer, export, billing, invites, passes
- **Accept:** see T11. The invitee creates a free account first if needed; the invite waits.
- **Collection switcher:** the co-keeper's app and web show "My collection" and "{Owner}'s collection" separately.
- **Caps:** animals a co-keeper adds to the shared collection count toward the **owner's** cap and plan. The co-keeper needs no premium.
- **Attribution:** every log records `logged_by_user_id`, and the owner sees "by Alex" in history. If a co-keeper deletes their account, their entries keep their name as "former co-keeper".
- **Removal:** the owner removes a member (effective next request); the member can leave. Deleting the owner's account removes all memberships.
- **Notifications:** feeding reminders and digest go to the owner by default; each co-keeper opts in per shared collection.

**Authorization refactor (P0, the bulk of rung 3):**

- [ ] `resolve_access(db, user, owner_id) -> Role | None` in one module; each router's `_owned_*` helper becomes a thin wrapper around it
- [ ] Routers migrate one at a time; co-keeper access is enabled per resource through an allowlist, so an unmigrated router stays owner-only
- [ ] A structural test fails when any co-keeper-reachable route bypasses the resolver
- [ ] Unit tests per role for every migrated router: allowed, forbidden, and "other keeper's data → 404, not 403"

**P2**

- Co-keepers creating sitter passes for the shared collection.
- Business seats and billing.
- Per-animal (rather than whole-collection) co-keeper scope.

---

## Data model sketch

```
keeper_passes
  id, owner_user_id, app ('tarantuverse'|'herpetoverse'),
  token_hash (unique), token_prefix, label, can_log (bool),
  pin_hash (null unless can_log), pin_failures, locked_at,
  starts_at, expires_at (NOT NULL), revoked_at, created_under_premium (bool),
  last_used_at, created_at

keeper_pass_animals          -- which animals a pass covers
  pass_id, invert_id | animal_id | colony_id  (num_nonnulls = 1, existing pattern)
  -- sitter notes live on the animal, not here (see "The sitter care card")

collection_members           -- rung 3
  id, owner_user_id, member_user_id (null until accepted), app, role,
  invited_email, invite_token_hash, invite_expires_at,
  status ('pending'|'active'|'removed'|'left'), created_at, accepted_at

feeding_logs (shared by TV and HV); later shed_logs, weight_logs, molt_logs, substrate_changes as rung 3 reaches them
  + logged_by_user_id  (nullable FK users, ON DELETE SET NULL)
  + logged_via_pass_id (nullable FK keeper_passes, ON DELETE SET NULL)
```

Pass sessions are a signed token that expires after at most 12 hours and carries a `pass_id` claim. Every request re-checks that the pass isn't revoked or expired.

## Web and app surfaces

- **Web route:** `/sit` on both domains. It exchanges `#token` for a pass session and then clears the fragment. PostHog is not initialised on this route.
- **iOS:** add `/sit` to `apple-app-site-association` paths. That's a server-side change; the entitlement already covers the domain, so **no new build**.
- **Android:** add a `/sit` intent filter in `app.json`. That **needs a native build**; until then Android sitters use the web page, which is fine.
- **Keeper UI:** a "Sitter & sharing" screen, reachable from the collection and from settings.

## Success metrics

**Leading (first 30 days)**

- Share of active keepers who create a pass (target set after two weeks of baseline)
- Pass open rate: exchanges ÷ passes created (low means the share step is broken)
- Sitter logs per write-enabled pass
- `shared_keeping` prompt shown → clicked → purchased
- Time from create to share
- Share of passes whose keeper used **preview as sitter**, and share of animals on passes with a keeper-written sitter note (low means the auto card isn't trusted, or the note field is buried)

**Lagging (60–90 days)**

- Sitters who create their own account within 30 days
- 90-day retention of keepers who used a pass vs. matched keepers who didn't
- Overdue-feeding rate inside pass windows vs. outside

**Security health (ongoing)**

- Zero cross-keeper access findings (structural test + review)
- PIN lockouts and revocations per week (a spike means links are leaking)

## Phasing

| Phase | Ships | Includes |
|---|---|---|
| **1** | Rung 1, TV + HV, web + app | Pass tables, hashed tokens, fragment exchange, PostHog exclusion, `/sit` headers, share/QR, iOS AASA path, **care-card composer, sitter notes, routine and emergency guide, preview as sitter** |
| **2** | Rung 2 | Attribution columns (on feeding logs now, for all later rungs), PIN, write endpoints, keeper notifications |
| **3a** | *(invisible)* | `resolve_access` plus router-by-router migration behind the allowlist, with the structural coverage test |
| **3b** | Rung 3 | Invites, roles, collection switcher, attribution UI |

Phases 1 and 2 don't depend on 3a. Phase 3a can start any time and ship silently, because it changes no behaviour until a co-keeper exists.

---

## Open questions

**Blocking before Phase 1**

1. ~~**Free pass limits.**~~ **Decided 2026-09-28 (Cory):** free keepers get up to **2 active passes, 30 days max** each. Premium is unlimited in count, with the same 30-day max, since expiry is a security control rather than a tier limit.
2. ~~**Route name.**~~ **Decided 2026-09-28 (Cory):** `/sit` on both domains.
3. ~~**Care-card fallbacks.**~~ **Decided 2026-09-28 (Cory): yes.** When the keeper has no record for a fact, the card falls back to the species sheet, labelled "From the *{species}* care sheet". Safety lines always come from the species record. If neither source has the fact, the line is still left out.

**Blocking before Phase 2**

4. **PIN required for write passes?** *(Cory)* Recommendation: **yes**. It's the control that turns a forwarded link from "stranger can falsify records" into "stranger sees a feeding list".
5. **What else sitters can log.** *(Cory)* Recommendation: feedings and refusals in v1, water/misting in P1, observations as notifications in P1, **never** molts or health events directly.

**Blocking before Phase 3b**

6. **Role names and scope.** *(Cory/design)* Viewer / Logger / Keeper as above?
7. **Member limit on premium.** *(Cory)* Recommendation: none in v1; revisit only if abuse appears.
8. **Privacy policy and terms.** *(Cory — legal)* Covers the sitter's name, rate-limit IP handling, and co-keepers seeing each other's names. Both sites' privacy pages need a paragraph before Phase 1 ships.

**Non-blocking**

9. TV and HV in the same release, or TV first? Recommendation: same release. The backend is shared and HV's feeding list is simpler.

## Phase 1 build notes (2026-09-28)

**Shipped:** migration `sit_20260928_sitter_passes`; `utils/sitter_pass.py` (hashed tokens; pass sessions signed with an HMAC-derived key and bound to the minting token's hash, so rotation kills old sessions); `services/sitter_card.py`; `routers/sitter_passes.py` (keeper router + a two-route sitter router); `/sit` on both sites; keeper screens at `/dashboard/sitter` (TV web), `/app/sitter` (HV web), and `app/sitter/*` in both apps; privacy policy §5.4 on all three copies. Tests: `test_sitter_card.py`, `test_sitter_pass_security.py` (86 tests; every security control mutation-tested).

**Deviations from the plan above:**
- **iOS universal link for `/sit` is NOT added yet.** The AASA change is server-side and would route `/sit` into the app, but neither app has an in-app sitter screen yet, so iPhones with the app installed would open a missing route. Everyone uses the web page until the in-app screen exists (the native `SitterPassView` component is already built for it).
- App date selection uses day chips (start: today/tomorrow/2 days/a week; length: 3/7/14/30 days), not a date picker. Neither app ships a date-picker module, and adding one would need a native build.
- Keeper display name only on the sitter page. It never falls back to the username, which would give a stranger the keeper's platform identity alongside the dates they're away.

**Independent security review (2026-09-28):** no Critical/High findings. Fixed: revoke/rotate exempt from maintenance mode; open passes never capped in the list; row lock on the free-tier count; token-shaped fragments only; premolt failures isolated in a savepoint; deactivated owners' links die; username fallback removed; PostHog `sanitize_properties` strips fragments site-wide.

**Open:**
- ~~**Rate-limit keying behind Render.**~~ **Checked 2026-09-28, not an issue.** Render's API logs show uvicorn receiving varied real client IPs (only the internal health check is 127.0.0.1), so SlowAPI's per-IP buckets are per visitor, for sitter links and login alike. No `FORWARDED_ALLOW_IPS` change needed.
- Per-pass payload cost scales with animals (a premolt prediction per tarantula). Consider a ~60s payload cache if large passes become common.

## Adjacent hardening found while scoping

Separate from this PRD, but found while tracing the patterns it reuses:

- **QR upload-session tokens are stored in plaintext**, and the public upload-session endpoints have no route-specific rate limit (only the global 200/min). Hash them, and add per-route limits.
- ~~**The web apps send no `Referrer-Policy` header.**~~ **Done 2026-09-28:** `strict-origin-when-cross-origin` site-wide on both sites; `/sit` gets `no-referrer`.
