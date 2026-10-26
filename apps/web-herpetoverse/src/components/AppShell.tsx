'use client'

import { ReactNode, useEffect, useState } from 'react'
import { refreshTokenIfStale } from '@/lib/auth'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

interface AppShellProps {
  children: ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Swap the API token for a fresh one when it is a day old: once on load,
  // and again whenever the tab comes back (a tab left open for days).
  useEffect(() => {
    void refreshTokenIfStale()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshTokenIfStale()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  return (
    <div className="min-h-screen bg-neutral-950">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content pushes over to the right of the fixed sidebar on desktop */}
      <div className="lg:pl-64">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="p-4 sm:p-8">{children}</main>
      </div>
    </div>
  )
}
