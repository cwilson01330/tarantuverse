/**
 * Small presentational components for reptile species badges + chips.
 *
 * Kept server-safe (no hooks, no "use client") so they can be composed into
 * server-rendered pages.
 */

import {
  CareLevel,
  CARE_LEVEL_LABELS,
  CitesAppendix,
  IucnStatus,
  IUCN_LABELS,
} from '@/lib/reptileSpecies'

interface CareLevelBadgeProps {
  level: CareLevel | null
}

const CARE_LEVEL_STYLES: Record<CareLevel, string> = {
  beginner: 'bg-herp-green/15 text-herp-lime border-herp-green/30',
  intermediate: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  advanced: 'bg-red-500/15 text-red-300 border-red-500/30',
}

export function CareLevelBadge({ level }: CareLevelBadgeProps) {
  if (!level) return null
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wider border ${CARE_LEVEL_STYLES[level]}`}
    >
      {CARE_LEVEL_LABELS[level]}
    </span>
  )
}

interface CitesBadgeProps {
  appendix: CitesAppendix | null
}

/** CITES (international trade) appendix — only render if present. */
export function CitesBadge({ appendix }: CitesBadgeProps) {
  if (!appendix) return null
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wider border bg-neutral-800 text-neutral-300 border-neutral-700"
      title="CITES appendix — international trade status"
    >
      CITES {appendix}
    </span>
  )
}

interface IucnBadgeProps {
  status: IucnStatus | null
}

// IUCN Red List color convention (approximately). "DD" / "NE" use neutral.
const IUCN_STYLES: Record<IucnStatus, string> = {
  LC: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  NT: 'bg-lime-500/15 text-lime-300 border-lime-500/30',
  VU: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  EN: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  CR: 'bg-red-500/15 text-red-300 border-red-500/30',
  EW: 'bg-red-700/20 text-red-200 border-red-700/40',
  EX: 'bg-neutral-700/40 text-neutral-200 border-neutral-600',
  DD: 'bg-neutral-800 text-neutral-400 border-neutral-700',
}

export function IucnBadge({ status }: IucnBadgeProps) {
  if (!status) return null
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wider border ${IUCN_STYLES[status]}`}
      title={`IUCN Red List: ${IUCN_LABELS[status]}`}
    >
      IUCN {status}
    </span>
  )
}

interface ChipListProps {
  items: string[]
  tone?: 'neutral' | 'danger' | 'accent'
}

/** Comma-separated list of short labels styled as chips. */
export function ChipList({ items, tone = 'neutral' }: ChipListProps) {
  if (items.length === 0) return null

  const styles = {
    neutral: 'bg-neutral-800/60 text-neutral-300 border-neutral-700',
    danger: 'bg-red-500/10 text-red-300 border-red-500/30',
    accent: 'bg-herp-teal/10 text-herp-teal border-herp-teal/30',
  }[tone]

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${styles}`}
        >
          {item}
        </span>
      ))}
    </div>
  )
}
