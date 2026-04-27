/**
 * Resolve a photo URL into a fully-qualified absolute URL the React
 * Native <Image> component can fetch.
 *
 * Photos in our system come in two shapes:
 *   1. Cloudflare R2 URLs — already absolute, e.g. `https://photos.tarantuverse.com/...`
 *   2. Server-relative paths — `/uploads/photos/abc.jpg` from the
 *      legacy local-storage path that some older rows still carry.
 *
 * For shape #2 we prefix the API host. Until 2026-04-24 each consumer
 * had its own copy of this helper with a HARDCODED prod URL — meaning
 * dev/staging builds silently pulled images from prod regardless of
 * EXPO_PUBLIC_API_URL. Centralizing here both fixes that bug and makes
 * any future API-host migration a one-line change.
 *
 * Returns '' for null/undefined input so callers can pass it directly
 * to <Image source={{ uri: getImageUrl(maybeUrl) }} /> without an extra
 * conditional — RN treats an empty uri as "no image" gracefully.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';

export function getImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE_URL}${url}`;
}
