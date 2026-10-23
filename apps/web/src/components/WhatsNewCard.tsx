'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useWhatsNew } from '@/lib/whatsNew'
import WhatsNewList from './WhatsNewList'

const MAX_ENTRIES = 3

/**
 * Home card for entries the keeper hasn't seen. Renders nothing when there are
 * none. The X and any action button mark the feed seen (fire and forget; the
 * card hides at once), actions then navigate. "See all" only navigates.
 */
export default function WhatsNewCard() {
  const router = useRouter()
  const { feed, markSeen } = useWhatsNew()
  const [hidden, setHidden] = useState(false)

  const unseen = feed?.unseen ?? []
  if (hidden || unseen.length === 0) return null

  const dismiss = () => {
    setHidden(true)
    void markSeen()
  }

  const open = (route: string) => {
    setHidden(true)
    void markSeen()
    router.push(route)
  }

  return (
    <section
      aria-label="What's new"
      className="bg-surface rounded-2xl shadow-lg border border-theme p-5 mb-6"
    >
      <div className="flex items-center gap-3 mb-3">
        <span aria-hidden="true" className="text-lg flex-shrink-0">✨</span>
        <h2 className="flex-1 text-base font-bold text-theme-primary">What&apos;s new</h2>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss what's new"
          title="Dismiss"
          className="p-1 text-theme-tertiary hover:text-theme-primary transition-colors"
        >
          <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <WhatsNewList entries={unseen.slice(0, MAX_ENTRIES)} onAction={open} />
      {/* Its own row at the bottom, like Herpetoverse's card, so it can't get
          lost next to the close button. */}
      <Link
        href="/dashboard/whats-new"
        className="mt-3 -mx-5 -mb-5 flex items-center justify-center gap-1 border-t border-theme py-3 text-sm font-semibold text-primary hover:bg-black/5 dark:hover:bg-white/5 rounded-b-2xl transition-colors"
      >
        See all
        <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </section>
  )
}
