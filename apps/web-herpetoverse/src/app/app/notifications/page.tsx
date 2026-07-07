'use client'

/**
 * Notifications — full list.
 *
 * Mirrors the proven Tarantuverse page
 * (apps/web/src/app/dashboard/notifications/page.tsx) for structure and UX,
 * restyled into the Herpetoverse dark theme (herp-* + neutral-* tokens).
 *
 * Renders inside the /app AppShell (Sidebar + TopBar). No useSearchParams
 * here, so no Suspense boundary is required.
 *
 * Behavior: list newest-first (backend-ordered) → "Mark all read" +
 * "Clear all" → per-row ✕ dismiss (optimistic, restore on failure) →
 * tap row → mark read + follow deeplink. Empty + error states included.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError } from '@/lib/apiClient'
import { useAuth } from '@/lib/auth'
import {
  type AppNotification,
  clearAllNotifications,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationRelativeTime,
} from '@/lib/notifications'

export default function NotificationsPage() {
  const router = useRouter()
  const { token, isLoading } = useAuth()

  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [markingAll, setMarkingAll] = useState(false)
  const [clearing, setClearing] = useState(false)

  const fetchNotifications = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await listNotifications(50, false)
      setNotifications(data)
      setLoadError('')
    } catch (e) {
      // 401 is handled by apiClient (clears session); show empty rather than
      // a scary banner while that fires.
      if (e instanceof ApiError && e.status === 401) {
        setNotifications([])
      } else {
        setLoadError(
          e instanceof ApiError ? e.message : 'Something went wrong',
        )
      }
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (isLoading) return
    if (!token) {
      router.push('/login')
      return
    }
    fetchNotifications()
  }, [isLoading, token, router, fetchNotifications])

  const handleRowClick = async (item: AppNotification) => {
    if (!item.is_read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)),
      )
      try {
        await markNotificationRead(item.id)
      } catch {
        // Non-fatal — UI already reflects read state.
      }
    }
    if (item.deeplink) router.push(item.deeplink)
  }

  const handleMarkAllRead = async () => {
    setMarkingAll(true)
    try {
      await markAllNotificationsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    } catch {
      // Leave state as-is; user can retry.
    } finally {
      setMarkingAll(false)
    }
  }

  const handleDismiss = async (e: React.MouseEvent, item: AppNotification) => {
    e.stopPropagation()
    const prev = notifications
    // Optimistic remove.
    setNotifications((cur) => cur.filter((n) => n.id !== item.id))
    try {
      await deleteNotification(item.id)
    } catch {
      // Restore on failure.
      setNotifications(prev)
    }
  }

  const handleClearAll = async () => {
    if (!window.confirm('Clear all notifications? This cannot be undone.')) return
    const prev = notifications
    setClearing(true)
    // Optimistic clear.
    setNotifications([])
    try {
      await clearAllNotifications()
    } catch {
      setNotifications(prev)
    } finally {
      setClearing(false)
    }
  }

  const hasUnread = notifications.some((n) => !n.is_read)

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="h-8 w-48 rounded bg-neutral-900/60 animate-pulse" />
        <div className="h-20 rounded-2xl bg-neutral-900/40 animate-pulse" />
        <div className="h-20 rounded-2xl bg-neutral-900/40 animate-pulse" />
        <div className="h-20 rounded-2xl bg-neutral-900/40 animate-pulse" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="text-5xl mb-4" aria-hidden="true">
          🔔
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">
          Couldn&rsquo;t load notifications
        </h1>
        <p className="text-neutral-400 mb-6">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true)
            fetchNotifications()
          }}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md herp-gradient-bg text-herp-dark font-bold tracking-wide transition-opacity hover:opacity-90"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-4xl flex-shrink-0" aria-hidden="true">
            🔔
          </span>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-wide text-white">
              Notifications
            </h1>
            <p className="text-neutral-400 text-sm mt-0.5">
              Feeding reminders, community activity, and more.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {hasUnread && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="px-4 py-2 rounded-md border border-neutral-800 bg-neutral-900/40 text-neutral-200 hover:bg-neutral-900 transition-colors disabled:opacity-50"
            >
              {markingAll ? 'Marking…' : 'Mark all read'}
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={clearing}
              className="px-4 py-2 rounded-md border border-red-500/40 bg-neutral-900/40 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              {clearing ? 'Clearing…' : 'Clear all'}
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {notifications.length === 0 ? (
        <div className="p-12 rounded-2xl border border-neutral-800 bg-neutral-900/30 text-center">
          <div className="text-5xl mb-4" aria-hidden="true">
            🔔
          </div>
          <h2 className="text-xl font-semibold text-white mb-1">
            No notifications yet
          </h2>
          <p className="text-neutral-400">
            When there&rsquo;s something to catch up on, it&rsquo;ll show up here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded-2xl border border-neutral-800 bg-neutral-900/30 overflow-hidden">
          {notifications.map((n) => (
            <li key={n.id} className="relative">
              <button
                type="button"
                onClick={() => handleRowClick(n)}
                className={`w-full text-left pl-4 pr-12 py-4 flex items-start gap-3 transition-colors hover:bg-neutral-900 ${
                  n.is_read ? '' : 'bg-herp-teal/5'
                }`}
              >
                {/* Unread dot */}
                <span className="flex-shrink-0 pt-1.5" aria-hidden="true">
                  {n.is_read ? (
                    <span className="block w-2.5 h-2.5" />
                  ) : (
                    <span className="block w-2.5 h-2.5 rounded-full bg-herp-teal" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p
                      className={`truncate ${
                        n.is_read
                          ? 'font-medium text-neutral-200'
                          : 'font-semibold text-white'
                      }`}
                    >
                      {n.title}
                      {!n.is_read && <span className="sr-only"> (unread)</span>}
                    </p>
                    <span className="flex-shrink-0 text-xs text-neutral-500">
                      {notificationRelativeTime(n.created_at)}
                    </span>
                  </div>
                  {n.body && (
                    <p className="mt-1 text-sm text-neutral-400 line-clamp-2">
                      {n.body}
                    </p>
                  )}
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => handleDismiss(e, n)}
                aria-label="Dismiss notification"
                title="Dismiss"
                className="absolute top-3 right-3 p-1.5 rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
