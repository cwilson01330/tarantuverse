# Forums pause switch + Feeding Day tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing `feature.forums_enabled` admin flag so OFF hides every forum/board entry point and refuses new posts, give Feeding Day its own mobile tab (Community moves to the You tab) and a web sidebar entry, and point keepers to outside communities.

**Architecture:** One server gate helper (`utils/forums_gate.py`) used by every forum + legacy-board route and by search/activity/discover/achievements; the flag reaches clients through the existing public `GET /api/v1/system/status`. Each client has a small cached features lib that the nav, screens and a shared "Forums are paused" page read. Mobile tab bar becomes Home · Collection · Feeding · Species · You.

**Tech Stack:** FastAPI + SQLAlchemy + pytest (apps/api); Next.js 14 + Tailwind (apps/web); Expo Router + React Native + jest-expo (apps/mobile).

**Spec:** `docs/superpowers/specs/2026-11-17-forums-pause-and-feeding-day-tab-design.md` (read it first).

## Global Constraints

- Nothing is deleted: no table, route, screen or row is removed. Flag ON = behaviour identical to today.
- Settings row key `feature.forums_enabled` (exists in production, value `true`), read with `settings_service.is_feature_enabled(db, "forums")`; status response key `features.forums_enabled`.
- Paused = forum/board WRITE → 403 `{"detail": "Forums are paused.", "code": "forums_paused"}`; READ → 404; admins (`is_admin` or `is_superuser`) are never paused. Direct messages are NOT affected.
- Legacy board (`routers/messages.py`, prefix `/api/v1/messages`) follows the same switch.
- Client default when the flag is unknown (no saved value, fetch failed): forums OFF. Saved key `features_v1` (web localStorage, mobile AsyncStorage).
- Outside communities, in this order: r/tarantulas `https://www.reddit.com/r/tarantulas/`, r/jumpingspiders `https://www.reddit.com/r/jumpingspiders/`, Arachnoboards `https://arachnoboards.com/`. Links only — no claims, no affiliation.
- Paused page copy: title "Forums are paused"; body "The forums were quiet, so we've put them away for now. Nothing has been deleted. To talk with other keepers, try these communities:"; then the links; a "Back" action. Card title on Community: "Talk with other keepers".
- Mobile tab order: Home · Collection · Feeding · Species · You; tab label "Feeding", screen title "Feeding Day", icon `silverware-fork-knife`. No badge.
- TV only, except HV web copy (Task 5). Dark mode on every web element; mobile ThemeContext + tokens, design-token gate passes without re-baselining; no new native modules (OTA-safe).
- Repo rules: no git writes by agents — "commit" = shadow snapshot `bash /sessions/elegant-sweet-meitner/mnt/outputs/sdd/day-one/env/snap.sh "<msg>"`; API tests via `with-pg.sh`; JS checks in the mirror after `js-sync.sh`; never install into the repo.

## Review Focus

1. An old app version (still showing the Forums tile) posting a thread or reply while paused must get 403 and nothing stored — Task 1 `test_paused_refuses_every_write` (incl. legacy board).
2. A future forum route added without the gate must fail a test — Task 1 `test_every_forum_and_board_route_is_gated` (static).
3. A keeper tapping an old forum notification (`/forums/thread/<id>`) must land on the paused page, not a blank/error screen — Tasks 4 and 5 (forum screens render the paused page before fetching).
4. Home's Start / See all and the daily digest deep link must still open Feeding Day after the route moves — Task 4 (`app/feeding-day.tsx` redirects to the tab; checked in the report by tracing every `router.push('/feeding-day')`).
5. A keeper who earned `first_post` keeps seeing that badge while paused — Task 2 `test_paused_keeps_earned_forum_badges`.

---

### Task 1: Server gate, status flag, forum + board routes

