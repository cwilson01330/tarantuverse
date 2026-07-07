/**
 * Interactive species browser — taxon chips + search over the herp_species
 * catalog.
 *
 * The public (`/species`) and in-app (`/app/species`) pages both server-render
 * the initial (unfiltered) species set for fast first paint + SEO, then hand
 * off to this client component. Selecting a taxon chip refetches the list
 * scoped to that taxon (`?taxon=`); typing a query switches to the search
 * endpoint (also taxon-scoped when a taxon is active).
 *
 * Taxon division mirrors Tarantuverse's web species browser
 * (apps/web/src/app/species/page.tsx) — a row of pill chips reading from the
 * shared taxon registry (ANIMAL_TAXA / ANIMAL_TAXON_ORDER), plus an "All"
 * chip. Chips use HV theme tokens (herp-teal / herp-lime / neutral-*).
 *
 * The two link schemes differ (public → /species/{slug}, in-app →
 * /app/species/{id}), so callers pass `hrefFor`. The card layout otherwise
 * matches the existing SpeciesCard on both pages.
 */
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ACTIVITY_ICONS,
  ACTIVITY_LABELS,
  browseReptileSpecies,
  displayTitle,
  ENCLOSURE_LABELS,
  formatRange,
  searchReptileSpecies,
  type ReptileSpecies,
} from '@/lib/reptileSpecies'
import {
  ANIMAL_TAXA,
  ANIMAL_TAXON_ORDER,
  isAnimalTaxon,
  type AnimalTaxon,
} from '@/lib/animals'
import {
  FEEDER_CATEGORIES,
  FEEDER_CATEGORY_ORDER,
  feederCategoryMeta,
  listFeederSpecies,
  type FeederCategory,
  type FeederSpecies,
} from '@/lib/feeders'
import { CareLevelBadge } from '@/components/SpeciesBadges'

interface SpeciesBrowserProps {
  /** Server-rendered initial (unfiltered) set for fast first paint. */
  initialSpecies: ReptileSpecies[]
  /** Build the care-sheet link for a species (slug for public, id for in-app). */
  hrefFor: (species: ReptileSpecies) => string
}

type TaxonFilter = AnimalTaxon | 'all'

/**
 * The active filter is EITHER an animal taxon (or 'all') OR a feeder category —
 * never both. We model that as a discriminated union so the two data sources
 * (reptile catalog vs. feeder catalog) never collide.
 */
type Selection =
  | { kind: 'taxon'; taxon: TaxonFilter }
  | { kind: 'feeder'; category: FeederCategory }

/** Feeder care sheets live under the in-app catalog route (public endpoint). */
function feederHref(feeder: FeederSpecies): string {
  return `/app/feeders/catalog/${feeder.id}`
}

