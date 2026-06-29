# Feature Parity Audit — Tarantuverse vs. Herpetoverse

**Date:** 2026-05-22
**Scope:** All four surfaces — Tarantuverse web (`apps/web`), Tarantuverse mobile (`apps/mobile`), Herpetoverse web (`apps/web-herpetoverse`), Herpetoverse mobile (`apps/mobile-herpetoverse`).
**Method:** Full route/screen inventory of each app, cross-referenced.

---

## TL;DR

Tarantuverse web and mobile are at near-complete parity with each other — that pairing is healthy. The real divergence is **Tarantuverse vs. Herpetoverse**: Herpetoverse has a strong husbandry core (collection, detail logging, breeding, genetics, species, care sheets, QR) but is missing most of the *surrounding* product. The settings and account layer is the worst of it — Herpetoverse web is a stub page that links back to Tarantuverse, and Herpetoverse mobile has no settings screen at all.

Some gaps are deliberate (community was decided for v1.1; the morph calculator is Herpetoverse-only by nature). But several are not deliberate, and **one is a hard App Store blocker**: Herpetoverse mobile lets users create an account but gives them no way to delete it, which violates App Store Guideline 5.1.1(v).

---

## 1. Settings & Account — the priority gap

This is what prompted the audit, and it is the largest single divergence. Below is every Tarantuverse settings capability and where Herpetoverse stands.

| Settings capability | TV web | TV mobile | HV web | HV mobile |
|---|---|---|---|---|
| Settings hub / menu | Full hub | Profile-tab hub | **Stub page** (links to TV) | **None** |
| Edit profile (name, avatar, bio, location) | Yes | Yes | No | No |
| Username change (with cooldown) | Yes | Yes | No | No |
| Experience level / specialties / social links | Yes | Yes | No | No |
| Privacy (collection visibility) | Yes | Yes | No | No |
| Notification preferences | Yes | Yes | No | No |
| Theme / appearance UI | Yes | Yes | No | No (context exists, no UI) |
| Linked OAuth accounts | Yes | Partial | No | No |
| Data export | Yes | Yes | No | No |
| Account deletion | Yes | Yes | No | **No — blocker** |
| Contact support | Yes | Yes | No | No |
| Referral program | Yes | Yes | No | No |
| Subscription / premium | Yes | Yes | No | No |
| Replay tutorial | Yes | Yes | No | No |
| Log out | Yes | Yes | Yes | Yes |

Herpetoverse's entire settings surface today is: **log out**, plus read-only identity (username, "Keeper"/"Admin"), plus — on mobile — a link to the morph calculator. The web app's `/app/settings` is a single static card reading *"Settings live on Tarantuverse for now"* with an outbound link.

**Is "shared account, managed on Tarantuverse" defensible?** Partly. One login / one profile is a reasonable product stance. But several settings are *Herpetoverse-specific* and cannot live on Tarantuverse:

- **Notification preferences** — reptile feeding/shed reminders are different from tarantula reminders; they have to be set in Herpetoverse.
- **Data export** — a reptile keeper's export must contain reptile data; Tarantuverse's exporter won't produce it.
- **Theme / appearance** — Herpetoverse has its own `ThemeContext` and presets; they must be settable in-app.
- **Account deletion** — Apple requires this *in the app that offers sign-up* (see §4).

So the stub is not a viable launch state. Profile editing is the one item that could arguably stay shared (one profile across both brands), though even that is a poor experience — a Herpetoverse-only keeper shouldn't have to visit a different website to change their display name.

---

## 2. Full feature-parity matrix

Legend: **Yes** = present · **~** = partial / inline-only · **No** = absent · **—** = not applicable.

| Feature | TV web | TV mobile | HV web | HV mobile |
|---|---|---|---|---|
| **Auth & onboarding** | | | | |
| Login | Yes | Yes | Yes | Yes |
| Registration | Yes | Yes | No (links to TV) | Yes |
| Password reset / recovery | Yes | Yes | No | No |
| Email verification | Yes | Yes | No | ~ |
| Onboarding flow | Yes (tour) | Yes (4-screen) | No | No |
| **Collection & husbandry** | | | | |
| Collection list | Yes | Yes | Yes | Yes |
| Animal detail + logging | Yes | Yes | Yes | Yes |
| Enclosures management | Yes | Yes | ~ (picker only) | ~ (picker only) |
| Feeder colonies | Yes | Yes | No | No |
| **Breeding & genetics** | | | | |
| Breeding (pairing → clutch → offspring) | Yes | Yes | Yes | Yes |
| Morph calculator / genetics | — | — | Yes | Yes |
| **Species** | | | | |
| Species browser + care sheets | Yes | Yes | Yes | Yes |
| **Intelligence & analytics** | | | | |
| Premolt / shed prediction | Yes | Yes | No | No |
| Analytics dashboard | Yes | Yes | No | No |
| **Community & social** | | | | |
| Forums, DMs, follows, profiles, activity, discover | Yes | Yes | No | No |
| Global search (Cmd+K) | Yes | Yes | No | No |
| **Gamification & QR** | | | | |
| Achievements | Yes | Yes | ~ (slim) | No |
| QR identity / labels | Yes | Yes | Yes | Yes |
| **Settings & account** | | | | |
| Settings hub | Yes | Yes | No (stub) | No |
| Profile editor | Yes | Yes | No | No |
| Notification preferences + delivery | Yes | Yes | No | No |
| Theme / appearance UI | Yes | Yes | No | No |
| Data export | Yes | Yes | No | No |
| Account deletion | Yes | Yes | No | No |
| Referral program | Yes | Yes | No | No |
| **Monetization** | | | | |
| Subscription / pricing | Yes | Yes | No | No |
| **Admin & legal** | | | | |
| Admin tools | Yes | Yes | No | No |
| Legal pages (terms / privacy) | Yes | Yes | ~ (hosted on TV) | No |

