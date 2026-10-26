# Sign-in Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stop keepers getting locked out: sessions renew instead of expiring under active users, emails match regardless of capitals, password resets never silently do nothing, the login screens say how you last signed in, and a Google/Apple sign-in never creates an empty duplicate account without asking.

**Evidence (2026-10-26):** App Store review (TV iOS 1.8.0, Oct 23) + Render logs: a keeper's session expired, 7 password attempts on a Google/Apple-only account failed, a Google sign-in created a new empty account, two reset requests sent nothing (Resend shows no emails), Apple sign-in finally reached the real account. 202 of 282 accounts have no password; 3 people have case-duplicate accounts. TV web's NextAuth session `maxAge` is 24 h.

**Spec:** this plan (approved by Cory in chat, 2026-10-26).

## Global Constraints

- Never reveal whether an email has an account on endpoints that don't already (login stays "Incorrect email or password"; forgot-password response text is unchanged).
- Never modify existing users' stored emails or merge/delete accounts. Lookups become case-insensitive; NEW writes store `email.strip().lower()`.
- Old app binaries/OTA bundles must keep working: every new request field is optional with the old behaviour as default.
- Apple `authorization_code` is single-use: a request that is refused for "no account" must not have consumed it.
- Copy, exact:
  - password-login failure hint (mobile + web, appended under the existing error): `If you signed up with Google or Apple, use that button instead.`
  - last-method line: `Last time you signed in with {Google|Apple|your email and password} on this device.`
  - no-account confirm title `No account for {email}`; body `Create a new account, or go back and sign in the way you did before.`; buttons `Go back` (default) and `Create account`.
  - social-only reset email subject `How you sign in to {Tarantuverse|Herpetoverse}`; body says the account has no password because it signs in with {providers}, and to use that button on the login screen. No reset link.
- Token refresh: client refreshes when its token is older than 24 h (decoded `iat`), on app start / foreground (mobile, at most once per 24 h) and on web session load. A refresh failure that is NOT a 401 keeps the existing token.

## Review Focus

- A keeper with **two case-duplicate accounts** logs in with the lowercase email and the password of either account → reaches the account whose password matches. → Task 1 test `test_login_case_duplicates_picks_password_match`.
- **Old clients** calling `/auth/oauth-login` without `allow_create` still create accounts exactly as before. → Task 1 test `test_oauth_default_still_creates`.
- **Expired or revoked token** on `/auth/refresh` → 401 (no new token from a dead one). → Task 1 test.
- **Apple retry**: 409 no-account, then the same id_token + authorization_code with `allow_create=true` succeeds and still exchanges the code once. → Task 1 test with the SIWA exchange mocked, asserting one exchange call.
- **Web NextAuth session** keeps working across a server restart and a token refresh (no forced sign-out at 24 h). → Task 3 manual check documented in the report + unit test of the refresh-decision helper.

---

### Task 1: API

**Files:** `apps/api/app/routers/auth.py`, `apps/api/app/utils/auth.py` (or a new `utils/emails.py` for `normalize_email`), `apps/api/app/schemas/user.py` / OAuth schemas, `apps/api/app/services/email.py`, tests `apps/api/tests/test_signin_fixes.py`.

**Produces:**
- `normalize_email(value: str) -> str` = `value.strip().lower()`.
- `find_users_by_email(db, email) -> list[User]` — `func.lower(User.email) == normalize_email(email)`, exact-case match first.
- `/auth/register`: stores the normalized email; 400 "Email already registered" when any case-variant exists.
- `/auth/login`: case-insensitive; with several matches, the first whose password verifies wins; else existing 401.
- `/auth/forgot-password`: case-insensitive; every matching account WITH a password gets the reset email; every matching account WITHOUT one gets the social-only email (`EmailService.send_social_signin_email(to, providers: list[str], brand)`), providers from `user_oauth_accounts` (+ legacy `oauth_provider`), labelled `Google`/`Apple`. Response unchanged.
- OAuth email-matching paths (`/oauth-login`, `/oauth/google`, `/oauth/apple`, link-account flows) match the existing user case-insensitively.
- `POST /auth/refresh` (auth required; `@limiter.limit("30/hour")`): returns the same `Token` shape as `/auth/login` for the current user; does not revoke the old token.
- `allow_create: bool = True` on the `/oauth-login`, `/oauth/google`, `/oauth/apple` request bodies. When no existing account is found or linkable and `allow_create` is false → 409 `{"detail": {"code": "oauth_no_account", "provider": "<google|apple>", "email": "<email from the verified token or null>"}}`, raised BEFORE any SIWA code exchange or user creation.

