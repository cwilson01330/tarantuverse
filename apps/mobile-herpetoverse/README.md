# Herpetoverse Mobile

React Native / Expo app for reptile keepers — snakes and lizards. Sibling
to the Tarantuverse mobile app (`apps/mobile/`); they share the FastAPI
backend but ship as **two separate App Store listings** under separate
bundle identifiers.

## Quick start

From the monorepo root:

```bash
pnpm install
```

Then, from this directory:

```bash
cp .env.example .env.local    # set EXPO_PUBLIC_POSTHOG_KEY
pnpm start                    # Expo dev server
```

Open the project in Expo Go (dev build required later for EAS features).

## Architecture

- **Auth**: JWT stored in AsyncStorage under `hv_token` (`auth_token` is
  Tarantuverse mobile's key — we use a different one so both apps can be
  signed in independently on the same device).
- **API**: axios client at `src/services/api.ts`. 401 → cache cleared +
  `AUTH_EXPIRED_EVENT` emitted; `AuthContext` listens and forces logout.
- **Theme**: single dark theme (`src/contexts/ThemeContext.tsx`) for v1.
  Preset system from Tarantuverse mobile can be ported later.
- **Analytics**: PostHog via `posthog-react-native`. Same project as both
  web apps — segment by the `app: "herpetoverse-mobile"` person-property.

## Before the first EAS build

```bash
eas login
eas init          # creates Expo project + writes projectId into app.json
eas build:configure
```

Once `app.json` has `extra.eas.projectId` filled in, `eas build` works.

## Bundle plan (Sprint 8)

1. **Bundle 1** (this commit) — scaffold, auth, theme, tabs, PostHog.
2. **Bundle 2** — snake + lizard CRUD (collection, detail, add, edit).
3. **Bundle 3** — feeding + shed logs (polymorphic).
4. **Bundle 4** — species browser, care sheets, genetics + morph calculator.
5. **Bundle 5** — photo gallery, camera upload, QR upload + labels.
