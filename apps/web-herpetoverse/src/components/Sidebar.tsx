'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

interface NavItem {
  icon: string
  label: string
  path: string
  disabled?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { icon: '🏠', label: 'Dashboard', path: '/app' },
  { icon: '🦎', label: 'Reptiles', path: '/app/reptiles' },
  { icon: '📖', label: 'Species', path: '/app/species' },
  { icon: '🥚', label: 'Breeding', path: '/app/breeding', disabled: true },
  { icon: '🌐', label: 'Community', path: '/app/community', disabled: true },
  { icon: '⚙️', label: 'Settings', path: '/app/settings' },
]

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()

  const isActive = (path: string) => {
    if (path === '/app') return pathname === '/app'
    return pathname.startsWith(path)
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-neutral-950 border-r border-neutral-800
          transition-transform duration-300 z-50
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Brand */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-neutral-800">
          <Link href="/app" className="flex items-center gap-2.5" onClick={onClose}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={32} height={33} className="select-none" draggable={false} />
            <span className="herp-gradient-text text-lg font-bold tracking-wide">
              Herpetoverse
            </span>
          </Link>

          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-md hover:bg-neutral-800 text-neutral-400"
            aria-label="Close navigation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path)

            if (item.disabled) {
              return (
                <div
                  key={item.path}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-neutral-600 cursor-not-allowed select-none"
                  title="Coming soon"
                >
                  <span className="text-lg flex-shrink-0 grayscale opacity-60">{item.icon}</span>
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-widest text-neutral-700">
                    Soon
                  </span>
                </div>
              )
            }

            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={onClose}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors
                  ${active
                    ? 'bg-herp-green/15 text-herp-lime border border-herp-green/30'
                    : 'text-neutral-300 hover:text-white hover:bg-neutral-900 border border-transparent'
                  }
                `}
              >
                <span className="text-lg flex-shrink-0">{item.icon}</span>
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-neutral-800">
          <p className="text-[10px] uppercase tracking-widest text-neutral-500">
            Preview build · v0.1
          </p>
          <Link
            href="/"
            className="mt-1 block text-xs text-herp-teal hover:text-herp-lime transition-colors"
          >
            ← Back to landing
          </Link>
        </div>
      </aside>
    </>
  )
}