export default function SpeciesBrowser({
  initialSpecies,
  hrefFor,
}: SpeciesBrowserProps) {
  const [selection, setSelection] = useState<Selection>({
    kind: 'taxon',
    taxon: 'all',
  })
  const [query, setQuery] = useState('')
  const [species, setSpecies] = useState<ReptileSpecies[]>(initialSpecies)
  const [feeders, setFeeders] = useState<FeederSpecies[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const isFeeder = selection.kind === 'feeder'
  const taxon: TaxonFilter =
    selection.kind === 'taxon' ? selection.taxon : 'all'

  // Track whether we've mounted so the first render reuses `initialSpecies`
  // (the "all" set the server already fetched) instead of refetching.
  const hydrated = useRef(false)

  // Debounced search term drives the effect; raw `query` drives the input.
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    // Skip the very first run for the default "all" + empty-query state — the
    // server already gave us that list.
    if (!hydrated.current) {
      hydrated.current = true
      if (
        selection.kind === 'taxon' &&
        selection.taxon === 'all' &&
        debouncedQuery.length === 0
      ) {
        return
      }
    }

    let cancelled = false

    // Feeder branch: fetch the feeder catalog scoped to the category, passing
    // the search box query through. Completely separate from the reptile
    // catalog — the two never mix in the same list.
    if (selection.kind === 'feeder') {
      const category = selection.category
      async function runFeeders() {
        setLoading(true)
        setError(false)
        try {
          const rows = await listFeederSpecies({
            category,
            q: debouncedQuery.length >= 2 ? debouncedQuery : undefined,
            limit: 200,
          })
          if (!cancelled) setFeeders(rows)
        } catch {
          if (!cancelled) {
            setError(true)
            setFeeders([])
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
      }
      runFeeders()
      return () => {
        cancelled = true
      }
    }

    const activeTaxon =
      selection.taxon === 'all' ? undefined : selection.taxon

    async function run() {
      setLoading(true)
      setError(false)
      try {
        if (debouncedQuery.length >= 2) {
          // Search endpoint returns the lightweight search shape; map it onto
          // the card fields we render (the rest stay undefined → card hides
          // those rows gracefully).
          const results = await searchReptileSpecies(
            debouncedQuery,
            50,
            activeTaxon,
          )
          if (cancelled) return
          setSpecies(
            results.map(
              (r) =>
                ({
                  id: r.id,
                  slug: r.slug,
                  taxon: r.taxon,
                  scientific_name: r.scientific_name,
                  common_names: r.common_names,
                  care_level: r.care_level,
                  image_url: r.image_url,
                }) as ReptileSpecies,
            ),
          )
        } else {
          const list = await browseReptileSpecies(activeTaxon)
          if (cancelled) return
          if (list === null) {
            setError(true)
            setSpecies([])
          } else {
            setSpecies(list)
          }
        }
      } catch {
        if (!cancelled) {
          setError(true)
          setSpecies([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [selection, debouncedQuery])

  const activeCount = isFeeder ? feeders.length : species.length
  const countLabel = useMemo(() => {
    return `${activeCount} ${isFeeder ? (activeCount === 1 ? 'feeder' : 'feeders') : 'species'}`
  }, [activeCount, isFeeder])

  return (
    <>
      {/* Taxon chips */}
      <div
        className="flex flex-wrap gap-2 mb-4"
        role="group"
        aria-label="Filter species by group"
      >
        <TaxonChip
          label="All"
          active={selection.kind === 'taxon' && selection.taxon === 'all'}
          onClick={() => setSelection({ kind: 'taxon', taxon: 'all' })}
        />
        {ANIMAL_TAXON_ORDER.map((key) => {
          const meta = ANIMAL_TAXA[key]
          return (
            <TaxonChip
              key={key}
              label={meta.plural}
              glyph={meta.glyph}
              active={selection.kind === 'taxon' && selection.taxon === key}
              onClick={() => setSelection({ kind: 'taxon', taxon: key })}
            />
          )
        })}
        {/* Feeder category chips — a feeder selection is mutually exclusive
            with the animal taxon / All chips above. */}
        {FEEDER_CATEGORY_ORDER.map((key) => {
          const meta = FEEDER_CATEGORIES[key]
          return (
            <TaxonChip
              key={`feeder-${key}`}
              label={meta.plural}
              glyph={meta.glyph}
              active={selection.kind === 'feeder' && selection.category === key}
              onClick={() =>
                setSelection({ kind: 'feeder', category: key })
              }
            />
          )
        })}
      </div>

      {/* Search */}
      <div className="mb-6">
        <label htmlFor="species-search" className="sr-only">
          Search species
        </label>
        <div className="relative max-w-md">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
            aria-hidden="true"
          >
            🔍
          </span>
          <input
            id="species-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by scientific or common name…"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-neutral-800 bg-neutral-900/60 text-white placeholder:text-neutral-500 focus:outline-none focus:border-herp-teal/50 focus:ring-1 focus:ring-herp-teal/40 transition-colors"
          />
        </div>
      </div>

      {error ? (
        <ApiErrorState />
      ) : loading ? (
        <div className="py-12 text-center text-sm text-neutral-500">
          <div
            className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-herp-teal"
            aria-hidden="true"
          />
          <p className="mt-3">Loading species…</p>
        </div>
      ) : activeCount === 0 ? (
        <NoResultsState />
      ) : (
        <>
          <div className="mb-4 text-sm text-neutral-500">
            {countLabel}
            {isFeeder ? (
              <>
                {' '}·{' '}
                <span className="text-neutral-400">
                  {FEEDER_CATEGORIES[selection.category].plural}
                </span>
              </>
            ) : (
              taxon !== 'all' && (
                <>
                  {' '}·{' '}
                  <span className="text-neutral-400">
                    {ANIMAL_TAXA[taxon].plural}
                  </span>
                </>
              )
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {isFeeder
              ? feeders.map((f) => (
                  <FeederCard key={f.id} feeder={f} href={feederHref(f)} />
                ))
              : species.map((s) => (
                  <SpeciesCard key={s.id} species={s} href={hrefFor(s)} />
                ))}
          </div>
        </>
      )}
    </>
  )
}

function TaxonChip({
  label,
  glyph,
  active,
  onClick,
}: {
  label: string
  glyph?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
        active
          ? 'bg-herp-teal/15 text-herp-lime border-herp-teal/50'
          : 'bg-neutral-900/50 text-neutral-400 border-neutral-800 hover:border-neutral-700 hover:text-neutral-200'
      }`}
    >
      {glyph && (
        <span aria-hidden="true" className="text-[13px] leading-none">
          {glyph}
        </span>
      )}
      {label}
    </button>
  )
}

/** Small taxon badge shown on each card. Unknown/absent taxa fall back to "Other". */
function TaxonBadge({ taxon }: { taxon: AnimalTaxon | null }) {
  const meta = isAnimalTaxon(taxon) ? ANIMAL_TAXA[taxon] : ANIMAL_TAXA.other
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border bg-neutral-800/60 text-neutral-300 border-neutral-700">
      <span aria-hidden="true">{meta.glyph}</span>
      {meta.label}
    </span>
  )
}

function SpeciesCard({
  species,
  href,
}: {
  species: ReptileSpecies
  href: string
}) {
  const adultSize = formatRange(
    species.adult_length_min_in,
    species.adult_length_max_in,
    'in',
  )
  const activity = species.activity_period
    ? `${ACTIVITY_ICONS[species.activity_period]} ${ACTIVITY_LABELS[species.activity_period]}`
    : null
  const enclosure = species.enclosure_type
    ? ENCLOSURE_LABELS[species.enclosure_type]
    : null

  return (
    <Link
      href={href}
      className="group block p-5 rounded-lg border border-neutral-800 bg-neutral-900/50 hover:border-herp-teal/40 hover:bg-neutral-900/80 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white mb-0.5 truncate">
            {displayTitle(species)}
          </h2>
          <p className="text-xs italic text-neutral-400 truncate">
            {species.scientific_name}
          </p>
        </div>
        <CareLevelBadge level={species.care_level} />
      </div>

      <div className="mb-3">
        <TaxonBadge taxon={species.taxon} />
      </div>

      {species.common_names.length > 1 && (
        <p className="text-xs text-neutral-500 mb-3 truncate">
          Also: {species.common_names.slice(1).join(', ')}
        </p>
      )}

      <dl className="space-y-1.5 text-xs text-neutral-400">
        {activity && (
          <div className="flex items-center gap-2">
            <dt className="sr-only">Activity period</dt>
            <dd>{activity}</dd>
          </div>
        )}
        {enclosure && (
          <div className="flex items-center gap-2">
            <dt className="text-neutral-600 w-16 flex-shrink-0">Setup</dt>
            <dd>{enclosure}</dd>
          </div>
        )}
        {adultSize && (
          <div className="flex items-center gap-2">
            <dt className="text-neutral-600 w-16 flex-shrink-0">Adult</dt>
            <dd>{adultSize}</dd>
          </div>
        )}
        {species.native_region && (
          <div className="flex items-start gap-2">
            <dt className="text-neutral-600 w-16 flex-shrink-0 mt-0.5">
              Native
            </dt>
            <dd className="line-clamp-2">{species.native_region}</dd>
          </div>
        )}
      </dl>

      <div className="mt-4 text-xs text-herp-teal group-hover:text-herp-lime transition-colors">
        View care sheet →
      </div>
    </Link>
  )
}

/**
 * Feeder catalog card. Deliberately does NOT reuse CareLevelBadge — feeder
 * `care_level` is `easy | moderate | hard` (or a freeform string), a different
 * vocabulary from the reptile beginner/intermediate/advanced scale. We render
 * it verbatim in a neutral pill so it's never mislabeled.
 */
function FeederCard({
  feeder,
  href,
}: {
  feeder: FeederSpecies
  href: string
}) {
  const meta = feederCategoryMeta(feeder.category)
  const title = feeder.common_names[0] || feeder.scientific_name

  return (
    <Link
      href={href}
      className="group block p-5 rounded-lg border border-neutral-800 bg-neutral-900/50 hover:border-herp-teal/40 hover:bg-neutral-900/80 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex items-start gap-2">
          <span aria-hidden="true" className="text-lg flex-shrink-0 leading-none mt-0.5">
            {meta.glyph}
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white mb-0.5 truncate">
              {title}
            </h2>
            <p className="text-xs italic text-neutral-400 truncate">
              {feeder.scientific_name}
            </p>
          </div>
        </div>
        {feeder.care_level && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wider border bg-neutral-800/60 text-neutral-300 border-neutral-700 flex-shrink-0">
            {feeder.care_level}
          </span>
        )}
      </div>

      <div className="mb-3">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border bg-neutral-800/60 text-neutral-300 border-neutral-700">
          <span aria-hidden="true">{meta.glyph}</span>
          {meta.label}
        </span>
      </div>

      {feeder.common_names.length > 1 && (
        <p className="text-xs text-neutral-500 mb-3 truncate">
          Also: {feeder.common_names.slice(1).join(', ')}
        </p>
      )}

      <dl className="space-y-1.5 text-xs text-neutral-400">
        {feeder.supports_sizes && feeder.typical_sizes.length > 0 && (
          <div className="flex items-start gap-2">
            <dt className="text-neutral-600 w-16 flex-shrink-0 mt-0.5">Sizes</dt>
            <dd className="line-clamp-2">
              {feeder.typical_sizes.join(', ')}
            </dd>
          </div>
        )}
        {feeder.prey_size_notes && (
          <div className="flex items-start gap-2">
            <dt className="text-neutral-600 w-16 flex-shrink-0 mt-0.5">Prey</dt>
            <dd className="line-clamp-2">{feeder.prey_size_notes}</dd>
          </div>
        )}
      </dl>

      <div className="mt-4 text-xs text-herp-teal group-hover:text-herp-lime transition-colors">
        View care sheet →
      </div>
    </Link>
  )
}

function NoResultsState() {
  return (
    <div className="p-10 rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 text-center">
      <div className="text-4xl mb-4" aria-hidden="true">
        🔍
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">
        No species match
      </h2>
      <p className="text-sm text-neutral-400 max-w-md mx-auto">
        Try a different group or clear your search — the library is still
        growing as care sheets pass content review.
      </p>
    </div>
  )
}

function ApiErrorState() {
  return (
    <div className="p-10 rounded-lg border border-red-500/30 bg-red-500/5 text-center">
      <div className="text-4xl mb-4" aria-hidden="true">
        🛰️
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">
        Couldn&rsquo;t reach the species API
      </h2>
      <p className="text-sm text-neutral-400 max-w-md mx-auto">
        This usually clears up within a minute. Try refreshing — if it
        persists, the backend may be waking up from sleep.
      </p>
    </div>
  )
}
