# Herpetoverse — Master Pre-Build & Launch Checklist

One place for everything between "code is done" and "live in stores." Detail docs
are linked per section. ✅ = done · ⬜ = your action.

App IDs: iOS/Android bundle `com.herpetoverse.app` · EAS project `herpetoverse`
(`8f745ac0-847d-4a69-93b3-a3a31970d616`) · web `herpetoverse.com`.

---

## 0. Native modules added this cycle (why ONE build carries everything)

All four are native → they only activate in a fresh `eas build`, never OTA:
- `expo-notifications` (push / feeding digest)
- `expo-document-picker` (collection import file upload)
- `@react-native-google-signin/google-signin` (Google sign-in)
- `expo-apple-authentication` (Apple sign-in)

Before building, pin them:
```
cd apps/mobile-herpetoverse
npx expo install @react-native-google-signin/google-signin expo-apple-authentication expo-document-picker expo-notifications
```

---

## 1. Android push — FCM  ✅ DONE
- ✅ `google-services.json` in `apps/mobile-herpetoverse/`, wired via `app.json`.
- ✅ FCM V1 service-account key uploaded to EAS.
Detail: `HV_NATIVE_BUILD_CHECKLIST.md`.

## 2. iOS push — APNs  ⬜
- ⬜ During the iOS build, accept EAS's offer to generate + upload the APNs key
  (or `eas credentials` → iOS → Push Key). One step, no file.

## 3. Google sign-in  ⬜  (detail: `HV_GOOGLE_SIGNIN_SETUP.md`)
- ⬜ Create 3 HV OAuth clients in Google Cloud: **Web**, **iOS** (bundle
  `com.herpetoverse.app`), **Android** (package + SHA-1 from `eas credentials`
  and the Play App-Signing SHA-1).
- ⬜ Set in `apps/mobile-herpetoverse/.env`:
  `EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB` / `_IOS` / `_ANDROID`.
- ⬜ In `app.json`, replace the placeholder `iosUrlScheme`
  `com.googleusercontent.apps.HV_IOS_CLIENT_ID` with your **reversed iOS client ID**.

## 4. Apple sign-in  ⬜
- ⬜ Enable **Sign in with Apple** on App ID `com.herpetoverse.app` (EAS can manage
  during build, or add manually). `app.json` already has `usesAppleSignIn: true`.

## 5. app.json — placeholders / version  ⬜
- ✅ `android.googleServicesFile` set.
- ⬜ Replace the Google `iosUrlScheme` placeholder (step 3).
- ⬜ (Optional) bump `version` `0.1.0` → `1.0.0` for the first store submission.

---

## 6. THE BUILD  ⬜
```
cd apps/mobile-herpetoverse
eas build --platform all --profile production
```
Accept the APNs key prompt on iOS. This one build carries push, import, Google +
Apple sign-in.

## 7. Submit to test tracks  ⬜
```
eas submit --platform android --profile production   # → Play Internal testing
eas submit --platform ios --profile production        # → TestFlight
```
- ⬜ iOS: App Store Connect app record for `com.herpetoverse.app` + an ASC API key
  (EAS can manage).
- ⬜ Android: a Google Play service-account JSON for `eas submit`, **or** upload the
  first `.aab` manually in Play Console (reliable for the first release).
- ✅ Business/org Play account → exempt from the 12-tester closed-testing rule.

---

## 8. Backend seeds (Render shell, after the backend deploys)  ⬜
Migrations `htr` / `hvs` / `hvfd` auto-run on push via `start.sh`. Then:
```
cd apps/api
python seed_hv_feeder_species.py       # 13-species feeder catalog (else categories are empty)
python backfill_herp_species_taxon.py  # if you've seeded new species since — fills taxon so the by-taxon browser sorts them
python seed_hv_subscription_plans.py   # ONLY after HV store products exist (step 9)
```

## 9. Subscriptions  ⬜  (detail: `HV_SUBSCRIPTION_CAP_DECISIONS.md`)
Play needs a build on a track first (steps 6–7), so this comes after the test build.
- ⬜ Create HV store products: **Herpetoverse Premium** ($4.99 / $44.99 / $149.99) and
  **All-Access bundle** ($6.99 / $69.99 / $249) in App Store Connect + Play Console.
- ⬜ iOS: activate the **Paid Apps agreement** (Business section). Android: set up a
  **payments profile**.
- ⬜ Send me the product IDs → I seed the plans + wire the purchase flow + flip the
  cap/feeder gates on. (Until then, don't enforce the 5-animal cap in prod.)

## 10. Store listing (needed to PROMOTE to production, not for testing)  ⬜
- ⬜ Privacy policy URL live at `herpetoverse.com/privacy-policy` (push `apps/web-herpetoverse`).
- ⬜ Play **Data safety** form + **content rating** (IARC) + **target audience**.
- ⬜ **App access / demo login** for reviewers (HV requires an account).
- ⬜ Screenshots + description.

---

## Reference: what's OTA vs native

- **OTA now** (`eas update`, no rebuild): dashboard, feeder UI, feeders-in-species-browser,
  species-by-taxon, cap/upgrade UI, transfers UI, import confirm UI (the JS), update banner.
- **Needs this build**: push delivery, import file-picker, Google + Apple sign-in.

## Recommended order

FCM ✅ → fill Google/Apple credentials + .env + iosUrlScheme (steps 2–5) → build (6) →
submit to test tracks (7) → run seeds (8) → create subscription products (9) → I wire
the purchase flow → store listing (10) → promote to production.
