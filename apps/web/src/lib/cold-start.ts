/**
 * Cold-start warmup helpers (web).
 *
 * Render's free tier spins down after 15 min of inactivity. We mitigate
 * cold boots (~20-30s) with two tools:
 *
 *   1. `warmupApi()` — fire-and-forget GET /health when a page mounts.
 *      By the time the user types credentials, the container is warm.
 *
 *   2. `useColdStartIndicator()` — flips `true` if an in-flight request
 *      stays active past `thresholdMs`, so screens can swap a generic
 *      spinner for "Waking up server…" copy.
 */
import { useEffect, useRef, useState } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

/**
 * Fire-and-forget GET to /health. Never throws, never awaits. Safe to
 * call from useEffect — we just want the side effect of nudging the
 * container awake.
 */
export function warmupApi(): void {
  // keepalive lets the request finish even if the user navigates away
  // before the response arrives (common during the 20-30s cold window).
  fetch(`${API_URL}/health`, { method: 'GET', keepalive: true }).catch(() => {
    // Swallow — a cold container may refuse connections during the
    // first seconds of boot. The user's real request will retry.
  })
}

/**
 * True once `active` has been true for at least `thresholdMs`.
 * Resets when `active` flips to false.
 *
 * Use on login/register pages to upgrade a spinner to a "Waking up
 * our server…" message once a request is clearly hitting a cold start.
 */
export function useColdStartIndicator(active: boolean, thresholdMs = 3000): boolean {
  const [warming, setWarming] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (active) {
      timeoutRef.current = setTimeout(() => setWarming(true), thresholdMs)
    } else {
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