**Files:**
- Create: `apps/api/app/utils/forums_gate.py`
- Modify: `apps/api/app/routers/system_settings.py` (`get_system_status`), `apps/api/app/routers/forums.py` (all 14 routes), `apps/api/app/routers/messages.py` (all 10 routes)
- Test: `apps/api/tests/test_forums_pause.py`

**Interfaces:**
- Produces: `forums_enabled(db: Session) -> bool` (the flag); `forums_open(db: Session, user: Optional[User]) -> bool` (flag ON, or user is admin/superuser); `refuse_write_if_paused(db, user) -> None` (raises 403 `forums_paused`); `hide_read_if_paused(db, user) -> None` (raises 404 `Not found`). Tag helpers so `tests/test_access_policies.py` stays green (follow how `utils/broods.py::load_egg_sac` used `@access_helper` if that test requires it).
- `/system/status` → `features.forums_enabled: bool`.

- [ ] **Step 1: Failing tests** (`pytestmark = pytest.mark.requires_postgres`; set the flag by inserting/updating a `SystemSetting(key="feature.forums_enabled", value="false", value_type="bool", category="feature_flags")` row in `db_session` then `settings_service.invalidate_cache()`; invalidate again in teardown; admin = a `User` with `is_admin=True` + token via `create_access_token`):
  - `test_status_reports_forum_flag` — ON → `features.forums_enabled is True`; OFF → `False`.
  - `test_flag_on_changes_nothing` — ON: keeper can list categories, create a thread, reply; board create works.
  - `test_paused_refuses_every_write` — OFF, keeper: thread create/patch/delete, post create/patch/delete → 403 with `code == "forums_paused"`; board create/update/delete/reply/like/reaction → 403 same code; row counts unchanged.
  - `test_paused_hides_reads` — OFF: categories/category/threads/thread/posts and board list/get/replies → 404 for anonymous and for a keeper.
  - `test_admin_unaffected_when_paused` — OFF, admin: reads 200, thread create 201, category create 201.
  - `test_every_forum_and_board_route_is_gated` — static: parse `routers/forums.py` and `routers/messages.py`; every function decorated `@router.<method>` calls `refuse_write_if_paused` (non-GET) or `hide_read_if_paused` (GET).
  - `test_direct_messages_untouched` — OFF: sending a DM still works (use the existing DM route).
- [ ] **Step 2: Run** `cd /sessions/elegant-sweet-meitner/mnt/tarantuverse/apps/api && bash /sessions/elegant-sweet-meitner/mnt/outputs/sdd/day-one/env/with-pg.sh python3 -m pytest -q -p no:cacheprovider tests/test_forums_pause.py` → FAIL.
- [ ] **Step 3: Implement.** Read routes that take no user (`list_categories`, `get_category`, `list_threads`, `list_posts`, board `get_messages`, `get_message`, `get_replies`) gain `current_user: Optional[User] = Depends(get_current_user_optional)` from `app.utils.dependencies`. Call the gate first thing in each route. Check `apps/web/src/app/dashboard/admin/moderation/forums/page.tsx` sends `Authorization` on its forum GETs; add it if not.
- [ ] **Step 4: Run** the new file + `tests/test_access_policies.py` + every existing test touching forums/messages (grep `forums`, `/api/v1/messages`) → PASS.
- [ ] **Step 5: Snapshot** `snap.sh "forums pause T1: gate + routes"`.

### Task 2: Hide forum content in search, activity, discover, achievements

**Files:**
- Modify: `apps/api/app/routers/search.py` (forum block ~221-235 + total ~245), `apps/api/app/routers/activity.py` (`get_personalized_feed`, `get_global_feed`, `get_user_activity`), `apps/api/app/routers/discover.py` (`trending_threads`, `stats.total_forum_threads`), `apps/api/app/services/achievement_service.py` (`get_user_achievements`)
- Test: `apps/api/tests/test_forums_pause_surfaces.py`

