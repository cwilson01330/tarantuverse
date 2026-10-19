# Next native (store) build — queued items

Target: new store versions of both apps within 5–7 days of 2026-10-07.
Everything here needs a native binary (OTA `eas update` can't deliver it), so
it ships together. Bump `runtimeVersion` in each app's `app.json` so OTA
updates built for the new binary never land on older installs.

**Version bump — do it right before `eas build` (2026-10-15: held back so the
JS fixes could still go out by OTA to the current binaries).** The native
config for this build (review prompt, deep-link paths, mic permission, store
URLs) is already in both `app.json` files and `package.json`; it only takes
effect in the next binary. At submission time bump:
- Tarantuverse `apps/mobile/app.json`: `version` 1.8.0 → **1.9.0**,
  `runtimeVersion` 1.1.0 → **1.2.0**. Create version 1.9.0 in App Store Connect.
- Herpetoverse `apps/mobile-herpetoverse/app.json`: `version` 1.1.0 →
  **1.2.0**, `runtimeVersion` 1.2.0 → **1.3.0**. Create version 1.2.0.
  **Done 2026-10-19** (HV submitting first, with its first IAP products).

The review-prompt code checks for the `ExpoStoreReview` native module before
loading it, so on today's binaries it simply does nothing.

## Both apps (Tarantuverse + Herpetoverse)

- **In-app review prompt** (requested 2026-10-07, to compete on store reviews).
  Use `expo-store-review` (`StoreReview.requestReview()`), native on both
  stores. Ground rules so it helps rather than annoys:
  - Ask only after a success moment (e.g. a completed Feeding Day batch, a
    logged molt/shed, an Nth animal added), never on launch, never mid-task,
    never after an error.
  - Gate on `StoreReview.hasAction()`; at most once per app version and no
    more than every ~90 days (persist in AsyncStorage). The OS also rate-limits
    and may show nothing; never show our own "please rate us" pre-prompt that
    filters for happy users (Apple guideline 5.6.1 / Play policy).
  - Settings: a plain "Rate the app" row that opens the store page
    (`StoreReview.storeUrl()`), always available.
  - App Store copy must not mention any other platform.
  - **TV: done (2026-10-12).** `apps/mobile/src/lib/reviewPrompt.ts`
    (`maybeRequestReview(trigger)`, `openStorePage()`); dependency
    `expo-store-review ~9.0.8` added to `apps/mobile/package.json` (lockfile
    still to be updated by `pnpm install`). Triggers: Feeding Day batch saved
    (skipped when the one-time premium intro card shows instead), a new
    non-fatal molt saved (`app/invert/add-molt.tsx`, after the share-card
    offer is declined), and the 3rd+ animal added to the keeper's own
    collection (`app/add.tsx`; counted on-device, "add another" only counts).
    "Rate the app" row: You tab → Help & legal. The native module is loaded
    lazily behind `requireOptionalNativeModule('ExpoStoreReview')`, so the JS
    can't crash a binary without it. `ios.appStoreUrl` / `android.playStoreUrl`
    set in app.json for `storeUrl()`.
  - HV: separate work item.

## Tarantuverse

- **Deep links for non-tarantula labels (audit B2) — done (2026-10-12).**
  Android intent filters now use exact segments `/t/`, `/i/`, `/col/` (the old
  `/i` prefix also caught `/invite`). iOS `associatedDomains` lists both
  `tarantuverse.com` and `www.tarantuverse.com`. QR labels and other app-built
  links now use `https://www.tarantuverse.com` (the apex redirects
  `/.well-known/*` to www, which fails Universal Link / App Link verification).
- **Release-audit fixes (2026-10-12, `release-audit-2026-10-12.md`) — done:**
  - B1: "Revoke Premium" test button shown only to admins/superusers.
  - H1/H2: web-checkout link only on iOS when StoreKit reports the **US**
    storefront (`getStorefront()`); never while loading or as a fallback;
    never on Android (Play billing only). Stripe "Manage Billing" kept for
    existing Stripe subscribers.
  - M1: `expo-image-picker` plugin with `microphonePermission: false`;
    `android.blockedPermissions: RECORD_AUDIO`.
  - M2/M3: promo-code "redeem in settings" copy removed; pricing screen and
    UpgradeModal show store-localized prices from the IAP products, or no
    amount at all when the store can't be reached (never hardcoded USD).
  - M5: PostHog persists through AsyncStorage (`customStorage`).
  - M6: themed loading view instead of a blank screen at launch; `/auth/me`
    wait capped at 8 s, then the app opens on the cached user (a slow
    network never signs anyone out).
  - M9: care-sheet Source link fixed (`Linking.openURL` from react-native).
  - M10: in-app Terms synced to the web Terms (April 21, 2026); the
    in-app-purchase paragraph names only the current platform's store.
  - `app/+not-found.tsx`: friendly "This link isn't available in the app"
    screen instead of expo-router's sitemap.

## Herpetoverse

- (tracked separately)
