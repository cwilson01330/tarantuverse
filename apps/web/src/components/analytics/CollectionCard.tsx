'use client'

import Link from 'next/link'
import { Bug, CircleHelp, Mars, Venus } from 'lucide-react'
import {
  SEMANTIC_COLORS,
  collectionFigures,
  paidFooter,
  speciesRows,
  type CollectionAnalytics,
  type SplitPart,
} from '@/lib/analyticsView'
import { CARD, CardHeading, Figure, TERTIARY } from './AnalyticsParts'
import { RankedRows, SplitBar } from './Charts'

const UNSEXED = '#9ca3af'

function sexParts(c: CollectionAnalytics): SplitPart[] {
  const d = c.sex_distribution ?? {}
  return [
    { key: 'male', count: d.male ?? 0, color: SEMANTIC_COLORS.male, label: 'male' },
    { key: 'female', count: d.female ?? 0, color: SEMANTIC_COLORS.female, label: 'female' },
    { key: 'unknown', count: d.unknown ?? 0, color: UNSEXED, label: 'unsexed' },
  ]
}

function sexMark(key: string, color: string) {
  const common = { size: 14, style: { color }, 'aria-hidden': true } as const
  if (key === 'male') return <Mars {...common} />
  if (key === 'female') return <Venus {...common} />
  return <CircleHelp {...common} />
}

/** Counts, time with you, sex split, species list and what was paid in total. */
export default function CollectionCard({ data }: { data: CollectionAnalytics }) {
  const figs = collectionFigures(data, true)
  const species = speciesRows(data)
  const paid = paidFooter(data)

  return (
    <section aria-label="Collection" className={`${CARD} flex flex-col gap-3.5 px-5 py-[18px]`}>
      <CardHeading icon={Bug} title="Collection" />

      <div className="flex flex-wrap gap-x-7 gap-y-3">
        <Figure value={figs.animals} caption="animals" />
        <Figure value={figs.species} caption="species" />
        <Figure value={figs.withYou} caption={figs.withYouCaption} />
      </div>

      <SplitBar parts={sexParts(data)} mark={sexMark} />

      {species.rows.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-solid border-theme pt-3">
          {species.moreCount === 0 ? (
            <ul className="flex flex-col gap-1.5 text-[13px]">
              {species.rows.map((r) => (
                <li key={r.key} aria-label={r.a11y} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate italic text-theme-secondary" title={r.label}>
                    {r.label}
                  </span>
                  <span className="shrink-0 font-semibold text-theme-primary">{r.value}</span>
                </li>
              ))}
            </ul>
          ) : (
            <RankedRows rows={species.rows} labelWidth={150} italic />
          )}
          {species.moreLabel && (
            <Link
              href="/dashboard/analytics/species"
              className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))]"
            >
              {species.moreLabel}
            </Link>
          )}
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3 border-t border-solid border-theme pt-3 text-[13px]">
        <span className="text-theme-secondary">Paid in total</span>
        <span className="text-right">
          <span className="font-bold text-theme-primary">{paid.value}</span>
          {paid.caption && <span className={`ml-1.5 text-[11px] ${TERTIARY}`}>{paid.caption}</span>}
        </span>
      </div>
    </section>
  )
}