**Interfaces:** Consumes Task 1 `forums_open(db, user)`. Constant `FORUM_ACHIEVEMENT_KEYS = ("first_post", "contributor_10")` in `achievement_service.py`; `get_user_achievements(db, user_id, hide_forum_unearned: bool = False)` — the router passes `not forums_open(db, current_user)`; when true, drop unearned `FORUM_ACHIEVEMENT_KEYS` rows before computing `total_available`. `check_and_award` is unchanged (nothing new can be earned while paused anyway). `routers/keepers.py` has no forum counts (checked) — no change.

- [ ] **Step 1: Failing tests** (flag OFF via the Task 1 helper pattern; a forum thread + post exist):
  - `test_paused_search_has_no_forum_results` — no `type == "forum"` items; total excludes them. ON → forum result present.
  - `test_paused_feeds_drop_forum_items` — all three feeds contain no `forum_thread`/`forum_post`; `action_type=forums` → empty list (200, not 422).
  - `test_paused_discover_has_no_threads` — `trending_threads == []` and `stats.total_forum_threads is None`.
  - `test_paused_hides_unearned_forum_badges` — `GET /achievements/` has no `first_post`/`contributor_10` for a keeper who hasn't earned them; `total_available` reduced by 2.
  - `test_paused_keeps_earned_forum_badges` — a keeper with a `UserAchievement(first_post)` still sees `first_post` (earned) but not `contributor_10`.
  - `test_flag_on_surfaces_unchanged` — ON: all of the above show forum content as before.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (admins see everything, like Task 1; anonymous discover/search callers count as non-admin). **Step 4: Run** new + existing search/activity/discover/achievement tests → PASS.
- [ ] **Step 5: Snapshot** `snap.sh "forums pause T2: surfaces"`.

### Task 3: Client features libs + paused page + outside-communities card

**Files:**
- Create: `apps/web/src/lib/features.ts`, `apps/web/src/components/ForumsPaused.tsx`, `apps/web/src/components/OutsideCommunities.tsx`, `apps/web/tests/features.test.mts`; `apps/mobile/src/lib/features.ts`, `apps/mobile/src/hooks/useFeatures.ts`, `apps/mobile/src/components/ForumsPaused.tsx`, `apps/mobile/src/components/OutsideCommunities.tsx`, `apps/mobile/src/lib/__tests__/features.test.ts`
- Modify: `apps/web/src/components/HerpetoverseBanner.tsx` (read status through `getSystemStatus()` so the app makes one status call per session)

