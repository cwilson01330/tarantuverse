'use client'

/**
 * Notification bell + dropdown for the Herpetoverse app header.
 *
 * Mirrors the proven Tarantuverse bell (apps/web/src/components/TopBar.tsx)
 * restyled into the Herpetoverse dark theme (herp-* + neutral-* tokens):
 *   - Badge shows the unread count, polled every ~30s via getUnreadCount().
 *   - Dropdown lists the most recent notifications, with "Mark all read"
 *     and per-row ✕ dismiss (optimistic).
 *   - Tapping a row with a deeplink routes there (and marks it read).
 *   - "See all" footer links to /app/notifications.
 *
 * Auth: reuses the shared apiFetch (Bearer). The bell only renders when a
 * token is present so guests never see an empty shell.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  type AppNotification,
  clearAllNotifications,
  deleteNotification,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationRelativeTime,
} from '@/lib/notifications'

export default function NotificationBell() {
  const router = useRouter()
  const { token, isLoading } = useAuth()

  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(false)

  // Poll unread count every 30s while signed in.
  useEffect(() => {
    if (!token) {
      setUnreadCount(0)
      return
    }
    let cancelled = false
    const fetchCount = async () => {
      try {
        const { unread_count } = await getUnreadCount()
        if (!cancelled) setUnreadCount(unread_count || 0)
      } catch {
        // Silent — a failed poll shouldn't disrupt the header.
      }
    }
    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [token])

  const fetchNotifications = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await listNotifications(15, false)
      setNotifications(data)
      setUnreadCount(data.filter((n) => !n.is_read).length)
    } catch {
      // Silent — the dropdown will show its empty/loading state.
    } finally {
      setLoading(false)
    }
  }, [token])

  const toggleOpen = () => {
    const next = !open
    setOpen(next)
    if (next) fetchNotifications()
  }

  const handleRowClick = async (item: AppNotification) => {
    if (!item.is_read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)),
      )
      setUnreadCount((c) => Math.max(0, c - 1))
      try {
        await markNotificationRead(item.id)
      } catch {
        // Non-fatal — UI already reflects read state.
      }
    }
    setOpen(false)
    if (item.deeplink) router.push(item.deeplink)
  }

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnreadCount(0)
    try {
      await markAllNotificationsRead()
    } catch {
      // Non-fatal.
    }
  }

  const handleDismiss = async (e: React.MouseEvent, item: AppNotification) => {
    e.stopPropagation()
    const wasUnread = !item.is_read
    // Optimistic remove.
    setNotifications((prev) => prev.filter((n) => n.id !== item.id))
    if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1))
    try {
      await deleteNotification(item.id)
    } catch {
      // Restore accurate state on failure.
      fetchNotifications()
    }
  }

  const handleClearAll = async () => {
    if (!window.confirm('Clear all notifications? This cannot be undone.')) return
    const prev = notifications
    // Optimistic clear.
    setNotifications([])
    setUnreadCount(0)
    try {
      await clearAllNotifications()
    } catch {
      setNotifications(prev)
      setUnreadCount(prev.filter((n) => !n.is_read).length)
    }
  }

  // Don't render the bell for guests (or during the SSR/auth-loading flash).
  if (isLoading || !token) return null

  return (
    <div className="relative">
      <button
        onClick={toggleOpen}
        className="relative p-2 rounded-md hover:bg-neutral-900 text-neutral-400 transition-colors"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : 'Notifications'
        }
        aria-haspopup="true"
        aria-expanded={open}
        title="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-herp-teal text-herp-dark text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[70vh] flex flex-col bg-neutral-950 rounded-xl shadow-2xl border border-neutral-800 z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 p-3 border-b border-neutral-800">
              <p className="text-sm font-semibold text-white">Notifications</p>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs font-medium text-herp-teal hover:text-herp-lime transition-colors"
                  >
                    Mark all read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 space-y-3">
                  <div className="h-12 rounded-lg bg-neutral-900/60 animate-pulse" />
                  <div className="h-12 rounded-lg bg-neutral-900/60 animate-pulse" />
                  <div className="h-12 rounded-lg bg-neutral-900/60 animate-pulse" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="text-3xl mb-2" aria-hidden="true">
                    🔔
                  </div>
                  <p className="text-sm text-neutral-400">No notifications yet</p>
                </div>
              ) : (
                <ul className="divide-y divide-neutral-800">
                  {notifications.map((n) => (
                    <li key={n.id} className="relative group">
                      <button
                        type="button"
                        onClick={() => handleRowClick(n)}
                        className={`w-full text-left pl-4 pr-10 py-3 flex items-start gap-3 transition-colors hover:bg-neutral-900 ${
                          n.is_read ? '' : 'bg-herp-teal/5'
                        }`}
                      >
                        <span className="flex-shrink-0 pt-1.5" aria-hidden="true">
                          {n.is_read ? (
                            <span className="block w-2 h-2" />
                          ) : (
                            <span className="block w-2 h-2 rounded-full bg-herp-teal" />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <p
                              className={`text-sm truncate ${
                                n.is_read
                                  ? 'font-medium text-neutral-200'
                                  : 'font-semibold text-white'
                              }`}
                            >
                              {n.title}
                              {!n.is_read && (
                                <span className="sr-only"> (unread)</span>
                              )}
                            </p>
                            <span className="flex-shrink-0 text-[11px] text-neutral-500">
                              {notificationRelativeTime(n.created_at)}
                            </span>
                          </div>
                          {n.body && (
                            <p className="mt-0.5 text-xs text-neutral-400 line-clamp-2">
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
                        className="absolute top-2 right-2 p-1 rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="p-2 border-t border-neutral-800">
              <button
                onClick={() => {
                  setOpen(false)
                  router.push('/app/notifications')
                }}
                className="w-full text-center text-sm font-medium text-herp-teal hover:text-herp-lime hover:bg-neutral-900 rounded-lg py-2 transition-colors"
              >
                See all
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
