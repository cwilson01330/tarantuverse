# Herpetoverse — First Native Build & Push Setup

Everything in the app is ready in code. Push **delivery** and the store build need
credentials that only you can create (Firebase, Apple, EAS). This is the checklist.

App identifiers: iOS `com.herpetoverse.app` · Android `com.herpetoverse.app` ·
EAS project `8f745ac0-847d-4a69-93b3-a3a31970d616` (slug `herpetoverse`, owner `gwizard202`).

---

## What's already done (in code)

- `expo-notifications`, `expo-document-picker`, `expo-clipboard` are all dependencies
  at SDK-54 versions.
- Push token registration is wired: on login/launch `AuthContext` calls
  `getExpoPushToken()` (reads HV's own EAS projectId) → `POST /notification-preferences/push-token`.
- `expo-notifications` config plugin added to `app.json`.
- Feeding reminders + daily digest count HV animals (transferred animals excluded).

**Nothing below is a code change** — it's account/credential setup + the build itself.

---

## A. Android push (Firebase / FCM V1)

1. Firebase console → create (or reuse) a project → **Add app → Android**, package
   name `com.herpetoverse.app`.
2. Download **`google-services.json`** → place at
   `apps/mobile-herpetoverse/google-services.json`.
3. Add one line to `apps/mobile-herpetoverse/app.json` under `"android"`:
   ```json
   "googleServicesFile": "./google-services.json",
   ```
   (Left out on purpose right now so a build isn't blocked before the file exists.)
4. Firebase → **Project settings → Service accounts → Generate new private key** →
   downloads a service-account JSON.
5. Upload it to Expo: `eas credentials` → Android → **FCM V1 service account key**
   (or EAS dashboard → the herpetoverse project → Credentials → Android).

> `google-services.json` is client config and is safe to commit. The **service-account
> private key JSON is a secret — never commit it** (same rule as the `.p8`).

## B. iOS push (APNs)

- Easiest path: run the production iOS build (Section C) and let EAS manage
  credentials — it prompts to enable Push Notifications and generates/uploads the
  APNs key for you.
- Manual path: `eas credentials` → iOS → **Push Notifications Key** → set up (creates
  or uploads an APNs `.p8` auth key). The App ID gets the Push capability automatically.

> The APNs `.p8` is a secret — never commit it (already covered by the `*.p8` gitignore).

## C. Build

From `apps/mobile-herpetoverse`:

```bash
cd apps/mobile-herpetoverse

# internal test build first (recommended)
eas build --platform all --profile preview

# store builds
eas build --platform all --profile production
```

`eas.json` already has `preview` (APK / ad-hoc) and `production` (app-bundle / Release,
auto-incrementing build numbers) profiles. Consider bumping `version` in `app.json`
from `0.1.0` → `1.0.0` before the first store submission (your call).

## D. Submit

```bash
eas submit -p ios --profile production
eas submit -p android --profile production   # needs a Play service account + listing
```

(Requires App Store Connect + Play Console listings set up first.)

## E. Verify push end-to-end

1. Install the **dev/preview/prod** build on a real device (push tokens never work in
   Expo Go).
2. Log in → confirm a token saved: the user's `notification_preferences` row should now
   have a non-null `expo_push_token` (check via the Neon read connector).
3. Send a test push to that token with the Expo tool: <https://expo.dev/notifications>.
4. Daily digest: the digest engine is shared with Tarantuverse. If the Render **cron
   job** + `CRON_SECRET` are already set for TV, HV animals are already included — no
   extra setup. If not, add an hourly job:
   `curl -X POST https://tarantuverse-api.onrender.com/api/v1/notifications/run-digests -H "X-Cron-Secret: <CRON_SECRET>"`.

---

## Notes / gotchas

- Adding the `expo-notifications` plugin means the next build is a **full native build**
  (`eas build`), not an OTA `eas update`. Same for `expo-document-picker` (the import
  file-picker). Both only work once this native build ships.
- Android notifications use the default channel in v1 (fine). A branded small-icon +
  accent color is a later polish item (`expo-notifications` plugin options).
- HV launches free — no IAP/subscription config needed for this build.
