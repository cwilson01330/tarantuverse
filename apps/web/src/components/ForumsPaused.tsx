'use client'

import { useRouter } from 'next/navigation'
import { FORUMS_PAUSED_BODY, FORUMS_PAUSED_TITLE, OUTSIDE_COMMUNITIES } from '@/lib/features'

/** Shown instead of any forum screen while the forums switch is off. */
export default function ForumsPaused() {
  const router = useRouter()

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/community')
  }

  return (
    <div className="max-w-xl mx-auto py-10 px-4">
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{FORUMS_PAUSED_TITLE}</h1>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">{FORUMS_PAUSED_BODY}</p>
        <ul className="space-y-2 mb-6">
          {OUTSIDE_COMMUNITIES.map((c) => (
            <li key={c.url}>
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                {c.label}
              </a>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={goBack}
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
        >
          Back
        </button>
      </div>
    </div>
  )
}
