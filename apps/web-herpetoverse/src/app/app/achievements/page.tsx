'use client'

/**
 * Achievements — slim Herpetoverse view of the shared badge system.
 *
 * Reads from /api/v1/achievements/ which already runs check-and-award
 * server-side, so opening the page surfaces anything the keeper has
 * earned since last visit — including badges unlocked via Tarantuverse
 * activity (the user account is shared).
 *
 * v1 layout:
 *   - Hero with earned / available + a thin progress bar
 *   - Recently earned strip (last 5) when present
 *   - Grid grouped by category, with earned tiles lit and unearned
 *     tiles muted + showing the requirement threshold
 *
 * Reptile-specific milestones (sheds, weight goals, pairings) are queued
 * for v1.x — until they ship, the backend categories are
 * tarantula-flavored. We still surface every category since
 * cross-brand badges (Community especially) earn for either app.
 */

import { useEffect, useState } from 'react'
import { ApiError } from '@/lib/apiClient'
import {
  type Achievement,
  type AchievementSummary,
  getAchievements,
} from '@/lib/achievements'

const CATEGORY_LABEL: Record<string, string> = {
  collection: 'Collection',
  feeding: 'Feeding',
  molts: 'Growth',
  community: 'Community',
  breeding: 'Breeding',
}

const TIER_STYLE: Record<string, { ring: string; label: string }> = {
  bronze: { ring: 'ring-amber-700/50', label: 'Bronze' },
  silver: { ring: 'ring-slate-400/60', label: 'Silver' },
  gold: { ring: 'ring-yellow-400/70', label: 'Gold' },
  platinum: { ring: 'ring-cyan-300/70', label: 'Platinum' },
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: AchievementSummary }
  | { kind: 'error'; message: string }

export default function AchievementsPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    getAchievements()
      .then((data) => {
        if (cancelled) return
        setState({ kind: 'ready', data })
      })
      .catch((err) => {
        if (cancelled) return
        const message =
          err instanceof ApiError
            ? err.message
            : "Couldn't load your achievements."
        setState({ kind: 'error', message })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state.kind === 'loading') {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="h-7 w-64 rounded bg-neutral-900 animate-pulse mb-3" />
        <div className="h-4 w-96 rounded bg-neutral-900/70 animate-pulse mb-10" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-lg bg-neutral-900/40 border border-neutral-800 animate-pulse"
            />
          ))}
        </div>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold tracking-wide text-white mb-3">
          Achievements
        </h1>
        <div
          role="alert"
          className="p-4 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
        >
          {state.message}
        </div>
      </div>
    )
  }

  const { data } = state
  const pct = data.total_available
    ? Math.round((data.total_earned / data.total_available) * 100)
    : 0

  // Group by category for the gallery. Sort each group by earned-first,
  // then by requirement_count ascending — so the keeper sees what's
  // already locked in, then what's the easiest next step.
  const grouped = groupByCategory(data.achievements)

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
      {/* Hero */}
      <header>
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
          Achievements
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-wide text-white mb-3">
          Trophy case
        </h1>
        <p className="text-neutral-400 max-w-2xl mb-6 leading-relaxed">
          Badges follow your keeper account across Tarantuverse and
          Herpetoverse. Reptile-specific milestones (sheds, weight goals,
          pairings) are queued for a future update — for now you&rsquo;ll
          earn the same Collection / Feeding / Community / Breeding
          badges your tarantula keeper friends do.
        </p>

        <div className="flex items-end gap-6 flex-wrap">
          <div>
            <div className="text-4xl font-bold text-white tabular-nums">
              {data.total_earned}
              <span className="text-neutral-600 text-2xl">
                {' / '}
                {data.total_available}
              </span>
            </div>
            <div className="text-xs uppercase tracking-wider text-neutral-500 mt-1">
              Earned
            </div>
          </div>
          <div className="flex-1 min-w-[200px] mb-1">
            <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className="h-full herp-gradient-bg transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-neutral-500">{pct}% complete</p>
          </div>
        </div>
      </header>

      {/* Recently earned */}
      {data.recently_earned.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">
            Recently earned
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {data.recently_earned.slice(0, 5).map((a) => (
              <BadgeCard key={a.id} achievement={a} />
            ))}
          </div>
        </section>
      )}

      {/* Grouped gallery */}
      {Object.entries(grouped).map(([category, items]) => (
        <section key={category} className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">
              {CATEGORY_LABEL[category] ?? category}
            </h2>
            <span className="text-xs text-neutral-500">
              {items.filter((a) => !!a.earned_at).length} of {items.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {items.map((a) => (
              <BadgeCard key={a.id} achievement={a} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// BadgeCard
// ---------------------------------------------------------------------------

function BadgeCard({ achievement: a }: { achievement: Achievement }) {
  const earned = !!a.earned_at
  const tier = TIER_STYLE[a.tier] ?? TIER_STYLE.bronze
  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        earned
          ? `border-neutral-800 bg-neutral-900/50 hover:border-herp-teal/40`
          : 'border-neutral-800/60 bg-neutral-900/20 opacity-70'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-2xl ring-2 ring-offset-2 ring-offset-neutral-950 ${
            earned ? tier.ring : 'ring-neutral-800'
          } ${earned ? 'bg-neutral-800' : 'bg-neutral-900 grayscale opacity-40'}`}
          aria-hidden="true"
        >
          {a.icon || '🏅'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <h3
              className={`text-sm font-semibold ${
                earned ? 'text-white' : 'text-neutral-400'
              }`}
            >
              {a.name}
            </h3>
            <span
              className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${
                earned
                  ? 'bg-neutral-800 text-neutral-300'
                  : 'bg-neutral-900 text-neutral-600'
              }`}
            >
              {tier.label}
            </span>
          </div>
          <p
            className={`text-xs leading-relaxed ${
              earned ? 'text-neutral-400' : 'text-neutral-500'
            }`}
          >
            {a.description}
          </p>
          {earned && a.earned_at ? (
            <p className="text-[10px] text-herp-teal/80 mt-1.5 uppercase tracking-wider">
              Earned {formatEarnedDate(a.earned_at)}
            </p>
          ) : (
            <p className="text-[10px] text-neutral-600 mt-1.5 uppercase tracking-wider">
              Goal: {a.requirement_count}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByCategory(achievements: Achievement[]): Record<string, Achievement[]> {
  const out: Record<string, Achievement[]> = {}
  for (const a of achievements) {
    if (!out[a.category]) out[a.category] = []
    out[a.category].push(a)
  }
  // Earned-first within each category, then by requirement count ascending.
  for (const key of Object.keys(out)) {
    out[key].sort((a, b) => {
      const ea = a.earned_at ? 0 : 1
      const eb = b.earned_at ? 0 : 1
      if (ea !== eb) return ea - eb
      return a.requirement_count - b.requirement_count
    })
  }
  // Stable display order for categories — collection first since it's
  // usually the first thing a keeper interacts with.
  const order = ['collection', 'feeding', 'molts', 'breeding', 'community']
  return Object.fromEntries(
    Object.entries(out).sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
    ),
  )
}

function formatEarnedDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
