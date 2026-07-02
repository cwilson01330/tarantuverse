'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Mirrors the /inverts/feeding-status response shape (backend contract).
interface FeedingStatus {
  id: string
  name: string | null
  common_name: string | null
  scientific_name: string | null
  taxon: string
  photo_url: string | null
  last_feeding_date: string | null
  days_since_last_feeding: number | null
  is_feeding_paused: boolean
  is_overdue: boolean
}

// Mirrors the /inverts/bulk-feedings response shape.
interface BulkFeedingSkip {
  invert_id: string
  reason: string
}
interface BulkFeedingResult {
  created_count: number
  created_ids: string[]
  skipped: BulkFeedingSkip[]
}

type FilterKey = 'all' | 'overdue' | 'never_fed'
type Outcome = 'fed' | 'refused'

const FOOD_QUICK_FILLS = ['Crickets', 'Dubia', 'Roaches', 'Mealworms'] as const

/** Taxon → emoji glyph. Falls back to 🐛 for unknown taxa. */
function taxonEmoji(taxon: string): string {
  switch (taxon) {
    case 'tarantula':
    case 'whip_spider':
    case 'vinegaroon':
    case 'true_spider':
      return '🕷️'
    case 'scorpion':
      return '🦂'
    case 'centipede':
    case 'millipede':
    case 'other':
      return '🐛'
    case 'mantis':
      return '🦗'
    case 'roach':
      return '🪳'
    default:
      return '🐛'
  }
}

/** Display name resolution: name → common_name → scientific_name → fallback. */
function displayName(a: FeedingStatus): string {
  return a.name || a.common_name || a.scientific_name || 'Unnamed'
}

