'use client'

/**
 * Feeder catalog browser (ADR-012).
 *
 * A public, browsable library of feeder species — rodents, fish, insects,
 * chicks. Category filter chips + debounced search, each row linking to a
 * care sheet at /app/feeders/catalog/[id].
 *
 * The catalog endpoint is public (auth:false in lib/feeders), so this works
 * even before the keeper has any stock. From a care sheet the keeper can jump
 * to "Add stock" pre-informed by the size ladder.
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ApiError } from '@/lib/apiClient'
import {
  type FeederCategory,
  type FeederSpecies,
  FEEDER_CATEGORIES,
  FEEDER_CATEGORY_ORDER,
  feederCategoryMeta,
  listFeederSpecies,
  capitalize,
} from '@/lib/feeders'

export default function FeederCatalogPage() {
  const [all, setAll] = useState<FeederSpecies[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<FeederCategory | null>(null)

  // Load the whole catalog once (<=200 rows) and filter client-side so
  // category chips + search feel instant with no round-trips.
  useEffect(() => {
    let cancelled = false
    listFeederSpecies({ limit: 200 })
      .then((rows) => {
        if (!cancelled) setAll(rows)
      })
      .catch((err) => {
        if (cancelled) return
        setAll([])
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load the feeder catalog.',
        )
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Which categories actually appear in the catalog, in registry order.
  const presentCategories = useMemo<FeederCategory[]>(() => {
    if (!all) return []
    const present = new Set(all.map((s) => s.category))
    return FEEDER_CATEGORY_ORDER.filter((c) => present.has(c))
  }, [all])

  const filtered = useMemo(() => {
    if (!all) return all
    const q = query.trim().toLowerCase()
    return all.filter((s) => {
      if (category && s.category !== category) return false
      if (!q) return true
      if (s.scientific_name.toLowerCase().includes(q)) return true
      return s.common_names.some((n) => n.toLowerCase().includes(q))
    })
  }, [all, query, category])

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
            Feeder keeping
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-wide text-white mb-2">
            Feeder catalog
          </h1>
          <p className="text-neutral-400">
            Care and sizing for common feeders — rodents, fish, insects, chicks.
          </p>
        </div>
        <Link
          href="/app/feeders"
          className="hidden sm:inline-flex flex-shrink-0 items-center gap-1.5 px-4 py-2 rounded-md border border-neutral-800 bg-neutral-900/40 text-sm text-neutral-300 hover:text-white hover:border-neutral-700 transition-colors"
        >
          ← My stock
        </Link>
      </header>

      {/* Search */}
      <div className="mb-4">
        <label htmlFor="feeder-search" className="sr-only">
          Search feeders
        </label>
        <input
          id="feeder-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="w-full px-4 py-2.5 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-neutral-100 placeholder-neutral-600"
        />
      </div>

      {/* Category chips */}
      {presentCategories.length > 1 && (
        <div
          className="flex flex-wrap gap-2 mb-6"
          role="group"
          aria-label="Filter by category"
        >
          <CatChip
            label="All"
            count={all?.length ?? 0}
            active={category === null}
            onClick={() => setCategory(null)}
          />
          {presentCategories.map((c) => {
            const meta = FEEDER_CATEGORIES[c]
            const count = (all ?? []).filter((s) => s.category === c).length
            return (
              <CatChip
                key={c}
                label={meta.plural}
                glyph={meta.glyph}
                count={count}
                active={category === c}
                onClick={() => setCategory(c)}
              />
            )
          })}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-6 p-3 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {all === null ? (
        <LoadingGrid />
      ) : filtered && filtered.length === 0 ? (
        <div className="p-8 rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 text-center text-sm text-neutral-400">
          {query.trim()
            ? `No feeders match "${query.trim()}".`
            : 'No feeders in this category yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(filtered ?? []).map((species) => (
            <CatalogCard key={species.id} species={species} />
          ))}
        </div>
      )}
    </div>
  )
}

function CatalogCard({ species }: { species: FeederSpecies }) {
  const meta = feederCategoryMeta(species.category)
  const common = species.common_names[0] || species.scientific_name
  return (
    <Link
      href={`/app/feeders/catalog/${species.id}`}
      className="group p-5 rounded-lg border border-neutral-800 bg-neutral-900/40 hover:border-herp-teal/40 hover:bg-neutral-900/60 transition-colors block"
    >
      <div className="flex items-start gap-3 mb-2">
        <span aria-hidden="true" className="text-xl flex-shrink-0">
          {meta.glyph}
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-white truncate">
            {common}
          </h3>
          <p className="text-xs italic text-neutral-500 truncate">
            {species.scientific_name}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-neutral-800 text-neutral-400">
          {meta.label}
        </span>
        {species.care_level && (
          <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-herp-teal/10 text-herp-teal">
            {species.care_level}
          </span>
        )}
      </div>

      {species.supports_sizes && species.typical_sizes.length > 0 && (
        <p className="mt-3 text-xs text-neutral-500 truncate">
          Sizes: {species.typical_sizes.map(capitalize).join(', ')}
        </p>
      )}
    </Link>
  )
}

function CatChip({
  label,
  glyph,
  count,
  active,
  onClick,
}: {
  label: string
  glyph?: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
        active
          ? 'border-herp-teal/60 bg-herp-teal/10 text-herp-lime'
          : 'border-neutral-800 bg-neutral-900/40 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
      }`}
    >
      {glyph && (
        <span aria-hidden="true" className="text-sm">
          {glyph}
        </span>
      )}
      {label}
      <span className="text-neutral-500">{count}</span>
    </button>
  )
}

function LoadingGrid() {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="p-5 rounded-lg border border-neutral-800 bg-neutral-900/30 animate-pulse"
        >
          <div className="h-5 bg-neutral-800 rounded w-2/3 mb-2" />
          <div className="h-3 bg-neutral-800/60 rounded w-1/2 mb-4" />
          <div className="h-3 bg-neutral-800 rounded w-1/3" />
        </div>
      ))}
    </div>
  )
}
