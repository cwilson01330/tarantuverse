# Tarantuverse — Release & OTA Runbook

How to ship changes without silently orphaning a platform. Read this before any
mobile release. (Learned the hard way 2026-07-01, when iOS sat on runtimeVersion
`0.2.0` for weeks while every OTA published to `1.0.0` and never reached it.)

---

## The one rule that matters

**OTA updates (`eas update`) only reach installs whose `runtimeVersion` matches
the update's `runtimeVersion`.** If iOS and Android are on different
runtimeVersions, one `eas update` can NOT serve both.

`runtimeVersion` is pinned to an explicit string in `apps/mobile/app.json`:

```json
"runtimeVersion": "1.0.0"
```

It is **decoupled from the marketing version** (`version`) on purpose. Do NOT
change it back to `{ "policy": "appVersion" }` — that ties it to the marketing
version, so bumping `version` forks the OTA track and strands existing installs.

- **Marketing version (`version`)**: bump freely per release, per platform. Cosmetic (App Store / Play listing).
- **`runtimeVersion`**: bump ONLY when the native layer changes (see below). Both platforms must be built on the SAME `runtimeVersion` to share OTA.

---

## OTA-safe vs needs-a-native-build

### Ships over-the-air (`eas update`) — no store review
Pure JavaScript / assets: screens, components, styles, copy, business logic,
images bundled in JS, and anything using native modules **already present** in
the installed build.

```powershell
cd C:\Users\gwiza\Desktop\Dev\tarantuverse
git add apps
git commit -m "…"
git push
cd apps\mobile
eas update --branch production
```

Reaches every install whose `runtimeVersion` matches (currently `1.0.0`).

### Requires a new native build (`eas build` + store submit) — bump runtimeVersion
- Adding/removing/upgrading a **native dependency** (e.g. `react-native-keyboard-controller`, reanimated, anything with native code).
- **Expo SDK** upgrade.
- Native config in `app.json`: permissions, plugins, icons/splash, `scheme`, `softwareKeyboardLayoutMode`, entitlements.
- New app icon / adaptive icon.

For these: **bump `runtimeVersion`** (e.g. `1.0.0` → `1.1.0`), build BOTH
platforms on it, submit BOTH, and keep them in lockstep.

```powershell
cd apps\mobile
eas build --platform ios --profile production
eas build --platform android --profile production
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

> If you ship a native-only change via `eas update`, it crashes the app
> ("Invariant Violation: View config getter…"). OTA can only swap JS.

---

## Backend & web

- **Backend (FastAPI)** → Render auto-deploys on push to `main`. Wait ~2–3 min before OTA-ing mobile changes that depend on a new API shape/limit.
- **Web (Next.js)** → Vercel auto-deploys on push. Independent of mobile.
- iOS/Android both call the same API, so server-side changes reach every platform automatically regardless of runtimeVersion.

**Deploy order when a mobile change depends on the backend** (e.g. a raised query
limit): push (Render deploys API) → wait for Render → then `eas update`.

---

## Keeping platforms on the same track

Both platforms share OTA **only if their builds have the same `runtimeVersion`**.
- Current shared track: **`1.0.0`** (Android build ≥1.0.0, iOS build 52 = 1.0.0).
- When you bump `runtimeVersion` for a native change, you MUST rebuild + resubmit
  BOTH platforms, or whichever you skip drops off the OTA track until it catches up.

### Verify before assuming an update landed
```powershell
cd apps\mobile
eas update:list --branch production      # runtimeVersion each update targeted
eas build:list --platform ios --limit 1  # the live iOS build's runtimeVersion
eas build:list --platform android --limit 1
```
The build's `Runtime Version` must appear in the update list, or that platform
isn't receiving the update.

### Catch up a stranded build (stopgap, no rebuild)
If a live build is on an older runtimeVersion and you want current JS on it now:
temporarily set `runtimeVersion` in `app.json` to that build's value, `eas update
--branch production`, then set it back. (This is how iOS `0.2.0` was caught up on
2026-07-01 before the `1.0.0` build shipped.) Only works if the JS is compatible
with that build's native layer (no new native deps).

---

## In-app updates (no "force-close twice")

expo-updates downloads a new bundle on launch but applies it on the NEXT cold
start. To spare users that:
- `src/components/UpdateBanner.tsx` watches `useUpdates().isUpdatePending` and shows a one-tap **"Update ready → Restart"** banner (wired into `app/_layout.tsx`).
- **Settings → Help → Check for Updates** does the same on demand.

Both call `Updates.reloadAsync()` to apply instantly. Note: a *new* banner/logic
change itself still needs the current dance to install; it helps from the next
update onward.

---

## Quick release checklist

1. Is the change JS-only? → OTA. Native/SDK/config/icon? → native build (+ bump runtimeVersion, both platforms).
2. Depends on backend/web? → push first, let Render/Vercel deploy, then OTA.
3. Design-token gate green? `cd apps/mobile && node scripts/check-design-tokens.js`
4. `git add apps && git commit && git push`
5. OTA: `cd apps/mobile && eas update --branch production`
6. If native: build + submit BOTH platforms on the same runtimeVersion.
7. Verify with `eas update:list` / `eas build:list` that both platforms' runtimeVersions match the update.
