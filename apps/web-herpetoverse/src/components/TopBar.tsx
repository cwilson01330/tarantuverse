'use client'

import NotificationBell from './NotificationBell'

interface TopBarProps {
  onMenuClick: () => void
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  return (
    <header className="h-16 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-30">
      <div className="h-full px-4 sm:px-6 flex items-center gap-4">
        {/* Mobile menu trigger */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-md hover:bg-neutral-900 text-neutral-400"
          aria-label="Open navigation"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Search intentionally omitted until it actually works. A permanently
            disabled search box advertises a dead end on every screen — better
            to add the control at the same time as the feature. */}
        <div className="flex-1" />

        {/* Notification bell — renders only when signed in */}
        <NotificationBell />

        {/* User stub */}
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full herp-gradient-bg flex items-center justify-center text-herp-dark font-bold text-sm">
            H
          </div>
        </div>
      </div>
    </header>
  )
}
