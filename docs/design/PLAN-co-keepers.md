# Build plan — Rung 3: co-keepers

**PRD:** `PRD-shared-keeping.md` (rung 3, threats T7–T12) · **Started:** 2026-09-29 · **Owner:** Cory

## Decisions (Cory, 2026-09-29)

| Question | Decision |
|---|---|
| Roles | **Viewer / Logger / Keeper.** Owner-only, always: delete animals or colonies, transfer/sell, import, export, billing, invites, sitter links |
| Member cap | **Up to 10** co-keepers per collection, per app |
| Invite scope | **Per app.** An invite shares the owner's Tarantuverse *or* Herpetoverse collection |
| v1 surface | **Core keeping** (below). Breeding, enclosures, feeders, analytics and QR sessions stay owner-only until a later pass |
| Activity feed | **Owner's feed, credited** ("Alex fed Rosie"). Achievements count toward the owner's collection |
| Enclosure / feeder deletes | **Owner only** |

## What the inventory found (2026-09-29)

275 endpoints across 32 routers touch collection data. Ownership is checked by 17 near-duplicate local helpers (different signatures, some raise, some return None) and ~140 inline `Model.user_id == current_user.id` filters. Two existing bugs, fixed in step 1:

- `_feeding_owner_taxon` has no `colony_id` branch → `GET/PUT/DELETE /feedings/{id}` returns 403 for colony feedings.
- By-id routes for feedings, molts, substrate changes, photos, animal events, sheds and weights answer **403** for another keeper's row and **404** for a missing one — confirming that someone else's record exists. The PRD requires 404 for both (T7).

## Architecture

### One resolver, deny by default

`app/utils/access.py`:

- `resolve_role(db, user, owner_id, app) -> 'owner' | 'keeper' | 'logger' | 'viewer' | None` — the caller *is* the owner, or holds an **active** membership for that owner **in that app**. Looked up on every request, never cached in a token (T9). A membership whose owner is deactivated resolves to `None`.
- **Lapse rule (T12):** if the owner's premium for that app has lapsed, every co-keeper role is capped at `viewer` — read-only, never locked out.
- `require(db, user, owner_id, app, need) -> Access(owner: User, role)`:
  - no role at all → **404** (identical to "doesn't exist")
  - a role, but too low → **403** "Your role in this collection can't do that." (they can already see it, so 403 leaks nothing)
- Resource loaders that replace the inline filters: `load_invert`, `load_colony`, `load_animal` (by id → owner from the row → `require`). One 404 path for missing / not yours / no access.
- Collection scoping for list endpoints: optional `?collection=<owner_id>`; absent means your own. `scope_collection(db, user, app, owner_id, need='viewer') -> Access`.
- Everything that used `current_user` for *whose data* now uses `access.owner`: new rows' `user_id`, free-tier caps (`enforce_collection_limit` / `enforce_animal_limit`), premium gates, feeding reminders. `current_user` is used only for *who did it* (attribution).

### Route policies + structural test (T7)

Every route in a collection router is tagged with a policy via a no-op decorator: `@policy("viewer" | "logger" | "keeper" | "owner_only")`. A test enumerates **every route in the app** and fails when:

- a route in a collection router has no policy tag;
- a `viewer`/`logger`/`keeper` route's handler doesn't go through the access module (`load_*` / `require` / `scope_collection`), or still contains an inline `user_id == current_user.id` owner filter;
- an `owner_only` route calls the access module with a non-owner need.

Unmigrated routes keep their inline owner filters, so a co-keeper gets a 404 from them — **deny by default** while migration is in progress. Migration is router by router; each one ships silently.

### Data model

```
collection_members
  id, owner_user_id (FK users CASCADE), member_user_id (FK users SET NULL, null until accepted),
  app ('tarantuverse'|'herpetoverse'), role ('viewer'|'logger'|'keeper'),
  invited_email (lower-cased), invite_token_hash (sha256, unique), invite_expires_at,
  status ('pending'|'active'|'declined'|'removed'|'left'|'expired'),
  created_at, accepted_at, ended_at
  UNIQUE (owner, member, app) WHERE status='active'
  UNIQUE (owner, invited_email, app) WHERE status='pending'
  CHECK owner_user_id <> member_user_id
```

