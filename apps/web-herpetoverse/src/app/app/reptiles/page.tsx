'use client'

/**
 * Reptile collection list.
 *
 * First authenticated page in Herpetoverse. Uses the shared Tarantuverse
 * API via apiClient — see lib/auth.ts + lib/apiClient.ts.
 *
 * Displays every reptile the keeper owns regardless of taxon (snakes +
 * lizards). Taxon is kept as part of each row so the card can route to
 * the right detail page (/app/reptiles/{id} for snakes vs.
 * /app/reptiles/lizards/{id} for lizards) and render a subtle taxon
 * indicator. Sorting is newest-first by created_at.
 *
 * Error handling is permissive: if one taxon fetch fails we still show
 * whatever loaded; a banner surfaces the partial failure.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ApiError } from '@/lib/apiClient'
import {
  fmtGrams,
  listSnakes,
  relativeDays,
  Snake,
  snakeTitle,
} from '@/lib/snakes'
import {
  listLizards,
  Lizard,
  lizardTitle,
} from '@/lib/lizards'

type Taxon = 'snake' | 'lizard'

interface ReptileRow {
  taxon: Taxon
  id: string
  title: string
  scientific_name: string | null
  sex: Snake['sex']
  current_weight_g: string | null
  last_fed_at: string | null
  created_at: string
}

function snakeRow(s: Snake): ReptileRow {
  return {
    taxon: 'snake',
    id: s.id,
    title: snakeTitle(s),
    scientific_name: s.scientific_name,
    sex: s.sex,
    current_weight_g: s.current_weight_g,
    last_fed_at: s.last_fed_at,
    created_at: s.created_at,
  }
}

function lizardRow(l: Lizard): ReptileRow {
  return {
    taxon: 'lizard',
    id: l.id,
    title: lizardTitle(l),
    scientific_name: l.scientific_name,
    sex: l.sex,
    current_weight_g: l.current_weight_g,
    last_fed_at: l.last_fed_at,
    created_at: l.created_at,
  }
}

/** Detail page URL — snakes use legacy root-level route; lizards go under
 *  a `lizards/` subpath so existing snake bookmarks don't break. */
function detailHref(row: ReptileRow): string {
  return row.taxon === 'snake'
    ? `/app/reptiles/${row.id}`
    : `/app/reptiles/lizards/${row.id}`
}

export default function ReptilesPage() {
  const [rows, setRows] = useState<ReptileRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    // Fetch both taxa in parallel. allSettled so one failure doesn't
    // zero out the other.
    Promise.allSettled([listSnakes(), listLizards()]).then((results) => {
      if (cancelled) return

      const collected: ReptileRow[] = []
      const failures: string[] = []

      const [snakeResult, lizardResult] = results

      if (snakeResult.status === 'fulfilled') {
        collected.push(...snakeResult.value.map(snakeRow))
      } else {
        const err = snakeResult.reason
        // 401 is handled by apiClient (redirects to login); ignore here.
        if (err instanceof ApiError && err.status !== 401) {
          failures.push(`Snakes: ${err.message}`)
        } else if (!(err instanceof ApiError)) {
          failures.push('Could not load your snakes.')
        }
      }

      if (lizardResult.status === 'fulfilled') {
        collected.push(...lizardResult.value.map(lizardRow))
      } else {
        const err = lizardResult.reason
        if (err instanceof ApiError && err.status !== 401) {
          failures.push(`Lizards: ${err.message}`)
        } else if (!(err instanceof ApiError)) {
          failures.push('Could not load your lizards.')
        }
      }

      // Newest first — keeps just-added animals at the top of the grid.
      collected.sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      )

      setRows(collected)
      if (failures.length) setError(failures.join(' '))
    })

    return () => {
      cancelled = true
    }
  }, [])

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
        <Link
          href="/app/reptiles/add"
          className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-herp-teal/40 bg-herp-teal/10 text-sm text-herp-teal hover:bg-herp-teal/20 hover:border-herp-teal/60 transition-colors"
        >
          <span aria-hidden="true">＋</span> Add reptile
        </Link>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-6 p-3 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {rows === null ? (
        <LoadingGrid />
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((row) => (
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
  const taxonLabel = row.taxon === 'snake' ? 'Snake' : 'Lizard'
  const taxonGlyph = row.taxon === 'snake' ? '🐍' : '🦎'

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
          <dd className="text-neutral-200">{lastFed || '—'}</dd>
        </div>
      </dl>
    </Link>
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
        Add your first snake or lizard to start tracking weights,
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
