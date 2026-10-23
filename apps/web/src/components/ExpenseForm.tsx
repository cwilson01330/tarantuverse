'use client'

/**
 * Add / edit an expense (dialog). Spec 2026-10-22 §3 "Form".
 *
 * Split section: Nothing / Whole collection / A location / Pick animals. The
 * preview line uses the same cents math as the server (`splitAmount`), so what
 * the keeper reads is what gets stored. Editing shows the current split and
 * sends a `split` ONLY when the keeper touched that section — an echoed split
 * would re-resolve against today's animals and quietly change old shares.
 * "Change split" seeds the picker from the saved shares (GET /expenses/{id}),
 * keeping ONLY targets still in the living list (`seedPicks`); shares whose
 * animal has died, been transferred, ended or been deleted are counted in a
 * note instead (`missingTargetsNote`), never picked. A touched split can't be
 * saved until the living list has loaded.
 *
 * The collection owner's plan decides who may add: a 403 premium_required
 * (PremiumRequiredError) hands off to the page's UpgradeModal.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_DESCRIPTION_MAX,
  EXPENSE_MAX_AMOUNT,
  EXPENSE_MAX_SHARES,
  EXPENSE_NOTES_MAX,
  PremiumRequiredError,
  createExpense,
  formatMoney,
  getExpense,
  splitAmount,
  updateExpense,
  type Expense,
  type ExpenseCategory,
  type ExpenseShare,
  type ExpenseSplitInput,
  type ExpenseSplitMode,
} from '@/lib/expenses'
import { listLocations, type LocationItem } from '@/lib/locations'
import { toISODateLocal } from '@/lib/date'
import { LocationDialog } from '@/components/LocationPicker'
import ExpenseAnimalPicker, { useLivingAnimals, type PickedAnimals } from '@/components/ExpenseAnimalPicker'

/** Today in the keeper's LOCAL calendar, as YYYY-MM-DD (never toISOString: that is UTC). */
export function localToday(): string {
  return toISODateLocal(new Date())
}

/**
 * Amount text → dollars, or null when it isn't a usable amount. Same rule as the
 * mobile `parseExpenseAmount` (keep the two in step):
 *   1. trim;
 *   2. thousands grouping ("1,234.50", "12,500") → drop the commas;
 *   3. else a decimal comma, one or two digits ("12,50", "1,5") → ".";
 *   4. else any other comma → refused;
 *   5. then digits with at most two decimals, > 0 and <= EXPENSE_MAX_AMOUNT.
 */
export function parseAmount(text: string): number | null {
  let t = text.trim()
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) t = t.replace(/,/g, '')
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.')
  else if (t.includes(',')) return null
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  if (!(n > 0) || n > EXPENSE_MAX_AMOUNT) return null
  return n
}

/** "$30.00 across 15 animals · $2.00 each" and its uneven / single-animal forms. */
export function splitPreview(amount: number, n: number): string {
  if (n < 1) return 'Pick at least one animal'
  if (n === 1) return `${formatMoney(amount)} on 1 animal`
  const parts = splitAmount(amount, n)
  const largest = parts[0]
  const smallest = parts[parts.length - 1]
  const each = largest === smallest ? `${formatMoney(largest)} each` : `${formatMoney(largest)} / ${formatMoney(smallest)} each`
  return `${formatMoney(amount)} across ${n} animals · ${each}`
}

/** The saved split in words: "Not split across any animals", or "Split across 15 animals · Rack 2". */
function savedSplitText(e: Pick<Expense, 'split_mode' | 'share_count' | 'split_label'>): string {
  if (e.split_mode === 'none') return 'Not split across any animals'
  const base = `Split across ${e.share_count} ${e.share_count === 1 ? 'animal' : 'animals'}`
  return e.split_label ? `${base} · ${e.split_label}` : base
}

/**
 * Seed the "Pick animals" selection from a saved split. ONLY ids present in the
 * living list are picked; a saved target that has died, been transferred,
 * ended / archived (colonies) or been deleted (null target) is never picked —
 * the picker can't show it, so it could never be unticked. Each such share
 * counts in `missing`. Same rule as the mobile `seedPicks`
 * (apps/mobile/src/lib/expense-form.ts) and HV web; keep them in step.
 */
