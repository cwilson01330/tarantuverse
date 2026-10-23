'use client'

/**
 * Expenses (spec 2026-10-22 §3): this month / last month, a category bar from
 * /expenses/summary, the list grouped by month with category chips, and
 * "Add expense". Herpetoverse copy of apps/web/src/app/dashboard/expenses/page.tsx
 * in HV's dark styling (app = 'herpetoverse', animals only, no colonies).
 *
 * States, all driven by the list response's `can_add` (the collection OWNER's
 * Premium, which is the only way a co-keeper can see it):
 *   free, no history     -> explainer + Upgrade button
 *   lapsed, has history  -> history read-only (no Edit), Upgrade button where "Add" was
 *   premium, empty       -> empty state with "Add your first expense"
 *   premium, has data    -> everything
 * Co-keepers with the keeper role (and a live owner plan) get a collection
 * picker: their own collection plus every shared HV collection they may write to.
 *
 * Paging: the first page is fetched by an effect keyed on collection / category
 * / refresh; "Load more" appends. Every response is checked against a
 * generation counter so a slow page from a collection, filter or reload the
 * keeper has already left can never land in the current list.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import UpgradeModal from '@/components/UpgradeModal'
import ExpenseForm, { splitText } from '@/components/ExpenseForm'
import { useAuth } from '@/lib/auth'
import { MEMBER_APP, loadSharedWithMe, type SharedCollection } from '@/lib/coKeepers'
import { fmtDay } from '@/lib/lifecycle'
import {
  EXPENSE_CATEGORIES,
  categoryLabel,
  deleteExpense,
  formatMoney,
  getExpenseSummary,
  listExpenses,
  type Expense,
  type ExpenseCategory,
  type ExpenseSummary,
} from '@/lib/expenses'

const PAGE_SIZE = 50

const BTN = 'px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50'
const BTN_PRIMARY = `${BTN} border border-herp-teal/40 bg-herp-teal/10 text-herp-teal hover:bg-herp-teal/20 hover:border-herp-teal/60`
const BTN_GRADIENT = `${BTN} herp-gradient-bg text-herp-dark font-bold tracking-wide hover:opacity-90`
const BTN_SECONDARY = `${BTN} border border-neutral-800 bg-neutral-900 text-neutral-100 hover:bg-neutral-800`
const CARD = 'rounded-lg border border-neutral-800 bg-neutral-900/40'

const CATEGORY_COLOR: Record<ExpenseCategory, string> = {
  feeders: 'bg-amber-500',
  substrate_decor: 'bg-emerald-500',
  enclosures_equipment: 'bg-sky-500',
  heat_lighting: 'bg-orange-500',
  health_vet: 'bg-rose-500',
  shipping: 'bg-violet-500',
  other: 'bg-neutral-500',
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map((p) => Number.parseInt(p, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m)) return key
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default function ExpensesPage() {
  const router = useRouter()
  const { token, isLoading } = useAuth()

  const [shared, setShared] = useState<SharedCollection[]>([])
  // Owner's user id of the collection being viewed; null = your own.
  const [collection, setCollection] = useState<string | null>(null)
  const [category, setCategory] = useState<ExpenseCategory | 'all'>('all')

  const [summary, setSummary] = useState<ExpenseSummary | null>(null)
  const [items, setItems] = useState<Expense[]>([])
  const [total, setTotal] = useState(0)
  const [canAdd, setCanAdd] = useState(true)
  // True once an UNFILTERED list showed any expense: tells "free, never used it"
  // from "lapsed with history" even while a category filter is on.
  const [anyHistory, setAnyHistory] = useState(false)
  const [listLoading, setListLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  // Bumped each time a first-page load starts; a response whose number is no
  // longer current belongs to a list the keeper has left.
  const listGen = useRef(0)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (isLoading) return
    if (!token) router.replace('/login?next=/app/expenses')
  }, [isLoading, token, router])

  // Collections this keeper may log into: shared HV collections where they are
  // a keeper and the owner's plan hasn't made it read-only.
  useEffect(() => {
    if (!token) return
    let alive = true
    loadSharedWithMe(token).then((s) => {
      if (!alive) return
      const list = (s?.collections ?? []).filter((c) => c.app === MEMBER_APP && c.role === 'keeper' && !c.read_only)
      setShared(list)
      // `?collection=<owner id>` (the Cost of keeping card on a shared animal)
      // opens that owner's ledger, but only if it is one we may write to.
      const wanted = new URLSearchParams(window.location.search).get('collection')
      if (wanted && list.some((c) => c.owner.id === wanted)) {
        setItems([])
        setTotal(0)
        setSummary(null)
        setAnyHistory(false)
        setListLoading(true)
        setCollection(wanted)
      }
    })
    return () => {
      alive = false
    }
  }, [token])

  // Summary (unfiltered by category): totals and the category bar.
  useEffect(() => {
    if (!token) return
    let alive = true
    getExpenseSummary({ app: 'herpetoverse', collection })
      .then((s) => alive && setSummary(s))
      .catch(() => alive && setSummary(null))
    return () => {
      alive = false
    }
  }, [token, collection, refreshKey])

  // First page of the list.
  useEffect(() => {
    if (!token) return
    let alive = true
    const gen = ++listGen.current
    setListLoading(true)
    setLoadingMore(false)
    setError(null)
    listExpenses({
      app: 'herpetoverse',
      collection,
      category: category === 'all' ? undefined : category,
      limit: PAGE_SIZE,
    })
      .then((res) => {
        if (!alive) return
        setItems(res.items)
        setTotal(res.total)
        setCanAdd(res.can_add)
        if (category === 'all') setAnyHistory(res.total > 0)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load your expenses.')
      })
      .finally(() => {
        if (alive) setListLoading(false)
      })
    return () => {
      alive = false
      // Invalidate any "Load more" still in flight for this list.
      if (listGen.current === gen) listGen.current += 1
    }
  }, [token, collection, category, refreshKey])

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const loadMore = async () => {
    const gen = listGen.current
    setLoadingMore(true)
    try {
      const res = await listExpenses({
        app: 'herpetoverse',
        collection,
        category: category === 'all' ? undefined : category,
        limit: PAGE_SIZE,
        offset: items.length,
      })
      if (gen !== listGen.current) return
      setItems((prev) => [...prev, ...res.items])
      setTotal(res.total)
    } catch (e) {
      if (gen !== listGen.current) return
      setActionError(e instanceof Error ? e.message : 'Could not load more.')
    } finally {
      if (gen === listGen.current) setLoadingMore(false)
    }
  }

  // Switching collection empties the list at once, so another owner's rows are
  // never shown (or appended to) under the new collection. A category change
  // keeps the rows (dimmed) until the filtered page arrives, so the chips stay.
  const chooseCollection = (value: string) => {
    setItems([])
    setTotal(0)
    setActionError(null)
    setListLoading(true)
    setCollection(value || null)
    setCategory('all')
    setAnyHistory(false)
    setSummary(null)
  }

  const chooseCategory = (next: ExpenseCategory | 'all') => {
    if (next !== category) setCategory(next)
  }

  const openAdd = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (e: Expense) => {
    setEditing(e)
    setFormOpen(true)
  }

  const closeForm = useCallback(() => setFormOpen(false), [])

  const handleDelete = async (e: Expense) => {
    if (!window.confirm(`Delete “${e.description}” (${formatMoney(e.amount)})? Its share of each animal's cost goes with it.`)) return
    setActionError(null)
    try {
      await deleteExpense(e.id)
      refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete that expense.')
    }
  }

  const now = new Date()
  const thisKey = monthKey(now)
  const lastKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  const monthTotal = (key: string): number => summary?.by_month.find((m) => m.month === key)?.total ?? 0

  const categoryTotals = useMemo(() => {
    const by = summary?.by_category ?? {}
    return EXPENSE_CATEGORIES.map((c) => ({ ...c, amount: by[c.key] ?? 0 })).filter((c) => c.amount > 0)
  }, [summary])
  const categorySum = categoryTotals.reduce((s, c) => s + c.amount, 0)

  const groups = useMemo(() => {
    const out: { key: string; rows: Expense[] }[] = []
    for (const e of items) {
      const key = e.spent_on.slice(0, 7)
      const last = out[out.length - 1]
      if (last && last.key === key) last.rows.push(e)
      else out.push({ key, rows: [e] })
    }
    return out
  }, [items])

  const viewingShared = collection !== null
  const ownerName = shared.find((c) => c.owner.id === collection)?.owner.name ?? 'the owner'
  const fullyLoaded = items.length >= total
  const showFreeExplainer = !listLoading && !error && !canAdd && !anyHistory

  const upgradeButton = (
    <button type="button" onClick={() => setUpgradeOpen(true)} className={BTN_GRADIENT}>
      💎 Upgrade to add expenses
    </button>
  )

  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.2em] uppercase text-herp-lime font-medium mb-2">Expenses</p>
          <h1 className="text-3xl font-bold text-white">What your animals cost</h1>
        </div>
        {!showFreeExplainer && !listLoading && !error && (
          canAdd ? (
            <button type="button" onClick={openAdd} className={BTN_PRIMARY}>
              <span aria-hidden="true">＋</span> Add expense
            </button>
          ) : (
            !viewingShared && upgradeButton
          )
        )}
      </header>

      {shared.length > 0 && (
        <div className="mb-6">
          <label htmlFor="expense-collection" className="block text-sm font-medium mb-1 text-neutral-300">
            Collection
          </label>
          <select
            id="expense-collection"
            value={collection ?? ''}
            onChange={(e) => chooseCollection(e.target.value)}
            className="px-3 py-2 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100 focus:outline-none focus:border-herp-teal"
          >
            <option value="">My collection</option>
            {shared.map((c) => (
              <option key={c.owner.id} value={c.owner.id}>
                {c.owner.name}&apos;s collection
              </option>
            ))}
          </select>
        </div>
      )}

      {actionError && (
        <p role="alert" className="mb-4 text-sm text-red-400">
          {actionError}
        </p>
      )}

      {error ? (
        <div className={`${CARD} p-6 text-center`}>
          <p role="alert" className="text-neutral-100">{error}</p>
          <button type="button" onClick={refresh} className={`${BTN_SECONDARY} mt-3`}>
            Try again
          </button>
        </div>
      ) : listLoading && items.length === 0 ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading expenses">
          <div className="h-24 rounded-lg bg-neutral-900 animate-pulse" />
          <div className="h-40 rounded-lg bg-neutral-900 animate-pulse" />
        </div>
      ) : showFreeExplainer ? (
        <div className={`${CARD} border-dashed p-8 text-center`}>
          <div className="text-4xl mb-3" aria-hidden="true">🧾</div>
          <h2 className="text-lg font-semibold text-white mb-2">Know what your hobby costs</h2>
          <p className="text-neutral-400 max-w-xl mx-auto mb-5">
            Log feeders, substrate, enclosures, heat and vet bills. Split a purchase across the animals it was for
            and every animal&apos;s page shows what it costs to keep. Expense tracking is a Premium feature.
          </p>
          {viewingShared ? (
            <p className="text-sm text-neutral-500">
              Adding expenses to {ownerName}&apos;s collection needs their Premium plan.
            </p>
          ) : (
            upgradeButton
          )}
        </div>
      ) : (
        <>
          {!canAdd && (
            <div className="mb-6 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
              {viewingShared
                ? `${ownerName}'s Premium has ended, so this history is read-only. They need Premium to add or edit expenses.`
                : 'Your Premium has ended, so your expense history is read-only. Upgrade to add or edit expenses.'}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard label="This month" value={summary ? formatMoney(monthTotal(thisKey)) : '—'} />
            <StatCard label="Last month" value={summary ? formatMoney(monthTotal(lastKey)) : '—'} />
            <StatCard label="Last 12 months" value={summary ? formatMoney(summary.total) : '—'} />
          </div>

          {categoryTotals.length > 0 && (
            <section aria-labelledby="expense-by-category" className={`mb-6 ${CARD} p-5`}>
              <h2 id="expense-by-category" className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium mb-3">
                By category · last 12 months
              </h2>
              <div
                className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-800"
                role="img"
                aria-label={categoryTotals.map((c) => `${c.label} ${formatMoney(c.amount)}`).join(', ')}
              >
                {categoryTotals.map((c) => (
                  <div
                    key={c.key}
                    className={CATEGORY_COLOR[c.key]}
                    style={{ width: `${(c.amount / categorySum) * 100}%` }}
                  />
                ))}
              </div>
              <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                {categoryTotals.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-neutral-300">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${CATEGORY_COLOR[c.key]}`} aria-hidden="true" />
                      {c.label}
                    </span>
                    <span className="tabular-nums text-neutral-100">{formatMoney(c.amount)}</span>
                  </li>
                ))}
              </ul>
              {summary && summary.unallocated_total > 0 && (
                <p className="mt-3 text-xs text-neutral-500">
                  {formatMoney(summary.unallocated_total)} isn&apos;t assigned to an animal.
                </p>
              )}
            </section>
          )}

          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
            <Chip active={category === 'all'} onClick={() => chooseCategory('all')}>All</Chip>
            {EXPENSE_CATEGORIES.map((c) => (
              <Chip key={c.key} active={category === c.key} onClick={() => chooseCategory(c.key)}>
                {c.label}
              </Chip>
            ))}
          </div>

          {items.length === 0 ? (
            category !== 'all' ? (
              <p className="py-8 text-center text-neutral-500">
                No {categoryLabel(category).toLowerCase()} expenses yet.
              </p>
            ) : (
              <div className={`${CARD} border-dashed p-8 text-center`}>
                <p className="text-neutral-300 mb-4">
                  No expenses yet. Log a feeder order or a bag of substrate and split it across the animals it was for.
                </p>
                {canAdd && (
                  <button type="button" onClick={openAdd} className={BTN_GRADIENT}>
                    Add your first expense
                  </button>
                )}
              </div>
            )
          ) : (
            <div className={`space-y-6 transition-opacity ${listLoading ? 'opacity-60' : ''}`} aria-busy={listLoading}>
              {groups.map((g) => (
                <section key={g.key} aria-label={monthLabel(g.key)}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">
                      {monthLabel(g.key)}
                    </h2>
                    {fullyLoaded && (
                      <span className="text-sm tabular-nums text-neutral-500">
                        {formatMoney(g.rows.reduce((s, r) => s + r.amount, 0))}
                      </span>
                    )}
                  </div>
                  <ul className={`${CARD} divide-y divide-neutral-800/70`}>
                    {g.rows.map((e) => (
                      <li key={e.id} className="flex items-start justify-between gap-4 p-4">
                        <div className="min-w-0">
                          <p className="font-medium text-neutral-100">{e.description}</p>
                          <p className="mt-0.5 text-xs text-neutral-500">
                            {fmtDay(e.spent_on)}
                            {' · '}
                            {categoryLabel(e.category)}
                            {' · '}
                            {splitText(e)}
                            {viewingShared && e.created_by_name ? ` · by ${e.created_by_name}` : ''}
                          </p>
                          {e.notes && (
                            <p className="mt-1 text-sm text-neutral-400 whitespace-pre-line">{e.notes}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="font-semibold tabular-nums text-neutral-100">
                            {formatMoney(e.amount)}
                          </span>
                          <div className="flex gap-3 text-sm">
                            {canAdd && (
                              <button
                                type="button"
                                onClick={() => openEdit(e)}
                                className="font-medium text-herp-teal hover:text-herp-lime transition-colors"
                              >
                                Edit
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDelete(e)}
                              className="font-medium text-red-300 hover:text-red-200 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              {!fullyLoaded && !listLoading && (
                <div className="text-center">
                  <button type="button" onClick={loadMore} disabled={loadingMore} className={BTN_SECONDARY}>
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <ExpenseForm
        open={formOpen}
        collection={collection}
        editing={editing}
        onClose={closeForm}
        onSaved={() => {
          setFormOpen(false)
          refresh()
        }}
        onPremiumRequired={() => {
          setFormOpen(false)
          // The list said we could add; the owner's plan has since lapsed. Re-read it.
          refresh()
          if (!viewingShared) setUpgradeOpen(true)
        }}
      />

      <UpgradeModal
        source="expenses"
        isOpen={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        message="Expense tracking is a Premium feature. Log what you spend on feeders, substrate, enclosures and vet visits, and see what each animal costs to keep."
      />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${CARD} p-5`}>
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-white">{value}</p>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
        active
          ? 'border-herp-teal/60 bg-herp-teal/10 text-herp-lime'
          : 'border-neutral-800 bg-neutral-900/40 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
      }`}
    >
      {children}
    </button>
  )
}
