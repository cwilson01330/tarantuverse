'use client'

/**
 * Feeding Day — bulk feeding for the whole collection.
 *
 * Mirrors the proven Tarantuverse screen
 * (apps/web/src/app/dashboard/feeding-day/page.tsx) for structure and UX,
 * restyled into the Herpetoverse dark theme (herp-* + neutral-* tokens).
 *
 * Flow: fetch feeding-status (already neediest-first) → filter chips
 * (All / Overdue / Never fed) → multi-select rows → sticky action bar
 * opens a "Log feeding for N" form (Fed/Refused toggle, optional food
 * type with reptile quick-chips, note) → bulkFeedAnimals → refetch.
 *
 * No useSearchParams here, so no Suspense boundary is required.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, API_URL } from '@/lib/apiClient'
import {
  ANIMAL_TAXA,
  type AnimalFeedingStatus,
  bulkFeedAnimals,
  listAnimalFeedingStatus,
} from '@/lib/animals'

type FilterKey = 'all' | 'overdue' | 'never_fed'
type Outcome = 'fed' | 'refused'

// Reptile-flavored quick fills for the food-type field.
const FOOD_QUICK_FILLS = [
  'F/T mouse',
  'F/T rat',
  'Crickets',
  'Dubia',
  'Superworms',
  'Hornworms',
  'CGD',
  'Greens',
] as const

/** Per-row glyph from the taxon registry, with a lizard fallback. */
function taxonGlyph(taxon: string): string {
  return ANIMAL_TAXA[taxon as keyof typeof ANIMAL_TAXA]?.glyph ?? '🦎'
}

/** name → common_name → scientific_name → fallback. */
function displayName(a: AnimalFeedingStatus): string {
  return a.name || a.common_name || a.scientific_name || 'Unnamed'
}

