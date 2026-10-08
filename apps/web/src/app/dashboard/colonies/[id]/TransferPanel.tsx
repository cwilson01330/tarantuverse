'use client'

/**
 * Transfer or sell a colony: the whole thing, or part of it ("25 of 360").
 *
 * Owner-only (the API refuses anyone else). Making a link takes nothing out of
 * the colony; the counts move when the buyer claims, and the API checks them
 * again then, because births and deaths keep being logged in between. We never
 * process the sale: the price is a private note for the seller.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  cancelColonyTransfer,
  createColonyTransfer,
  listColonyTransfers,
  type ColonyResponse,
  type ColonyTransferMode,
  type ColonyTransferRow,
} from '@/lib/colonies'

const inputCls =
  'w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary placeholder-theme-tertiary focus:outline-none focus:ring-2 focus:ring-electric-blue-500'
const BTN_SECONDARY =
  'px-3 py-1.5 rounded-lg border border-theme bg-surface text-theme-primary text-sm hover:bg-surface-elevated transition disabled:opacity-50'

function fmtDate(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : ''
}

function stageWord(stage: string): string {
  return stage.replace(/_/g, ' ')
}

function claimUrlFor(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://tarantuverse.com'
  return `${origin}/claim/${token}`
}

export default function TransferPanel({
  token,
  colony,
}: {
  token: string
  colony: ColonyResponse
}) {
  const [rows, setRows] = useState<ColonyTransferRow[] | null>(null)
  const [listError, setListError] = useState('')
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ColonyTransferMode>('full')
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [includePhotos, setIncludePhotos] = useState(true)
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [claimUrl, setClaimUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [cancelBusy, setCancelBusy] = useState<string | null>(null)

  const stages = useMemo(
    () => Object.entries(colony.stage_counts ?? {}).filter(([, n]) => typeof n === 'number' && n > 0),
    [colony.stage_counts],
  )
  const colonyTotal = stages.reduce((sum, [, n]) => sum + n, 0)
  const approx = colony.count_is_estimated ? '~' : ''

  const partialTotal = stages.reduce((sum, [stage]) => {
    const n = Number.parseInt(counts[stage] ?? '', 10)
    return sum + (Number.isFinite(n) && n > 0 ? n : 0)
  }, 0)

  const refresh = useCallback(async () => {
    try {
      setRows(await listColonyTransfers(token, colony.id))
      setListError('')
    } catch {
      setListError('Couldn’t load this colony’s transfer links.')
    }
  }, [token, colony.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const visible = (rows ?? []).filter((r) => r.status === 'pending' || r.status === 'claimed')

  const openDialog = () => {
    setMode('full')
    setCounts(Object.fromEntries(stages.map(([s]) => [s, '0'])))
    setIncludePhotos(true)
    setPrice('')
    setNote('')
    setError('')
    setClaimUrl(null)
    setCopied(null)
    setOpen(true)
  }

  const partialProblem = (): string | null => {
    for (const [stage, have] of stages) {
      const raw = (counts[stage] ?? '').trim()
      if (raw === '') continue
      const n = Number(raw)
      if (!Number.isInteger(n) || n < 0) return `Enter a whole number for ${stageWord(stage)}.`
      if (n > have) return `You have ${have} ${stageWord(stage)}, so you can hand over at most ${have}.`
    }
    if (partialTotal === 0) return 'Enter how many of at least one stage you’re handing over.'
    if (partialTotal >= colonyTotal) return 'That’s every animal in the colony. Choose Whole colony instead.'
    return null
  }

  const submit = async () => {
    if (busy) return
    setError('')
    let payloadCounts: Record<string, number> | undefined
    if (mode === 'partial') {
      const problem = partialProblem()
      if (problem) {
        setError(problem)
        return
      }
      payloadCounts = {}
      for (const [stage] of stages) {
        const n = Number.parseInt(counts[stage] ?? '', 10)
        if (Number.isFinite(n) && n > 0) payloadCounts[stage] = n
      }
    }
    const priceNum = price.trim() ? Number(price) : null
    if (priceNum != null && (!Number.isFinite(priceNum) || priceNum < 0)) {
      setError('Enter the price as a number, or leave it blank.')
      return
    }
    setBusy(true)
    try {
      const created = await createColonyTransfer(token, colony.id, {
        mode,
        counts: payloadCounts,
        include_photos: includePhotos,
        sale_price: priceNum,
        note: note.trim() || null,
      })
      setClaimUrl(created.claim_url)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the transfer link.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(url)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Clipboard blocked: the link is in a selectable field, so nothing is lost.
    }
  }

  const cancel = async (row: ColonyTransferRow) => {
    if (!confirm('Cancel this transfer link? Anyone holding it won’t be able to claim.')) return
    setCancelBusy(row.token)
    setListError('')
    try {
      await cancelColonyTransfer(token, row.token)
      await refresh()
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Could not cancel the transfer.')
    } finally {
      setCancelBusy(null)
    }
  }

  return (
    <section
      aria-labelledby="transfer-heading"
      className="mb-6 p-6 rounded-2xl border border-theme bg-surface"
    >
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <h2
          id="transfer-heading"
          className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide"
        >
          Transfer or sell
        </h2>
        <button type="button" onClick={openDialog} className={BTN_SECONDARY}>
          Make a claim link
        </button>
      </div>
      <p className="text-sm text-theme-secondary">
        Selling or rehoming the whole colony, or some of it? Make a link the new keeper uses to add
        the animals to their collection. Nothing leaves this colony until they claim. We never
        process the sale.
      </p>

      {listError && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{listError}</p>
      )}

      {visible.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-200 dark:divide-gray-700 border border-theme rounded-xl">
          {visible.map((r) => (
            <li key={r.id} className="p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium text-theme-primary">{r.label ?? 'Transfer'}</p>
                <p className="text-xs text-theme-tertiary">
                  {r.status === 'claimed'
                    ? `Claimed${r.counterparty ? ` by @${r.counterparty}` : ''} ${fmtDate(r.claimed_at)}`
                    : `Waiting to be claimed · link works until ${fmtDate(r.expires_at)}`}
                  {r.sale_price != null && ` · Price (private): ${r.sale_price}`}
                </p>
              </div>
              {r.status === 'pending' && (
                <div className="flex gap-2">
                  <button type="button" className={BTN_SECONDARY} onClick={() => copy(claimUrlFor(r.token))}>
                    {copied === claimUrlFor(r.token) ? 'Copied' : 'Copy link'}
                  </button>
                  <button
                    type="button"
                    className={BTN_SECONDARY}
                    disabled={cancelBusy === r.token}
                    onClick={() => cancel(r)}
                  >
                    {cancelBusy === r.token ? 'Cancelling…' : 'Cancel'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="transfer-dialog-heading"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-theme bg-surface p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="transfer-dialog-heading" className="text-xl font-bold text-theme-primary">
              Transfer {colony.name}
            </h3>

            {!claimUrl ? (
              <>
                <fieldset>
                  <legend className="block text-sm font-medium text-theme-secondary mb-1">
                    What are you handing over?
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {(['full', 'partial'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setMode(m)
                          setError('')
                        }}
                        aria-pressed={mode === m}
                        disabled={m === 'partial' && colonyTotal === 0}
                        className={`px-3 py-1.5 rounded-full border text-sm font-medium transition disabled:opacity-50 ${
                          mode === m
                            ? 'bg-theme-primary border-theme-primary text-surface'
                            : 'border-theme bg-surface text-theme-primary hover:border-primary-400'
                        }`}
                      >
                        {m === 'full' ? 'Whole colony' : 'Part of it'}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {mode === 'full' ? (
                  <p className="text-sm text-theme-secondary">
                    {colonyTotal > 0
                      ? `All ${approx}${colonyTotal.toLocaleString()} animals. When the link is claimed, this colony moves to the new keeper and becomes a transferred record here.`
                      : 'When the link is claimed, this colony moves to the new keeper and becomes a transferred record here.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-theme-secondary">
                      How many of each stage? The rest stay in this colony.
                    </p>
                    {stages.map(([stage, have]) => (
                      <label key={stage} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-theme-primary capitalize">
                          {stageWord(stage)}{' '}
                          <span className="text-theme-tertiary normal-case">of {approx}{have.toLocaleString()}</span>
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={have}
                          step={1}
                          value={counts[stage] ?? '0'}
                          onChange={(e) => setCounts((c) => ({ ...c, [stage]: e.target.value }))}
                          className={`${inputCls} w-28 text-right`}
                          aria-label={`${stageWord(stage)} to hand over`}
                        />
                      </label>
                    ))}
                    <p className="text-sm font-semibold text-theme-primary" aria-live="polite">
                      {partialTotal.toLocaleString()} of {approx}{colonyTotal.toLocaleString()}
                    </p>
                  </div>
                )}

                <label className="flex items-center gap-2 text-sm text-theme-primary">
                  <input
                    type="checkbox"
                    checked={includePhotos}
                    onChange={(e) => setIncludePhotos(e.target.checked)}
                    className="rounded border-theme"
                  />
                  Include this colony’s photos
                </label>

                <label className="block">
                  <span className="block text-sm font-medium text-theme-secondary mb-1">
                    Sale price <span className="text-theme-tertiary font-normal">Private, for your records only</span>
                  </span>
                  <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    inputMode="decimal"
                    placeholder="Optional"
                    className={inputCls}
                  />
                </label>

                <label className="block">
                  <span className="block text-sm font-medium text-theme-secondary mb-1">
                    Note to the new keeper <span className="text-theme-tertiary font-normal">Optional</span>
                  </span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 2000))}
                    rows={2}
                    className={inputCls}
                  />
                </label>

                {error && (
                  <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
                )}

                <button
                  type="button"
                  onClick={submit}
                  disabled={busy}
                  className="w-full py-3 rounded-xl bg-theme-primary text-surface font-semibold disabled:opacity-60"
                >
                  {busy ? 'Making link…' : 'Make claim link'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="w-full text-sm text-theme-tertiary hover:underline"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-theme-secondary">
                  Send this link to the new keeper. The link works for 30 days, and you can cancel it
                  from this page until it’s claimed.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={claimUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className={`${inputCls} text-xs font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => copy(claimUrl)}
                    className="px-3 py-2 rounded-lg bg-theme-primary text-surface text-sm font-semibold whitespace-nowrap"
                  >
                    {copied === claimUrl ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full py-2 rounded-xl border border-theme bg-surface text-theme-primary font-semibold hover:bg-surface-elevated transition"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
