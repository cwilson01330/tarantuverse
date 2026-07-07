'use client'

/**
 * My feeder stock — the Feeder Keeping home (ADR-012).
 *
 * Lists every feeder stock the keeper owns: live colonies AND frozen
 * freezer inventory. The headline job is frozen sized inventory — a
 * freezer of graded rodents shown as "Pinky 20 · Hopper 8 · Adult 12"
 * with a one-tap "Used" on each bucket that decrements it. A `count`
 * stock is the same idea with a single number.
 *
 * Quick actions POST a log through lib/feeders (used = negative delta,
 * restock = positive) and refetch the affected stock for fresh totals —
 * the backend owns the arithmetic and floors buckets at 0, so we never
 * do count math on the client.
 *
 * Feeder keeping is planned HV-premium but the backend gate is OFF for
 * now (testable), so there's deliberately no paywall/UpgradeModal here.
 *
 * Theme: herp-* + neutral-* tokens, matching /app/reptiles and
 * /app/feeding-day.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from '@/lib/apiClient'
import {
  type FeederStock,
  feederStockTitle,
  getFeederStock,
  listFeederStocks,
  logFeederRestock,
  logFeederUsed,
  sizedBucketEntries,
  capitalize,
} from '@/lib/feeders'

export default function FeedersPage() {
  const [stocks, setStocks] = useState<FeederStock[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Per-stock (and per-bucket) busy flag so we can disable the exact
  // button being acted on. Keyed "stockId" or "stockId:size".
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const load = useCallback(() => {
    let cancelled = false
    listFeederStocks()
      .then((data) => {
        if (cancelled) return
        // Neediest first: low-stock at the top, then newest.
        data.sort((a, b) => {
          if (a.is_low_stock !== b.is_low_stock) return a.is_low_stock ? -1 : 1
          return b.created_at.localeCompare(a.created_at)
        })
        setStocks(data)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          setStocks([])
          return
        }
        setStocks([])
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load your feeder stock.',
        )
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => load(), [load])

  // Refetch a single stock after a quick action and splice it back in,
  // preserving the current sort by re-sorting the same way as load().
  const refetchOne = useCallback(async (id: string) => {
    try {
      const fresh = await getFeederStock(id)
      setStocks((prev) => {
        if (!prev) return prev
        const next = prev.map((s) => (s.id === id ? fresh : s))
        next.sort((a, b) => {
          if (a.is_low_stock !== b.is_low_stock) return a.is_low_stock ? -1 : 1
          return b.created_at.localeCompare(a.created_at)
        })
        return next
      })
    } catch {
      // Fall back to a full reload if the single refetch fails.
      load()
    }
  }, [load])

  const runAction = useCallback(
    async (
      stockId: string,
      kind: 'used' | 'restock',
      size: string | undefined,
      amount: number,
    ) => {
      const key = size ? `${stockId}:${size}` : stockId
      setBusy((b) => ({ ...b, [key]: true }))
      setError(null)
      try {
        if (kind === 'used') await logFeederUsed(stockId, amount, size)
        else await logFeederRestock(stockId, amount, size)
        await refetchOne(stockId)
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not update the stock. Please try again.',
        )
      } finally {
        setBusy((b) => {
          const next = { ...b }
          delete next[key]
          return next
        })
      }
    },
    [refetchOne],
  )

  const lowCount = useMemo(
    () => (stocks ?? []).filter((s) => s.is_low_stock).length,
    [stocks],
  )

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
            Feeder keeping
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-wide text-white mb-2">
            Feeder stock
          </h1>
          <p className="text-neutral-400">
            Live colonies and frozen freezer inventory — track what you have,
            log what you use.
          </p>
          {stocks !== null && lowCount > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-medium">
                ⚠ {lowCount} low
              </span>
              <span className="text-neutral-500">
                {lowCount === 1 ? 'stock is' : 'stocks are'} running low
              </span>
            </p>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <Link
            href="/app/feeders/catalog"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-neutral-800 bg-neutral-900/40 text-sm text-neutral-300 hover:text-white hover:border-neutral-700 transition-colors"
          >
            <span aria-hidden="true">📖</span> Catalog
          </Link>
          <Link
            href="/app/feeders/add"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-herp-teal/40 bg-herp-teal/10 text-sm text-herp-teal hover:bg-herp-teal/20 hover:border-herp-teal/60 transition-colors"
          >
            <span aria-hidden="true">＋</span> Add stock
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

      {stocks === null ? (
        <LoadingList />
      ) : stocks.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {stocks.map((stock) => (
            <StockCard
              key={stock.id}
              stock={stock}
              busy={busy}
              onAction={runAction}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stock card
// ---------------------------------------------------------------------------

function StockCard({
  stock,
  busy,
  onAction,
}: {
  stock: FeederStock
  busy: Record<string, boolean>
  onAction: (
    stockId: string,
    kind: 'used' | 'restock',
    size: string | undefined,
    amount: number,
  ) => void
}) {
  const isSized = stock.inventory_mode === 'sized'
  const stockBusy = !!busy[stock.id]

  return (
    <div className="p-5 rounded-lg border border-neutral-800 bg-neutral-900/40">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/app/feeders/${stock.id}`}
              className="text-lg font-semibold text-white hover:text-herp-lime transition-colors truncate"
            >
              {feederStockTitle(stock)}
            </Link>
            <FormBadge form={stock.form} />
            {stock.is_low_stock && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">
                Low stock
              </span>
            )}
          </div>
          {stock.species_display_name && (
            <p className="text-xs text-neutral-500 truncate mt-0.5">
              {stock.species_display_name}
              {stock.storage_location && (
                <span className="text-neutral-600">
                  {' '}· {stock.storage_location}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-2xl font-bold text-white leading-none">
            {stock.total_count}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mt-1">
            total
          </div>
        </div>
      </div>

      {isSized ? (
        <SizedBuckets stock={stock} busy={busy} onAction={onAction} />
      ) : (
        <CountRow stock={stock} busy={stockBusy} onAction={onAction} />
      )}

      {/* Card footer link */}
      <div className="mt-4 flex items-center justify-between">
        <Link
          href={`/app/feeders/${stock.id}`}
          className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          History &amp; details →
        </Link>
        {stock.low_threshold != null && (
          <span className="text-[10px] text-neutral-600">
            Low below {stock.low_threshold}
          </span>
        )}
      </div>
    </div>
  )
}