export function seedPicks(
  shares: Pick<ExpenseShare, 'target_kind' | 'target_id'>[],
  living: { inverts: Iterable<string>; colonies: Iterable<string> },
): { picked: PickedAnimals; missing: number } {
  const liveInverts = new Set(living.inverts)
  const liveColonies = new Set(living.colonies)
  const inverts = new Set<string>()
  const colonies = new Set<string>()
  let missing = 0
  for (const s of shares) {
    const id = s.target_id
    if (id && s.target_kind === 'invert' && liveInverts.has(id)) inverts.add(id)
    else if (id && s.target_kind === 'colony' && liveColonies.has(id)) colonies.add(id)
    else missing += 1
  }
  return { picked: { inverts: Array.from(inverts), colonies: Array.from(colonies) }, missing }
}

/** The note under the split when saved shares point at animals that are gone (null = nothing missing). */
export function missingTargetsNote(missing: number): string | null {
  if (missing < 1) return null
  const who = missing === 1 ? '1 animal in this split is' : `${missing} animals in this split are`
  return `${who} no longer in your collection. Changing the split moves the cost onto the animals you pick; leave the split unchanged to keep it as it was.`
}

const EMPTY_PICKS: PickedAnimals = { inverts: [], colonies: [] }

const SPLIT_OPTIONS: { mode: ExpenseSplitMode; label: string }[] = [
  { mode: 'none', label: 'Nothing' },
  { mode: 'collection', label: 'Whole collection' },
  { mode: 'location', label: 'A location' },
  { mode: 'animals', label: 'Pick animals' },
]

const INPUT_CLASS =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 dark:text-white bg-white dark:bg-gray-800'
const LABEL_CLASS = 'block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300'

interface Props {
  open: boolean
  token: string
  /** Owner's user id when logging into a collection shared with you; null = your own. */
  collection: string | null
  /** The expense being edited; null = add. */
  editing: Expense | null
  onClose: () => void
  onSaved: () => void
  /** The collection owner isn't premium (create / update 403). */
  onPremiumRequired: () => void
}

