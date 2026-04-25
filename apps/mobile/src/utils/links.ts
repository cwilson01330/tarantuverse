/**
 * Cross-platform URL normalization for mobile.
 *
 * The Tarantuverse API returns URLs that mostly target the web app's
 * route layout (e.g. `/dashboard/tarantulas/<id>`, `/community/forums/thread/<id>`).
 * Some of those paths don't exist in the mobile expo-router tree, so
 * pushing them raw produces hard 404s. This helper translates web-canonical
 * paths to their mobile equivalents.
 *
 * History:
 *   - The first instance lived inside `apps/mobile/app/search.tsx` (added
 *     2026-04-24 to fix universal-search keeper/tarantula 404s).
 *   - Then mobile/app/discover.tsx + an audit of activity-feed taps
 *     surfaced the same class of bug, so we extracted to a shared util
 *     to stop copy-pasting the regex.
 *
 * Known mappings (web-canonical → mobile equivalent):
 *   /dashboard/tarantulas/<id>      → /tarantula/<id>
 *   /keeper/<username>              → /community/<username>
 *   /community/forums/thread/<id>   → /forums/thread/<id>
 *   /species/<id>                   → unchanged ✓
 *   /t/<id>                         → unchanged ✓
 *
 * When you find another mismatch, add a regex here rather than duplicating
 * a string-replace at the call site — keeps the fixes centralised and
 * makes it easy to audit what's normalized vs. what passes through.
 */

export function toMobilePath(url: string): string {
  if (!url) return url;

  // /dashboard/tarantulas/<id>  →  /tarantula/<id>
  const tarantulaMatch = url.match(/^\/dashboard\/tarantulas\/([^/?#]+)/);
  if (tarantulaMatch) return `/tarantula/${tarantulaMatch[1]}`;

  // /keeper/<u>  →  /community/<u>
  const keeperMatch = url.match(/^\/keeper\/([^/?#]+)/);
  if (keeperMatch) return `/community/${keeperMatch[1]}`;

  // /community/forums/thread/<id>  →  /forums/thread/<id>
  // Mobile's forums live at the top level, not under /community.
  const threadMatch = url.match(/^\/community\/forums\/thread\/([^/?#]+)/);
  if (threadMatch) return `/forums/thread/${threadMatch[1]}`;

  return url;
}