/** Sized stock: one row per size bucket, each with its own Used/Restock. */
function SizedBuckets({
  stock,
  busy,
  onAction,
}: {
  stock: FeederStock
  busy: Record<string, boolean>
  onAction: (
    stockId: string,
    kind: 'used' | 'restock',
    size: string | undefined,
    amount: number,
  ) => void
}) {
  const entries = sizedBucketEntries(stock.sized_counts)
  if (entries.length === 0) {
    return (
      <p className="text-sm text-neutral-500 italic">
        No sizes tracked yet. Restock from the details page to add buckets.
      </p>
    )
  }
  return (
    <ul className="space-y-2">
      {entries.map(([size, n]) => {
        const key = `${stock.id}:${size}`
        const bucketBusy = !!busy[key]
        const empty = n <= 0
        return (
          <li
            key={size}
            className="flex items-center justify-between gap-3 py-1.5 px-3 rounded-md bg-neutral-950/60 border border-neutral-800"
          >
            <div className="min-w-0 flex items-baseline gap-2">
              <span className="text-sm font-medium text-neutral-200 truncate">
                {capitalize(size)}
              </span>
              <span
                className={`text-sm font-bold ${
                  empty ? 'text-neutral-600' : 'text-white'
                }`}
              >
                {n}
              </span>
            </div>
            <div className="flex-shrink-0 flex items-center gap-1.5">
              <QuickButton
                label="−1"
                title={`Used one ${size}`}
                disabled={bucketBusy || empty}
                onClick={() => onAction(stock.id, 'used', size, 1)}
                variant="used"
              />
              <QuickButton
                label="Used…"
                title={`Log multiple ${size} used`}
                disabled={bucketBusy || empty}
                onClick={() => promptAmount(
                  `How many ${capitalize(size)} did you use?`,
                  (amt) => onAction(stock.id, 'used', size, amt),
                )}
                variant="used"
              />
              <QuickButton
                label="+ Restock"
                title={`Restock ${size}`}
                disabled={bucketBusy}
                onClick={() => promptAmount(
                  `How many ${capitalize(size)} did you add?`,
                  (amt) => onAction(stock.id, 'restock', size, amt),
                )}
                variant="restock"
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Count stock: single number with the same used/restock quick actions. */
function CountRow({
  stock,
  busy,
  onAction,
}: {
  stock: FeederStock
  busy: boolean
  onAction: (
    stockId: string,
    kind: 'used' | 'restock',
    size: string | undefined,
    amount: number,
  ) => void
}) {
  const empty = stock.total_count <= 0
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 px-3 rounded-md bg-neutral-950/60 border border-neutral-800">
      <span className="text-sm text-neutral-400">
        {empty ? 'Out of stock' : 'On hand'}
      </span>
      <div className="flex items-center gap-1.5">
        <QuickButton
          label="−1"
          title="Used one"
          disabled={busy || empty}
          onClick={() => onAction(stock.id, 'used', undefined, 1)}
          variant="used"
        />
        <QuickButton
          label="Used…"
          title="Log multiple used"
          disabled={busy || empty}
          onClick={() => promptAmount('How many did you use?', (amt) =>
            onAction(stock.id, 'used', undefined, amt),
          )}
          variant="used"
        />
        <QuickButton
          label="+ Restock"
          title="Restock"
          disabled={busy}
          onClick={() => promptAmount('How many did you add?', (amt) =>
            onAction(stock.id, 'restock', undefined, amt),
          )}
          variant="restock"
        />
      </div>
    </div>
  )
}

/**
 * A window.prompt-based amount collector. Deliberately lightweight — a
 * full modal is overkill for "how many did you use", and prompt keeps the
 * card self-contained. Parses a positive integer; ignores blanks/cancels.
 */
function promptAmount(question: string, onValue: (amount: number) => void) {
  if (typeof window === 'undefined') return
  const raw = window.prompt(question, '1')
  if (raw == null) return
  const n = Math.floor(Number(raw.trim()))
  if (!Number.isFinite(n) || n <= 0) return
  onValue(n)
}

function QuickButton({
  label,
  title,
  disabled,
  onClick,
  variant,
}: {
  label: string
  title: string
  disabled?: boolean
  onClick: () => void
  variant: 'used' | 'restock'
}) {
  const base =
    'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const styles =
    variant === 'restock'
      ? 'border-herp-teal/40 bg-herp-teal/10 text-herp-teal hover:bg-herp-teal/20'
      : 'border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-white'
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${styles}`}
    >
      {label}
    </button>
  )
}

function FormBadge({ form }: { form: 'live' | 'frozen' }) {
  const frozen = form === 'frozen'
  return (
    <span
      className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${
        frozen
          ? 'border-sky-500/40 bg-sky-500/10 text-sky-300'
          : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      }`}
    >
      {frozen ? '❄ Frozen' : '● Live'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

function LoadingList() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="p-5 rounded-lg border border-neutral-800 bg-neutral-900/30 animate-pulse"
        >
          <div className="h-5 bg-neutral-800 rounded w-1/3 mb-3" />
          <div className="h-8 bg-neutral-800/60 rounded w-full mb-2" />
          <div className="h-8 bg-neutral-800/60 rounded w-full" />
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="p-10 rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 text-center">
      <div className="text-4xl mb-4" aria-hidden="true">
        🐁
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">
        No feeder stock yet
      </h2>
      <p className="text-sm text-neutral-400 max-w-md mx-auto mb-6">
        Track your freezer full of frozen rodents or a live cricket colony.
        Add a stock, log what you use, and get a heads-up before you run out.
      </p>
      <div className="flex items-center justify-center gap-3">
        <Link
          href="/app/feeders/add"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md herp-gradient-bg text-herp-dark font-bold tracking-wide transition-opacity hover:opacity-90"
        >
          <span aria-hidden="true">＋</span> Add your first stock
        </Link>
        <Link
          href="/app/feeders/catalog"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md border border-neutral-800 bg-neutral-900/40 text-sm text-neutral-300 hover:text-white hover:border-neutral-700 transition-colors"
        >
          Browse catalog
        </Link>
      </div>
    </div>
  )
}
