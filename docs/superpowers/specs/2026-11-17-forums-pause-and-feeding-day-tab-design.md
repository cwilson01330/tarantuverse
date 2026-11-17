# Pause the forums behind a switch, and give Feeding Day its own tab — design

Date: 2026-11-17 · Status: approach chosen in conversation (A), awaiting Cory's review
Product: Tarantuverse (TV). Herpetoverse (HV) only where it mentions TV's forums.

## 1. Why

Production data (2026-11-17, Neon, read-only):

- The forums have had **3 threads and 5 posts from 2 people, ever**; the last post was 2026-08-06. 0 threads in the last 30 days.
- Other social parts get light, quiet use: 47 follows (3 in 30 days), 19 public collections, 8 direct messages in 30 days.
- 26 keepers logged a feeding in the last 7 days; 50 in 30 days. That is the whole audience a forum could draw on.
- An empty forum works against the app: a new keeper who opens it sees three threads from August and concludes nobody is here.
- Feeding Day — the thing keepers do every week — is hard to reach: on mobile only from Home's Start button, which appears only when something is due; on the web it isn't in the sidebar at all.

Cory's goals (stated): don't delete the forums in case they become worthwhile later; don't take on moderating an open-ish forum; send community conversation to places keepers already gather; keep the low-maintenance social features; give Feeding Day its own button (chosen: its own mobile tab, replacing Community, which moves to the You tab).

Success: no forum entry point is visible while the switch is off and nothing new can be posted; flipping the switch back restores everything with no code change; Feeding Day is one tap from anywhere on mobile and in the web sidebar.

## 2. Goals, non-goals, anti-goals

Goals:
1. Wire the existing admin flag `feature.forums_enabled` (system_settings, currently `true`) so that OFF hides every forum entry point on web and mobile and the server refuses new forum content.
2. A "Forums are paused" page for old links, pointing to outside communities.
3. An "Talk with other keepers" card linking to outside communities.
4. Mobile: Feeding Day becomes a bottom tab in Community's slot; Community moves to a row on the You tab.
5. Web: Feeding Day gets a sidebar entry.
6. Marketing copy stops claiming forums while they're off.

Non-goals: deleting forum tables, routes, screens or data; changing direct messages, follows, public collections, share cards, activity feed (other than hiding forum items), or the admin moderation page; HV mobile (it has no forum surfaces); a due-count badge on the Feeding Day tab (could come later).

Anti-goals (would be failure even if it "works"): any forum data deleted; anyone (including old app versions) able to post into a hidden forum; a keeper landing on a blank or erroring screen from an old link; Feeding Day losing any existing entry point (Home Start / See all, notification deep links).

## 3. Approaches (chosen: A)

- **A. Hide in the apps + refuse new posts on the server (chosen).** Clients read the flag from the public status endpoint and hide every entry point; old links show a paused page; the server refuses forum writes and hides forum reads from non-admins. Flip back = everything returns. Old app versions still show their Forums tile until updated, but the server check stops anything new.
- B. Hide in the apps only. Less work, but old app versions or direct API calls could still post into a forum nobody reads — the moderation burden Cory wants to avoid.
- C. Delete the forum screens. Simplest, but contradicts "keep them in case forums become a thing again".

## 4. Server