---

## 3. Gap analysis & triage

### By design — leave as-is for v1

- **Community on Herpetoverse** — deferred to v1.1 by an explicit prior decision. The web sidebar already shows "Community → Soon". Not a launch gap.
- **Morph calculator is Herpetoverse-only** — reptile color-morph genetics has no tarantula analogue. This is Herpetoverse *adding* value, not a parity hole.
- **Subscription / pricing absent on Herpetoverse** — Herpetoverse v1 launches free (prior decision). No premium surface is needed for v1; the matrix marks it "No" only for completeness.
- **Feeder colonies absent on Herpetoverse** — debatable (reptile keepers do raise rodent/insect colonies), but reasonable to defer.

### Launch-critical — must close before Herpetoverse goes public

- **Account deletion in Herpetoverse mobile** — see §4. Hard App Store blocker.
- **Legal reachable from Herpetoverse mobile** — the App Store listing and the app both need a privacy policy link. The Herpetoverse privacy/terms pages exist but are hosted on the Tarantuverse web app (`/herpetoverse/privacy-policy`, `/herpetoverse/terms`); Herpetoverse mobile must link them, and they arguably belong on `herpetoverse.com`.
- **Password reset on Herpetoverse** — login is native on both surfaces, but there is no recovery flow. A Herpetoverse-only keeper who forgets their password is locked out with no recourse. The backend endpoint already exists (Tarantuverse uses it) — this is UI-only work.
- **Notification preferences + delivery on Herpetoverse mobile** — there is no notification service at all. A husbandry-tracking app that never reminds you to feed or check for a shed is missing a core value prop. Strongly recommended before launch.

### Real parity gaps — the "settings menu parity" work

- **Herpetoverse settings hub** — replace the web stub with a real hub; build a settings screen on mobile (the Profile tab is the natural home, as in Tarantuverse mobile).
- **Profile editor on Herpetoverse** (both surfaces).
- **Theme / appearance UI on Herpetoverse** — the `ThemeContext` and presets already exist; this is purely a missing settings screen.
- **Data export on Herpetoverse** — needs a reptile-aware export; compliance-relevant.
- **Onboarding on Herpetoverse mobile** — parity with Tarantuverse's 4-screen welcome.
- **Achievements on Herpetoverse mobile** — web has a slim version, mobile has none; also the achievement categories still read as tarantula-flavored and need reptile copy.

### Post-launch — lower priority

Analytics dashboard, shed-prediction (the Herpetoverse analogue of premolt prediction), global search, referral program, enclosures management UI, admin tools. None block launch; all are fair v1.1 candidates.

### Internal web↔mobile inconsistencies (Herpetoverse)

- Herpetoverse mobile has native registration; Herpetoverse web links registration out to Tarantuverse — pick one.
- Herpetoverse web has a (slim) achievements page; Herpetoverse mobile has none.

---

## 4. The App Store blocker — read this first

**App Store Review Guideline 5.1.1(v):** any app that supports account *creation* must also let the user *delete* their account from within the app. Herpetoverse mobile has a working `register.tsx` and **no account-deletion path anywhere**. As it stands, the Herpetoverse mobile build will be rejected on submission.

This makes "build Herpetoverse settings" not just a parity nicety but a launch dependency. The minimum viable settings screen for Herpetoverse mobile must include account deletion (the Tarantuverse mobile delete flow — typed-"DELETE" confirmation modal — is a ready pattern to copy). Google Play has an equivalent requirement plus an external data-deletion URL, so the same work covers both stores.

---

## 5. Recommended sequencing

1. **Herpetoverse settings v1 (mobile + web).** Build a real settings hub. Minimum contents: profile editor, theme/appearance, notification preferences, data export, contact support, **account deletion**, legal links, log out. This single effort clears the App Store blocker, closes the gap that prompted this audit, and is mostly adaptation of existing Tarantuverse screens against the shared API.
2. **Password reset UI on Herpetoverse** (both surfaces) — small, backend already exists.
3. **Notification service on Herpetoverse mobile** — feeding/shed reminders + push registration.
4. **Onboarding + achievements on Herpetoverse mobile** — parity polish.
5. **Post-launch:** analytics, shed prediction, global search, referral, enclosures UI, admin, then community (v1.1).

Items 1–3 are the realistic pre-launch set. Item 1 is the big one and should start first.
