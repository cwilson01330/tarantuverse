# ADR-009: Notification System Rework — "help, not harass"

**Status:** Accepted — 2026-07. Phase 1 in progress.

## Context / findings (audited 2026-07)

Push notifications have never worked, there is no in-app notification center, and
the local reminders spam. Root causes, verified:

**Delivery is broken.**
- `notification_preferences`: **0 of 28 rows have an `expo_push_token`** — the
  backend has nothing to send to, so every push is a no-op.
- `src/services/notifications.ts::getExpoPushToken()` calls
  `getExpoPushTokenAsync({ projectId: '9c77e4ff-…' })`, but the app's real EAS
  projectId (app.json `extra.eas.projectId` and the updates URL) is
  **`1d412361-…`**. A mismatched projectId makes the call throw → returns null →
  nothing is saved. **Primary code bug.**
- Token registration only runs on the Notifications *settings* screen
  (`checkNotificationPermissions` on mount / the request-permission button),
  never at login/launch. Even without the projectId bug, almost nobody would get
  a token.
- Android has no FCM configured (no `expo-notifications` plugin, no
  `googleServicesFile`). Expo push to Android needs FCM V1 — without it Android
  can't even mint a token. iOS APNs (managed by EAS) is unverified.

**No notification center.**
- The web "bell" in `TopBar.tsx` is a mislabeled **Messages** link
  (`router.push('/messages')`, badge = DM unread from
  `/messages/direct/unread-count`). Not a notifications bell.
- There is no `notifications` table — only `notification_preferences`.
  `activity_feed` is the *community* stream (public actions), not a personal
  inbox. Mobile has no notifications screen (`notifications.tsx` +
  `settings/notifications.tsx` are both the *preferences* screen).

**Local reminders spam.** Feeding reminders are scheduled **per animal** as
individual on-device `TIME_INTERVAL` timers (`scheduleFeedingReminder` from the
feeding/substrate/detail screens), so 5 overdue animals = 5 separate
notifications.

## Goal

A **daily briefing, not a stream.** One in-app place to see what happened;
push reserved for what actually matters; digests over per-item pings; quiet
hours and frequency caps enforced centrally. Never nag ("all caught up!" = send
nothing).

## Decision

**Backbone: a `notifications` table + a single `create_notification()` service.**
Every notify-worthy event writes one row. **Push is an optional side-effect of
`create_notification`**, gated by the user's prefs + the event's urgency. The
in-app center and the bell's unread badge both read this table. This is the lever
for "help not harass": low-urgency events land silently in the center with no
push; push is reserved for the daily digest and DMs.

### `notifications` table (migration)
`id` (uuid pk), `user_id` (fk users, cascade, indexed), `type` (str), `title`
(str), `body` (text), `deeplink` (str, nullable), `data` (JSONB, nullable),
`is_read` (bool default false), `created_at` (timestamptz). Index
`(user_id, is_read, created_at desc)`.

### Types + default delivery
| type | in-app center | push (default) |
|---|---|---|
| `feeding_digest` | yes | **yes** — once/day, only if something is due |
| `direct_message` | yes | **yes** — coalesced ("2 new messages from X") |
| `forum_reply` | yes | no (opt-in) |
| `new_follower` | yes | no (silent) |
| `community_activity` | yes | no (silent; opt-in weekly digest later) |
| `transfer_claimed` / `system` | yes | yes (transactional, low volume) |

### Guardrails (enforced in `create_notification` / the digest job)
- Quiet hours (already in prefs) — suppress push during the window, still write
  the center row.
- Per-category daily cap; digest coalesces rather than repeats.
- Never send an empty/"you're all good" push.

### Simplified preferences
Collapse the current pile of toggles to: **Daily digest** (on + time picker),
**Messages**, **Community updates**. Keep quiet hours.

## Phases

**Phase 1 — Delivery fixes (this ADR; OTA + one native build).**
- Code (OTA-safe): projectId read dynamically from
  `Constants.expoConfig.extra.eas.projectId` (fallback to the correct id);
  register the push token on login/launch in `AuthContext` (not just the settings
  screen). This starts tokens flowing (iOS immediately if APNs is on EAS).
- Config / native build (Cory — see checklist): FCM V1 + `expo-notifications`
  plugin + confirm APNs.

**Phase 2 — Notification Center (backbone).**
- `notifications` table + `create_notification()` service + endpoints:
  `GET /notifications` (paginated), `GET /notifications/unread-count`,
  `POST /notifications/{id}/read`, `POST /notifications/read-all`.
- Route existing events (DM, follow, forum reply, community, transfer) through
  `create_notification`.
- Web: turn the bell into a real notifications panel/`/notifications` page; unread
  badge from the notifications table (not DM count). Mobile: a Notifications
  screen. Both mark-read.

**Phase 3 — Smart digest + guardrails.**
- Daily care digest: a scheduled job (Render Cron → protected endpoint, hourly)
  finds users whose local digest-time matches and who have something due,
  computes overdue via the existing species/life-stage-aware engine
  (`/inverts/feeding-status` / `_recommended_feeding_interval`), and sends **one**
  batched push per user, recording "sent today."
- Retire the per-animal local timers.
- Enforce quiet hours + caps centrally; ship the simplified prefs.

## FCM / APNs setup checklist (Cory — needs a native build)
1. Firebase: create a project, add an Android app (package
   `com.tarantuverse...`), download `google-services.json` into `apps/mobile/`.
2. app.json: add the `expo-notifications` plugin, and
   `android.googleServicesFile: "./google-services.json"`.
3. EAS: upload the FCM V1 service-account key — `eas credentials` (Android →
   Push notifications: FCM V1). Confirm the iOS APNs key is present too.
4. `eas build` both platforms (bump `runtimeVersion`), submit. (Native change —
   NOT an OTA.)
5. Verify with an admin "send test push to myself" path once tokens exist.

## Consequences
- One migration (`notifications`). A scheduler (Render Cron). Token backfill
  happens naturally once register-on-login ships. The bell/unread semantics
  change from "DM unread" to "notification unread."

Related: builds on the feeding-status overdue engine (bulk feeding /
species-aware ADR work), `notification_preferences`, quiet hours.
