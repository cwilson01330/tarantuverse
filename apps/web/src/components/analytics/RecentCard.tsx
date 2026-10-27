'use client'

import Link from 'next/link'
import { History, Layers, Shell, Utensils } from 'lucide-react'
import { SEMANTIC_COLORS, recentRows, type CollectionAnalytics, type RecentRow } from '@/lib/analyticsView'
import { CARD, CardHeading, TERTIARY } from './AnalyticsParts'

const KIND_LOOK: Record<RecentRow['kind'], { Icon: typeof Shell; color: string | null }> = {
  molt: { Icon: Shell, color: SEMANTIC_COLORS.molt },
  feeding: { Icon: Utensils, color: SEMANTIC_COLORS.success },
  substrate_change: { Icon: Layers, color: null }, // null = the theme's primary
}

/** The three latest things logged. */
export default function RecentCard({ data, now }: { data: CollectionAnalytics; now: Date }) {
  const rows = recentRows(data, now)
  return (
    <section aria-label="Recent" className={`${CARD} flex flex-col gap-2 px-5 py-[18px]`}>
      <CardHeading icon={History} title="Recent" />
      {rows.length === 0 ? (
        <p className={`text-[13px] ${TERTIARY}`}>Nothing logged yet.</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r, i) => {
            const { Icon, color } = KIND_LOOK[r.kind]
            return (
              <li key={`${r.id}-${r.kind}-${i}`}>
                <Link
                  href={`/dashboard/inverts/${r.id}`}
                  aria-label={r.a11y}
                  className="-mx-2 flex min-h-[44px] items-center gap-3 rounded-preset-sm px-2 transition hover:bg-surface-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))]"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${color ? '' : 'bg-primary-soft text-primary'}`}
                    style={color ? { backgroundColor: `${color}29` } : undefined}
                    aria-hidden
                  >
                    <Icon size={15} style={color ? { color } : undefined} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-theme-primary">
                    <span className="font-semibold">{r.name}</span> {r.verb}
                  </span>
                  <span className={`shrink-0 text-xs ${TERTIARY}`}>{r.rel}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
