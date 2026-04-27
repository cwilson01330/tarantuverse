/**
 * Cold-start warmup helpers — port of apps/mobile/src/utils/cold-start.ts.
 *
 * Tarantuverse + Herpetoverse mobile apps both hit the same Render-hosted
 * API. Render free tier spins down after 15 min idle; first request after
 * that takes 20-30 seconds. We mitigate two ways:
 *
 *   1. `warmupApi()` — fire-and-forget GET /health when an auth screen
 *      mounts. By the time the user finishes typing credentials, the
 *      container is warm and their real login hits a hot worker.
 *
 *   2. `useColdStartIndicator()` — flips a boolean to `true` if an
 *      in-flight request hasn't returned within `thresholdMs`. Login
 *      screen swaps a generic spinner for a "Waking up server" message
 *      so users don't think the app is broken.
 *
 * If we ever spin up a `packages/` workspace, this is a strong candidate
 * to share between both mobile apps.
 */
import { useEffect, useRef, useState } from 'react';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';

export function warmupApi(): void {
  fetch(`${API_URL}/health`, { method: 'GET' }).catch(() => {
    // Cold container may refuse the connection during boot. The user's
    // real request will retry — this helper is purely a side-effectful
    // nudge.
  });
}

export function useColdStartIndicator(active: boolean, thresholdMs = 3000): boolean {
  const [warming, setWarming] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (active) {
      timeoutRef.current = setTimeout(() => setWarming(true), thresholdMs);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setWarming(false);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [active, thresholdMs]);

  return warming;
}
