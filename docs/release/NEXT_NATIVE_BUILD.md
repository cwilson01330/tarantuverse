# Next native (store) build — queued items

Target: new store versions of both apps within 5–7 days of 2026-10-07.
Everything here needs a native binary (OTA `eas update` can't deliver it), so
it ships together. Bump `runtimeVersion` in each app's `app.json` (TV is
1.1.0, HV is 1.2.0 today) so OTA updates built for the new binary never land
on older installs.

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

## Tarantuverse

- **Deep links for non-tarantula labels (audit B2):** Android intent filters
  and iOS associated-domain paths for `/i/*` and `/col/*` (today only `/t/*`
  opens the app).

## Herpetoverse

- (none yet)
