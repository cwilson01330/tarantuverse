'use client'

import { useEffect } from 'react'

/**
 * Community-scoped error boundary. Catches crashes in `/community/*`
 * routes (forums, keeper profiles, discover) without bringing down
 * the rest of the app. Dashboard routes, messages, and settings
 * remain reachable from the global nav even when this segment fails.
 */
export default function CommunityError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[Community error boundary]', error)
  }, [error])

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="bg-surface rounded-2xl shadow-lg border border-theme p-8 text-center">
        <div className="text-5xl mb-4" aria-hidden="true">🕸️</div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Community page hit an error
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
          We couldn't load this community page. Try again, or browse the keeper
          directory instead.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-brand text-white rounded-xl hover:bg-gradient-brand-hover transition font-semibold"
          >
            Try again
          </button>
          <a
            href="/community"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-surface border border-theme text-gray-900 dark:text-white rounded-xl hover:bg-surface-elevated transition font-semibold"
          >
            Browse Keepers
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
