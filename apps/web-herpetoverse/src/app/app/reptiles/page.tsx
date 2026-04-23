'use client'

/**
 * Reptile collection list.
 *
 * First authenticated page in Herpetoverse. Uses the shared Tarantuverse
 * API via apiClient — see lib/auth.ts + lib/apiClient.ts.
 *
 * "Reptile" in the URL; under the hood, every record is currently a Snake
 * (the only non-tarantula species Herpetoverse supports). The UI stays
 * generic so we can broaden without a URL rename.
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

export default function ReptilesPage() {
  const [snakes, setSnakes] = useState<Snake[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listSnakes()
      .then((data) => {
        if (!cancelled) setSnakes(data)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status !== 401) {
          setError(err.message)
        } else if (!(err instanceof ApiError)) {
          setError('Could not load your reptiles.')
        }
        setSnakes([])
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
        <button
          disabled
          title="Adding reptiles from the web is coming soon — for now, add via the mobile app or Tarantuverse web."
          className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-neutral-800 text-sm text-neutral-500 cursor-not-allowed"
        >
          <span aria-hidden="true">＋</span> Add reptile
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-6 p-3 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {snakes === null ? (
        <LoadingGrid />
      ) : snakes.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {snakes.map((s) => (
            <SnakeCard key={s.id} snake={s} />
          ))}
        </div>
      )}
    </div>
  )
}

function SnakeCard({ snake }: { snake: Snake }) {
  const weight = fmtGrams(snake.current_weight_g)
  const lastFed = relativeDays(snake.last_fed_at)

  return (
    <Link
      href={`/app/reptiles/${snake.id}`}
      className="group p-5 rounded-lg border border-neutral-800 bg-neutral-900/40 hover:border-herp-teal/40 hover:bg-neutral-900/60 transition-colors block"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-white truncate">
            {snakeTitle(snake)}
          </h3>
          {snake.scientific_name && (
            <p className="text-xs italic text-neutral-500 truncate">
              {snake.scientific_name}
            </p>
          )}
        </div>
        {snake.sex && (
          <span className="flex-shrink-0 text-[10px] uppercase tracking-widest text-neutral-400 px-2 py-1 rounded border border-neutral-800">
            {snake.sex[0]}
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
        Herpetoverse shares your Tarantuverse account, but web-based reptile
        add isn&rsquo;t wired up yet. Add a snake via the mobile app and it
        will show up here.
      </p>
      <p className="text-xs text-neutral-600">
        We&rsquo;re testing the model first — web-based CRUD ships after the
        detail page proves out.
      </p>
    </div>
  )
}
