'use client'

import { routeForTarget, type WhatsNewEntry } from '@/lib/whatsNew'

interface WhatsNewListProps {
  entries: WhatsNewEntry[]
  /** Called with the entry's route when its button is pressed. */
  onAction: (route: string) => void
}

/**
 * Entry rendering shared by the Home card and the history page: title, a
 * "Premium" label when the feature is premium, the body, and a button only when
 * this app has a screen for the entry's target (never a dead link).
 */
export default function WhatsNewList({ entries, onAction }: WhatsNewListProps) {
  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
      {entries.map((entry) => {
        const route = entry.action ? routeForTarget(entry.action.target) : null
        return (
          <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-theme-primary">{entry.title}</h3>
              {entry.premium && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  Premium
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-theme-secondary">{entry.body}</p>
            {entry.action && route !== null && (
              <button
                type="button"
                onClick={() => onAction(route)}
                className="mt-2 px-3 py-1.5 bg-gradient-brand text-white rounded-lg text-xs font-semibold hover:brightness-90 transition"
              >
                {entry.action.label}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