- `GET /api/v1/system/status` (public, already used by the web Herpetoverse banner and HV web layout) adds `features.forums_enabled: bool` (response key) from `settings_service.is_feature_enabled(db, "forums")`, which reads the settings row `feature.forums_enabled`. Verified 2026-11-17 in production: that row exists (category feature_flags, value `true`). Default true when the row is missing — matches `is_feature_enabled`.
- One helper, e.g. `utils/forums_gate.py::forums_open(db, user) -> bool` (true when the flag is on, or the user is an admin; `user` may be None) and `refuse_if_forums_paused(db, user)`. Forum routes that don't authenticate today (`GET /forums/categories`, `/categories/{slug}`, `/categories/{slug}/threads`, `/threads/{id}/posts`) gain an OPTIONAL current user (the same optional-auth dependency `GET /threads/{id}` already uses) so admins are recognised; anonymous callers count as non-admin. Check the web admin moderation page sends its token on these calls; add it if not.
  - Every forum WRITE route in `routers/forums.py` (thread create/patch/delete, post create/patch/delete, category create/patch/delete) → 403 `{"detail": "Forums are paused.", "code": "forums_paused"}` when not open. Admin category management is allowed (admins are always "open").
  - Every forum READ route → 404 when not open (so old links and old app versions get "not found", and the content is out of sight). Admins keep full access (the moderation page keeps working).
  - The legacy community board (`routers/messages.py` threads + `message_replies` / likes / reactions; mobile `app/community/board.tsx`) is the same kind of public posting surface — 0 messages ever in production — and follows the SAME switch: writes 403 `forums_paused`, reads 404 for non-admins, entry points hidden. Direct messages (`direct_messages`) are NOT affected.
  - A flip takes up to 5 minutes to reach the server checks (settings cache TTL). Accepted: nobody is posting today.
- Other places that surface forum content, when the flag is off:
  - Global search (`routers/search.py`): no forum-thread results.
  - Activity feeds (`routers/activity.py`): exclude `forum_thread` / `forum_post` items; the `action_type=forums` filter returns an empty list.
  - Discover (`routers/discover.py`): no trending threads (empty list; the client hides the section when empty).
  - Notifications: no new forum-reply pushes are possible (no new replies); existing notification-center rows for forum replies stay, and their deep link (`/forums/thread/<id>`, allow-listed in `services/notification_service.py`) lands on the paused page.
  - Achievements: `first_post` and `contributor_10` count forum posts and can't be earned while paused. The gallery (`GET /achievements/` + definitions) hides those two while paused UNLESS the keeper already earned them (earned badges always show). They stay in the database and reappear when forums come back.
  - Public keeper profiles / keeper stats: any forum post or thread count is omitted (or 0 and hidden by the client) while paused — check `routers/keepers.py` and the profile clients.
  - Admin analytics/moderation: unchanged.
