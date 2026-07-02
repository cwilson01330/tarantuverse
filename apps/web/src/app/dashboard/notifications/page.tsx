'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'

const API_URL = process.env.NEXT_PUBLIC_API_URL

interface AppNotification {
  id: string
  type: string
  title: string
  body: string | null
  deeplink: string | null
  data: Record<string, unknown> | null
  is_read: boolean
  created_at: string
}

function relativeTime(iso: string): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const diffMs = Date.now() - then.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 45) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return then.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function NotificationsPage() {
  const router = useRouter()
  const { token, isAuthenticated, isLoading } = useAuth()

  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [markingAll, setMarkingAll] = useState(false)

  const fetchNotifications = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(
        `${API_URL}/api/v1/notifications/?limit=50&offset=0&unread_only=false`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) throw new Error('Failed to load notifications')
      const data = (await res.json()) as AppNotification[]
      setNotifications(data)
      setLoadError('')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    fetchNotifications()
  }, [isLoading, isAuthenticated, router, fetchNotifications])

  const markRead = useCallback(
    async (id: string) => {
      if (!token) return
      try {
        await fetch(`${API_URL}/api/v1/notifications/${id}/read`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch {
        // Non-fatal — UI already reflects read state.
      }
    },
    [token],
  )

  const handleItemClick = async (item: AppNotification) => {
    if (!item.is_read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)),
      )
      await markRead(item.id)
    }
    if (item.deeplink) {
      router.push(item.deeplink)
    }
  }

  const markAllRead = async () => {
    if (!token) return
    setMarkingAll(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/notifications/read-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to mark all read')
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    } catch {
      // Swallow — leave state as-is; user can retry.
    } finally {
      setMarkingAll(false)
    }
  }

  const hasUnread = notifications.some((n) => !n.is_read)

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="h-8 w-48 rounded bg-surface-elevated animate-pulse" />
          <div className="h-20 rounded-2xl bg-surface-elevated animate-pulse" />
          <div className="h-20 rounded-2xl bg-surface-elevated animate-pulse" />
          <div className="h-20 rounded-2xl bg-surface-elevated animate-pulse" />
        </div>
      </DashboardLayout>
    )
  }

  if (loadError) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="text-5xl mb-4" aria-hidden="true">
            🔔
          </div>
          <h1 className="text-2xl font-bold text-theme-primary mb-2">
            Couldn’t load notifications
          </h1>
          <p className="text-theme-secondary mb-6">{loadError}</p>
          <button
            onClick={fetchNotifications}
            className="px-4 py-2 rounded-xl bg-gradient-brand text-white font-medium shadow-gradient-brand hover:opacity-90 transition"
          >
            Retry
          </button>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-theme-primary">Notifications</h1>
            <p className="text-theme-secondary mt-1">
              Feeding reminders, community activity, and more.
            </p>
          </div>
          {hasUnread && (
            <button
              onClick={markAllRead}
              disabled={markingAll}
              className="self-start sm:self-auto px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition disabled:opacity-50"
            >
              {markingAll ? 'Marking…' : 'Mark all read'}
            </button>
          )}
        </div>

        {/* Empty state */}
        {notifications.length === 0 ? (
          <div className="p-12 rounded-2xl border border-theme bg-surface text-center">
            <div className="text-5xl mb-4" aria-hidden="true">
              🔔
            </div>
            <h2 className="text-xl font-semibold text-theme-primary mb-1">
              No notifications yet
            </h2>
            <p className="text-theme-secondary">
              When there’s something to catch up on, it’ll show up here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-theme rounded-2xl border border-theme bg-surface overflow-hidden">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleItemClick(n)}
                  className={`w-full text-left p-4 flex items-start gap-3 transition hover:bg-surface-elevated ${
                    n.is_read ? '' : 'bg-primary-50 dark:bg-primary-900/10'
                  }`}
                >
                  {/* Unread dot */}
                  <span className="flex-shrink-0 pt-1.5" aria-hidden="true">
                    {n.is_read ? (
                      <span className="block w-2.5 h-2.5" />
                    ) : (
                      <span className="block w-2.5 h-2.5 rounded-full bg-gradient-brand" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p
                        className={`truncate ${
                          n.is_read
                            ? 'font-medium text-theme-primary'
                            : 'font-semibold text-theme-primary'
                        }`}
                      >
                        {n.title}
                        {!n.is_read && (
                          <span className="sr-only"> (unread)</span>
                        )}
                      </p>
                      <span className="flex-shrink-0 text-xs text-theme-tertiary">
                        {relativeTime(n.created_at)}
                      </span>
                    </div>
                    {n.body && (
                      <p className="mt-1 text-sm text-theme-secondary line-clamp-2">
                        {n.body}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardLayout>
  )
}
