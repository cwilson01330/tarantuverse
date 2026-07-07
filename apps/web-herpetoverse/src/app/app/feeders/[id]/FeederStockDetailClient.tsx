'use client'

/**
 * Feeder stock detail (ADR-012).
 *
 * Shows one stock's full state — per-bucket (or single count) inventory with
 * Used/Restock quick actions, storage/threshold metadata, and the full log
 * history with delete. Data lives in localStorage-token land, so this is a
 * client component fed an id by the server page wrapper (Next 15 params).
 *
 * The quick actions and history use the same lib/feeders helpers as the list
 * page; after every mutating action we refetch the stock (and reload logs) so
 * the numbers stay authoritative from the server.
 */

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '@/lib/apiClient'
import {
  type FeederLog,
  type FeederLogType,
  type FeederStock,
  deleteFeederLog,
  deleteFeederStock,
  feederStockTitle,
  fmtFeederDate,
  getFeederStock,
  listFeederLogs,
  logFeederRestock,
  logFeederUsed,
  sizedBucketEntries,
  capitalize,
} from '@/lib/feeders'
import { useRouter } from 'next/navigation'

const LOG_TYPE_LABELS: Record<FeederLogType, string> = {
  restock: 'Restocked',
  used: 'Used',
  cleaned: 'Cleaned',
  bred: 'Bred',
  died: 'Died',
  count_correction: 'Corrected',
}

const LOG_TYPE_GLYPH: Record<FeederLogType, string> = {
  restock: '＋',
  used: '−',
  cleaned: '🧹',
  bred: '🐣',
  died: '☠',
  count_correction: '✎',
}