export default function ExpenseForm({ open, token, collection, editing, onClose, onSaved, onPremiumRequired }: Props) {
  const [description, setDescription] = useState('')
  const [amountText, setAmountText] = useState('')
  const [spentOn, setSpentOn] = useState(localToday())
  const [category, setCategory] = useState<ExpenseCategory>('feeders')
  const [notes, setNotes] = useState('')
  const [splitMode, setSplitMode] = useState<ExpenseSplitMode>('none')
  const [location, setLocation] = useState<string | null>(null)
  // What the keeper has picked by hand; null = not yet, so the selection is the
  // seed from the saved split (see `picked` below).
  const [userPicked, setUserPicked] = useState<PickedAnimals | null>(null)
  // Edit only: the split section is hidden behind "Change split", and `splitTouched`
  // is what decides whether a `split` is sent at all. `savedShares` are the saved
  // split's shares (GET /expenses/{id}); `seeding` is true while they are read.
  const [showSplit, setShowSplit] = useState(true)
  const [splitTouched, setSplitTouched] = useState(false)
  const [savedShares, setSavedShares] = useState<ExpenseShare[] | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [locations, setLocations] = useState<LocationItem[]>([])
  const [locationOpen, setLocationOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fresh state every time the dialog opens (or switches expense).
  useEffect(() => {
    if (!open) return
    let alive = true
    setError(null)
    setSaving(false)
    setLocation(null)
    setUserPicked(null)
    setSavedShares(null)
    setSplitTouched(false)
    if (editing) {
      setDescription(editing.description)
      setAmountText(editing.amount.toFixed(2))
      setSpentOn(editing.spent_on)
      setCategory(editing.category)
      setNotes(editing.notes ?? '')
      setSplitMode(editing.split_mode)
      setShowSplit(false)
      // Read the saved shares to seed the split. Failing only means the keeper
      // re-picks if they choose to change it; an untouched split is never sent.
      setSeeding(true)
      getExpense(editing.id)
        .then((d) => {
          if (alive) setSavedShares(d.shares)
        })
        .catch(() => {})
        .finally(() => {
          if (alive) setSeeding(false)
        })
    } else {
      setDescription('')
      setAmountText('')
      setSpentOn(localToday())
      setCategory('feeders')
      setNotes('')
      setSplitMode('none')
      setShowSplit(true)
      setSeeding(false)
    }
    return () => {
      alive = false
    }
  }, [open, editing])

  // Existing locations of the collection being logged into (pick-first).
  useEffect(() => {
    if (!open) return
    let alive = true
    listLocations(token, collection)
      .then((l) => alive && setLocations(l))
      .catch(() => alive && setLocations([]))
    return () => {
      alive = false
    }
  }, [open, token, collection])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locationOpen) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, locationOpen])

  // The living list: loaded as soon as an existing expense is open (to tell which
  // saved targets are still living), or when "Pick animals" is first shown.
  const living = useLivingAnimals(token, collection, open && (!!editing || splitMode === 'animals'))
  const seeded = useMemo(
    () =>
      savedShares && living.data
        ? seedPicks(savedShares, {
            inverts: living.data.inverts.map((a) => a.id),
            colonies: living.data.colonies.map((c) => c.id),
          })
        : null,
    [savedShares, living.data],
  )
  const picked: PickedAnimals = userPicked ?? seeded?.picked ?? EMPTY_PICKS
  const missingNote = missingTargetsNote(seeded?.missing ?? 0)
  // A touched split can't be built from picks until the list that filters them has arrived.
  const splitWaiting = !!editing && splitTouched && living.loading

  const amount = useMemo(() => parseAmount(amountText), [amountText])
  const pickedCount = picked.inverts.length + picked.colonies.length

  if (!open) return null

  const touchSplit = () => setSplitTouched(true)

  const chooseMode = (mode: ExpenseSplitMode) => {
    // Clicking the mode already shown changes nothing, so it must not count as an edit.
    if (mode === splitMode) return
    touchSplit()
    setSplitMode(mode)
    if (mode === 'location' && !location) setLocationOpen(true)
  }

  const previewLine = (): string => {
    // Untouched saved split: say what is saved, never a recomputed preview.
    if (editing && !splitTouched) return savedSplitText(editing)
    if (splitMode === 'none') return 'Not assigned to any animal. It still counts in your totals.'
    if (splitMode === 'collection') return 'Split evenly across every living animal and open colony'
    if (splitMode === 'location') {
      return location
        ? `Split evenly across every living animal and open colony at ${location}`
        : 'Choose a location to split across'
    }
    if (amount === null) return pickedCount ? `${pickedCount} ${pickedCount === 1 ? 'animal' : 'animals'} picked. Enter an amount to see the split.` : 'Pick at least one animal'
    return splitPreview(amount, pickedCount)
  }

  const buildSplit = (): ExpenseSplitInput | string => {
    if (splitMode === 'none') return { mode: 'none' }
    if (splitMode === 'collection') return { mode: 'collection' }
    if (splitMode === 'location') {
      return location ? { mode: 'location', location } : 'Choose a location to split across.'
    }
    if (pickedCount < 1) return 'Pick at least one animal to split across.'
    if (pickedCount > EXPENSE_MAX_SHARES) return `You can split across at most ${EXPENSE_MAX_SHARES} animals.`
    return { mode: 'animals', invert_ids: picked.inverts, colony_ids: picked.colonies }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving || splitWaiting) return
    const desc = description.trim()
    if (!desc) return setError('Add a short description.')
    if (desc.length > EXPENSE_DESCRIPTION_MAX) return setError(`Keep the description under ${EXPENSE_DESCRIPTION_MAX} characters.`)
    if (amount === null) {
      return setError('Enter an amount like 12.50, more than $0 and no more than $100,000.')
    }
    if (!spentOn) return setError('Pick the date you spent it.')
    // A NEW date can't be after the keeper's local today; an unchanged saved date is always accepted.
    if (spentOn > localToday() && !(editing && spentOn === editing.spent_on)) {
      return setError('Pick a date no later than today.')
    }
    if (notes.trim().length > EXPENSE_NOTES_MAX) return setError(`Keep notes under ${EXPENSE_NOTES_MAX} characters.`)

    let split: ExpenseSplitInput | undefined
    if (!editing || splitTouched) {
      const s = buildSplit()
      if (typeof s === 'string') return setError(s)
      split = s
    }

    setSaving(true)
    setError(null)
    try {
      if (editing) {
        await updateExpense(editing.id, {
          spent_on: spentOn,
          description: desc,
          category,
          amount,
          notes: notes.trim() ? notes.trim() : null,
          ...(split ? { split } : {}),
        })
      } else {
        await createExpense({
          app: 'tarantuverse',
          collection: collection ?? undefined,
          spent_on: spentOn,
          description: desc,
          category,
          amount,
          notes: notes.trim() ? notes.trim() : undefined,
          split,
        })
      }
      onSaved()
    } catch (err) {
      if (err instanceof PremiumRequiredError) {
        onPremiumRequired()
      } else {
        setError(err instanceof Error ? err.message : 'Could not save that expense. Nothing has changed.')
      }
    } finally {
      setSaving(false)
    }
  }

  const showLocationOption = locations.length > 0 || splitMode === 'location'

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-form-title"
      >
        <h2 id="expense-form-title" className="text-xl font-bold text-gray-900 dark:text-white">
          {editing ? 'Edit expense' : 'Add expense'}
        </h2>

        <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
          <div>
            <label htmlFor="expense-description" className={LABEL_CLASS}>Description</label>
            <input
              id="expense-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={EXPENSE_DESCRIPTION_MAX}
              placeholder="e.g. 500 dubia roaches"
              autoFocus
              className={INPUT_CLASS}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="expense-amount" className={LABEL_CLASS}>Amount</label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 dark:text-gray-400">$</span>
                <input
                  id="expense-amount"
                  type="text"
                  inputMode="decimal"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  placeholder="0.00"
                  className={INPUT_CLASS}
                />
              </div>
            </div>
            <div>
              <label htmlFor="expense-date" className={LABEL_CLASS}>Date</label>
              <input
                id="expense-date"
                type="date"
                value={spentOn}
                min="1990-01-01"
                max={localToday()}
                onChange={(e) => setSpentOn(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <span className={LABEL_CLASS} id="expense-category-label">Category</span>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="expense-category-label">
              {EXPENSE_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={category === c.key}
                  onClick={() => setCategory(c.key)}
                  className={`px-3 py-1.5 rounded-full border text-sm font-medium transition ${
                    category === c.key
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="expense-notes" className={LABEL_CLASS}>Notes (optional)</label>
            <textarea
              id="expense-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={EXPENSE_NOTES_MAX}
              rows={2}
              className={INPUT_CLASS}
            />
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-white" id="expense-split-label">Split across</span>
              {editing && !showSplit && (
                <button
                  type="button"
                  disabled={seeding}
                  onClick={() => setShowSplit(true)}
                  className="text-sm font-semibold text-primary-700 dark:text-primary-400 hover:underline disabled:opacity-50"
                >
                  Change split
                </button>
              )}
            </div>

            {editing && !showSplit ? (
              <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{savedSplitText(editing)}</p>
            ) : (
              <>
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="expense-split-label">
                  {SPLIT_OPTIONS.filter((o) => o.mode !== 'location' || showLocationOption).map((o) => (
                    <button
                      key={o.mode}
                      type="button"
                      aria-pressed={splitMode === o.mode}
                      onClick={() => chooseMode(o.mode)}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition ${
                        splitMode === o.mode
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>

                {splitMode === 'location' && (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setLocationOpen(true)}
                      className="flex flex-1 items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-left text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600"
                    >
                      <span aria-hidden>📍</span>
                      <span className="flex-1 truncate">{location ?? 'Choose a location'}</span>
                      <span aria-hidden className="text-gray-400">▾</span>
                    </button>
                  </div>
                )}

                {splitMode === 'animals' && (
                  <div className="mt-3">
                    <ExpenseAnimalPicker
                      living={living}
                      value={picked}
                      onChange={(next) => {
                        touchSplit()
                        setUserPicked(next)
                      }}
                    />
                  </div>
                )}

                <p aria-live="polite" className="mt-3 text-sm font-medium text-gray-800 dark:text-gray-200">
                  {previewLine()}
                </p>
              </>
            )}

            {missingNote && <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{missingNote}</p>}
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || splitWaiting}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add expense'}
            </button>
          </div>
        </form>
      </div>
    </div>

    {/* A sibling of the form overlay, not a child: its backdrop click must not bubble up and close the form. */}
    <LocationDialog
      open={locationOpen}
      token={token}
      title="Split across a location"
      value={location}
      locations={locations}
      allowClear={false}
      confirmLabel="Use"
      onClose={() => setLocationOpen(false)}
      onPick={(l) => {
        touchSplit()
        setLocation(l)
      }}
    />
    </>
  )
}
