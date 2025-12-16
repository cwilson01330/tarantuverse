'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  isCollapsed: boolean
  onToggleCollapse: () => void
}

interface NavItem {
  icon: string
  label: string
  path: string
  badge?: number
}

export default function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    checkAdminStatus()
  }, [])

  const checkAdminStatus = async () => {
    const token = localStorage.getItem('auth_token')
    if (!token) return

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.ok) {
        const user = await response.json()
        setIsAdmin(user.is_admin || user.is_superuser)
      }
    } catch (error) {
      console.error('Failed to check admin status:', error)
    }
  }

  const baseNavItems: NavItem[] = [
    { icon: '🏠', label: 'Dashboard', path: '/dashboard' },
    { icon: '🕷️', label: 'Species', path: '/species' },
    { icon: '📊', label: 'Analytics', path: '/dashboard/analytics' },
    { icon: '💰', label: 'Collection Value', path: '/dashboard/collection-value' },
    { icon: '🥚', label: 'Breeding', path: '/dashboard/breeding' },
    { icon: '🌐', label: 'Community', path: '/community' },
    { icon: '💬', label: 'Forums', path: '/community/forums' },
    { icon: '⚙️', label: 'Settings', path: '/dashboard/settings' },
  ]

  // Add Admin link if user is admin
  const navItems: NavItem[] = isAdmin
    ? [...baseNavItems.slice(0, -1), { icon: '🛡️', label: 'Admin', path: '/dashboard/admin' }, baseNavItems[baseNavItems.length - 1]]
    : baseNavItems

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname.startsWith(path)
  }

  const handleNavigate = (path: string) => {
    router.push(path)
    onClose() // Close mobile menu after navigation
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
          shadow-xl transition-all duration-300 z-50
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${isCollapsed ? 'w-20' : 'w-64'}
        `}
      >
        {/* Logo / Brand */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800">
          {!isCollapsed && (
            <div className="flex items-center gap-3">
              <img
                src="/logo-transparent.png"
                alt="Tarantuverse"
                className="w-8 h-8 object-contain"
              />
              <span className="text-xl font-bold text-gradient-brand">
                Tarantuverse
              </span>
            </div>
          )}
          {isCollapsed && (
            <img
              src="/logo-transparent.png"
              alt="Tarantuverse"
              className="w-8 h-8 object-contain mx-auto"
            />
          )}

          {/* Desktop collapse toggle */}
          <button
            onClick={onToggleCollapse}
            className="hidden lg:block p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Mobile close button */}
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActive(item.path)
            return (
              <button
                key={item.path}
                onClick={() => handleNavigate(item.path)}
                className={`
                  w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200
                  ${active
                    ? 'bg-gradient-brand text-white shadow-gradient-brand'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }
                  ${isCollapsed ? 'justify-center' : ''}
                `}
                title={isCollapsed ? item.label : undefined}
              >
                <span className="text-xl flex-shrink-0">{item.icon}</span>
                {!isCollapsed && (
                  <span className="font-medium text-sm">{item.label}</span>
                )}
                {!isCollapsed && item.badge && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Footer - User Section */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          {!isCollapsed ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Tarantuverse v0.5.1
            </div>
          ) : (
            <div className="text-center text-xs text-gray-500 dark:text-gray-400">
              v0.5
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
