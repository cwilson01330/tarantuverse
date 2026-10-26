/**
 * "Last time you signed in with ..." (sign-in fixes, Task 3).
 *
 * Remembers HOW this browser last signed in so a keeper who used Google months
 * ago is nudged to the right button instead of guessing a password. Stored in
 * localStorage under `last_sign_in_method` and deliberately NOT cleared on
 * sign-out — the whole point is to still know after sign-out. It holds a
 * method name only, never an email or token.
 *
 * Herpetoverse web has Google and password sign-in, both finished in the page,
 * so unlike Tarantuverse web no "pending" note is needed.
 *
 * Keep the shared half identical in apps/web/src/lib/lastSignInMethod.ts.
 */

export type SignInMethod = 'google' | 'apple' | 'password'

const KEY = 'last_sign_in_method'

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
