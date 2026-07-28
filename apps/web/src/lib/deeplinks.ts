/**
 * Notification deeplink resolver (web).
 *
 * The API emits CANONICAL LOGICAL ROUTES from a fixed vocabulary — see
 * DEEPLINK_PATTERNS in apps/api/app/services/notification_service.py. This maps
 * them to real Next.js routes in THIS app. Mobile has its own resolver at
 * apps/mobile/src/lib/deeplinks.ts; the two disagree on purpose, because the
 * route shapes genuinely differ (threads are /forums/thread/<id> on mobile,
 * /community/forums/thread/<id> here; Feeding Day is /feeding-day on mobile,
 * /dashboard/feeding-day here).
 *
 * Unknown patterns return null and the caller must not navigate. Previously the
 * bell pushed whatever string the API sent, so /dashboard/transfers and
 * /feeding-day both landed on 404s.
 */

const EXACT_MAP: Record<string, string> = {
  '/feeding-day': '/dashboard/feeding-day',
}

export function resolveDeeplink(deeplink: string | null | undefined): string | null {
  if (!deeplink) return null

  // Only ever navigate to in-app paths. A deeplink is server data, and an
  // absolute URL here would be an open-redirect shaped hole.
  if (!deeplink.startsWith('/') || deeplink.startsWith('//')) return null

  if (EXACT_MAP[deeplink]) return EXACT_MAP[deeplink]

  // /forums/thread/<id> → /community/forums/thread/<id>
  const thread = deeplink.match(/^\/forums\/thread\/([0-9a-fA-F-]+)$/)
  if (thread) return `/community/forums/thread/${thread[1]}`

  // /messages/<username> and /community/<username> are served verbatim.
  if (/^\/messages\/[^/]+$/.test(deeplink)) return deeplink
  if (/^\/community\/[^/]+$/.test(deeplink)) return deeplink

  return null
}