export default function FeederStockDetailClient({ stockId }: { stockId: string }) {
  const router = useRouter()
  const [stock, setStock] = useState<FeederStock | null>(null)
  const [logs, setLogs] = useState<FeederLog[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [deleting, setDeleting] = useState(false)

  const loadStock = useCallback(async () => {
    try {
      const s = await getFeederStock(stockId)
      setStock(s)
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : 'Could not load this stock.',
      )
    }
  }, [stockId])

  const loadLogs = useCallback(async () => {
    try {
      const l = await listFeederLogs(stockId)
      // Newest first.
      l.sort((a, b) => b.logged_at.localeCompare(a.logged_at))
      setLogs(l)
    } catch {
      setLogs([])
    }
  }, [stockId])

  useEffect(() => {
    loadStock()
    loadLogs()
  }, [loadStock, loadLogs])

  const runAction = useCallback(
    async (kind: 'used' | 'restock', size: string | undefined, amount: number) => {
      const key = size ? `${kind}:${size}` : kind
      setBusy((b) => ({ ...b, [key]: true }))
      setActionError(null)
      try {
        if (kind === 'used') await logFeederUsed(stockId, amount, size)
        else await logFeederRestock(stockId, amount, size)
        await Promise.all([loadStock(), loadLogs()])
      } catch (err) {
        setActionError(
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
    [stockId, loadStock, loadLogs],
  )

  const handleDeleteLog = useCallback(
    async (logId: string) => {
      if (typeof window !== 'undefined') {
        const ok = window.confirm(
          'Delete this log entry? This does not change the current count.',
        )
        if (!ok) return
      }
      try {
        await deleteFeederLog(logId)
        await Promise.all([loadStock(), loadLogs()])
      } catch (err) {
        setActionError(
          err instanceof ApiError ? err.message : 'Could not delete the entry.',
        )
      }
    },
    [loadStock, loadLogs],
  )

  const handleDeleteStock = useCallback(async () => {
    if (!stock) return
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Delete "${feederStockTitle(stock)}" and all its history? This can't be undone.`,
      )
      if (!ok) return
    }
    setDeleting(true)
    try {
      await deleteFeederStock(stock.id)
      router.push('/app/feeders')
    } catch (err) {
      setDeleting(false)
      setActionError(
        err instanceof ApiError ? err.message : 'Could not delete this stock.',
      )
    }
  }, [stock, router])

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto">
        <Link
          href="/app/feeders"
          className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          ← Back to feeder stock
        </Link>
        <div
          role="alert"
          className="mt-4 p-4 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
        >
          {loadError}
          <button
            type="button"
            onClick={() => {
              setLoadError(null)
              loadStock()
              loadLogs()
            }}
            className="ml-3 underline"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!stock) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="h-6 bg-neutral-800 rounded w-1/3 mb-4 animate-pulse" />
        <div className="h-40 bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse" />
      </div>
    )
  }

  const isSized = stock.inventory_mode === 'sized'

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/app/feeders"
        className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        ← Back to feeder stock
      </Link>

      {/* Header */}
      <header className="mt-3 mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-3xl font-bold tracking-wide text-white truncate">
              {feederStockTitle(stock)}
            </h1>
            <FormBadge form={stock.form} />
            {stock.is_low_stock && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">
                Low stock
              </span>
            )}
          </div>
          {stock.species_display_name && (
            <p className="text-sm text-neutral-500">
              {stock.species_display_name}
            </p>
          )}
        </div>
        <Link
          href={`/app/feeders/${stock.id}/edit`}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-neutral-800 bg-neutral-900/40 text-sm text-neutral-300 hover:text-white hover:border-neutral-700 transition-colors"
        >
          Edit
        </Link>
      </header>

      {actionError && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
        >
          {actionError}
        </div>
      )}

      {/* Inventory panel */}
      <section className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/40 mb-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-herp-lime/80 font-medium">
            Inventory
          </h2>
          <div className="text-right">
            <span className="text-2xl font-bold text-white">
              {stock.total_count}
            </span>
            <span className="text-xs text-neutral-500 ml-1.5">total</span>
          </div>
        </div>

        {isSized ? (
          <ul className="space-y-2">
            {sizedBucketEntries(stock.sized_counts).length === 0 ? (
              <li className="text-sm text-neutral-500 italic">
                No sizes yet — restock below to add a bucket.
              </li>
            ) : (
              sizedBucketEntries(stock.sized_counts).map(([size, n]) => (
                <li
                  key={size}
                  className="flex items-center justify-between gap-3 py-2 px-3 rounded-md bg-neutral-950/60 border border-neutral-800"
                >
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-sm font-medium text-neutral-200 truncate">
                      {capitalize(size)}
                    </span>
                    <span
                      className={`text-sm font-bold ${
                        n <= 0 ? 'text-neutral-600' : 'text-white'
                      }`}
                    >
                      {n}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ActionBtn
                      label="−1"
                      title={`Used one ${size}`}
                      disabled={!!busy[`used:${size}`] || n <= 0}
                      onClick={() => runAction('used', size, 1)}
                      variant="used"
                    />
                    <ActionBtn
                      label="Used…"
                      title={`Log multiple ${size} used`}
                      disabled={!!busy[`used:${size}`] || n <= 0}
                      onClick={() =>
                        promptAmount(`How many ${capitalize(size)} did you use?`, (amt) =>
                          runAction('used', size, amt),
                        )
                      }
                      variant="used"
                    />
                    <ActionBtn
                      label="+ Restock"
                      title={`Restock ${size}`}
                      disabled={!!busy[`restock:${size}`]}
                      onClick={() =>
                        promptAmount(`How many ${capitalize(size)} did you add?`, (amt) =>
                          runAction('restock', size, amt),
                        )
                      }
                      variant="restock"
                    />
                  </div>
                </li>
              ))
            )}

            {/* Add-a-new-size restock (sized only) */}
            <li className="pt-1">
              <button
                type="button"
                onClick={() =>
                  promptNewBucket((size, amt) => runAction('restock', size, amt))
                }
                className="text-xs text-herp-teal hover:text-herp-lime transition-colors"
              >
                ＋ Restock a new size
              </button>
            </li>
          </ul>
        ) : (
          <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-md bg-neutral-950/60 border border-neutral-800">
            <span className="text-sm text-neutral-400">
              {stock.total_count <= 0 ? 'Out of stock' : 'On hand'}
            </span>
            <div className="flex items-center gap-1.5">
              <ActionBtn
                label="−1"
                title="Used one"
                disabled={!!busy['used'] || stock.total_count <= 0}
                onClick={() => runAction('used', undefined, 1)}
                variant="used"
              />
              <ActionBtn
                label="Used…"
                title="Log multiple used"
                disabled={!!busy['used'] || stock.total_count <= 0}
                onClick={() =>
                  promptAmount('How many did you use?', (amt) =>
                    runAction('used', undefined, amt),
                  )
                }
                variant="used"
              />
              <ActionBtn
                label="+ Restock"
                title="Restock"
                disabled={!!busy['restock']}
                onClick={() =>
                  promptAmount('How many did you add?', (amt) =>
                    runAction('restock', undefined, amt),
                  )
                }
                variant="restock"
              />
            </div>
          </div>
        )}
      </section>

      {/* Meta */}
      <section className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/40 mb-6">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-herp-lime/80 font-medium mb-4">
          Details
        </h2>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <Meta label="Form" value={stock.form === 'frozen' ? 'Frozen' : 'Live'} />
          <Meta
            label="Mode"
            value={isSized ? 'By size' : 'Single count'}
          />
          <Meta
            label="Storage"
            value={stock.storage_location || '—'}
          />
          <Meta
            label="Low below"
            value={stock.low_threshold != null ? String(stock.low_threshold) : '—'}
          />
          <Meta
            label="Last restocked"
            value={fmtFeederDate(stock.last_restocked) || '—'}
          />
          <Meta
            label="Last used"
            value={fmtFeederDate(stock.last_used) || '—'}
          />
        </dl>
        {stock.notes && (
          <div className="mt-4 pt-4 border-t border-neutral-800">
            <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1">
              Notes
            </p>
            <p className="text-sm text-neutral-300 whitespace-pre-wrap">
              {stock.notes}
            </p>
          </div>
        )}
      </section>

      {/* History */}
      <section className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/40 mb-6">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-herp-lime/80 font-medium mb-4">
          History
        </h2>
        {logs === null ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-neutral-500 italic">
            No activity yet. Used and restock actions show up here.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-800">
            {logs.map((log) => (
              <li
                key={log.id}
                className="py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span aria-hidden="true" className="text-neutral-500">
                      {LOG_TYPE_GLYPH[log.log_type] ?? '•'}
                    </span>
                    <span className="text-neutral-200 font-medium">
                      {LOG_TYPE_LABELS[log.log_type] ?? log.log_type}
                    </span>
                    {log.size && (
                      <span className="text-neutral-400">
                        {capitalize(log.size)}
                      </span>
                    )}
                    {log.count_delta != null && log.count_delta !== 0 && (
                      <span
                        className={
                          log.count_delta < 0
                            ? 'text-neutral-400'
                            : 'text-herp-lime'
                        }
                      >
                        {log.count_delta > 0 ? '+' : ''}
                        {log.count_delta}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {fmtFeederDate(log.logged_at) || ''}
                    {log.notes ? ` · ${log.notes}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteLog(log.id)}
                  className="flex-shrink-0 p-1.5 rounded-md text-neutral-600 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  aria-label="Delete log entry"
                  title="Delete entry"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Danger zone */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleDeleteStock}
          disabled={deleting}
          className="text-sm text-red-400/80 hover:text-red-300 transition-colors disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete this stock'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers + primitives
// ---------------------------------------------------------------------------

function promptAmount(question: string, onValue: (amount: number) => void) {
  if (typeof window === 'undefined') return
  const raw = window.prompt(question, '1')
  if (raw == null) return
  const n = Math.floor(Number(raw.trim()))
  if (!Number.isFinite(n) || n <= 0) return
  onValue(n)
}

/** Two-step prompt to restock a brand-new size bucket. */
function promptNewBucket(onValue: (size: string, amount: number) => void) {
  if (typeof window === 'undefined') return
  const size = window.prompt('New size name (e.g. jumbo)')?.trim()
  if (!size) return
  const raw = window.prompt(`How many ${capitalize(size)} did you add?`, '1')
  if (raw == null) return
  const n = Math.floor(Number(raw.trim()))
  if (!Number.isFinite(n) || n <= 0) return
  onValue(size, n)
}

function ActionBtn({
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
