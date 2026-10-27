'use client'

import Link from 'next/link'
import { Shell } from 'lucide-react'
import { moltsCard, type CollectionAnalytics } from '@/lib/analyticsView'
import { CARD, CardHeading, TERTIARY } from './AnalyticsParts'
import { RankedRows } from './Charts'

/** Per-animal ranked molt rows: all up to five animals, else the top three and "All n". */
export default function MoltsCard({ data, now }: { data: CollectionAnalytics; now: Date }) {
  const m = moltsCard(data, now, true)
  return (
    <section aria-label="Molts" className={`${CARD} flex flex-col gap-3 px-5 py-[18px]`}>
      <CardHeading icon={Shell} title="Molts" trailing={m.trailing} />
      {m.emptyLine && <p className={`text-[13px] leading-[18px] ${TERTIARY}`}>{m.emptyLine}</p>}
      {m.rows.length > 0 && (
        <RankedRows rows={m.rows} labelWidth={70} hrefFor={(r) => (r.id ? `/dashboard/inverts/${r.id}` : null)} />
      )}
      {m.allLabel && (
        <Link
          href="/dashboard/analytics/molts"
          className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))]"
        >
          {m.allLabel}
        </Link>
      )}
    </section>
  )
}
