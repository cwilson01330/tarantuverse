/**
 * Notification deeplink resolver (Herpetoverse mobile).
 *
 * The shared API emits CANONICAL LOGICAL ROUTES from a fixed vocabulary — see
 * DEEPLINK_PATTERNS in apps/api/app/services/notification_service.py. One
 * backend serves four clients with four different route shapes, so the
 * canonical string is never a literal path; each client maps it here.
 *
 * HV mobile currently serves only Feeding Day. It has no transfers index, no
 * forums, no DMs, and no keeper profiles — those canonical routes resolve to
 * null and the caller must not navigate. Previously this screen pushed the raw
 * string, so a transfer notification tried to open a route that doesn't exist.
 */

const EXACT_MAP: Record<string, string> = {
  '/feeding-day': '/feeding-day',
};

export function resolveDeeplink(deeplink: string | null | undefined): string | null {
  if (!deeplink) return null;

  // Only ever navigate to in-app paths. A deeplink is server data, and an
  // absolute URL here would be an open-redirect shaped hole.
  if (!deeplink.startsWith('/') || deeplink.startsWith('//')) return null;

  return EXACT_MAP[deeplink] ?? null;
}
