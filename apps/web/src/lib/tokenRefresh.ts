/**
 * Pure decisions about refreshing the API access token (sign-in fixes, Task 3).
 *
 * The API issues 14-day JWTs. A keeper who keeps using the app should never hit
 * that wall, so a client swaps its token for a fresh one (POST /auth/refresh)
 * once it is more than a day old. These helpers hold only the DECISION so it
 * can be unit-tested (`tests/tokenRefresh.test.mts`); the network call lives
 * with each caller (NextAuth `jwt` callback here, `lib/auth.ts` on Herpetoverse
 * web).
 *
 * Keep this file identical to apps/web-herpetoverse/src/lib/tokenRefresh.ts.
 * No imports on purpose: it runs in the NextAuth route (Node) and in the browser.
 */

/** Refresh when the token is at least this old (the API token lasts 14 days). */
export const TOKEN_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000

/**
 * After a refresh fails for a reason other than "token is dead" (API asleep,
 * 429, network), wait this long before trying again — otherwise every session
 * read would retry against a struggling API.
 */
export const REFRESH_RETRY_AFTER_MS = 10 * 60 * 1000

/**
 * The `iat` claim (seconds since epoch) of a JWT, WITHOUT verifying it — the
 * API verifies tokens; here we only need to know how old our own token is.
 * Returns null for anything that is not a decodable JWT with a numeric `iat`.
 */
export function tokenIssuedAtSeconds(token: string | null | undefined): number | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as { iat?: unknown }
    return typeof payload.iat === 'number' && Number.isFinite(payload.iat) ? payload.iat : null
  } catch {
    return null
  }
}

/**
 * Should this token be swapped for a fresh one now?
 *
 * - Only when its age is known and at least a day (a token without a readable
 *   `iat` is left alone: we would otherwise refresh on every call).
 * - Not again within `REFRESH_RETRY_AFTER_MS` of a failed attempt.
 * - A clock set in the past (iat in the future) never refreshes.
 */
export function shouldRefreshToken(
  token: string | null | undefined,
  nowMs: number,
  lastFailedAtMs?: number | null,
): boolean {
  const iat = tokenIssuedAtSeconds(token)
  if (iat === null) return false
  if (nowMs - iat * 1000 < TOKEN_REFRESH_AFTER_MS) return false
  if (typeof lastFailedAtMs === 'number' && nowMs - lastFailedAtMs < REFRESH_RETRY_AFTER_MS) {
    return false
  }
  return true
}
