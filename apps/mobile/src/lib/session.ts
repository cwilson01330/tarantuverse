/**
 * Sign-in session helpers: token age, when to refresh, the "last time you
 * signed in with ..." line, and the exact sign-in copy.
 *
 * Pure on purpose (no React, no storage, no network) so the rules are unit
 * tested. Herpetoverse keeps its own identical copy at
 * apps/mobile-herpetoverse/src/lib/session.ts - keep the two in lockstep.
 *
 * Why this exists: tokens last 14 days and nothing renewed them, so keepers
 * were signed out on a schedule and then often came back by the wrong method.
 * The app now trades its token for a fresh one once it is older than a day
 * (POST /auth/refresh), and remembers HOW the keeper last signed in.
 */

/** Refresh a token once it is older than this many hours. */
export const REFRESH_AFTER_HOURS = 24;
/** Never attempt a refresh more often than this, whatever the outcome. */
export const MIN_REFRESH_GAP_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// JWT age
// ---------------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64url -> string. Hand-rolled so it never depends on the runtime's atob. */
function base64UrlDecode(input: string): string | null {
  const s = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (s.length % 4 === 1) return null;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = B64.indexOf(s[i]);
    if (v < 0) return null;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  try {
    return decodeURIComponent(bytes.map((b) => '%' + b.toString(16).padStart(2, '0')).join(''));
  } catch {
    // Not valid UTF-8 - fall back to a byte-per-char read (ASCII claims stay right).
    return bytes.map((b) => String.fromCharCode(b)).join('');
  }
}