- [ ] Tests first (`requires_postgres`): register lowercase + reject case-variant; login with mixed case; `test_login_case_duplicates_picks_password_match` (seed two rows directly via `db_session`); forgot-password sends reset for password account and the social email for a no-password account (mock `EmailService`), and nothing for unknown emails, same response body each time; `/auth/refresh` 200 with a fresh token, 401 for revoked (logout first) and expired tokens; `test_oauth_default_still_creates`; `allow_create=false` → 409 shape, no user row created, SIWA exchange not called; retry with `allow_create=true` creates the user and exchanges once (mock token verification the way existing OAuth tests do — see `tests/test_apple_siwa_revocation.py` / existing oauth tests).
- [ ] Implement; focused tests pass; full API suite passes.

### Task 2: Mobile (TV + HV)

**Files (each app):** `src/contexts/AuthContext.tsx`, `src/services/api.ts` (if refresh lives there), `src/services/google-signin.ts` (or wherever social sign-in posts `/auth/oauth-login`), `app/login.tsx`, a new `src/lib/session.ts` (pure helpers, jest-tested in TV: `tokenAgeHours(token, now)`, `shouldRefresh(token, lastAttemptAt, now)`, `lastMethodLine(method)`), HV equivalents (`apps/mobile-herpetoverse/...`; HV's login screen is under `src/screens` or `app/` — find it).

- [ ] Refresh: after stored-auth hydration and on `AppState` → `active`, if `shouldRefresh` → `POST /auth/refresh`, store the new token in both state and AsyncStorage. 401 → existing forced logout; other failures → keep the token.
- [ ] Last method: on every successful sign-in store `last_sign_in_method` (`password`/`google`/`apple`) in AsyncStorage; logout must NOT clear it. Login screen shows the exact last-method line above the buttons when set.
- [ ] Password 401 → the existing alert message plus the hint line.
- [ ] Social sign-in from the LOGIN screen sends `allow_create: false`; on 409 `oauth_no_account` show the confirm (exact copy); `Create account` resends with `allow_create: true` using the same credentials; `Go back` returns to the login screen with no account created. From the REGISTER screen send `allow_create: true`.
- [ ] jest for `session.ts` (TV); `tsc` both apps; bundle check both apps (`check-single-react-native`).

### Task 3: Web (TV + HV)

**Files:** `apps/web/src/app/api/auth/[...nextauth]/route.ts`, `apps/web/src/app/login/page.tsx`, `apps/web/src/components/auth/OAuthButtons.tsx`, `apps/web/src/lib/api.ts`; `apps/web-herpetoverse/src/lib/auth.ts`, its login page and `components/GoogleSignInButton.tsx`.

- [ ] TV web: NextAuth `session.maxAge` = 14 days (`ACCESS_TOKEN_EXPIRE_MINUTES` on the API), and the `jwt` callback refreshes `accessToken` through `POST /auth/refresh` when it is older than 24 h (keep the old one on non-401 failure; on 401 return a token that forces sign-out). Keep `localStorage.auth_token` (used by `lib/api.ts`) in step with the session token.
- [ ] HV web (localStorage `hv_token`): refresh on app load when older than 24 h.
- [ ] Last-method line (localStorage `last_sign_in_method`, not cleared on sign-out) and the password-failure hint on both login pages.
- [ ] Social sign-in on the login page sends `allow_create: false`; the 409 `oauth_no_account` shows the confirm (exact copy); `Create account` repeats the sign-in with `allow_create: true`. NextAuth: pass the flag through the provider sign-in (e.g. a query param read in the `signIn` callback) — implementer decides the mechanism and documents it.
- [ ] `tsc` both web apps; lint the touched files.

### Task 4: Docs + verification
- [ ] CLAUDE.md bullet "Sign-in fixes (2026-10-26)"; full API suite, tsc ×4, mobile jest, bundle check ×2.