function getImageUrl(url: string | null): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${API_URL}${url}`
}

export default function FeedingDayPage() {
  const router = useRouter()
  const { token, isAuthenticated, isLoading } = useAuth()

  const [animals, setAnimals] = useState<FeedingStatus[]>([])
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
    if (!token) return
    setLoadError('')
    try {
      const tzOffset = new Date().getTimezoneOffset()
      const res = await fetch(
        `${API_URL}/api/v1/inverts/feeding-status?tz_offset_minutes=${tzOffset}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) {
        throw new Error('Failed to load your collection')
      }
      const data = (await res.json()) as FeedingStatus[]
      setAnimals(Array.isArray(data) ? data : [])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || !token) {
      router.push('/login')
      return
    }
    fetchStatus()
  }, [isLoading, isAuthenticated, token, router, fetchStatus])

  // Filtered list for the current chip.
  const shownAnimals = useMemo(() => {
    switch (filter) {
      case 'overdue':
        return animals.filter((a) => a.is_overdue)
      case 'never_fed':
        return animals.filter((a) => a.days_since_last_feeding === null)
      default:
        return animals
    }
  }, [animals, filter])

  const counts = useMemo(
    () => ({
      all: animals.length,
      overdue: animals.filter((a) => a.is_overdue).length,
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
    if (!token || selectedCount === 0) return
    setSubmitting(true)
    setActionError('')
    setResultMessage('')
    try {
      const body: {
        invert_ids: string[]
        accepted: boolean
        food_type?: string
        notes?: string
      } = {
        invert_ids: Array.from(selectedIds),
        accepted: outcome === 'fed',
      }
      if (foodType.trim()) body.food_type = foodType.trim()
      if (notes.trim()) body.notes = notes.trim()

      const res = await fetch(`${API_URL}/api/v1/inverts/bulk-feedings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to log feedings')
      }
      const result = (await res.json()) as BulkFeedingResult
      const verb = outcome === 'fed' ? 'Logged feeding' : 'Logged refusal'
      const skippedNote =
        result.skipped.length > 0
          ? ` · ${result.skipped.length} skipped`
          : ''
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
      setActionError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading || loading) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="h-8 w-48 rounded bg-surface-elevated animate-pulse" />
          <div className="h-10 w-full rounded-xl bg-surface-elevated animate-pulse" />
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-surface-elevated animate-pulse"
            />
          ))}
        </div>
      </DashboardLayout>
    )
  }

  if (loadError) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="text-5xl mb-4" aria-hidden="true">
            🍽️
          </div>
          <h1 className="text-2xl font-bold text-theme-primary mb-2">
            {loadError}
          </h1>
          <p className="text-theme-secondary mb-6">
            Check your connection and try again.
          </p>
          <button
            onClick={() => {
              setLoading(true)
              fetchStatus()
            }}
            className="px-5 py-2 rounded-xl bg-gradient-brand text-white font-medium shadow-gradient-brand hover:opacity-90 transition"
          >
            Retry
          </button>
        </div>
      </DashboardLayout>
    )
  }

  if (animals.length === 0) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="text-6xl mb-4" aria-hidden="true">
            🕷️
          </div>
          <h1 className="text-2xl font-bold text-theme-primary mb-2">
            No animals yet
          </h1>
          <p className="text-theme-secondary mb-6">
            Add animals to your collection to run a Feeding Day.
          </p>
          <Link
            href="/dashboard/tarantulas/add"
            className="px-5 py-2 rounded-xl bg-gradient-brand text-white font-medium shadow-gradient-brand hover:opacity-90 transition"
          >
            Add your first animal
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  const filterChips: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'overdue', label: 'Overdue', count: counts.overdue },
    { key: 'never_fed', label: 'Never fed', count: counts.never_fed },
  ]

  return (
    <DashboardLayout>
      {/* pb leaves room for the sticky action bar so it never covers the last row */}
      <div className="max-w-4xl mx-auto pb-40">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-4xl flex-shrink-0" aria-hidden="true">
              🍽️
            </span>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold text-theme-primary">
                Feeding Day
              </h1>
              <p className="text-theme-secondary text-sm">
                Select animals and log a feeding for all of them at once.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-theme-secondary hover:text-theme-primary transition flex-shrink-0"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {/* Honesty note about the overdue heuristic */}
        <p className="text-xs text-theme-tertiary mb-5">
          &ldquo;Overdue&rdquo; is a soft 14-day heuristic, not a per-species
          schedule — use your own judgement.
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
                className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                  active
                    ? 'bg-gradient-brand text-white border-transparent shadow-gradient-brand'
                    : 'bg-surface text-theme-primary border-theme hover:bg-surface-elevated'
                }`}
              >
                {chip.label}
                <span
                  className={`ml-2 text-xs font-semibold ${
                    active ? 'text-white/90' : 'text-theme-tertiary'
                  }`}
                >
                  {chip.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Select-all + selected count */}
        <div className="flex items-center justify-between mb-3">
          <label className="flex items-center gap-2 text-sm text-theme-primary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allShownSelected}
              onChange={toggleSelectAllShown}
              disabled={shownIds.length === 0}
              className="w-4 h-4 rounded border-theme accent-purple-600"
              aria-label="Select all shown animals"
            />
            Select all (shown)
          </label>
          <span className="text-sm text-theme-tertiary">
            {selectedCount} selected
          </span>
        </div>

        {/* Result message (persists until next action) */}
        {resultMessage && (
          <div
            role="status"
            className="mb-4 p-3 rounded-xl border border-green-300 dark:border-green-600/60 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 text-sm"
          >
            {resultMessage}
          </div>
        )}

        {/* Animal list */}
        {shownAnimals.length === 0 ? (
          <div className="p-8 rounded-2xl border border-theme bg-surface text-center text-theme-secondary">
            No animals match this filter.
          </div>
        ) : (
          <ul className="space-y-2">
            {shownAnimals.map((a) => {
              const selected = selectedIds.has(a.id)
              return (
                <li key={a.id}>
                  <label
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                      selected
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-theme bg-surface hover:bg-surface-elevated'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleOne(a.id)}
                      className="w-4 h-4 rounded border-theme accent-purple-600 flex-shrink-0"
                      aria-label={`Select ${displayName(a)}`}
                    />
                    {/* Thumbnail or emoji */}
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-elevated flex items-center justify-center flex-shrink-0">
                      {a.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={getImageUrl(a.photo_url)}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-lg" aria-hidden="true">
                          {taxonEmoji(a.taxon)}
                        </span>
                      )}
                    </div>
                    {/* Name + scientific */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-theme-primary truncate">
                        {displayName(a)}
                      </p>
                      {a.scientific_name && (
                        <p className="text-sm text-theme-tertiary italic truncate">
                          {a.scientific_name}
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
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-theme bg-surface/95 backdrop-blur shadow-2xl">
          <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
            {actionError && (
              <div
                role="alert"
                className="p-2 text-sm rounded-lg border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
              >
                {actionError}
              </div>
            )}

            <div className="flex flex-col md:flex-row md:items-end gap-3">
              {/* Outcome toggle */}
              <div>
                <span className="block text-xs font-medium text-theme-tertiary mb-1">
                  Outcome
                </span>
                <div className="inline-flex rounded-xl border border-theme overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOutcome('fed')}
                    aria-pressed={outcome === 'fed'}
                    className={`px-4 py-2 text-sm font-medium transition ${
                      outcome === 'fed'
                        ? 'bg-gradient-brand text-white'
                        : 'bg-surface text-theme-primary hover:bg-surface-elevated'
                    }`}
                  >
                    Fed
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutcome('refused')}
                    aria-pressed={outcome === 'refused'}
                    className={`px-4 py-2 text-sm font-medium transition ${
                      outcome === 'refused'
                        ? 'bg-amber-500 text-white'
                        : 'bg-surface text-theme-primary hover:bg-surface-elevated'
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
                  className="block text-xs font-medium text-theme-tertiary mb-1"
                >
                  Food type (optional)
                </label>
                <input
                  id="feeding-day-food"
                  type="text"
                  value={foodType}
                  onChange={(e) => setFoodType(e.target.value)}
                  placeholder="e.g. Crickets"
                  className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-surface text-theme-primary"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {FOOD_QUICK_FILLS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFoodType(f)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                        foodType === f
                          ? 'bg-purple-600 text-white border-transparent'
                          : 'bg-surface text-theme-secondary border-theme hover:bg-surface-elevated'
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
                className="px-5 py-3 rounded-xl bg-gradient-brand text-white font-semibold shadow-gradient-brand hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              >
                {submitting
                  ? 'Saving…'
                  : `${
                      outcome === 'fed' ? 'Log feeding' : 'Log refusal'
                    } for ${selectedCount} animal${
                      selectedCount === 1 ? '' : 's'
                    }`}
              </button>
            </div>

            {/* Note */}
            <div>
              <label
                htmlFor="feeding-day-notes"
                className="block text-xs font-medium text-theme-tertiary mb-1"
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
                className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-surface text-theme-primary"
              />
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

/** Status pill: Paused (amber) → Overdue (red/orange) → Never fed → Xd ago. */
function StatusPill({ animal }: { animal: FeedingStatus }) {
  if (animal.is_feeding_paused) {
    return (
      <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
        Paused
      </span>
    )
  }
  if (animal.is_overdue) {
    return (
      <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
        Overdue
      </span>
    )
  }
  if (animal.days_since_last_feeding === null) {
    return (
      <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
        Never fed
      </span>
    )
  }
  return (
    <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-elevated text-theme-secondary">
      {animal.days_since_last_feeding}d ago
    </span>
  )
}
