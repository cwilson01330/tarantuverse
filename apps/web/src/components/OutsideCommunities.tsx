'use client'

import { OUTSIDE_COMMUNITIES } from '@/lib/features'

/** "Talk with other keepers": links to outside communities, one per line. Links only, no claims. */
export default function OutsideCommunities({ className = '' }: { className?: string }) {
  return (
    <section
      aria-labelledby="outside-communities-title"
      className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 ${className}`}
    >
      <h2 id="outside-communities-title" className="text-base font-semibold text-gray-900 dark:text-white mb-2">
        Talk with other keepers
      </h2>
      <ul className="space-y-1">
        {OUTSIDE_COMMUNITIES.map((c) => (
          <li key={c.url}>
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
            >
              {c.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
