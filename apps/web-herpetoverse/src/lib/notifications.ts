/**
 * In-app notifications API client for Herpetoverse.
 *
 * Shared backend with Tarantuverse — same `/api/v1/notifications` surface,
 * same auth (Bearer via apiFetch). This is a thin typed wrapper over the six
 * endpoints; the bell and the /app/notifications page consume it.
 *
 * Trailing-slash rule: the collection endpoints use `/notifications/`; the
 * by-id and named-action endpoints do not.
 */
import { apiFetch } from './apiClient'

export interface AppNotification {
  id: string
  type: string
  title: string
  body: string | null
  deeplink: string | null
  data: Record<string, unknown> | null
  is_read: boolean
  created_at: string
}

export interface UnreadCount {
  unread_count: number
}

/**
 * List recent notifications, neediest/newest-first (backend-ordered).
 * @param limit  max rows to return (default 30, matching the API)
 * @param unreadOnly  when true, only return unread notifications
 */
export function listNotifications(
  limit = 30,
  unreadOnly = false,
): Promise<AppNotification[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    unread_only: String(unreadOnly),
  })
  return apiFetch<AppNotification[]>(`/api/v1/notifications/?${params.toString()}`)
}

/** Poll target for the bell badge. */
export function getUnreadCount(): Promise<UnreadCount> {
  return apiFetch<UnreadCount>('/api/v1/notifications/unread-count')
}

/** Mark a single notification read. */
export function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/api/v1/notifications/${encodeURIComponent(id)}/read`,
    { method: 'POST' },
  )
}

/** Mark every notification read. */
export function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/api/v1/notifications/read-all', {
    method: 'POST',
  })
}

/** Dismiss (delete) a single notification. Returns 204. */
export function deleteNotification(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/notifications/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

/** Clear (delete) all notifications for the current user. Returns 204. */
export function clearAllNotifications(): Promise<void> {
  return apiFetch<void>('/api/v1/notifications/', { method: 'DELETE' })
}

// ─── Display helpers ─────────────────────────────────────────────────────

/** Compact relative time for notification rows. */
export function notificationRelativeTime(iso: string): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const diffSec = Math.floor((Date.now() - then.getTime()) / 1000)
  if (diffSec < 45) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
