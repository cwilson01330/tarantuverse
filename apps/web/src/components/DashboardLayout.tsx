'use client'

import { useState, ReactNode } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

interface DashboardLayoutProps {
  children: ReactNode
  userName?: string
  userEmail?: string
  userAvatar?: string
}

export default function DashboardLayout({ children, userName, userEmail, userAvatar }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main content area */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        {/* Top bar */}
        <TopBar
          userName={userName}
          userEmail={userEmail}
          userAvatar={userAvatar}
          onMenuClick={() => setSidebarOpen(true)}
        />

        {/* Page content */}
        <main className="min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>
    </div>
  )
}
