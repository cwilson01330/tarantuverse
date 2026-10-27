'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Banknote } from 'lucide-react'
import { ADD_PAID_LINK, formatMoney, moneyCard, type AdvancedAnalytics } from '@/lib/analyticsView'
import { CARD, CardHeading, OUTLINE_BTN, SAMPLE_CARD, TERTIARY } from './AnalyticsParts'

/** The default the API falls back to when a keeper has not set their own cost per feeding. */
const DEFAULT_COST = 0.5

type MoneyFigureProps = { value: string; caption: string; sub: string | null; muted?: boolean }

function MoneyFigure({ value, caption, sub, muted }: MoneyFigureProps) {
  return (
    <div className="min-w-0">
      <div className={`text-2xl font-bold leading-8 ${muted ? TERTIARY : 'text-theme-primary'}`}>{value}</div>
      <div className={`text-[11px] ${TERTIARY}`}>{caption}</div>
      {sub && <div className={`truncate text-[11px] ${TERTIARY}`}>{sub}</div>}
    </div>
  )
}

/**
 * Money (Premium): spent this month, paid for animals, and the estimated
 * feeding cost with its Change control. Plain numbers in the keeper's own
 * currency, no symbol. Modes:
 *   member  - the real card; Change saves through `onSaveCost` (page refetches /advanced/ only)
 *   preview - only what was paid in total (free keeper behind the blur)
 *   sample  - the grey sample figures, nothing editable
 */
export default function MoneyCard(
  props:
    | { mode: 'member'; data: AdvancedAnalytics; onSaveCost: (value: number | null) => Promise<void> }
    | { mode: 'preview'; paid: { paid: string; caption: string } }
    | { mode: 'sample'; data: AdvancedAnalytics },
) {
  // Cost-per-feeding editor (moved unchanged from the old Advanced page).
  const [editingCost, setEditingCost] = useState(false)
  const [costDraft, setCostDraft] = useState('')
  const [savingCost, setSavingCost] = useState(false)
  const [costError, setCostError] = useState<string | null>(null)

  if (props.mode === 'preview') {
    return (
      <section aria-label="Money" className={`${CARD} flex flex-col gap-3 px-5 py-[18px]`}>
        <CardHeading icon={Banknote} title="Money" trailing="your currency · private" />
        <MoneyFigure value={props.paid.paid} caption={props.paid.caption} sub={null} />
      </section>
    )
  }

  const data = props.data
  const model = moneyCard(data)
  const muted = props.mode === 'sample'
  const frame = muted ? SAMPLE_CARD : CARD

  const save = async (value: number | null) => {
    if (props.mode !== 'member') return
    setSavingCost(true)
    setCostError(null)
    try {
      await props.onSaveCost(value)
      setEditingCost(false)
    } catch {
      setCostError("Couldn't save that. Try again.")
    } finally {
      setSavingCost(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const n = Number(costDraft.replace(',', '.').replace(/[^0-9.]/g, ''))
    if (costDraft.trim() === '' || !Number.isFinite(n) || n < 0 || n > 1000) {
      setCostError('Enter an amount from 0 to 1000.')
      return
    }
    save(Math.round(n * 100) / 100)
  }

  const cost = data.cost_per_feeding ?? DEFAULT_COST

  return (
    <section aria-label="Money" className={`${frame} flex flex-col gap-3.5 px-5 py-[18px]`}>
      <CardHeading icon={Banknote} title="Money" trailing={model.trailing} />

      <div className="grid grid-cols-2 gap-4">
        <MoneyFigure value={model.spent.value} caption={model.spent.caption} sub={model.spent.sub} muted={muted} />
        <div className="min-w-0">
          <MoneyFigure value={model.paid.value} caption={model.paid.caption} sub={model.paid.sub} muted={muted} />
          {model.paid.addLink && !muted && (
            <Link
              href="/dashboard/tarantulas"
              className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))]"
            >
              {ADD_PAID_LINK}
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-solid border-theme pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] text-theme-secondary">
              {model.feeding.label}{' '}
              <span className={`font-bold ${muted ? TERTIARY : 'text-theme-primary'}`}>{model.feeding.value}</span>
            </div>
            {model.feeding.caption && <div className={`text-[11px] ${TERTIARY}`}>{model.feeding.caption}</div>}
          </div>
          {props.mode === 'member' && !editingCost && (
            <button
              type="button"
              className={OUTLINE_BTN}
              onClick={() => {
                setCostDraft(cost.toFixed(2))
                setCostError(null)
                setEditingCost(true)
              }}
            >
              Change
            </button>
          )}
        </div>

        {props.mode === 'member' && editingCost && (
          <form onSubmit={submit} className="space-y-2">
            <label className="block text-xs font-medium text-theme-secondary">
              Cost per feeding
              <div className="mt-1">
                <input
                  type="text"
                  inputMode="decimal"
                  value={costDraft}
                  onChange={(e) => setCostDraft(e.target.value)}
                  autoFocus
                  aria-describedby="feeding-cost-help"
                  className="min-h-[44px] w-28 rounded-preset-sm border border-solid border-theme bg-surface px-3 text-sm text-theme-primary"
                />
              </div>
            </label>
            <p id="feeding-cost-help" className={`text-xs ${TERTIARY}`}>
              What one meal costs you on average. 0 if you breed your own feeders.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={savingCost}
                className="btn-primary-preset inline-flex min-h-[44px] items-center px-4 text-sm font-semibold disabled:opacity-60"
              >
                {savingCost ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className={OUTLINE_BTN}
                onClick={() => {
                  setEditingCost(false)
                  setCostError(null)
                }}
              >
                Cancel
              </button>
              {data.cost_per_feeding_is_default === false && (
                <button
                  type="button"
                  disabled={savingCost}
                  onClick={() => save(null)}
                  className="inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-theme-secondary hover:underline disabled:opacity-60"
                >
                  Use default ({formatMoney(DEFAULT_COST)})
                </button>
              )}
            </div>
            {costError && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                {costError}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  )
}
