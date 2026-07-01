"use client"

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'

const API_URL = process.env.NEXT_PUBLIC_API_URL

type FeederCategory = 'cricket' | 'roach' | 'larvae' | 'other'
type CareLevel = 'easy' | 'moderate' | 'hard'

interface FeederSpeciesListItem {
  id: string
  scientific_name: string
  common_names: string[] | null
  category: FeederCategory | string
  care_level: CareLevel | string | null
  image_url: string | null
  supports_life_stages: boolean
  default_life_stages: string[] | null
}

interface CategoryFilter {
  label: string
  value: FeederCategory | null
}

const CATEGORY_FILTERS: CategoryFilter[] = [
  { label: 'All', value: null },
  { label: 'Crickets', value: 'cricket' },
  { label: 'Roaches', value: 'roach' },
  { label: 'Larvae', value: 'larvae' },
  { label: 'Other', value: 'other' },
]

function categoryEmoji(category: string): string {
  switch (category) {
    case 'cricket':
      return '🦗'
    case 'roach':
      return '🪳'
    case 'larvae':
      return '🐛'
    case 'other':
      return '🪱'
    default:
      return '🦗'
  }
}

function careLevelClasses(level: string | null): string {
  switch (level) {
    case 'easy':
      return 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200'
    case 'moderate':
      return 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
    case 'hard':
      return 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200'
    default:
      return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
  }
}

export default function FeederSpeciesBrowsePage() {
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuth()

  const [species, setSpecies] = useState<FeederSpeciesListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [category, setCategory] = useState<FeederCategory | null>(null)

  // Debounce the search input (~300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const fetchSpecies = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('q', debouncedSearch)
      if (category) params.set('category', category)
      params.set('limit', '200')
      const res = await fetch(
        `${API_URL}/api/v1/feeder-species/?${params.toString()}`,
      )
      if (!res.ok) {
        throw new Error('Failed to load feeder species')
      }
      const data = (await res.json()) as FeederSpeciesListItem[]
      setSpecies(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, category])

  // Auth guard + fetch on filter changes.
  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    fetchSpecies()
  }, [isLoading, isAuthenticated, router, fetchSpecies])

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Back link */}
        <Link
          href="/dashboard/feeders"
          className="text-sm text-theme-secondary hover:text-theme-primary transition"
        >
          ← Back to Feeders
        </Link>

        {/* Header */}
        <div className="mt-2 mb-6">
          <h1 className="text-3xl font-bold text-theme-primary flex items-center gap-3">
            <span aria-hidden="true">📖</span>
            Feeder Care Sheets
          </h1>
          <p className="text-theme-secondary mt-1">
            Reference husbandry for common feeder insects — crickets, roaches, larvae, and more.
          </p>
        </div>

        {/* Search */}
        <div className="mb-4">
          <label htmlFor="feeder-species-search" className="sr-only">
            Search feeder species
          </label>
          <input
            id="feeder-species-search"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name…"
            className="w-full sm:max-w-md px-4 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary placeholder:text-theme-tertiary"
          />
        </div>

        {/* Category chips */}
        <div
          role="group"
          aria-label="Filter by category"
          className="flex flex-wrap gap-2 mb-6"
        >
          {CATEGORY_FILTERS.map((chip) => {
            const isActive = category === chip.value
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => setCategory(chip.value)}
                aria-pressed={isActive}
                className={`
                  px-4 py-1.5 rounded-full text-sm font-medium border transition
                  ${isActive
                    ? 'bg-gradient-brand text-white border-transparent shadow-gradient-brand'
                    : 'border-theme bg-surface text-theme-secondary hover:bg-surface-elevated hover:text-theme-primary'
                  }
                `}
              >
                {chip.value ? `${categoryEmoji(chip.value)} ` : ''}
                {chip.label}
              </button>
            )
          })}
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
          >
            {error}
            <button
              onClick={fetchSpecies}
              className="ml-3 underline font-medium hover:text-red-900 dark:hover:text-red-100"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-32 rounded-xl bg-surface-elevated animate-pulse border border-theme"
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && species.length === 0 && (
          <div className="text-center py-16 px-6 rounded-2xl border border-theme bg-surface">
            <div className="text-6xl mb-4" aria-hidden="true">🔍</div>
            <h2 className="text-2xl font-bold text-theme-primary mb-2">
              No feeder species found
            </h2>
            <p className="text-theme-secondary max-w-md mx-auto">
              Try a different search term or category filter.
            </p>
          </div>
        )}

        {/* Grid */}
        {!loading && !error && species.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {species.map((s) => {
              const commonNames =
                s.common_names && s.common_names.length > 0
                  ? s.common_names.join(', ')
                  : ''
              return (
                <Link
                  key={s.id}
                  href={`/dashboard/feeders/species/${s.id}`}
                  className="group block p-5 rounded-xl border border-theme bg-surface transition hover:shadow-lg hover:-translate-y-0.5 hover:border-primary-400 dark:hover:border-primary-500"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="text-3xl flex-shrink-0" aria-hidden="true">
                        {categoryEmoji(s.category)}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-semibold italic text-theme-primary truncate">
                          {s.scientific_name}
                        </h3>
                        {commonNames && (
                          <p className="text-xs text-theme-secondary truncate">
                            {commonNames}
                          </p>
                        )}
                      </div>
                    </div>
                    {s.care_level && (
                      <span
                        className={`flex-shrink-0 text-xs font-semibold px-2 py-1 rounded-full capitalize ${careLevelClasses(
                          s.care_level,
                        )}`}
                      >
                        {s.care_level}
                      </span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
