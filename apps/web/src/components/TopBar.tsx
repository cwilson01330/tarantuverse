'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useThemeStore } from '@/stores/themeStore'
import { useAuth } from '@/hooks/useAuth'
import GlobalSearch from './GlobalSearch'

interface TopBarProps {
  userName?: string
  userEmail?: string
  userAvatar?: string
  onMenuClick: () => void
}

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

function notificationRelativeTime(iso: string): string {
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

export default function TopBar({ userName, userEmail, userAvatar, onMenuClick }: TopBarProps) {
  const router = useRouter()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const { theme, toggleTheme } = useThemeStore()
  const { token } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  // Notification center state
  const [notifUnreadCount, setNotifUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [notifLoading, setNotifLoading] = useState(false)

  const handleLogout = async () => {
    await signOut({ redirect: false })
    router.push('/')
  }

  // Fetch unread message count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      if (!token) return

      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
        const response = await fetch(`${API_URL}/api/v1/messages/direct/unread-count`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (response.ok) {
          const data = await response.json()
          setUnreadCount(data.unread_count || 0)
        }
      } catch {
        // Unread count fetch failed silently
      }
    }

    fetchUnreadCount()

    // Poll every 30 seconds for new messages
    const interval = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [token])

  // Fetch unread notification count (polled)
  useEffect(() => {
    const fetchNotifUnreadCount = async () => {
      if (!token) return
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
        const response = await fetch(`${API_URL}/api/v1/notifications/unread-count`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (response.ok) {
          const data = (await response.json()) as { unread_count: number }
          setNotifUnreadCount(data.unread_count || 0)
        }
      } catch {
        // Unread notification count fetch failed silently
      }
    }

    fetchNotifUnreadCount()

    // Poll every 30 seconds for new notifications
    const interval = setInterval(fetchNotifUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [token])

  const fetchNotifications = async () => {
    if (!token) return
    setNotifLoading(true)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(
        `${API_URL}/api/v1/notifications/?limit=15&offset=0&unread_only=false`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (response.ok) {
        const data = (await response.json()) as AppNotification[]
        setNotifications(data)
        setNotifUnreadCount(data.filter((n) => !n.is_read).length)
      }
    } catch {
      // Notifications fetch failed silently
    } finally {
      setNotifLoading(false)
    }
  }

  const toggleNotifications = () => {
    const next = !showNotifications
    setShowNotifications(next)
    if (next) fetchNotifications()
  }

  const handleNotificationClick = async (item: AppNotification) => {
    if (!item.is_read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)),
      )
      setNotifUnreadCount((c) => Math.max(0, c - 1))
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
        await fetch(`${API_URL}/api/v1/notifications/${item.id}/read`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch {
        // Non-fatal
      }
    }
    setShowNotifications(false)
    if (item.deeplink) router.push(item.deeplink)
  }

  const markAllNotificationsRead = async () => {
    if (!token) return
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setNotifUnreadCount(0)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      await fetch(`${API_URL}/api/v1/notifications/read-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {
      // Non-fatal
    }
  }

  const dismissNotification = async (
    e: React.MouseEvent,
    item: AppNotification,
  ) => {
    e.stopPropagation()
    if (!token) return
    const wasUnread = !item.is_read
    // Optimistic remove
    setNotifications((prev) => prev.filter((n) => n.id !== item.id))
    if (wasUnread) setNotifUnreadCount((c) => Math.max(0, c - 1))
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const res = await fetch(`${API_URL}/api/v1/notifications/${item.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to dismiss')
    } catch {
      // On failure, refetch to restore accurate state
      fetchNotifications()
    }
  }

  const clearAllNotifications = async () => {
    if (!token) return
    if (!window.confirm('Clear all notifications? This cannot be undone.')) return
    const prev = notifications
    // Optimistic clear
    setNotifications([])
    setNotifUnreadCount(0)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const res = await fetch(`${API_URL}/api/v1/notifications/`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to clear')
    } catch {
      // Restore on failure
      setNotifications(prev)
      setNotifUnreadCount(prev.filter((n) => !n.is_read).length)
    }
  }

  return (
    <>
      <GlobalSearch isOpen={showSearch} onClose={() => setShowSearch(false)} />
      <header className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="h-16 px-4 flex items-center justify-between gap-4">
          {/* Left section - Mobile menu button */}
          <div className="flex items-center gap-4">
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Breadcrumb or page title could go here */}
            <div className="hidden md:block">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Welcome back! 🕷️
              </h2>
            </div>
          </div>

          {/* Right section - User menu */}
          <div className="flex items-center gap-3">
            {/* Search button */}
            <button
              onClick={() => setShowSearch(true)}
              className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
              title="Search (Cmd+K)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-sm hidden md:inline">Search</span>
              <kbd className="hidden lg:inline ml-2 px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600">
                ⌘K
              </kbd>
            </button>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              )}
            </button>

            {/* Messages/Notifications — authenticated only */}
            {token && (
              <button
                onClick={() => router.push('/messages')}
                className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={unreadCount > 0 ? `${unreadCount} unread message${unreadCount > 1 ? 's' : ''}` : 'Messages'}
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            )}

            {/* Notifications bell — authenticated only */}
            {token && (
              <div className="relative">
                <button
                  onClick={toggleNotifications}
                  className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-label={
                    notifUnreadCount > 0
                      ? `Notifications, ${notifUnreadCount} unread`
                      : 'Notifications'
                  }
                  aria-haspopup="true"
                  aria-expanded={showNotifications}
                  title="Notifications"
                >
                  <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {notifUnreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {notifUnreadCount > 99 ? '99+' : notifUnreadCount}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowNotifications(false)}
                    />
                    <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[70vh] flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-20 overflow-hidden">
                      {/* Header */}
                      <div className="flex items-center justify-between gap-2 p-3 border-b border-gray-200 dark:border-gray-700">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          Notifications
                        </p>
                        <div className="flex items-center gap-3">
                          {notifUnreadCount > 0 && (
                            <button
                              onClick={markAllNotificationsRead}
                              className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                            >
                              Mark all read
                            </button>
                          )}
                          {notifications.length > 0 && (
                            <button
                              onClick={clearAllNotifications}
                              className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                            >
                              Clear all
                            </button>
                          )}
                        </div>
                      </div>

                      {/* List */}
                      <div className="flex-1 overflow-y-auto">
                        {notifLoading ? (
                          <div className="p-4 space-y-3">
                            <div className="h-12 rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse" />
                            <div className="h-12 rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse" />
                            <div className="h-12 rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse" />
                          </div>
                        ) : notifications.length === 0 ? (
                          <div className="p-8 text-center">
                            <div className="text-3xl mb-2" aria-hidden="true">🔔</div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              No notifications yet
                            </p>
                          </div>
                        ) : (
                          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                            {notifications.map((n) => (
                              <li key={n.id} className="relative group">
                                <button
                                  type="button"
                                  onClick={() => handleNotificationClick(n)}
                                  className={`w-full text-left pl-4 pr-10 py-3 flex items-start gap-3 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                                    n.is_read ? '' : 'bg-primary-50 dark:bg-primary-900/10'
                                  }`}
                                >
                                  <span className="flex-shrink-0 pt-1.5" aria-hidden="true">
                                    {n.is_read ? (
                                      <span className="block w-2 h-2" />
                                    ) : (
                                      <span className="block w-2 h-2 rounded-full bg-gradient-brand" />
                                    )}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <p
                                        className={`text-sm truncate ${
                                          n.is_read
                                            ? 'font-medium text-gray-900 dark:text-white'
                                            : 'font-semibold text-gray-900 dark:text-white'
                                        }`}
                                      >
                                        {n.title}
                                        {!n.is_read && <span className="sr-only"> (unread)</span>}
                                      </p>
                                      <span className="flex-shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
                                        {notificationRelativeTime(n.created_at)}
                                      </span>
                                    </div>
                                    {n.body && (
                                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                                        {n.body}
                                      </p>
                                    )}
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => dismissNotification(e, n)}
                                  aria-label="Dismiss notification"
                                  title="Dismiss"
                                  className="absolute top-2 right-2 p-1 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
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
                      <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                        <button
                          onClick={() => {
                            setShowNotifications(false)
                            router.push('/dashboard/notifications')
                          }}
                          className="w-full text-center text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg py-2 transition-colors"
                        >
                          See all
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* User menu — authenticated */}
            {token ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  {userAvatar ? (
                    <img
                      src={userAvatar}
                      alt={userName || userEmail || 'User'}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-brand flex items-center justify-center text-white font-semibold text-sm">
                      {(userName || userEmail || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {userName || 'User'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {userEmail}
                    </p>
                  </div>
                  <svg
                    className={`hidden md:block w-4 h-4 text-gray-600 dark:text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showUserMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowUserMenu(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-20 overflow-hidden">
                      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {userName || 'User'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {userEmail}
                        </p>
                      </div>
                      <div className="py-2">
                        <button
                          onClick={() => { router.push('/dashboard/settings'); setShowUserMenu(false) }}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <span>⚙️</span><span>Settings</span>
                        </button>
                        <button
                          onClick={() => { router.push('/dashboard/settings/profile'); setShowUserMenu(false) }}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <span>👤</span><span>Profile</span>
                        </button>
                        <button
                          onClick={() => { router.push('/help'); setShowUserMenu(false) }}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <span>❓</span><span>Help & Support</span>
                        </button>
                      </div>
                      <div className="py-2 border-t border-gray-200 dark:border-gray-700">
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <span>🚪</span><span>Logout</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* Guest — Login / Sign Up buttons */
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/login')}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Log in
                </button>
                <button
                  onClick={() => router.push('/register')}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-gradient-brand hover:opacity-90 rounded-lg transition-opacity"
                >
                  Sign up
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  )
}
