'use client'

/**
 * Reptile collection list.
 *
 * First authenticated page in Herpetoverse. Uses the shared Tarantuverse
 * API via apiClient — see lib/auth.ts + lib/apiClient.ts.
 *
 * Displays every reptile the keeper owns regardless of taxon. ADR-003
 * collapsed the per-taxon route trees, so every card routes to the one
 * /app/reptiles/[id] detail page; taxon is kept on each row to render a
 * subtle taxon indicator and to drive the taxon filter chips. Sorting is
 * newest-first by created_at.
 *
 * The taxon filter is derived from the registry (ANIMAL_TAXON_ORDER) but
 * only surfaces the taxa the keeper actually owns — adding a herp group
 * to lib/animals.ts makes it filterable here automatically once the
 * keeper has one.
 *
 * Error handling is permissive: if one taxon fetch fails we still show
 * whatever loaded; a banner surfaces the partial failure.
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ApiError } from '@/lib/apiClient'
import {
  ANIMAL_TAXA,
  ANIMAL_TAXON_ORDER,
  type Animal,
  type AnimalTaxon,
  animalTitle,
  fmtGrams,
  listAnimals,
  relativeDays,
} from '@/lib/animals'
import { lastFedTextClass } from '@/lib/cgd'

type Taxon = AnimalTaxon

/** Taxon indicator (glyph + label) with a graceful fallback for any
 *  taxon not in the registry (e.g. a legacy row). */
function taxonMeta(taxon: Taxon): { label: string; glyph: string } {
  const meta = ANIMAL_TAXA[taxon]
  return meta
    ? { label: meta.label, glyph: meta.glyph }
    : { label: taxon, glyph: '🦕' }
}

interface ReptileRow {
  taxon: Taxon
  id: string
  title: string
  scientific_name: string | null
  sex: Animal['sex']
  current_weight_g: string | null
  last_fed_at: string | null
  /** Drives the CGD-aware Last fed coloring on the card. */
  feeds_on_cgd: boolean
  created_at: string
}

function animalRow(a: Animal): ReptileRow {
  return {
    taxon: a.taxon,
    id: a.id,
    title: animalTitle(a),
    scientific_name: a.scientific_name,
    sex: a.sex,
    current_weight_g: a.current_weight_g,
    last_fed_at: a.last_fed_at,
    feeds_on_cgd: a.feeds_on_cgd,
    created_at: a.created_at,
  }
}

/** Detail page URL — ADR-003 collapsed the per-taxon route trees, so
 *  every taxon resolves through the one /app/reptiles/[id] route. */
function detailHref(row: ReptileRow): string {
  return `/app/reptiles/${row.id}`
}

