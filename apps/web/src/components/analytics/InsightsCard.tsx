'use client'

/**
 * Dashboard "Insights" card (analytics redesign, README §3): one sentence about
 * the collection, the whole card links to /dashboard/analytics.
 *
 * Reads the /analytics/collection response the dashboard already fetched, so it
 * makes no request of its own. No money here, ever. Renders nothing when the
 * response is missing (loading or failed) or the keeper has no animals.
 */
import Link from 'next/link'
import { useMemo } from 'react'
import { LineChart } from 'lucide-react'
import { insight, type CollectionAnalytics } from '@/lib/analyticsView'
import { CARD, TERTIARY } from './AnalyticsParts'

export default function InsightsCard({ collection }: { collection: CollectionAnalytics | null }) {
  const model = useMemo(() => (collection ? insight(collection, new Date()) : null), [collection])
  if (!model) return null

  return (
    <Link
      href="/dashboard/analytics"
      className={`${CARD} mb-8 block px-4 py-3.5 transition hover:bg-surface-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))] sm:px-4`}
    >
      <div className="flex items-center gap-2">
        <LineChart className="text-primary" size={15} aria-hidden />
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${TERTIARY}`}>Insights</span>
      </div>
      <p className="mt-1.5 text-[15px] font-semibold leading-[21px] text-theme-primary">{model.sentence}</p>
      {model.support && <p className={`mt-1 text-[13px] ${TERTIARY}`}>{model.support}</p>}
      <span className="mt-2 inline-block text-[13px] font-semibold text-primary">{model.link}</span>
    </Link>
  )
}
