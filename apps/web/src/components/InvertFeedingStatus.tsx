'use client'

/**
 * Feeding status for any invert.
 *
 * WHY NOT REUSE FeedingStatsCard
 * ------------------------------
 * That card is built for the tarantula endpoint, which returns refusal
 * counts, a prey-type distribution, an acceptance streak and a longest gap.
 * `/inverts/{id}/feeding-stats` returns a deliberately leaner shape and none
 * of those. Feeding it into that card would render a 0-day streak and an
 * empty prey chart — numbers presented as measurements of an animal nobody
 * measured. ADR-014's rule is to refuse to show a number when the evidence
 * isn't there, so this renders only what the endpoint actually returns.
 *
 * WHY THE CADENCE SOURCE MATTERS
 * ------------------------------
 * The backend supplies a fallback interval for animals with no linked
 * species, so `interval_days` is almost never null. Treating it as a cadence
 * would give every animal a confident "Feed in 4 days" built on a default.
 * `interval_source` is what distinguishes a care-sheet cadence from a guess,
 * and ADR-017 adds a third: one the KEEPER set, which is neither a default
 * nor a claim of ours. A countdown only appears when someone actually stated
 * the cadence; on a default we still flag overdue as a safety net but don't
 * pretend to know when the next meal is due.
 *
 * This mirrors apps/mobile/app/invert/[id].tsx — keep the two in lockstep.
 */

export interface InvertFeedingStats {
  invert_id: string
  total_feedings: number
  total_accepted: number
  acceptance_rate: number
  last_feeding_date?: string | null
  days_since_last_feeding?: number | null
  is_feeding_paused?: boolean
  feeding_paused_reason?: string | null
  feeding_paused_until?: string | null
  interval_days?: number | null
  interval_source?: string | null
  is_overdue?: boolean
}

export interface FeedingVerdict {
  tone: 'good' | 'bad' | 'muted'
  headline: string
  detail: string
}

function fmtDate(v: string): string {
  // Date-only strings are parsed as UTC midnight by `new Date`, which rewinds
  // a day in western timezones. Split rather than parse.
  const [y, m, d] = v.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return v
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Pure: the same inputs always give the same verdict, so it can be tested
 * without rendering anything.
 */
export function feedingVerdict(s: InvertFeedingStats | null): FeedingVerdict | null {
  if (!s) return null
  const d = s.days_since_last_feeding
  const iv = s.interval_days

  if (s.is_feeding_paused) {
    return {
      tone: 'muted',
      headline: 'Feeding paused',
      detail: s.feeding_paused_reason
        ? s.feeding_paused_until
          ? `${s.feeding_paused_reason} · until ${fmtDate(s.feeding_paused_until)}`
          : s.feeding_paused_reason
        : 'Resume from the actions above when she starts taking food again.',
    }
  }

  if (d === null || d === undefined) {
    return {
      tone: 'muted',
      headline: 'Not yet fed',
      detail: 'Log the first feeding to start tracking a cadence.',
    }
  }

  const fromKeeper = s.interval_source === 'keeper'
  const fromSpecies = s.interval_source === 'species'
  const stated = fromKeeper || fromSpecies

  const detail = [
    iv
      ? fromKeeper
        ? `Every ${iv}d (your schedule)`
        : fromSpecies
          ? `Every ${iv}d`
          : `Every ${iv}d (default — no species cadence on file)`
      : 'No species cadence on file',
    s.total_feedings > 0
      ? `${Math.round(s.acceptance_rate)}% accepted (${s.total_feedings})`
      : null,
    s.last_feeding_date
      ? `fed ${d === 0 ? 'today' : `${d}d ago`} (${fmtDate(s.last_feeding_date)})`
      : `fed ${d === 0 ? 'today' : `${d}d ago`}`,
  ]
    .filter(Boolean)
    .join(' · ')

  if (s.is_overdue) {
    // `is_overdue` fires at days >= interval, so on the due date d - iv === 0
    // and this read "Feed now — 0d overdue", which contradicts itself.
    const daysPast = iv != null ? d - iv : 0
    return {
      tone: 'bad',
      headline: daysPast > 0 ? `Feed now — ${daysPast}d overdue` : 'Feed today',
      detail,
    }
  }

  if (iv && stated) {
    const due = iv - d
    return {
      tone: 'good',
      headline: due <= 0 ? 'Feed today' : `Feed in ${due} ${due === 1 ? 'day' : 'days'}`,
      detail,
    }
  }

  return {
    tone: 'muted',
    headline: d === 0 ? 'Fed today' : `Fed ${d}d ago`,
    detail,
  }
}

const TONE_CLS: Record<FeedingVerdict['tone'], string> = {
  good: 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300',
  bad: 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300',
  muted: 'border-theme bg-surface text-theme-secondary',
}

export default function InvertFeedingStatus({
  stats,
  onSetCadence,
}: {
  stats: InvertFeedingStats | null
  /** ADR-017 — an offer, not a setting. Omit it and the prompt never renders. */
  onSetCadence?: () => void
}) {
  const v = feedingVerdict(stats)
  if (!v) return null

  // Only offer to set a cadence when nobody has stated one. If the keeper
  // already answered, repeating the question reads as not having listened.
  const offerCadence =
    onSetCadence && stats && stats.interval_source !== 'keeper'

  return (
    <div className={`rounded-xl border p-4 mb-6 ${TONE_CLS[v.tone]}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-bold">{v.headline}</p>
          <p className="text-xs mt-0.5 opacity-90">{v.detail}</p>
        </div>
        {offerCadence && (
          <button
            type="button"
            onClick={onSetCadence}
            className="shrink-0 px-3 py-1.5 rounded-full border border-current text-xs font-bold hover:opacity-80 transition"
          >
            Set a schedule
          </button>
        )}
      </div>
    </div>
  )
}
