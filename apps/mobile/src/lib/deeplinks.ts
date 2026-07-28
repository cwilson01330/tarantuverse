/**
 * Notification deeplink resolver (mobile).
 *
 * The API emits CANONICAL LOGICAL ROUTES from a fixed vocabulary — see
 * DEEPLINK_PATTERNS in apps/api/app/services/notification_service.py. This maps
 * them to real Expo Router paths in THIS app.
 *
 * Why a resolver instead of using the string directly: web and mobile have
 * different route shapes for the same screen. Mobile threads live at
 * /forums/thread/<id>, web at /community/forums/thread/<id>. Feeding Day is
 * /feeding-day here and /dashboard/feeding-day on web. Before this existed the
 * notification center pushed the WEB thread path, which matched
 * app/community/forums/[slug]/[threadId] with slug="thread" and rendered the
 * wrong screen — a bug that looked like a broken forum rather than a bad link.
 *
 * Unknown patterns return null and the caller must not navigate. A notification
 * that reads fine and does nothing on tap is better than one that lands the
 * keeper on an error screen.
 */

/** Mobile serves these canonical routes verbatim. */
const PASSTHROUGH_PREFIXES = [
  '/messages/',
  '/community/',
  '/forums/thread/',
];

const PASSTHROUGH_EXACT = ['/feeding-day'];

export function resolveDeeplink(deeplink: string | null | undefined): string | null {
  if (!deeplink) return null;

  // Defensive: only ever navigate to in-app paths. A deeplink is server data,
  // and an absolute URL here would be an open-redirect shaped hole.
  if (!deeplink.startsWith('/') || deeplink.startsWith('//')) return null;

  if (PASSTHROUGH_EXACT.includes(deeplink)) return deeplink;

  for (const prefix of PASSTHROUGH_PREFIXES) {
    if (deeplink.startsWith(prefix) && deeplink.length > prefix.length) {
      // /community/<username> is a profile; /community/forums/... is not a
      // route this app serves under that shape, so reject the nested case.
      if (prefix === '/community/' && deeplink.slice(prefix.length).includes('/')) {
        return null;
      }
      return deeplink;
    }
  }

  return null;
}
