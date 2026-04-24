/**
 * Cold-start warmup helpers.
 *
 * Render's free tier spins down after 15 min of inactivity. A cold boot
 * takes 20-30 seconds during which every request hangs. We mitigate
 * two ways:
 *
 *   1. `warmupApi()` — fire-and-forget GET /health when an auth screen
 *      mounts. If the container is cold, this kicks it awake while the
 *      user is still typing, so by the time they tap Login the API is
 *      likely ready.
 *
 *   2. `useColdStartIndicator()` — a tiny hook that flips a boolean to
 *      `true` if an in-flight request hasn't returned within `thresholdMs`.
 *      Screens use it to swap a "Logging in…" spinner for a more
 *      informative "Waking up our server — this can take 20-30s on the
 *      first visit" message so users don't think the app is broken.
 */
import { useEffect, useRef, useState } from 'react'

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'

/**
 * Fire-and-forget GET to /health. Never throws, never awaits. Safe to
 * call from useEffect without an AbortController — we just don't care
 * about the response. The request itself is what wakes the container.
 */
export function warmupApi(): void {
  // Don't await. Any failure is logged and swallowed — this is purely
  // a side-effectful nudge, not a precondition for anything.
  fetch(`${API_URL}/health`, { method: 'GET' }).catch(() => {
    // Swallow — cold container may refuse connections entirely during
    // the first few seconds of boot. The user's real request will retry.
  })
}

/**
 * Returns `warming` = true once `active` has been true for at least
 * `thresholdMs`. When `active` flips back to false, `warming` resets.
 *
 * Use on login/register screens to upgrade a generic spinner to a
 * "Waking up the server…" message once a request is clearly slow.
 */
export function useColdStartIndicator(active: boolean, thresholdMs = 3000): boolean {
  const [warming, setWarming] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (active) {
      // Start the clock. If `active` stays true past the threshold,
      // assume the container is cold and surface the warming message.
      timeoutRef.current = setTimeout(() => setWarming(true), thresholdMs)
    } else {
      // Request finished (success or failure) — cancel the pending
      // timer and hide the message.
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = null
      setWarming(false)
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [active, thresholdMs])

  return warming
}
