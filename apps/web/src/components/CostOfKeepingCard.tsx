'use client'

/**
 * "Cost of keeping" on an invert or colony detail page (spec 2026-10-22 §3):
 * purchase price, this animal's share of supplies by category, the total, and
 * (tap to expand) the expenses behind it. Shown on died and transferred
 * animals too.
 *
 * The CALLER mounts this only for a viewer whose role is keeper or above
 * (`can(role, 'keeper')`), so loggers, viewers and visitors cost no request.
 * It renders when `can_add` or there is at least one share; otherwise nothing
 * (no upgrade prompt on detail pages). The card is an extra: a failed load
 * renders nothing rather than an error.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { EXPENSE_CATEGORIES, categoryLabel, formatMoney, getAnimalCost, type AnimalCost } from '@/lib/expenses'
import { formatLocalDate } from '@/lib/date'
import { useAuth } from '@/hooks/useAuth'

interface Props {
  kind: 'invert' | 'colony'
  id: string
  /** The animal's owner. When it isn't the signed-in keeper, the link opens THAT owner's ledger. */
  ownerId?: string | null
  /** Bottom margin, to match the neighbouring cards: the invert page's section cards use mb-4, the colony page's mb-6. */
  spacing?: 'mb-4' | 'mb-6'
}

export default function CostOfKeepingCard({ kind, id, ownerId, spacing = 'mb-4' }: Props) {
  const { user } = useAuth()
  const [cost, setCost] = useState<AnimalCost | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let alive = true
    setCost(null)
    setExpanded(false)
    getAnimalCost(kind === 'invert' ? { invert_id: id } : { colony_id: id })
      .then((c) => alive && setCost(c))
      .catch(() => alive && setCost(null))
    return () => {
      alive = false
    }
  }, [kind, id])

  if (!cost || !(cost.can_add || cost.shares.length > 0)) return null

  const otherOwner = ownerId && user?.id && ownerId !== user.id ? ownerId : null
  const categories = EXPENSE_CATEGORIES.filter((c) => (cost.by_category[c.key] ?? 0) !== 0)
  const hasAnything = cost.purchase_price !== null || cost.shares.length > 0

  return (
    <section
      aria-labelledby="cost-of-keeping-heading"
      className={`bg-surface border border-theme rounded-2xl p-5 ${spacing}`}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 id="cost-of-keeping-heading" className="text-lg font-bold text-theme-primary">
          Cost of keeping
        </h2>
        <Link
          href={otherOwner ? `/dashboard/expenses?collection=${encodeURIComponent(otherOwner)}` : '/dashboard/expenses'}
          className="text-sm font-semibold text-primary-600 hover:underline"
        >
          {cost.can_add ? 'Add expense' : 'Expenses'}
        </Link>
      </div>

      {hasAnything ? (
        <>
          <dl className="text-sm">
            {cost.purchase_price !== null && (
              <Row label="Purchase price" value={formatMoney(cost.purchase_price)} />
            )}
            {categories.map((c) => (
              <Row key={c.key} label={c.label} value={formatMoney(cost.by_category[c.key])} muted />
            ))}
            <Row label="Total" value={formatMoney(cost.total)} strong />
          </dl>

          {cost.shares.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="mt-3 text-sm font-semibold text-primary-600 hover:underline"
              >
                {expanded
                  ? 'Hide expenses'
                  : `Show the ${cost.shares.length} ${cost.shares.length === 1 ? 'expense' : 'expenses'} behind this`}
              </button>
              {expanded && (
                <ul className="mt-2 text-sm">
                  {cost.shares.map((s) => (
                    <li key={`${s.expense_id}-${s.spent_on}`} className="flex items-start justify-between gap-3 py-2 border-b border-theme last:border-0">
                      <div className="min-w-0">
                        <p className="truncate text-theme-primary">{s.description}</p>
                        <p className="text-xs text-theme-tertiary">
                          {formatLocalDate(s.spent_on, { month: 'short', day: 'numeric', year: 'numeric' })}
                          {' · '}
                          {categoryLabel(s.category)}
                        </p>
                      </div>
                      <span className="tabular-nums text-theme-primary">{formatMoney(s.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      ) : (
        <p className="text-sm text-theme-tertiary">
          Nothing logged yet. Split an expense across this {kind === 'colony' ? 'colony' : 'animal'} to see what it
          costs to keep.
        </p>
      )}
    </section>
  )
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-theme last:border-0">
      <dt className={muted ? 'text-theme-tertiary' : 'text-theme-secondary'}>{label}</dt>
      <dd
        className={`tabular-nums ${
          strong ? 'font-bold text-theme-primary' : 'text-theme-primary'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
