'use client'

import Link from 'next/link'
import { Clock, Shell, Utensils } from 'lucide-react'
import { SEMANTIC_COLORS, rightNowTiles, type CollectionAnalytics, type RightNowTile } from '@/lib/analyticsView'
import { CARD, TERTIARY } from './AnalyticsParts'

const TILE_LOOK = {
  due: { Icon: Utensils, color: SEMANTIC_COLORS.error },
  molt: { Icon: Shell, color: SEMANTIC_COLORS.molt },
  gap: { Icon: Clock, color: SEMANTIC_COLORS.warning },
} as const

function hrefFor(tile: RightNowTile): string | null {
  const t = tile.target
  if (!t) return null
  return t.kind === 'feeding_day' ? '/dashboard/feeding-day' : `/dashboard/inverts/${t.id}`
}

/** The three "Right now" tiles. Zero animals: nothing is rendered. */
export default function RightNow({ data, now }: { data: CollectionAnalytics; now: Date }) {
  const tiles = rightNowTiles(data, now, true)
  if (tiles.length === 0) return null
  return (
    <section aria-label="Right now" className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
      {tiles.map((tile) => {
        const { Icon, color } = TILE_LOOK[tile.key]
        const href = hrefFor(tile)
        const body = (
          <>
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-preset-sm"
              style={{ backgroundColor: `${color}24` }}
              aria-hidden
            >
              <Icon size={20} style={{ color }} />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold text-theme-secondary">{tile.label}</span>
              <span className="block truncate text-2xl font-bold leading-7 text-theme-primary">{tile.value}</span>
              <span className={`block truncate text-[11px] ${TERTIARY}`}>{tile.caption}</span>
            </span>
          </>
        )
        // README: tiles sit one radius step below cards.
        const cls = `${CARD.replace('rounded-preset-md', 'rounded-preset-sm')} flex min-h-[74px] items-center gap-3.5 px-4 py-3.5`
        return href ? (
          <Link
            key={tile.key}
            href={href}
            aria-label={tile.a11y}
            className={`${cls} transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))] dark:hover:brightness-110`}
          >
            {body}
          </Link>
        ) : (
          <div key={tile.key} role="group" aria-label={tile.a11y} className={cls}>
            {body}
          </div>
        )
      })}
    </section>
  )
}
