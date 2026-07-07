'use client'

/**
 * Feeder care sheet (ADR-012).
 *
 * Renders one catalog entry: category, care/handling/prey-size notes, the
 * size ladder, and — for live feeders — target temps/humidity. A prominent
 * "Add to my stock" CTA jumps to the add form; the form's species picker
 * then seeds size buckets from this entry's `typical_sizes`.
 *
 * Public data (auth:false), so this renders for anyone browsing.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ApiError } from '@/lib/apiClient'
import {
  type FeederSpecies,
  feederCategoryMeta,
  getFeederSpecies,
  capitalize,
} from '@/lib/feeders'

export default function FeederCareSheetClient({ speciesId }: { speciesId: string }) {
  const [species, setSpecies] = useState<FeederSpecies | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getFeederSpecies(speciesId)
      .then((s) => {
        if (!cancelled) setSpecies(s)
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load this care sheet.',
        )
      })
    return () => {
      cancelled = true
    }
  }, [speciesId])

  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <Link
          href="/app/feeders/catalog"
          className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          ← Back to catalog
        </Link>
        <div
          role="alert"
          className="mt-4 p-4 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
        >
          {error}
        </div>
      </div>
    )
  }

  if (!species) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="h-8 bg-neutral-800 rounded w-1/2 mb-4 animate-pulse" />
        <div className="h-32 bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse" />
      </div>
    )
  }

  const meta = feederCategoryMeta(species.category)
  const common = species.common_names[0] || species.scientific_name
  const isLive = species.category === 'insect' || species.category === 'fish'
  const hasTemps =
    species.temperature_min != null || species.temperature_max != null
  const hasHumidity =
    species.humidity_min != null || species.humidity_max != null

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/app/feeders/catalog"
        className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        ← Back to catalog
      </Link>

      {/* Header */}
      <header className="mt-3 mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <span aria-hidden="true" className="text-2xl flex-shrink-0">
              {meta.glyph}
            </span>
            <h1 className="text-3xl font-bold tracking-wide text-white truncate">
              {common}
            </h1>
          </div>
          <p className="text-sm italic text-neutral-500 pl-9">
            {species.scientific_name}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-3 pl-9">
            <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-neutral-800 text-neutral-400">
              {meta.label}
            </span>
            {species.care_level && (
              <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-herp-teal/10 text-herp-teal">
                {species.care_level}
              </span>
            )}
            {species.is_verified && (
              <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-herp-lime/10 text-herp-lime">
                ✓ Verified
              </span>
            )}
          </div>
        </div>
        <Link
          href={`/app/feeders/add?species=${encodeURIComponent(species.id)}`}
          className="flex-shrink-0 herp-gradient-bg text-herp-dark font-bold px-4 py-2 rounded-md text-sm tracking-wide transition-opacity hover:opacity-90"
        >
          ＋ Add to my stock
        </Link>
      </header>

      {/* Size ladder */}
      {species.supports_sizes && species.typical_sizes.length > 0 && (
        <Section title="Sizes">
          <div className="flex flex-wrap items-center gap-2">
            {species.typical_sizes.map((size, i) => (
              <span key={size} className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-md bg-neutral-950/60 border border-neutral-800 text-sm text-neutral-200">
                  {capitalize(size)}
                </span>
                {i < species.typical_sizes.length - 1 && (
                  <span aria-hidden="true" className="text-neutral-600">
                    →
                  </span>
                )}
              </span>
            ))}
          </div>
          {species.prey_size_notes && (
            <p className="mt-3 text-sm text-neutral-300 whitespace-pre-wrap">
              {species.prey_size_notes}
            </p>
          )}
        </Section>
      )}

      {/* Prey-size notes when there's no size ladder to hang them under */}
      {(!species.supports_sizes || species.typical_sizes.length === 0) &&
        species.prey_size_notes && (
          <Section title="Prey sizing">
            <p className="text-sm text-neutral-300 whitespace-pre-wrap">
              {species.prey_size_notes}
            </p>
          </Section>
        )}

      {/* Care notes */}
      {species.care_notes && (
        <Section title="Care">
          <p className="text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed">
            {species.care_notes}
          </p>
        </Section>
      )}

      {/* Handling notes */}
      {species.handling_notes && (
        <Section title="Handling & storage">
          <p className="text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed">
            {species.handling_notes}
          </p>
        </Section>
      )}

      {/* Environment — only meaningful for live feeders you keep going */}
      {isLive && (hasTemps || hasHumidity || species.typical_adult_size_mm != null) && (
        <Section title="Environment">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            {hasTemps && (
              <Meta
                label="Temperature"
                value={rangeF(species.temperature_min, species.temperature_max)}
              />
            )}
            {hasHumidity && (
              <Meta
                label="Humidity"
                value={rangePct(species.humidity_min, species.humidity_max)}
              />
            )}
            {species.typical_adult_size_mm != null && (
              <Meta
                label="Adult size"
                value={`${species.typical_adult_size_mm} mm`}
              />
            )}
          </dl>
        </Section>
      )}

      {species.typical_adult_size_mm != null && !isLive && (
        <Section title="Size">
          <p className="text-sm text-neutral-300">
            Typical adult size: {species.typical_adult_size_mm} mm
          </p>
        </Section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers + primitives
// ---------------------------------------------------------------------------

function rangeF(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${min}–${max}°F`
  if (min != null) return `≥ ${min}°F`
  if (max != null) return `≤ ${max}°F`
  return '—'
}

function rangePct(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${min}–${max}%`
  if (min != null) return `≥ ${min}%`
  if (max != null) return `≤ ${max}%`
  return '—'
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/40 mb-4">
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-herp-lime/80 font-medium mb-4">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-neutral-500 mb-0.5">
        {label}
      </dt>
      <dd className="text-neutral-200">{value}</dd>
    </div>
  )
}
