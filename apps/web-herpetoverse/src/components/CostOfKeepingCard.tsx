'use client'

/**
 * "Cost of keeping" on a Herpetoverse animal detail page (spec 2026-10-22 §3):
 * purchase price, this animal's share of supplies by category, the total, and
 * (click to expand) the expenses behind it. Shown on died and transferred
 * animals too. Dark copy of apps/web/src/components/CostOfKeepingCard.tsx.
 *
 * The CALLER mounts this only for a viewer whose role is keeper or above
 * (`can(role, 'keeper')`), so loggers, viewers and visitors cost no request.
 * It renders when `can_add` or there is at least one share; otherwise nothing
 * (no upgrade prompt on detail pages). The card is an extra: a failed load
 * renders nothing rather than an error. The purchase price comes from the
 * response, never from the animal record the page already holds.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { EXPENSE_CATEGORIES, categoryLabel, formatMoney, getAnimalCost, type AnimalCost } from '@/lib/expenses'
import { fmtDay } from '@/lib/lifecycle'
import { useAuth } from '@/lib/auth'

/** `ownerId` = the animal's owner; when it isn't the signed-in keeper, the link opens THAT owner's ledger. */
export default function CostOfKeepingCard({ animalId, ownerId }: { animalId: string; ownerId?: string | null }) {
  const { user } = useAuth()
  const [cost, setCost] = useState<AnimalCost | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let alive = true
    setCost(null)
    setExpanded(false)
    getAnimalCost({ animal_id: animalId })
      .then((c) => alive && setCost(c))
      .catch(() => alive && setCost(null))
    return () => {
      alive = false
    }
  }, [animalId])

  if (!cost || !(cost.can_add || cost.shares.length > 0)) return null

  const otherOwner = ownerId && user?.id && ownerId !== user.id ? ownerId : null
  const categories = EXPENSE_CATEGORIES.filter((c) => (cost.by_category[c.key] ?? 0) !== 0)
  const hasAnything = cost.purchase_price !== null || cost.shares.length > 0

  return (
    <section aria-labelledby="cost-of-keeping-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2
          id="cost-of-keeping-heading"
          className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium"
        >
          Cost of keeping
        </h2>
        <Link
          href={otherOwner ? `/app/expenses?collection=${encodeURIComponent(otherOwner)}` : '/app/expenses'}
          className="text-sm font-medium text-herp-teal hover:text-herp-lime transition-colors">
          {cost.can_add ? 'Add expense' : 'Expenses'}
        </Link>
      </div>

      <div className="p-4 rounded-lg border border-neutral-800 bg-neutral-900/40">
        {hasAnything ? (
          <>
            <dl className="divide-y divide-neutral-800/70 text-sm">
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
                  className="mt-3 text-sm font-medium text-herp-teal hover:text-herp-lime transition-colors"
                >
                  {expanded
                    ? 'Hide expenses'
                    : `Show the ${cost.shares.length} ${cost.shares.length === 1 ? 'expense' : 'expenses'} behind this`}
                </button>
                {expanded && (
                  <ul className="mt-2 divide-y divide-neutral-800/70 text-sm">
                    {cost.shares.map((s) => (
                      <li key={`${s.expense_id}-${s.spent_on}`} className="flex items-start justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-neutral-100">{s.description}</p>
                          <p className="text-xs text-neutral-500">
                            {fmtDay(s.spent_on)}
                            {' · '}
                            {categoryLabel(s.category)}
                          </p>
                        </div>
                        <span className="tabular-nums text-neutral-100">{formatMoney(s.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        ) : (
          <p className="text-sm text-neutral-500">
            Nothing logged yet. Split an expense across this animal to see what it costs to keep.
          </p>
        )}
      </div>
    </section>
  )
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <dt className={muted ? 'text-neutral-500' : 'text-neutral-300'}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-bold text-white' : 'text-neutral-100'}`}>{value}</dd>
    </div>
  )
}
