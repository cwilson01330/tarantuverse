# Herpetoverse — Google & Apple Sign-In Setup

The **code is done** (login + register screens, AuthContext, service). What's left is
account/credential setup that only you can do, plus a native build (the two modules
are native, so this can't ship over-the-air).

App IDs: iOS/Android bundle = `com.herpetoverse.app`. Backend endpoint is the shared,
app-agnostic `POST /api/v1/auth/oauth-login` — no backend work needed.

---

## What's already wired (in code)

- `@react-native-google-signin/google-signin` + `expo-apple-authentication` added to
  `apps/mobile-herpetoverse/package.json`.
- `app.json`: `expo-apple-authentication` plugin, `ios.usesAppleSignIn: true`, and the
  `@react-native-google-signin/google-signin` plugin with a **placeholder**
  `iosUrlScheme` you must replace (see step 3).
- `src/services/google-signin.ts`: `signInWithGoogle`, `signInWithApple`,
  `isGoogleSignInAvailable`, `isAppleSignInAvailable` (reads env client IDs; guarded
  for Expo Go).
- `AuthContext`: `loginWithGoogle()` / `loginWithApple()`.
- Login + Register screens: "Continue with Google" (hidden in Expo Go) and
  "Continue with Apple" (iOS only).

---

## A. Google Cloud — create HV's OWN OAuth clients

Use the Appalachian Tarantulas Google Cloud project (or a dedicated HV project). Create
**three** OAuth client IDs (APIs & Services → Credentials → Create credentials → OAuth
client ID). These are separate from Tarantuverse's.

1. **Web application** client → this ID is the `webClientId` the library needs (it's the
   token audience). Copy the `...apps.googleusercontent.com` ID.
2. **iOS** client → bundle ID `com.herpetoverse.app`. Copy the iOS client ID.
3. **Android** client → package `com.herpetoverse.app` + the app's **SHA-1**. Get the
   SHA-1 from `eas credentials` (Android → Keystore) — and also add the **Google Play
   App Signing** SHA-1 (Play Console → Setup → App signing) for production installs.

## B. Env vars — `apps/mobile-herpetoverse/.env`

```
EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=<web client id>.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=<ios client id>.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=<android client id>.apps.googleusercontent.com
# EXPO_PUBLIC_API_URL is already set
```

## C. app.json — replace the iOS URL scheme placeholder

In `apps/mobile-herpetoverse/app.json`, the google-signin plugin currently has:
```json
"iosUrlScheme": "com.googleusercontent.apps.HV_IOS_CLIENT_ID"
```
Replace it with your **reversed iOS client ID**. If your iOS client ID is
`12345-abcxyz.apps.googleusercontent.com`, the scheme is
`com.googleusercontent.apps.12345-abcxyz`.

## D. Apple — Sign in with Apple

- In Apple Developer, enable the **Sign in with Apple** capability on the App ID
  `com.herpetoverse.app` (EAS can manage this during the build, or add it manually).
- `app.json` already declares `ios.usesAppleSignIn: true` + the plugin, so the
  entitlement is included in the build.
- No client secret is needed for the native iOS flow — the app sends the Apple
  credential to the shared backend. (Offering Google sign-in on iOS makes Apple sign-in
  **required** by App Store guideline 4.8, which is why it's included.)

## E. Build (native — not OTA)

The two modules are native, so after A–D:
```
cd apps/mobile-herpetoverse
npx expo install @react-native-google-signin/google-signin expo-apple-authentication
eas build --platform all --profile production
```
Batches cleanly with the FCM/APNs + expo-document-picker native work — one build covers
all of it. Sign-in only works in a dev/prod build, never Expo Go (the buttons hide
themselves there).

---

## Note / later hardening

The shared `/auth/oauth-login` currently trusts the client-provided provider identity
(same as Tarantuverse today). A future hardening pass could verify the Google ID token
+ Apple identity token signatures server-side. Not a launch blocker — it matches TV's
current behavior — but worth a ticket.
