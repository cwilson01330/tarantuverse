'use client'

export const dynamic = 'force-dynamic'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-6xl font-bold text-gray-900 dark:text-white">500</h1>
            <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-300 mt-4">
              Something went wrong
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              An error occurred while loading the application.
            </p>
            <button
              onClick={reset}
              className="mt-6 inline-block px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}