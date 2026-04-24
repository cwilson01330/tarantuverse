'use client'

import { useEffect } from 'react'

/**
 * Dashboard-scoped error boundary. Catches render errors in any route
 * under `/dashboard/*` so a crash in one dashboard page (e.g. bad data
 * on the analytics tab) doesn't bubble up and replace the whole app
 * shell with the root error screen. The user keeps their session and
 * can click "Try again" or navigate away.
 *
 * Next.js renders this instead of the page content when a child throws.
 * The `reset` callback re-renders the route's children.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[Dashboard error boundary]', error)
  }, [error])

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="bg-surface rounded-2xl shadow-lg border border-theme p-8 text-center">
        <div className="text-5xl mb-4" aria-hidden="true">🕸️</div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          This page hit an error
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
          Something went wrong loading this dashboard page. Your data is safe — try
          reloading, or head back to your collection.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-brand text-white rounded-xl hover:bg-gradient-brand-hover transition font-semibold"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-surface border border-theme text-gray-900 dark:text-white rounded-xl hover:bg-surface-elevated transition font-semibold"
          >
            My Collection
          </a>
        </div>
        {error.digest && (
          <p className="mt-6 text-xs text-gray-500 dark:text-gray-500 font-mono">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
