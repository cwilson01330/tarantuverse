'use client'

import { type ReactNode } from 'react'
import Link from 'next/link'
import DashboardLayout from '@/components/DashboardLayout'

/**
 * Chrome wrapper for public-facing care-guide pages.
 *
 * Care guides are a public SEO / signup surface (BRIEF-care-guide-expansion §0).
 * Logged-out visitors must NOT see the authenticated app sidebar + "Welcome back!"
 * (every app link there bounces to login). They get a real marketing header +
 * footer; authenticated users keep the full DashboardLayout app shell.
 */

function PublicSiteHeader() {
  return (
    <header className="bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-transparent.png" alt="Tarantuverse" className="h-8 w-8" />
          <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
            Tarantuverse
          </span>
        </Link>
        <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-gray-600 dark:text-gray-300">
          <Link href="/species" className="hover:text-purple-600 dark:hover:text-purple-400 transition">Care Guides</Link>
          <Link href="/features" className="hover:text-purple-600 dark:hover:text-purple-400 transition">Features</Link>
          <Link href="/pricing" className="hover:text-purple-600 dark:hover:text-purple-400 transition">Pricing</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-purple-600 dark:hover:text-purple-400 transition">
            Log in
          </Link>
          <Link href="/register" className="px-4 py-1.5 text-sm font-semibold text-white rounded-lg bg-gradient-to-r from-purple-600 to-pink-500 hover:opacity-90 transition">
            Sign up
          </Link>
        </div>
      </div>
    </header>
  )
}

function PublicSiteFooter() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          © {new Date().getFullYear()} Tarantuverse
        </span>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-500 dark:text-gray-400">
          <Link href="/species" className="hover:text-purple-600 dark:hover:text-purple-400 transition">Care Guides</Link>
          <Link href="/features" className="hover:text-purple-600 dark:hover:text-purple-400 transition">Features</Link>
          <Link href="/pricing" className="hover:text-purple-600 dark:hover:text-purple-400 transition">Pricing</Link>
          <Link href="/privacy" className="hover:text-purple-600 dark:hover:text-purple-400 transition">Privacy</Link>
          <Link href="/register" className="font-medium text-purple-600 dark:text-purple-400 hover:underline">Sign up free</Link>
        </nav>
      </div>
    </footer>
  )
}

interface PublicCareShellProps {
  /** Truthy when a user is authenticated (next-auth session user). */
  authUser?: { name?: string | null; email?: string | null; image?: string | null } | null
  children: ReactNode
}

export default function PublicCareShell({ authUser, children }: PublicCareShellProps) {
  if (authUser) {
    return (
      <DashboardLayout
        userName={authUser?.name ?? undefined}
        userEmail={authUser?.email ?? undefined}
        userAvatar={authUser?.image ?? undefined}
      >
        {children}
      </DashboardLayout>
    )
  }
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <PublicSiteHeader />
      <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      <PublicSiteFooter />
    </div>
  )
}