Attribution (`logged_by_user_id`, SET NULL, set only when the actor isn't the owner — NULL keeps meaning "the owner"):
`feeding_logs` (exists, unused so far), plus new on `molt_logs`, `substrate_changes`, `photos`, `care_logs`, `animal_events`, `shed_logs`, `weight_logs`. A deleted co-keeper account leaves the entry and shows "former co-keeper".

### Invites (T11)

- Owner (premium for that app, < 10 active + pending) invites by email with a role. Token: 256-bit, **hashed**, single use, 7 days, sent by email (Resend, per-app branding) with an in-app notification if the address already has an account.
- Accept: `POST /collection-members/accept` with the token in the body, by a **signed-in** account whose **verified** email matches the invite. Mismatch → one generic message. The invite waits while the invitee creates a free account.
- Owner: list, change role, remove (effective next request). Member: leave. Owner account deletion removes all memberships (CASCADE).

### v1 surface ("core keeping")

| Area | Routers | Viewer | Logger | Keeper |
|---|---|---|---|---|
| TV animals + colonies | inverts, colonies | list, detail, growth, feeding stats, feeding status | — | create, edit, died/revive, change taxon |
| HV animals | animals | list, detail, feeding status, limits | bulk feedings | create, edit, died/revive |
| Logs | feedings, molts, substrate_changes, photos, care_logs, animal_events, sheds, weight_logs | read | create, edit, delete | — |
| Feeding Day | inverts/animals bulk + cadence, feeding-reminders | read | bulk log | — |
| Premolt | premolt | read | — | — |

Legacy per-taxon routers (`tarantulas`, `scorpions`, `centipedes`, `whip_spiders`, `scorpion_colonies`) stay owner-only; co-keeper clients use the generic `/inverts/*` screens. Invert log writes set the tarantula twin FK (as the sitter path does) so entries show on the owner's legacy tarantula page.

## Progress

| Step | State |
|---|---|
| 1. Foundation | ✅ `utils/access.py`, `collection_members` (`ckp_20260929`), policy tags + structural test |
| 2. Migrate v1 routers | ✅ 258/258 collection routes tagged; the structural test now **enforces**. ~130 co-keeper-reachable, the rest `owner_only` (or `public` for share tokens / public profiles). Both existing bugs fixed |
| 3. Attribution | ✅ `logged_by_user_id` on 8 more log tables (`cka_20260929`), written on every co-keeper log; responses carry `logged_by_name` |
| 4. Invites & membership API | ✅ `routers/collection_members.py` at `/api/v1/collection-members` |
| 5. Clients | ⏳ next |
| 6. Verify & review | ⏳ (per-router tests + mutation tests already done for steps 1–4) |

### Decisions made while building (2026-09-29)

- **Loggers change only their own entries**; keepers and the owner can change any entry (`require_can_change`). Viewers never write.
- **Choosing an animal's hero photo is a keeper action** (it changes the animal); uploading, captioning and deleting your own photo is logger.
- **Death / revive / change-taxon / bulk cadence are keeper actions**; deleting an animal or colony stays owner-only.
- **List endpoints take `?collection=<owner id>`** (inverts, colonies, animals, feeding status, bulk feeding, premolt dashboard, feeding reminders); absent means your own.
- **Invites can also be accepted in-app** (Shared with me), with the same checks as the email link: live, not your own, verified email that matches. Pending invites are listed only once your email is verified.
- The owner gets the accept link once at invite time (to send by text if they like); accepting still needs the invitee's verified email.
- **Activity feed:** none of the v1 co-keeper routes emit activity today (the generic log routes never did), so "credited on the owner's feed" has nothing to credit yet. It applies when those routes gain activity.
- **Deviation:** a co-keeper who deletes their account can't show as "former co-keeper" — `logged_by_user_id` is SET NULL, which is indistinguishable from "the owner". The entry stays; the name goes.

## Steps

1. **Foundation (invisible).** `access.py`, `@policy`, `collection_members` table + model, structural test in "report" mode, fix the colony-feeding and 403→404 bugs. *No behaviour change except the bug fixes.*
2. **Migrate the v1 routers**, one commit per group: (a) logs by id; (b) inverts + colonies; (c) HV animals; (d) Feeding Day + premolt + stats. Tag every other collection route `owner_only`. Structural test switches to enforcing.
3. **Attribution migration** + write `logged_by_user_id` + credited activity.
4. **Invites & membership API** + emails + notifications + lapse rule.
5. **Clients (both apps, both sites):** "Shared with me" collection switcher, members screen (invite / role / remove / leave), invite accept page + deep link, role-aware UI (hide what a role can't do), "by Alex" on history.
6. **Verify:** per-role tests for every migrated router (allowed / 403 / other keeper's → 404), mutation tests on the resolver, independent security review, privacy policy + terms copy (co-keepers see each other's names), PRD notes.