export default function ReptilesPage() {
  const [rows, setRows] = useState<ReptileRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // null = "All"; otherwise the active taxon filter.
  const [activeTaxon, setActiveTaxon] = useState<Taxon | null>(null)

  useEffect(() => {
    let cancelled = false

    // ADR-003: one unified animals endpoint — every taxon in a single call.
    listAnimals()
      .then((animals) => {
        if (cancelled) return
        const collected = animals.map(animalRow)
        // Newest first — keeps just-added animals at the top of the grid.
        collected.sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        )
        setRows(collected)
      })
      .catch((err) => {
        if (cancelled) return
        // 401 is handled by apiClient (redirects to login); show an empty
        // grid rather than a scary banner while the redirect fires.
        if (err instanceof ApiError && err.status === 401) {
          setRows([])
          return
        }
        setRows([])
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load your reptiles.',
        )
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Which taxa the keeper actually owns, in registry order. Only these
  // get a filter chip — no empty "Turtles (0)" chips for taxa nobody has.
  const ownedTaxa = useMemo<Taxon[]>(() => {
    if (!rows) return []
    const present = new Set(rows.map((r) => r.taxon))
    return ANIMAL_TAXON_ORDER.filter((t) => present.has(t))
  }, [rows])

  // If the active filter's taxon disappears (e.g. after a reload with a
  // now-empty taxon), fall back to "All" so we never show an empty grid
  // with a stale chip selected.
  useEffect(() => {
    if (activeTaxon && rows && !ownedTaxa.includes(activeTaxon)) {
      setActiveTaxon(null)
    }
  }, [activeTaxon, rows, ownedTaxa])

  const visibleRows = useMemo(() => {
    if (!rows) return rows
    return activeTaxon ? rows.filter((r) => r.taxon === activeTaxon) : rows
  }, [rows, activeTaxon])

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
            Collection
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-wide text-white mb-2">
            Your reptiles
          </h1>
          <p className="text-neutral-400">
            Weights, feedings, sheds — per animal.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <Link
            href="/app/feeding-day"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-neutral-800 bg-neutral-900/40 text-sm text-neutral-300 hover:text-white hover:border-neutral-700 transition-colors"
          >
            <span aria-hidden="true">🍽️</span> Feeding Day
          </Link>
          <Link
            href="/app/reptiles/add"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-herp-teal/40 bg-herp-teal/10 text-sm text-herp-teal hover:bg-herp-teal/20 hover:border-herp-teal/60 transition-colors"
          >
            <span aria-hidden="true">＋</span> Add reptile
          </Link>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-6 p-3 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {/* Taxon filter — only shown when the keeper owns more than one
          taxon (a single-taxon collection needs no filter). Chips are
          registry-driven; only owned taxa appear. */}
      {rows !== null && rows.length > 0 && ownedTaxa.length > 1 && (
        <div
          className="flex flex-wrap gap-2 mb-6"
          role="group"
          aria-label="Filter by taxon"
        >
          <TaxonChip
            label="All"
            count={rows.length}
            active={activeTaxon === null}
            onClick={() => setActiveTaxon(null)}
          />
          {ownedTaxa.map((t) => {
            const meta = ANIMAL_TAXA[t]
            const count = rows.filter((r) => r.taxon === t).length
            return (
              <TaxonChip
                key={t}
                label={meta.plural}
                glyph={meta.glyph}
                count={count}
                active={activeTaxon === t}
                onClick={() => setActiveTaxon(t)}
              />
            )
          })}
        </div>
      )}

      {rows === null ? (
        <LoadingGrid />
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : visibleRows && visibleRows.length === 0 ? (
        <div className="p-8 rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 text-center text-sm text-neutral-400">
          No {activeTaxon ? ANIMAL_TAXA[activeTaxon].plural.toLowerCase() : 'animals'} in your collection yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(visibleRows ?? []).map((row) => (
            <ReptileCard key={`${row.taxon}:${row.id}`} row={row} />
          ))}
        </div>
      )}
    </div>
  )
}

function ReptileCard({ row }: { row: ReptileRow }) {
  const weight = fmtGrams(row.current_weight_g)
  const lastFed = relativeDays(row.last_fed_at)
  const lastFedClass = lastFedTextClass(row.last_fed_at, row.feeds_on_cgd)
  const { label: taxonLabel, glyph: taxonGlyph } = taxonMeta(row.taxon)

  return (
    <Link
      href={detailHref(row)}
      className="group p-5 rounded-lg border border-neutral-800 bg-neutral-900/40 hover:border-herp-teal/40 hover:bg-neutral-900/60 transition-colors block"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              aria-hidden="true"
              className="text-sm flex-shrink-0"
              title={taxonLabel}
            >
              {taxonGlyph}
            </span>
            <h3 className="text-lg font-semibold text-white truncate">
              {row.title}
            </h3>
          </div>
          {row.scientific_name && (
            <p className="text-xs italic text-neutral-500 truncate pl-6">
              {row.scientific_name}
            </p>
          )}
        </div>
        {row.sex && (
          <span className="flex-shrink-0 text-[10px] uppercase tracking-widest text-neutral-400 px-2 py-1 rounded border border-neutral-800">
            {row.sex[0]}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-neutral-500 uppercase tracking-wider text-[10px] mb-0.5">
            Weight
          </dt>
          <dd className="text-neutral-200">{weight || '—'}</dd>
        </div>
        <div>
          <dt className="text-neutral-500 uppercase tracking-wider text-[10px] mb-0.5">
            Last fed
          </dt>
          <dd className={lastFedClass}>{lastFed || '—'}</dd>
        </div>
      </dl>
    </Link>
  )
}

function TaxonChip({
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
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="p-5 rounded-lg border border-neutral-800 bg-neutral-900/30 animate-pulse"
        >
          <div className="h-5 bg-neutral-800 rounded w-2/3 mb-2" />
          <div className="h-3 bg-neutral-800/60 rounded w-1/2 mb-5" />
          <div className="h-3 bg-neutral-800 rounded w-full" />
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="p-10 rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 text-center">
      <div className="text-4xl mb-4" aria-hidden="true">
        🦎
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">
        No reptiles yet
      </h2>
      <p className="text-sm text-neutral-400 max-w-md mx-auto mb-6">
        Add your first snake, lizard, or frog to start tracking weights,
        feedings, and sheds. Link it to a species to unlock prey
        suggestions.
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
