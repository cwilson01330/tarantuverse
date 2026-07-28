/**
 * Notification deeplink resolver (Herpetoverse web).
 *
 * The shared API emits CANONICAL LOGICAL ROUTES from a fixed vocabulary — see
 * DEEPLINK_PATTERNS in apps/api/app/services/notification_service.py. Because
 * one backend serves four clients (TV web/mobile, HV web/mobile) with four
 * different route shapes, the canonical string is never a literal path; each
 * client maps it here.
 *
 * HV web nests its authenticated app under /app/*, so /feeding-day and
 * /transfers both need rewriting. Before this resolver existed the bell pushed
 * the raw string and those landed on 404s.
 *
 * Unknown patterns return null and the caller must not navigate. HV has no
 * forums, DMs, or keeper profiles, so those canonical routes correctly resolve
 * to nothing here — the notification still reads fine as text.
 */

const EXACT_MAP: Record<string, string> = {
  '/feeding-day': '/app/feeding-day',
  '/transfers': '/app/transfers',
}

export function resolveDeeplink(deeplink: string | null | undefined): string | null {
  if (!deeplink) return null

  // Only ever navigate to in-app paths. A deeplink is server data, and an
  // absolute URL here would be an open-redirect shaped hole.
  if (!deeplink.startsWith('/') || deeplink.startsWith('//')) return null

  return EXACT_MAP[deeplink] ?? null
}
