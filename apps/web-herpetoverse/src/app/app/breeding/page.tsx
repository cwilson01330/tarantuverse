'use client'

/**
 * Breeding hub — tabbed page combining the morph calculator with
 * actual breeding records (pairings + clutches + offspring).
 *
 * Two tabs:
 *   • My pairings (default) — list of the keeper's recorded pairings
 *   • Calculator             — the existing Punnett-style morph predictor
 *
 * Tab state lives in `?tab=` so deep links work and a refresh
 * doesn't yank a keeper back to the default tab. The calculator was
 * the previous content of this route; it's now imported from the
 * shared component so both tabs render under one URL.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import MorphCalculator from '@/components/MorphCalculator'
import { ApiError } from '@/lib/apiClient'
import {
  PAIRING_OUTCOME_LABEL,
  type ReptilePairing,
  listPairings,
} from '@/lib/breeding'

type Tab = 'pairings' | 'calculator'

export default function BreedingHubPage() {
  const router = useRouter()
  const params = useSearchParams()
  const tabParam = params.get('tab')
  const tab: Tab = tabParam === 'calculator' ? 'calculator' : 'pairings'

  function setTab(next: Tab) {
    const sp = new URLSearchParams(params.toString())
    if (next === 'pairings') {
      sp.delete('tab') // default — keep URL clean
    } else {
      sp.set('tab', next)
    }
    const qs = sp.toString()
    router.replace(qs ? `/app/breeding?${qs}` : '/app/breeding')
  }

  return (
    <article className="max-w-5xl mx-auto">
      <div
        role="tablist"
        aria-label="Breeding hub"
        className="flex border-b border-neutral-800 mb-6"
      >
        {(['pairings', 'calculator'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors -mb-px ${
              tab === t
                ? 'text-herp-lime border-b-2 border-herp-teal'
                : 'text-neutral-500 hover:text-neutral-300 border-b-2 border-transparent'
            }`}
          >
            {t === 'pairings' ? 'My pairings' : 'Calculator'}
          </button>
        ))}
      </div>

      {tab === 'pairings' ? <PairingsTab /> : <MorphCalculator />}
    </article>
  )
}

// ---------------------------------------------------------------------------
// Pairings tab
// ---------------------------------------------------------------------------

function PairingsTab() {
  const [pairings, setPairings] = useState<ReptilePairing[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listPairings()
      .then((rows) => {
        if (!cancelled) {
          setPairings(rows)
          setError(null)
        }
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't load your pairings.",
        )
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-2 font-medium">
            Pairings
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-wide text-white mb-1">
            Breeding records
          </h1>
          <p className="text-sm text-neutral-400 max-w-2xl">
            Track pairings, clutches, and offspring across the season.
            Pairings default to private — flip the switch when you&rsquo;re
            ready to share progress publicly.
          </p>
        </div>
        <Link
          href="/app/breeding/pairings/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md herp-gradient-bg text-herp-dark text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity"
        >
          <span aria-hidden="true">＋</span> New pairing
        </Link>
      </header>

      {error && (
        <div
          role="alert"
          className="p-3 rounded-md border border-red-500/40 bg-red-500/10 text-xs text-red-300"
        >
          {error}
        </div>
      )}

      {pairings === null && !error && <PairingsListSkeleton />}

      {pairings !== null && pairings.length === 0 && !error && (
        <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 p-8 text-center">
          <p className="text-3xl mb-3" aria-hidden="true">
            🥚
          </p>
          <h2 className="text-base font-semibold text-white mb-1">
            No pairings yet
          </h2>
          <p className="text-sm text-neutral-400 max-w-md mx-auto leading-relaxed">
            Record your first pairing to start tracking clutches, hatch
            dates, and morph projections.
          </p>
          <Link
            href="/app/breeding/pairings/new"
            className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 rounded-md herp-gradient-bg text-herp-dark text-sm font-semibold"
          >
            Record a pairing
          </Link>
        </div>
      )}

      {pairings && pairings.length > 0 && (
        <ul className="space-y-2">
          {pairings.map((p) => (
            <li key={p.id}>
              <PairingRow pairing={p} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PairingRow({ pairing: p }: { pairing: ReptilePairing }) {
  return (
    <Link
      href={`/app/breeding/pairings/${p.id}`}
      className="block rounded-md border border-neutral-800 bg-neutral-900/40 hover:border-herp-teal/40 hover:bg-neutral-900/60 transition-colors p-4"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate">
            <span className="text-sky-400">♂</span>{' '}
            {p.male_display_name ?? 'Male'}
            <span className="text-neutral-600 mx-2">×</span>
            <span className="text-pink-400">♀</span>{' '}
            {p.female_display_name ?? 'Female'}
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            Paired {formatDate(p.paired_date)}
            {p.separated_date
              ? ` · separated ${formatDate(p.separated_date)}`
              : ''}
            {' · '}
            {p.taxon === 'snake' ? '🐍 Snake' : '🦎 Lizard'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <OutcomeChip outcome={p.outcome} />
          {p.is_private && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-800 text-[10px] uppercase tracking-wider text-neutral-400">
              🔒 Private
            </span>
          )}
          {p.clutch_count > 0 && (
            <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-medium">
              {p.clutch_count} clutch{p.clutch_count === 1 ? '' : 'es'}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

function OutcomeChip({
  outcome,
}: {
  outcome: ReptilePairing['outcome']
}) {
  const tone: Record<typeof outcome, string> = {
    in_progress: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    successful: 'bg-herp-teal/15 text-herp-lime border-herp-teal/30',
    unsuccessful:
      'bg-amber-500/15 text-amber-300 border-amber-500/30',
    abandoned: 'bg-neutral-800 text-neutral-400 border-neutral-700',
    unknown: 'bg-neutral-800 text-neutral-400 border-neutral-700',
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${tone[outcome]}`}
    >
      {PAIRING_OUTCOME_LABEL[outcome]}
    </span>
  )
}

function PairingsListSkeleton() {
  return (
    <ul className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: 3 }).map((_, i) => (
        <li
          key={i}
          className="h-20 rounded-md border border-neutral-800 bg-neutral-900/30 animate-pulse"
        />
      ))}
    </ul>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
