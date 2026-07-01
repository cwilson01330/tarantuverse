"use client"

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'

const API_URL = process.env.NEXT_PUBLIC_API_URL

interface FeederSpecies {
  id: string
  scientific_name: string
  common_names: string[] | null
  category: string
  care_level: string | null
  image_url: string | null
  supports_life_stages: boolean
  default_life_stages: string[] | null
  temperature_min: number | null
  temperature_max: number | null
  humidity_min: number | null
  humidity_max: number | null
  typical_adult_size_mm: number | null
  prey_size_notes: string | null
  care_notes: string | null
  is_verified: boolean
  created_at: string
  updated_at: string | null
}

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

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
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

function rangeLabel(
  min: number | null,
  max: number | null,
  unit: string,
): string | null {
  if (min != null && max != null) return `${min}–${max} ${unit}`.trim()
  if (min != null) return `From ${min} ${unit}`.trim()
  if (max != null) return `Up to ${max} ${unit}`.trim()
  return null
}

export default function FeederSpeciesDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const speciesId = params?.id
  const { isAuthenticated, isLoading } = useAuth()

  const [species, setSpecies] = useState<FeederSpecies | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const fetchSpecies = useCallback(async () => {
    if (!speciesId) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/feeder-species/${speciesId}`)
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Care sheet not found')
        }
        throw new Error('Failed to load care sheet')
      }
      const data = (await res.json()) as FeederSpecies
      setSpecies(data)
      setLoadError('')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [speciesId])

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    fetchSpecies()
  }, [isLoading, isAuthenticated, router, fetchSpecies])

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="h-6 w-24 rounded bg-surface-elevated animate-pulse" />
          <div className="h-24 rounded-2xl bg-surface-elevated animate-pulse" />
          <div className="h-40 rounded-2xl bg-surface-elevated animate-pulse" />
          <div className="h-40 rounded-2xl bg-surface-elevated animate-pulse" />
        </div>
      </DashboardLayout>
    )
  }

  if (loadError || !species) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="text-5xl mb-4" aria-hidden="true">📖</div>
          <h1 className="text-2xl font-bold text-theme-primary mb-2">
            {loadError || 'Care sheet not found'}
          </h1>
          <p className="text-theme-secondary mb-6">
            It may have been removed, or the link may be incorrect.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/dashboard/feeders/species"
              className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
            >
              Back to Care Sheets
            </Link>
            {loadError && (
              <button
                onClick={() => {
                  setLoadError('')
                  fetchSpecies()
                }}
                className="px-4 py-2 rounded-xl bg-gradient-brand text-white font-medium shadow-gradient-brand hover:opacity-90 transition"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const primaryCommonName =
    species.common_names && species.common_names.length > 0
      ? species.common_names[0]
      : null
  const otherCommonNames =
    species.common_names && species.common_names.length > 1
      ? species.common_names.slice(1)
      : []

  const tempLabel = rangeLabel(
    species.temperature_min,
    species.temperature_max,
    '°F',
  )
  const humidityLabel = rangeLabel(species.humidity_min, species.humidity_max, '%')
  const sizeLabel =
    species.typical_adult_size_mm != null
      ? `${species.typical_adult_size_mm} mm`
      : null

  const hasOverview =
    !!species.category || !!species.care_level || sizeLabel != null
  const hasClimate = tempLabel != null || humidityLabel != null
  const hasLifeStages =
    species.supports_life_stages &&
    !!species.default_life_stages &&
    species.default_life_stages.length > 0

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        {/* Back link */}
        <Link
          href="/dashboard/feeders/species"
          className="text-sm text-theme-secondary hover:text-theme-primary transition"
        >
          ← Back
        </Link>

        {/* Header */}
        <div className="flex items-start gap-3 mt-2 mb-6">
          <span className="text-4xl flex-shrink-0" aria-hidden="true">
            {categoryEmoji(species.category)}
          </span>
          <div className="min-w-0 flex-1">
            {primaryCommonName ? (
              <>
                <h1 className="text-3xl font-bold text-theme-primary">
                  {primaryCommonName}
                </h1>
                <p className="mt-1 italic text-theme-secondary">
                  {species.scientific_name}
                </p>
              </>
            ) : (
              <h1 className="text-3xl font-bold italic text-theme-primary">
                {species.scientific_name}
              </h1>
            )}
            {species.care_level && (
              <span
                className={`inline-block mt-3 text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${careLevelClasses(
                  species.care_level,
                )}`}
              >
                {species.care_level} care
              </span>
            )}
          </div>
        </div>

        {/* Overview */}
        {hasOverview && (
          <section
            aria-labelledby="overview-heading"
            className="mb-6 p-6 rounded-2xl border border-theme bg-surface"
          >
            <h2
              id="overview-heading"
              className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-4"
            >
              Overview
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              {species.category && (
                <div>
                  <div className="text-theme-tertiary">Category</div>
                  <div className="text-theme-primary font-medium">
                    {titleCase(species.category)}
                  </div>
                </div>
              )}
              {species.care_level && (
                <div>
                  <div className="text-theme-tertiary">Care level</div>
                  <div className="text-theme-primary font-medium capitalize">
                    {species.care_level}
                  </div>
                </div>
              )}
              {sizeLabel && (
                <div>
                  <div className="text-theme-tertiary">Typical adult size</div>
                  <div className="text-theme-primary font-medium">{sizeLabel}</div>
                </div>
              )}
            </div>
            {otherCommonNames.length > 0 && (
              <div className="mt-4 text-sm">
                <div className="text-theme-tertiary">Also known as</div>
                <div className="text-theme-primary">
                  {otherCommonNames.join(', ')}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Climate */}
        {hasClimate && (
          <section
            aria-labelledby="climate-heading"
            className="mb-6 p-6 rounded-2xl border border-theme bg-surface"
          >
            <h2
              id="climate-heading"
              className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-4"
            >
              Climate
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {tempLabel && (
                <div>
                  <div className="text-theme-tertiary">Temperature</div>
                  <div className="text-theme-primary font-medium">{tempLabel}</div>
                </div>
              )}
              {humidityLabel && (
                <div>
                  <div className="text-theme-tertiary">Humidity</div>
                  <div className="text-theme-primary font-medium">
                    {humidityLabel}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Life stages */}
        {hasLifeStages && (
          <section
            aria-labelledby="lifestages-heading"
            className="mb-6 p-6 rounded-2xl border border-theme bg-surface"
          >
            <h2
              id="lifestages-heading"
              className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-4"
            >
              Life stages
            </h2>
            <div className="flex flex-wrap gap-2 mb-3">
              {species.default_life_stages!.map((stage) => (
                <span
                  key={stage}
                  className="text-sm font-medium px-3 py-1 rounded-full border border-theme bg-surface-elevated text-theme-primary capitalize"
                >
                  {stage}
                </span>
              ))}
            </div>
            <p className="text-sm text-theme-secondary">
              Commonly kept and offered at these stages.
            </p>
          </section>
        )}

        {/* Prey / feeding */}
        {species.prey_size_notes && (
          <section
            aria-labelledby="prey-heading"
            className="mb-6 p-6 rounded-2xl border border-theme bg-surface"
          >
            <h2
              id="prey-heading"
              className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-4"
            >
              Prey &amp; feeding
            </h2>
            <p className="text-theme-primary whitespace-pre-wrap">
              {species.prey_size_notes}
            </p>
          </section>
        )}

        {/* Care notes */}
        {species.care_notes && (
          <section
            aria-labelledby="carenotes-heading"
            className="mb-10 p-6 rounded-2xl border border-theme bg-surface"
          >
            <h2
              id="carenotes-heading"
              className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-4"
            >
              Care notes
            </h2>
            <p className="text-theme-primary whitespace-pre-wrap">
              {species.care_notes}
            </p>
          </section>
        )}
      </div>
    </DashboardLayout>
  )
}