**Interfaces (Produces):**
- Both libs, identical below `// ---- shared below: keep identical in both copies ----` (add the pair to `apps/api/tests/test_jumper_libs_in_sync.py`'s pattern or a new `tests/test_features_libs_in_sync.py`): `type Features = { forumsEnabled: boolean }`; `DEFAULT_FEATURES: Features = { forumsEnabled: false }`; `FEATURES_STORAGE_KEY = 'features_v1'`; `featuresFromStatus(status: unknown): Features | null` (null when the shape is wrong); `pickFeatures(fetched: Features | null, saved: Features | null): Features` (fetched → saved → default); `OUTSIDE_COMMUNITIES: { label: string; url: string }[]` (exact list from Global Constraints); `FORUMS_PAUSED_TITLE`, `FORUMS_PAUSED_BODY` (exact copy).
- Web: `getSystemStatus(): Promise<unknown>` (one cached promise per page load), `useFeatures(): Features` hook (reads saved localStorage value synchronously, then refreshes; try/catch on storage).
- Mobile: `useFeatures(): Features` (AsyncStorage saved value, one fetch per app session via the existing api client; storage errors ignored).
- `<ForumsPaused />` (both): title, body, OUTSIDE_COMMUNITIES as tappable links (web `target="_blank" rel="noopener noreferrer"`, mobile `Linking.openURL`), Back (web `router.back()` falling back to `/community`; mobile `router.back()` falling back to `/(tabs)`).
- `<OutsideCommunities />` (both): card titled "Talk with other keepers" with the same links.

- [ ] **Step 1: Failing tests** — `featuresFromStatus({features:{forums_enabled:false}})` → `{forumsEnabled:false}`; malformed → null; `pickFeatures(null, null)` → default OFF; `pickFeatures(null, {forumsEnabled:true})` → saved; `pickFeatures({forumsEnabled:false}, {forumsEnabled:true})` → fetched; `OUTSIDE_COMMUNITIES` equals the exact list.
- [ ] **Step 2: Run** (web: `cd /tmp/tv/repo/apps/web && node --test --experimental-strip-types tests/features.test.mts`; mobile: `cd /tmp/tv/repo/apps/mobile && node_modules/.bin/jest src/lib/__tests__/features.test.ts`, after `js-sync.sh`) → FAIL. **Step 3: Implement.** **Step 4:** tests + `tsc --noEmit` both apps + design-token gate → PASS.
- [ ] **Step 5: Snapshot** `snap.sh "forums pause T3: client libs + paused page"`.

### Task 4: Mobile — Feeding tab, Community on You, forum entry points

**Files:**
- Move: `apps/mobile/app/feeding-day.tsx` content → `apps/mobile/app/(tabs)/feeding-day.tsx` (drop the back button: no `leftAction`); `apps/mobile/app/feeding-day.tsx` becomes `<Redirect href="/(tabs)/feeding-day" />`
- Move: `apps/mobile/app/(tabs)/community.tsx` screen → `apps/mobile/app/community-feed.tsx` (add an `AppHeader` back action → `router.back()`); `(tabs)/community.tsx` becomes `<Redirect href="/community-feed" />`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx` (Tabs order: index, collection, feeding-day, species, profile; `community` → `href: null`), `apps/mobile/app/(tabs)/profile.tsx` (new `MenuRow` icon `account-group` label "Community" → `/community-feed`, in a section near Notifications), `apps/mobile/app/(tabs)/index.tsx` (Forums tile shown only when `forumsEnabled`), `apps/mobile/app/community-feed.tsx` (Forums chip only when enabled; `<OutsideCommunities />` above the feed; fix the stale "client-side" comment), `apps/mobile/app/search.tsx` (no forum section when disabled), `apps/mobile/app/discover.tsx` (no trending threads / forum stat when disabled), `apps/mobile/app/settings/notifications.tsx` (hide the `forum_replies_enabled` row when disabled), forum screens `app/(tabs)/forums.tsx`, `app/forums/[category].tsx`, `app/forums/new-thread.tsx`, `app/forums/thread/[id].tsx`, `app/community/forums/[slug].tsx`, `app/community/forums/[slug]/*`, `app/community/board.tsx` (render `<ForumsPaused />` and skip fetching when disabled)

**Interfaces:** Consumes Task 3 `useFeatures`, `ForumsPaused`, `OutsideCommunities`.

- [ ] **Step 1:** Implement the moves + tab layout; trace every `'/feeding-day'` and `'/(tabs)/community'` reference (grep) and confirm each still resolves (list them in the report).
- [ ] **Step 2:** Implement the flag-driven hiding listed above.
- [ ] **Step 3: Verify** `bash …/js-sync.sh && cd /tmp/tv/repo/apps/mobile && node_modules/.bin/tsc --noEmit -p . && node_modules/.bin/jest && node scripts/check-design-tokens.js` → all PASS.
- [ ] **Step 4: Snapshot** `snap.sh "forums pause T4: mobile"`.

### Task 5: Web — sidebar, forum entry points, copy

**Files:**
- Modify: `apps/web/src/components/Sidebar.tsx` (add `{ icon: '🍽️', label: 'Feeding Day', path: '/dashboard/feeding-day' }` right after Collection; Forums item only when `forumsEnabled`; keep the admin insertion working), `apps/web/src/app/community/page.tsx` (Forums button only when enabled; `<OutsideCommunities />`), `apps/web/src/app/community/discover/page.tsx` (no trending threads / forum stat when disabled), `apps/web/src/components/GlobalSearch.tsx` (no forum group / placeholder mention when disabled), `apps/web/src/components/ActivityFeed.tsx` (no `forum_thread`/`forum_post` filter options when disabled), `apps/web/src/app/dashboard/settings/notifications/page.tsx` (hide forum replies switch when disabled), `apps/web/src/components/DashboardTour.tsx` (no Forums step when disabled), forum pages `app/community/forums/page.tsx`, `[category]/page.tsx`, `[category]/new/page.tsx`, `thread/[id]/page.tsx`, `app/community/board/page.tsx` (render `<ForumsPaused />` without fetching when disabled)
- Static copy (not flag-driven): `apps/web/src/app/page.tsx` lines ~874, ~886, ~967, ~974, ~1042, ~1202-1203 — stop claiming forums / the activity board (reword to what exists: public profiles, keeper directory, direct messages, share cards; drop the Forums and Activity Board footer links); `apps/web/src/app/contact/page.tsx:74` (drop the `/community/board` link); `apps/web-herpetoverse/src/app/app/page.tsx:74` body → "Shared with Tarantuverse — keepers and discovery."
- Do NOT edit privacy/terms/legal pages (they describe stored data, which still exists).

- [ ] **Step 1:** Implement; dark mode on every new element.
- [ ] **Step 2: Verify** `bash …/js-sync.sh && cd /tmp/tv/repo/apps/web && node_modules/.bin/tsc --noEmit -p . && node --test --experimental-strip-types tests/*.test.mts` + eslint on touched files (as in earlier reports) + `cd /tmp/tv/repo/apps/web-herpetoverse && node_modules/.bin/tsc --noEmit -p .` → PASS.
- [ ] **Step 3: Snapshot** `snap.sh "forums pause T5: web"`.

### Task 6: What's new, docs, full verification

**Files:**
- Modify: `apps/api/app/content/whats_new.json` — add a `tarantuverse` entry `2026-11-23-feeding-day-tab` (published_on "2026-11-23", premium false, action target `feeding_day`, title ≤60 e.g. "Feeding Day has its own tab", body ≤220 plain: on the phone it sits in the tab bar, on the web in the sidebar; Community moved under You). Add a second entry `2026-11-23-egg-sac-photos` (premium false, no action or target `collection`): egg sacs can have a photo; mature male jumping spiders linked to a jumper species show a sourced note on how long males usually live after maturing. No mention of forums. Both entries are dated 2026-11-23 only if API, web AND the OTA are live before that Monday; otherwise Cory bumps both to the next Monday at release (the existing `2026-11-23-egg-sacs-to-sling-groups` entry stays as it is).
- Modify: `C:\Users\gwiza\Desktop\Dev\tarantuverse\CLAUDE.md` — new bullet "Forums pause + Feeding Day tab (2026-11-17)": flag key, `utils/forums_gate.py` helpers + the static gating test, surfaces hidden, client features libs + `features_v1`, paused page/outside communities, legacy board on the same switch, static landing/contact/HV copy (restore by hand if forums return), mobile tab order + `/feeding-day` and `/(tabs)/community` redirects, web sidebar entry; how to revive (flip the flag in `/dashboard/admin/settings`, restore copy).
- [ ] **Step 1:** Entries + CLAUDE.md; `tests/test_whats_new.py` + `tests/test_whats_new_targets_in_sync.py` PASS.
- [ ] **Step 2: Full verification:** API `run-suite.sh 0..3`; web tsc + node tests + eslint; mobile tsc + jest + token gate; `pnpm run check:bundle` in apps/mobile (`/tmp/tv/pnpm-bin/node_modules/.bin/pnpm run check:bundle`) → all PASS, recorded in the report.
- [ ] **Step 3: Snapshot** `snap.sh "forums pause T6: docs + verification"`.