/** The JWT's payload claims, or null if the token is not a readable JWT. */
export function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const json = base64UrlDecode(parts[1]);
  if (json == null) return null;
  try {
    const payload = JSON.parse(json);
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

/** The `iat` claim in epoch SECONDS, or null if absent / unreadable. */
export function tokenIssuedAt(token: string | null | undefined): number | null {
  const iat = decodeJwtPayload(token)?.iat;
  return typeof iat === 'number' && Number.isFinite(iat) && iat > 0 ? iat : null;
}

/**
 * How many hours ago the token was issued, or null when that can't be known
 * (not a JWT, or an old token without `iat`). Never negative: a phone clock
 * that runs behind the server reads as "just issued", not as the future.
 */
export function tokenAgeHours(token: string | null | undefined, now: number = Date.now()): number | null {
  const iat = tokenIssuedAt(token);
  if (iat == null) return null;
  return Math.max(0, (now - iat * 1000) / HOUR_MS);
}

/**
 * Should the app ask for a fresh token now?
 *
 * - the token is older than REFRESH_AFTER_HOURS (an unreadable age counts as
 *   old - such a token predates `iat` and is the one most worth renewing), and
 * - the last attempt (success OR failure) was at least MIN_REFRESH_GAP_HOURS
 *   ago, so a flaky network can't turn every foreground into a request.
 *
 * `lastAttemptAt` is epoch MILLISECONDS or null if never tried. A last attempt
 * in the future (clock moved back) is ignored rather than blocking forever.
 */
export function shouldRefresh(
  token: string | null | undefined,
  lastAttemptAt: number | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!token) return false;
  const age = tokenAgeHours(token, now);
  if (age != null && age < REFRESH_AFTER_HOURS) return false;
  if (typeof lastAttemptAt === 'number' && Number.isFinite(lastAttemptAt) && lastAttemptAt <= now) {
    if ((now - lastAttemptAt) / HOUR_MS < MIN_REFRESH_GAP_HOURS) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Session epoch
// ---------------------------------------------------------------------------

/**
 * A counter that changes whenever the signed-in session changes (sign-in,
 * sign-out, forced logout). A slow request (the token refresh) takes a
 * `snapshot()` before it starts and only saves its result if the epoch is
 * still the same when it lands - otherwise a refresh that resolves just after
 * logout would write the old session back and sign the keeper in again.
 *
 * `bump()` must be the FIRST synchronous thing a sign-in / sign-out does,
 * before any await, so a refresh that checks afterwards always sees it.
 */
export type SessionEpoch = {
  /** Mark the session as changed. Returns the new epoch. */
  bump: () => number;
  /** The current epoch - take it before starting a request. */
  snapshot: () => number;
  /** True while nothing has changed since `snapshot()` returned `epoch`. */
  isCurrent: (epoch: number) => boolean;
};

export function createSessionEpoch(): SessionEpoch {
  let n = 0;
  return {
    bump: () => ++n,
    snapshot: () => n,
    isCurrent: (epoch) => epoch === n,
  };
}

// ---------------------------------------------------------------------------
// Last sign-in method
// ---------------------------------------------------------------------------

export type SignInMethod = 'password' | 'google' | 'apple';

export function isSignInMethod(value: unknown): value is SignInMethod {
  return value === 'password' || value === 'google' || value === 'apple';
}

const METHOD_LABEL: Record<SignInMethod, string> = {
  google: 'Google',
  apple: 'Apple',
  password: 'your email and password',
};

/** "Last time you signed in with Google on this device." - null if unknown. */
export function lastMethodLine(method: unknown): string | null {
  if (!isSignInMethod(method)) return null;
  return `Last time you signed in with ${METHOD_LABEL[method]} on this device.`;
}

// ---------------------------------------------------------------------------
// Sign-in copy and error shapes
// ---------------------------------------------------------------------------

/** Appended under a failed password login. */
export const PASSWORD_HINT = 'If you signed up with Google or Apple, use that button instead.';

/** The password-failure message with the hint on its own line. */
export function withPasswordHint(message: string): string {
  return `${message}\n\n${PASSWORD_HINT}`;
}

export const NO_ACCOUNT_BODY =
  'Create a new account, or go back and sign in the way you did before.';
export const NO_ACCOUNT_GO_BACK = 'Go back';
export const NO_ACCOUNT_CREATE = 'Create account';

export type SocialProvider = 'google' | 'apple';

/**
 * "No account for {email}". Apple's private relay can hide the address (the
 * server sends null); then the title names the provider instead of printing
 * nothing.
 */
export function noAccountTitle(email: string | null | undefined, provider: SocialProvider): string {
  const who = email && email.trim() ? email.trim() : `this ${provider === 'apple' ? 'Apple' : 'Google'} account`;
  return `No account for ${who}`;
}

export type NoAccountDetail = { provider: SocialProvider; email: string | null };

/**
 * Reads the 409 body of POST /auth/oauth-login?allow_create=false.
 * The SAME route has another 409 ("account exists but is not verified") whose
 * detail is a plain STRING, so only an object with code oauth_no_account counts.
 */
export function parseNoAccountDetail(detail: unknown): NoAccountDetail | null {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null;
  const d = detail as Record<string, unknown>;
  if (d.code !== 'oauth_no_account') return null;
  if (d.provider !== 'google' && d.provider !== 'apple') return null;
  return { provider: d.provider, email: typeof d.email === 'string' && d.email ? d.email : null };
}

/** An error the login screen turns into the "No account for ..." confirm. */
export type NoAccountError<T = unknown> = Error & {
  code: 'oauth_no_account';
  provider: SocialProvider;
  email: string | null;
  /** Re-sends the SAME credentials with allow_create: true. */
  createAccount: () => Promise<T>;
};

export function makeNoAccountError<T>(
  info: NoAccountDetail,
  createAccount: () => Promise<T>,
): NoAccountError<T> {
  const err = new Error(noAccountTitle(info.email, info.provider)) as NoAccountError<T>;
  err.code = 'oauth_no_account';
  err.provider = info.provider;
  err.email = info.email;
  err.createAccount = createAccount;
  return err;
}

export function isNoAccountError(e: unknown): e is NoAccountError {
  const x = e as { code?: unknown; createAccount?: unknown } | null;
  return !!x && x.code === 'oauth_no_account' && typeof x.createAccount === 'function';
}

/** A server `detail` as a message. An object/array detail must never print as "[object Object]". */
export function detailMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail.trim()) return detail;
  return fallback;
}
