/**
 * "No account for this email" hand-off between the NextAuth route (server) and
 * the login page (browser) — sign-in fixes, Task 3.
 *
 * Why cookies and not the URL or an authorization param
 * -----------------------------------------------------
 * Two small values have to cross the OAuth round trip:
 *
 *  1. login -> server: "this sign-in came from the LOGIN page, don't create an
 *     account". `LOGIN_ONLY_COOKIE`, set by the page just before `signIn()`.
 *     A query/authorization param can't carry it: NextAuth builds the provider
 *     redirect itself and the provider's callback never echoes our params
 *     back. It is `SameSite=None; Secure` because Apple completes the sign-in
 *     with a CROSS-SITE form POST to /api/auth/callback/apple, and a Lax cookie
 *     is not sent on that request (the same reason `checks: []` is set on the
 *     Apple provider). Missing cookie = old behaviour (account is created), so
 *     a cookie that fails to arrive never locks anyone out.
 *
 *  2. server -> login: "the provider's email has no account". The API's 409
 *     `oauth_no_account` carries the user's own email; the `signIn` callback
 *     stores `{email, provider}` in `PENDING_COOKIE` (5 minutes, readable by
 *     the page) and redirects to `/login?oauth=no_account&provider=...`.
 *     The email is NEVER put in a URL: PostHog attaches the full query string
 *     to `$current_url` and Vercel Analytics records page URLs, so a query
 *     param would ship it to both. The page reads the cookie once, deletes it,
 *     and strips the query.
 */

export const LOGIN_ONLY_COOKIE = 'tv_oauth_login_only'
export const PENDING_COOKIE = 'tv_oauth_pending'

/** Providers this flow knows about. */
export type OAuthProvider = 'google' | 'apple'

export interface PendingNoAccount {
  email: string
  provider: OAuthProvider
}

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return value === 'google' || value === 'apple'
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  bytes.forEach((b) => {
    bin += String.fromCharCode(b)
  })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(padded)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Cookie value for a pending no-account confirm. */
export function encodePending(pending: PendingNoAccount): string {
  return toBase64Url(JSON.stringify(pending))
}

/** Parse the cookie value back; null if it is missing or not what we wrote. */
export function decodePending(raw: string | null | undefined): PendingNoAccount | null {
  if (!raw) return null
  try {
    const value = JSON.parse(fromBase64Url(raw)) as Partial<PendingNoAccount>
    if (
      typeof value.email === 'string' &&
      value.email.length > 0 &&
      value.email.length <= 254 &&
      isOAuthProvider(value.provider)
    ) {
      return { email: value.email, provider: value.provider }
    }
    return null
  } catch {
    return null
  }
}

/**
 * The no-account detail from an API 409 body, or null for any other error
 * (the other 409, "account exists but is not verified", has a STRING detail).
 */
export function noAccountFromDetail(detail: unknown): { email: string; provider: string } | null {
  if (!detail || typeof detail !== 'object') return null
  const d = detail as { code?: unknown; email?: unknown; provider?: unknown }
  if (d.code !== 'oauth_no_account') return null
  return {
    email: typeof d.email === 'string' ? d.email : '',
    provider: typeof d.provider === 'string' ? d.provider : '',
  }
}

// ---------------------------------------------------------------------------
// Browser helpers (call from event handlers / effects only).
// ---------------------------------------------------------------------------

function cookieAttributes(maxAgeSeconds: number): string {
  // SameSite=None needs Secure; plain-http localhost falls back to Lax (Apple
  // can't be tested there anyway).
  const secure = typeof location !== 'undefined' && location.protocol === 'https:'
  return `Max-Age=${maxAgeSeconds}; Path=/; ${secure ? 'SameSite=None; Secure' : 'SameSite=Lax'}`
}

/**
 * Tell the server whether the sign-in about to start may create an account.
 * Login page: `true` (refuse to create, ask first). Register page / the
 * "Create account" confirm: `false`.
 */
export function setLoginOnly(on: boolean): void {
  if (typeof document === 'undefined') return
  document.cookie = on
    ? `${LOGIN_ONLY_COOKIE}=1; ${cookieAttributes(600)}`
    : `${LOGIN_ONLY_COOKIE}=; ${cookieAttributes(0)}`
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  for (const part of document.cookie.split('; ')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq) === name) return part.slice(eq + 1)
  }
  return null
}

/** Read AND delete the pending no-account cookie (it is one-shot). */
export function takePendingNoAccount(): PendingNoAccount | null {
  const raw = readCookie(PENDING_COOKIE)
  if (raw === null) return null
  document.cookie = `${PENDING_COOKIE}=; ${cookieAttributes(0)}`
  return decodePending(raw)
}
