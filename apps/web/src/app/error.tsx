'use client'

import { useEffect } from 'react'

/**
 * Root error boundary for the Tarantuverse web app.
 *
 * Next.js App Router auto-mounts this when any component under the app
 * directory throws. We do three things:
 *
 *   1. Log to console so the error shows up in the user's devtools /
 *      Vercel runtime logs. `error.digest` is server-generated and is
 *      the join key between client reports and server traces.
 *   2. Stay in-app with a themed fallback (the previous version bounced
 *      to a static /500.html, throwing away the user's session context).
 *   3. Give the user a "Try again" button wired to Next's `reset` fn,
 *      which re-renders the boundary's children. If that doesn't clear
 *      it, a "Go home" link navigates to the landing page.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log for observability. Vercel captures console.error in runtime
    // logs and PostHog's autocapture picks it up client-side.
    // eslint-disable-next-line no-console
    console.error('[Tarantuverse error boundary]', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-theme">
      <div className="w-full max-w-lg bg-surface rounded-2xl shadow-lg border border-theme p-8 text-center">
        <div className="text-6xl mb-4" aria-hidden="true">🕸️</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Something went wrong
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          We hit an unexpected error. Try again, or head back to the dashboard.
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
            Go to dashboard
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