- The settings cache TTL is 5 minutes, so a flip takes up to 5 minutes to reach the server checks.
- Tests: status exposes the flag; with the flag off — every forum write 403 `forums_paused` (enumerate routes from the router so a future route can't slip past: a static test that every route in `routers/forums.py` calls the gate), reads 404 for keepers, admins unaffected, search/activity/discover carry no forum items; with the flag on — everything as before (existing forum tests stay green).

## 5. Clients — the flag

- One small hook/lib per platform: web `lib/features.ts` (`useFeatures()` / `getFeatures()`), mobile `src/lib/features.ts` + hook. One cached `GET /system/status` per app session (signed in or out), shared with the web Herpetoverse banner where practical.
- Default while loading or if the request fails: the last known value saved on the device (web localStorage `features_v1`, mobile AsyncStorage `features_v1`); with no saved value, treat forums as OFF (hiding a forum briefly is harmless; showing a dead one is not). While the flag is ON, a fresh install may hide forum entry points until the first status read lands — accepted, since the plan is to switch the flag OFF right after release.
- Pure logic (merge saved + fetched, defaults) in a tested helper (mobile jest, web node test).

## 6. Clients — what hides when forums are OFF

Mobile (TV):
- Home "Everything else" grid: the Forums tile is removed (Feeding Day now has a tab, so the grid keeps its other 7 tiles).
- Community screen feed chips: no "Forums" chip.
- Search screen: no forum section.
- Discover: no trending-threads section.
- Notification settings: the "Forum replies" switch is hidden.
- Forum screens (`(tabs)/forums.tsx`, `forums/*`, `community/forums/*`): render the paused page instead of loading.

Web (TV):
- Sidebar: no Forums item.
- `/community` page: no forum links/sections; `/community/discover`: no trending threads.
- GlobalSearch (Cmd+K): no forum group.
- Notification settings page: no forum-replies switch.
- `/community/forums/**` pages: the paused page.
- Landing page (`app/page.tsx`): the forum mentions (features section ~874-886, the search/export lines ~967/974 that name forums, the plan feature list ~1042, footer link ~1202) are reworded to not claim forums — static copy, NOT flag-driven (a server-rendered marketing page that changes with a runtime flag isn't worth it); reviving forums means restoring that copy (noted in CLAUDE.md). `public/llms.txt` and the TV pricing/FAQ copy are checked for forum claims and updated the same way.

HV web: the home card "Shared with Tarantuverse — forums, keepers, and discovery." becomes "Shared with Tarantuverse — keepers and discovery." (static copy).

## 7. The paused page and "Talk with other keepers"

- Paused page copy (both platforms): title "Forums are paused"; body "The forums were quiet, so we've put them away for now. Nothing has been deleted. To talk with other keepers, try these communities:" followed by the outside-community links; a "Back" action.
- "Talk with other keepers" card: on the Community screen (mobile and web), above the feed — the same links, one line each, opening in the browser.
- Links (my call, Cory to confirm — see §10): r/tarantulas, r/jumpingspiders, Arachnoboards. Stated as links only — no claims about the communities, no affiliation implied. Kept in one list per platform (`OUTSIDE_COMMUNITIES` in the features lib) so it's a one-line change.

## 8. Feeding Day tab (mobile) and sidebar entry (web)

Mobile:
- Tab bar becomes: **Home · Collection · Feeding · Species · You** (5 tabs, iOS limit respected). Label "Feeding", screen title "Feeding Day", icon `silverware-fork-knife` (already used for feeding on Home).
- Implementation: the Feeding Day screen moves to `(tabs)/feeding-day.tsx` as the ONE instance. The old stack route `app/feeding-day.tsx` becomes a redirect to the tab, so Home's Start / See all buttons, the daily digest notification and any deep link switch to the Feeding tab (not a pushed copy with a back button). Any params the old route accepted are passed through to the tab.
- As a tab it renders without a back button (today's `AppHeader` back action is dropped on the tab) and without relying on params it doesn't get.
- Community: the screen moves to a stack route (e.g. `app/community-feed.tsx` or `app/community/index.tsx` — builder's choice of file) with a normal back button, opened by a **"Community"** row on the You tab (`(tabs)/profile.tsx`, near the existing social rows). The `(tabs)/community` route stays registered with `href: null` and redirects to that stack route, so existing links/deep links still resolve. Discover/keepers/messages remain reachable from inside Community as today; the DM bell stays in Home's header.
- Home quick-action grid: no Feeding Day tile needed (it's a tab now).

Web:
- Sidebar: **Feeding Day** (`/dashboard/feeding-day`, icon 🍽️) right after Collection. Community and Discover stay in the web sidebar (the web has room); Forums item shown only when the flag is on.

## 9. Rollout and copy

- API first (flag still ON in production, so nothing changes yet), then web and the mobile OTA (no native modules → OTA-safe; `pnpm run check:bundle` before `eas update`).
- Then Cory flips `feature.forums_enabled` to OFF in `/dashboard/admin/settings`. Within ~5 minutes the server refuses forum writes; clients hide entry points on their next status read.
- What's new: one entry for the Feeding Day tab (dated the next Monday after web + OTA are live, per the weekly rule; plain copy, no mention of forums being removed beyond what's true). The forums pause itself gets no What's new entry (behind-the-scenes/removal).
- CLAUDE.md: a bullet describing the flag, the gate helper, where entry points hide, the static landing copy, and how to revive.

## 10. Calls I made (Cory to check while reading)

1. Outside communities linked: r/tarantulas, r/jumpingspiders, Arachnoboards.
2. Old forum threads are hidden from non-admins (404) rather than left readable.
3. Landing/pricing/llms copy is reworded statically rather than following the flag.
4. With no saved flag value and no network, forums are treated as OFF.
5. Mobile tab label "Feeding" (title "Feeding Day").
6. No due-count badge on the tab for now.
7. The unused legacy community board follows the same switch as the forums (0 posts ever).
8. Forum-only achievements (`first_post`, `contributor_10`) are hidden while paused unless already earned.
9. The old `/feeding-day` route redirects to the new tab instead of keeping a second copy of the screen.

## 11. Left to the builder

Exact component structure, how the web shares the status fetch with the Herpetoverse banner, test file names, and the exact placement of the Community row within the You tab's existing sections.
