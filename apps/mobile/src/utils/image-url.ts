/**
 * Resolve a photo URL into a fully-qualified absolute URL the React
 * Native <Image> component can fetch.
 *
 * Photos in our system come in three shapes:
 *   1. Absolute URLs — e.g. `https://photos.tarantuverse.com/...`,
 *      `https://...vercel.app/...`. Returned unchanged.
 *   2. `/species-images/...` — static species catalog images that
 *      live in `apps/web/public/species-images/` and are served by
 *      the WEB app (Next.js), NOT by the API. We prefix the web host.
 *   3. Other server-relative paths (`/uploads/photos/...`) — legacy
 *      local-storage path served by the API. We prefix the API host.
 *
 * Until 2026-04-24 each consumer had its own copy of this helper with
 * a HARDCODED prod URL — meaning dev/staging builds silently pulled
 * images from prod regardless of EXPO_PUBLIC_API_URL. Centralizing
 * here both fixes that bug and keeps any future host migration to a
 * one-line change.
 *
 * The species-images branch was added 2026-05-27 after a 422-driven
 * audit revealed the unified species browser was sending those paths
 * to the API and getting 404s back. The previous tarantula species
 * tab had the same latent bug but only surfaced as broken-image cards
 * here and there; the unified browser made it impossible to miss.
 *
 * Returns '' for null/undefined input so callers can pass it directly
 * to <Image source={{ uri: getImageUrl(maybeUrl) }} /> without an extra
 * conditional — RN treats an empty uri as "no image" gracefully.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';

/** Web app host (Next.js, Vercel). Serves the species catalog static
 * images plus the public profile pages at `/t/{id}` and `/s/{id}`. */
export const WEB_BASE_URL =
  process.env.EXPO_PUBLIC_WEB_URL || 'https://tarantuverse.com';

export function getImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/species-images/')) return `${WEB_BASE_URL}${url}`;
  return `${API_BASE_URL}${url}`;
}
