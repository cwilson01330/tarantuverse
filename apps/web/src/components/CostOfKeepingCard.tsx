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
}

export default function CostOfKeepingCard({ kind, id, ownerId }: Props) {
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
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 mb-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 id="cost-of-keeping-heading" className="text-lg font-bold text-gray-900 dark:text-white">
          Cost of keeping
        </h2>
        <Link
          href={otherOwner ? `/dashboard/expenses?collection=${encodeURIComponent(otherOwner)}` : '/dashboard/expenses'}
          className="text-sm font-semibold text-primary-700 dark:text-primary-400 hover:underline"
        >
          {cost.can_add ? 'Add expense' : 'Expenses'}
        </Link>
      </div>

      {hasAnything ? (
        <>
          <dl className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
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
                className="mt-3 text-sm font-semibold text-primary-700 dark:text-primary-400 hover:underline"
              >
                {expanded
                  ? 'Hide expenses'
                  : `Show the ${cost.shares.length} ${cost.shares.length === 1 ? 'expense' : 'expenses'} behind this`}
              </button>
              {expanded && (
                <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-700 text-sm">
                  {cost.shares.map((s) => (
                    <li key={`${s.expense_id}-${s.spent_on}`} className="flex items-start justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-gray-900 dark:text-white">{s.description}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatLocalDate(s.spent_on, { month: 'short', day: 'numeric', year: 'numeric' })}
                          {' · '}
                          {categoryLabel(s.category)}
                        </p>
                      </div>
                      <span className="tabular-nums text-gray-900 dark:text-white">{formatMoney(s.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Nothing logged yet. Split an expense across this {kind === 'colony' ? 'colony' : 'animal'} to see what it
          costs to keep.
        </p>
      )}
    </section>
  )
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <dt className={muted ? 'text-gray-500 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'}>{label}</dt>
      <dd
        className={`tabular-nums ${
          strong ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-900 dark:text-white'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
