/**
 * "Last time you signed in with ..." (sign-in fixes, Task 3).
 *
 * Remembers HOW this browser last signed in so a keeper who used Google months
 * ago is nudged to the right button instead of guessing a password. Stored in
 * localStorage under `last_sign_in_method` and deliberately NOT cleared on
 * sign-out — the whole point is to still know after sign-out. It holds a
 * method name only, never an email or token.
 *
 * Password sign-in is known the moment it succeeds. Google/Apple sign-in
 * finishes on the server and redirects away, so the button leaves a short-lived
 * "pending" note that `SessionTokenSync` promotes once a session exists.
 *
 * Keep the shared half identical in apps/web-herpetoverse/src/lib/lastSignInMethod.ts.
 */

export type SignInMethod = 'google' | 'apple' | 'password'

const KEY = 'last_sign_in_method'
const PENDING_KEY = 'last_sign_in_pending'
const PENDING_MAX_AGE_MS = 15 * 60 * 1000

export function isSignInMethod(value: unknown): value is SignInMethod {
  return value === 'google' || value === 'apple' || value === 'password'
}

export function getLastSignInMethod(): SignInMethod | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(KEY)
    return isSignInMethod(v) ? v : null
  } catch {
    return null
  }
}

export function setLastSignInMethod(method: SignInMethod): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, method)
  } catch {
    // private mode / quota — the hint is a nicety
  }
}

/** The exact line shown on the login screen. */
export function lastSignInLine(method: SignInMethod): string {
  const label = method === 'google' ? 'Google' : method === 'apple' ? 'Apple' : 'your email and password'
  return `Last time you signed in with ${label} on this device.`
}

/** Hint shown under a failed password sign-in. */
export const PASSWORD_FAILURE_HINT = 'If you signed up with Google or Apple, use that button instead.'

// ---- OAuth: remembered only once the sign-in actually completes ----------

/** Called when a Google/Apple button is pressed, before leaving the page. */
export function markPendingSignInMethod(method: 'google' | 'apple'): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify({ method, at: Date.now() }))
  } catch {
    // ignore
  }
}

/** Called once a session exists: pending OAuth note -> last method. */
export function promotePendingSignInMethod(): void {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(PENDING_KEY)
    if (!raw) return
    window.localStorage.removeItem(PENDING_KEY)
    const parsed = JSON.parse(raw) as { method?: unknown; at?: unknown }
    if (
      (parsed.method === 'google' || parsed.method === 'apple') &&
      typeof parsed.at === 'number' &&
      Date.now() - parsed.at < PENDING_MAX_AGE_MS
    ) {
      setLastSignInMethod(parsed.method)
    }
  } catch {
    // ignore
  }
}

/** Called when a pending OAuth sign-in turns out not to have signed anyone in. */
export function clearPendingSignInMethod(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(PENDING_KEY)
  } catch {
    // ignore
  }
}
