/**
 * Registration outcome events.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-08-09 web registration was impossible for anyone who didn't already
 * know the undocumented password rules. It surfaced only because one person
 * messaged on TikTok. Nothing on our side noticed: the API returned a valid
 * response, no exception was thrown anywhere we watch, and the signup page
 * looked healthy.
 *
 * Silence is not evidence that signup works. These two events make the failure
 * rate a number rather than an assumption.
 *
 * WHAT IS DELIBERATELY NOT SENT
 * -----------------------------
 * No email, no username, no password, no error body that might echo one back.
 * A failure category and an HTTP status is enough to notice a problem and start
 * looking; anything more is collecting personal data to solve a problem that
 * doesn't need it.
 */
import posthog from 'posthog-js'

export type SignupFailureReason =
  | 'password_complexity'
  | 'email_taken'
  | 'username_taken'
  | 'invalid_email'
  | 'rate_limited'
  | 'server_error'
  | 'network'
  | 'unknown'

/**
 * Bucket an error into a stable category.
 *
 * Categories rather than raw messages: raw strings fragment into dozens of
 * near-identical variants and stop being countable, which is the whole point.
 */
export function classifySignupFailure(
  message: string,
  status?: number,
): SignupFailureReason {
  const m = (message || '').toLowerCase()

  if (status === 429) return 'rate_limited'
  if (status && status >= 500) return 'server_error'

  if (m.includes('password')) return 'password_complexity'
  if (m.includes('email') && (m.includes('registered') || m.includes('taken') || m.includes('exists'))) {
    return 'email_taken'
  }
  if (m.includes('username')) return 'username_taken'
  if (m.includes('valid email') || m.includes('email address')) return 'invalid_email'
  if (m.includes('fetch') || m.includes('network') || m.includes('connection')) return 'network'

  return 'unknown'
}

export function trackSignupFailed(
  reason: SignupFailureReason,
  status?: number,
): void {
  try {
    posthog.capture('signup_failed', { reason, status: status ?? null })
  } catch {
    // Telemetry must never be the reason a signup form breaks. An ad blocker
    // or a failed PostHog init is not the user's problem.
  }
}

export function trackSignupSucceeded(): void {
  try {
    // The denominator. A count of failures alone can't distinguish "signup is
    // broken" from "we had a busy day" — the ratio is the signal.
    posthog.capture('signup_succeeded')
  } catch {
    // As above.
  }
}
