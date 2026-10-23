'use client'

/**
 * Home "What's new" card (spec 2026-10-23 §2). Renders nothing unless the
 * feed has unseen entries (so a loading, failed or empty feed never shows
 * anything). Up to 3 entries; "See all" opens the history page without marking
 * anything seen; the ✕ and any entry button call `markSeen()` (which
 * empties the shared feed, so the card and the sidebar dot clear together) and
 * then, for buttons, navigate. The card hides locally at once; markSeen is not awaited.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useWhatsNew } from '@/lib/whatsNew'
import { WhatsNewEntryRow } from './WhatsNewList'

const MAX_ENTRIES = 3

export default function WhatsNewCard() {
  const router = useRouter()
  const { feed, markSeen } = useWhatsNew()
  const [hidden, setHidden] = useState(false)

  const entries = (feed?.unseen ?? []).slice(0, MAX_ENTRIES)
  if (hidden || entries.length === 0) return null

  // Hide at once and let the POST finish in the background: a slow or hung API must never delay
  // the dismissal or the navigation. markSeen never throws; on failure the card returns next visit.
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
      className="relative mb-8 rounded-lg border border-herp-teal/30 bg-neutral-900/50 p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3 pr-8">
        <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-herp-lime">
          <span aria-hidden="true">✨ </span>What&apos;s new
        </h2>
        <Link href="/app/whats-new" className="text-xs text-herp-teal transition-colors hover:text-herp-lime">
          See all
        </Link>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss what's new"
        className="absolute right-3 top-3 rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-white"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="space-y-5">
        {entries.map((entry) => (
          <WhatsNewEntryRow key={entry.id} entry={entry} onAction={open} />
        ))}
      </div>
    </section>
  )
}
