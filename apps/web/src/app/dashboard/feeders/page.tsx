"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'

const API_URL = process.env.NEXT_PUBLIC_API_URL

interface FeederColonyListItem {
  id: string
  name: string
  inventory_mode: 'count' | 'life_stage'
  total_count: number | null
  is_low_stock: boolean
  is_active: boolean
  species_display_name: string | null
  species_missing: boolean
  last_fed_date: string | null
  last_cleaned: string | null
  last_restocked: string | null
}

function categoryEmoji(name: string | null): string {
  if (!name) return '🦗'
  const n = name.toLowerCase()
  if (n.includes('cricket')) return '🦗'
  if (n.includes('roach') || n.includes('dubia') || n.includes('hisser')) return '🪳'
  if (n.includes('meal') || n.includes('super') || n.includes('worm') || n.includes('larva')) return '🐛'
  return '🦗'
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  const now = new Date()
  const ms = now.getTime() - then.getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

export default function FeedersPage() {
  const router = useRouter()
  const { token, isAuthenticated, isLoading } = useAuth()
  const [colonies, setColonies] = useState<FeederColonyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    fetchColonies()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated, token])

  const fetchColonies = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/api/v1/feeder-colonies/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        throw new Error('Failed to load feeder colonies')
      }
      const data = (await res.json()) as FeederColonyListItem[]
      setColonies(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const lowStockCount = colonies.filter((c) => c.is_low_stock).length

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-theme-primary flex items-center gap-3">
              <span aria-hidden="true">🦗</span>
              Feeders
            </h1>
            <p className="text-theme-secondary mt-1">
              Track your live feeder colonies — crickets, roaches, larvae.
            </p>
          </div>
          <Link
            href="/dashboard/feeders/add"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-brand text-white rounded-xl shadow-gradient-brand hover:opacity-90 transition font-medium"
          >
            <span aria-hidden="true">＋</span> Add Colony
          </Link>
        </div>

        {/* Low-stock banner */}
        {!loading && lowStockCount > 0 && (
          <div
            role="status"
            className="mb-6 p-4 rounded-xl border border-amber-300 dark:border-amber-600/60 bg-amber-50 dark:bg-amber-900/20 flex items-start gap-3"
          >
            <span aria-hidden="true" className="text-2xl">⚠️</span>
            <div className="flex-1">
              <p className="font-semibold text-amber-900 dark:text-amber-100">
                {lowStockCount} {lowStockCount === 1 ? 'colony is' : 'colonies are'} running low
              </p>
              <p className="text-sm text-amber-800 dark:text-amber-200/80">
                Tap a colony to log a restock or adjust the low-stock threshold.
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
          >
            {error}
            <button
              onClick={fetchColonies}
              className="ml-3 underline font-medium hover:text-red-900 dark:hover:text-red-100"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-40 rounded-xl bg-surface-elevated animate-pulse border border-theme"
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && colonies.length === 0 && (
          <div className="text-center py-16 px-6 rounded-2xl border border-theme bg-surface">
            <div className="text-6xl mb-4" aria-hidden="true">🦗</div>
            <h2 className="text-2xl font-bold text-theme-primary mb-2">No colonies yet</h2>
            <p className="text-theme-secondary mb-6 max-w-md mx-auto">
              Add your first feeder colony to start tracking feeds, cleanings, and restocks.
              Keepers typically keep crickets, dubia, hissers, or mealworms.
            </p>
            <Link
              href="/dashboard/feeders/add"
              className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-brand text-white rounded-xl shadow-gradient-brand hover:opacity-90 transition font-medium"
            >
              <span aria-hidden="true">＋</span> Add Your First Colony
            </Link>
          </div>
        )}

        {/* Colonies grid */}
        {!loading && !error && colonies.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {colonies.map((c) => {
              const fedDays = daysSince(c.last_fed_date)
              const cleanedDays = daysSince(c.last_cleaned)
              const speciesLabel = c.species_missing
                ? 'Species removed'
                : c.species_display_name || 'No species set'
              const totalCountLabel =
                c.total_count == null ? '—' : c.total_count.toLocaleString()

              return (
                <Link
                  key={c.id}
                  href={`/dashboard/feeders/${c.id}`}
                  className={`
                    group block p-5 rounded-xl border bg-surface transition
                    hover:shadow-lg hover:-translate-y-0.5
                    ${c.is_low_stock
                      ? 'border-amber-400 dark:border-amber-500/70'
                      : 'border-theme hover:border-primary-400 dark:hover:border-primary-500'
                    }
                  `}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-3xl flex-shrink-0" aria-hidden="true">
                        {categoryEmoji(c.species_display_name)}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-theme-primary truncate">
                          {c.name}
                        </h3>
                        <p
                          className={`text-xs truncate ${
                            c.species_missing
                              ? 'italic text-theme-tertiary'
                              : 'text-theme-secondary'
                          }`}
                        >
                          {speciesLabel}
                        </p>
                      </div>
                    </div>
                    {c.is_low_stock && (
                      <span
                        className="flex-shrink-0 text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200"
                        aria-label="Low stock"
                      >
                        Low
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-2xl font-bold text-theme-primary">
                      {totalCountLabel}
                    </span>
                    <span className="text-xs text-theme-tertiary">
                      {c.inventory_mode === 'life_stage' ? 'across stages' : 'total'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-theme-tertiary">
                    <span>
                      {fedDays == null
                        ? 'Never fed'
                        : fedDays === 0
                          ? 'Fed today'
                          : `Fed ${fedDays}d ago`}
                    </span>
                    <span>
                      {cleanedDays == null
                        ? 'Not cleaned'
                        : cleanedDays === 0
                          ? 'Cleaned today'
                          : `Cleaned ${cleanedDays}d ago`}
                    </span>
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