/** Absolute photo URL — server may hand back a relative /uploads path. */
function getImageUrl(url: string | null): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${API_URL}${url}`
}

export default function FeedingDayPage() {
  const [animals, setAnimals] = useState<AnimalFeedingStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [filter, setFilter] = useState<FilterKey>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Action-bar state
  const [outcome, setOutcome] = useState<Outcome>('fed')
  const [foodType, setFoodType] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState('')
  const [resultMessage, setResultMessage] = useState('')

  const fetchStatus = useCallback(async () => {
    setLoadError('')
    try {
      const tzOffset = new Date().getTimezoneOffset()
      const data = await listAnimalFeedingStatus(tzOffset)
      setAnimals(Array.isArray(data) ? data : [])
    } catch (e) {
      // 401 is handled by apiClient (clears session + redirects); show an
      // empty state rather than a scary banner while that fires.
      if (e instanceof ApiError && e.status === 401) {
        setAnimals([])
      } else {
        setLoadError(
          e instanceof ApiError ? e.message : 'Failed to load your collection',
        )
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Filtered list for the current chip.
  const shownAnimals = useMemo(() => {
    switch (filter) {
      case 'overdue':
        return animals.filter((a) => a.is_overdue && a.status_mode !== 'daily')
      case 'never_fed':
        return animals.filter((a) => a.days_since_last_feeding === null)
      default:
        return animals
    }
  }, [animals, filter])

  const counts = useMemo(
    () => ({
      all: animals.length,
      overdue: animals.filter((a) => a.is_overdue && a.status_mode !== 'daily').length,
      never_fed: animals.filter((a) => a.days_since_last_feeding === null).length,
    }),
    [animals],
  )

  // Selection helpers.
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const shownIds = useMemo(() => shownAnimals.map((a) => a.id), [shownAnimals])
  const allShownSelected =
    shownIds.length > 0 && shownIds.every((id) => selectedIds.has(id))

  const toggleSelectAllShown = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allShownSelected) {
        shownIds.forEach((id) => next.delete(id))
      } else {
        shownIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())
  const selectedCount = selectedIds.size

  const submitFeeding = async () => {
    if (selectedCount === 0) return
    setSubmitting(true)
    setActionError('')
    setResultMessage('')
    try {
      const payload: {
        animal_ids: string[]
        accepted: boolean
        food_type?: string
        notes?: string
      } = {
        animal_ids: Array.from(selectedIds),
        accepted: outcome === 'fed',
      }
      if (foodType.trim()) payload.food_type = foodType.trim()
      if (notes.trim()) payload.notes = notes.trim()

      const result = await bulkFeedAnimals(payload)
      const verb = outcome === 'fed' ? 'Logged feeding' : 'Logged refusal'
      const skippedNote =
        result.skipped.length > 0 ? ` · ${result.skipped.length} skipped` : ''
      setResultMessage(
        `${verb} for ${result.created_count} animal${
          result.created_count === 1 ? '' : 's'
        }${skippedNote}.`,
      )
      // Clear selection + form, then refetch fresh status.
      clearSelection()
      setFoodType('')
      setNotes('')
      await fetchStatus()
    } catch (e) {
      setActionError(
        e instanceof ApiError ? e.message : 'Failed to log feedings',
      )
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="h-8 w-48 rounded bg-neutral-900/60 animate-pulse" />
        <div className="h-10 w-full rounded-md bg-neutral-900/60 animate-pulse" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-16 rounded-md bg-neutral-900/40 animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="text-5xl mb-4" aria-hidden="true">
          🍽️
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">{loadError}</h1>
        <p className="text-neutral-400 mb-6">
          Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true)
            fetchStatus()
          }}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md herp-gradient-bg text-herp-dark font-bold tracking-wide transition-opacity hover:opacity-90"
        >
          Retry
        </button>
      </div>
    )
  }

  if (animals.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="text-6xl mb-4" aria-hidden="true">
          🦎
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">No animals yet</h1>
        <p className="text-neutral-400 mb-6">
          Add animals to your collection to run a Feeding Day.
        </p>
        <Link
          href="/app/reptiles/add"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md herp-gradient-bg text-herp-dark font-bold tracking-wide transition-opacity hover:opacity-90"
        >
          <span aria-hidden="true">＋</span> Add your first reptile
        </Link>
      </div>
    )
  }

  const filterChips: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'overdue', label: 'Overdue', count: counts.overdue },
    { key: 'never_fed', label: 'Never fed', count: counts.never_fed },
  ]

  return (
    <>
      {/* pb leaves room for the sticky action bar so it never covers the last row */}
      <div className="max-w-4xl mx-auto pb-44">
        {/* Header */}
        <header className="mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-4xl flex-shrink-0" aria-hidden="true">
              🍽️
            </span>
            <div className="min-w-0">
              <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-1 font-medium">
                Bulk feeding
              </p>
              <h1 className="text-3xl font-bold tracking-wide text-white">
                Feeding Day
              </h1>
              <p className="text-neutral-400 text-sm">
                Select animals and log a feeding for all of them at once.
              </p>
            </div>
          </div>
          <Link
            href="/app/reptiles"
            className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors flex-shrink-0"
          >
            ← Back to collection
          </Link>
        </header>

        {/* Honesty note about the overdue heuristic */}
        <p className="text-xs text-neutral-500 mb-5">
          &ldquo;Overdue&rdquo; is a soft heuristic, not a per-species schedule
          — use your own judgement.
        </p>

        {/* Filter chips */}
        <div
          role="group"
          aria-label="Filter animals"
          className="flex flex-wrap gap-2 mb-4"
        >
          {filterChips.map((chip) => {
            const active = filter === chip.key
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setFilter(chip.key)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                  active
                    ? 'border-herp-teal/60 bg-herp-teal/10 text-herp-lime'
                    : 'border-neutral-800 bg-neutral-900/40 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
                }`}
              >
                {chip.label}
                <span className="text-neutral-500">{chip.count}</span>
              </button>
            )
          })}
        </div>

        {/* Select-all + selected count */}
        <div className="flex items-center justify-between mb-3">
          <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allShownSelected}
              onChange={toggleSelectAllShown}
              disabled={shownIds.length === 0}
              className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 accent-herp-teal"
              aria-label="Select all shown animals"
            />
            Select all (shown)
          </label>
          <span className="text-sm text-neutral-500">
            {selectedCount} selected
          </span>
        </div>

        {/* Result message (persists until next action) */}
        {resultMessage && (
          <div
            role="status"
            className="mb-4 p-3 rounded-md border border-herp-teal/40 bg-herp-teal/10 text-sm text-herp-lime"
          >
            {resultMessage}
          </div>
        )}

        {/* Animal list */}
        {shownAnimals.length === 0 ? (
          <div className="p-8 rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 text-center text-sm text-neutral-400">
            No animals match this filter.
          </div>
        ) : (
          <ul className="space-y-2">
            {shownAnimals.map((a) => {
              const selected = selectedIds.has(a.id)
              return (
                <li key={a.id}>
                  <label
                    className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                      selected
                        ? 'border-herp-teal/60 bg-herp-teal/10'
                        : a.is_overdue && a.status_mode !== 'daily'
                          ? 'border-orange-500/30 bg-neutral-900/40 hover:bg-neutral-900/60'
                          : 'border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900/60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleOne(a.id)}
                      className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 accent-herp-teal flex-shrink-0"
                      aria-label={`Select ${displayName(a)}`}
                    />
                    {/* Thumbnail or taxon glyph */}
                    <div className="w-10 h-10 rounded-md overflow-hidden bg-neutral-800 flex items-center justify-center flex-shrink-0">
                      {a.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={getImageUrl(a.photo_url)}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-lg" aria-hidden="true">
                          {taxonGlyph(a.taxon)}
                        </span>
                      )}
                    </div>
                    {/* Name + scientific + cadence */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">
                        {displayName(a)}
                      </p>
                      {a.scientific_name && (
                        <p className="text-sm text-neutral-500 italic truncate">
                          {a.scientific_name}
                        </p>
                      )}
                      {a.interval_days != null && (
                        <p className="text-xs text-neutral-500 truncate">
                          every ~{a.interval_days}d
                        </p>
                      )}
                    </div>
                    {/* Status pill */}
                    <StatusPill animal={a} />
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Sticky action bar — appears once at least one animal is selected */}
      {selectedCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur shadow-2xl">
          <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">
                Log feeding for {selectedCount} animal
                {selectedCount === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
              >
                Clear
              </button>
            </div>

            {actionError && (
              <div
                role="alert"
                className="p-2 text-sm rounded-md border border-red-500/40 bg-red-500/10 text-red-300"
              >
                {actionError}
              </div>
            )}

            <div className="flex flex-col md:flex-row md:items-end gap-3">
              {/* Outcome toggle */}
              <div>
                <span className="block text-xs font-medium text-neutral-500 mb-1">
                  Outcome
                </span>
                <div className="inline-flex rounded-md border border-neutral-800 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOutcome('fed')}
                    aria-pressed={outcome === 'fed'}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      outcome === 'fed'
                        ? 'bg-herp-teal/20 text-herp-lime'
                        : 'bg-neutral-900/40 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    Fed
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutcome('refused')}
                    aria-pressed={outcome === 'refused'}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      outcome === 'refused'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-neutral-900/40 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    Refused
                  </button>
                </div>
              </div>

              {/* Food type */}
              <div className="flex-1 min-w-0">
                <label
                  htmlFor="feeding-day-food"
                  className="block text-xs font-medium text-neutral-500 mb-1"
                >
                  Food type (optional)
                </label>
                <input
                  id="feeding-day-food"
                  type="text"
                  value={foodType}
                  onChange={(e) => setFoodType(e.target.value)}
                  placeholder="e.g. F/T mouse"
                  className="w-full px-3 py-2 rounded-md border border-neutral-800 bg-neutral-900/60 text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-herp-teal/50"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {FOOD_QUICK_FILLS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFoodType(f)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        foodType === f
                          ? 'border-herp-teal/60 bg-herp-teal/10 text-herp-lime'
                          : 'border-neutral-800 bg-neutral-900/40 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit */}
              <button
                type="button"
                onClick={submitFeeding}
                disabled={submitting}
                className="px-5 py-3 rounded-md herp-gradient-bg text-herp-dark font-bold tracking-wide transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              >
                {submitting
                  ? 'Saving…'
                  : `${
                      outcome === 'fed' ? 'Log feeding' : 'Log refusal'
                    } for ${selectedCount}`}
              </button>
            </div>

            {/* Note */}
            <div>
              <label
                htmlFor="feeding-day-notes"
                className="block text-xs font-medium text-neutral-500 mb-1"
              >
                Note (optional)
              </label>
              <textarea
                id="feeding-day-notes"
                rows={2}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Applies to all selected animals"
                className="w-full px-3 py-2 rounded-md border border-neutral-800 bg-neutral-900/60 text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-herp-teal/50"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Status pill: Paused (amber) → daily fed-today check → Overdue (orange) →
 * Never fed → Nd ago. Frequent feeders (status_mode 'daily', e.g. insectivorous
 * beardies) get a calm fed-today check instead of a red days-overdue that would
 * nag every morning.
 */
function StatusPill({ animal }: { animal: AnimalFeedingStatus }) {
  if (animal.is_feeding_paused) {
    return (
      <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300">
        Paused
      </span>
    )
  }
  if (animal.status_mode === 'daily') {
    return animal.fed_today ? (
      <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-500/15 text-green-300">
        Fed today
      </span>
    ) : (
      <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-800/60 text-neutral-400">
        Feed today
      </span>
    )
  }
  if (animal.is_overdue) {
    return (
      <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-300">
        Overdue
      </span>
    )
  }
  if (animal.days_since_last_feeding === null) {
    return (
      <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-800 text-neutral-300">
        Never fed
      </span>
    )
  }
  return (
    <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-800/60 text-neutral-400">
      {animal.days_since_last_feeding}d ago
    </span>
  )
}
