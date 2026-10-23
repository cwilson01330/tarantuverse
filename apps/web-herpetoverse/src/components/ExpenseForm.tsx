'use client'

/**
 * Add / edit an expense (dialog). Spec 2026-10-22 §3 "Form". Herpetoverse copy
 * of apps/web/src/components/ExpenseForm.tsx in HV's dark styling: split
 * targets are animals only (`animal_ids`), there are no colonies.
 *
 * Split section: Nothing / Whole collection / A location / Pick animals. The
 * preview line uses the same cents math as the server (`splitAmount`), so what
 * the keeper reads is what gets stored.
 *
 * Editing seeds the split section from the saved split (mode, picked animals,
 * location — read from GET /expenses/{id}) and starts it UNTOUCHED: a `split`
 * is sent ONLY if the keeper changed that section, because an echoed split
 * would re-resolve against today's animals and quietly change old shares.
 * While untouched, the line under the chips is the saved split ("Split across
 * 15 animals"), never a recomputed preview.
 *
 * The collection owner's plan decides who may add: a 403 premium_required
 * (PremiumRequiredError) hands off to the page's UpgradeModal.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { apiFetch } from '@/lib/apiClient'
import {
  ANIMAL_TAXA,
  ANIMAL_TAXON_ORDER,
  animalTitle,
  type Animal,
  type AnimalTaxon,
} from '@/lib/animals'
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
import { LocationDialog } from '@/components/LocationPicker'

/** YYYY-MM-DD from LOCAL calendar parts (never toISOString: that is UTC). */
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Today in the keeper's LOCAL calendar, as YYYY-MM-DD. */
export function localToday(): string {
  return ymd(new Date())
}

/**
 * Amount text → dollars, or null when it isn't a usable amount. Same rule as the
 * TV web `parseAmount` and the mobile `parseExpenseAmount` (keep them in step):
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

/** The saved split in words: "Not split", or "Split across 15 animals · Rack 2". */
export function splitText(e: Pick<Expense, 'split_mode' | 'share_count' | 'split_label'>): string {
  if (e.split_mode === 'none') return 'Not split'
  const base = `Split across ${e.share_count} ${e.share_count === 1 ? 'animal' : 'animals'}`
  return e.split_label ? `${base} · ${e.split_label}` : base
}

/**
 * Seed the "Pick animals" selection from a saved split. ONLY ids present in the
 * living list are picked; a saved target that has died, been transferred or been
 * deleted (null target) is never picked — the picker can't show it, so it could
 * never be unticked. Each such share counts in `missing`. Same rule as the TV
 * web / mobile `seedPicks`; keep them in step.
 */
export function seedPicks(
  shares: Pick<ExpenseShare, 'target_kind' | 'target_id'>[],
  livingIds: Iterable<string>,
): { picked: string[]; missing: number } {
  const live = new Set(livingIds)
  const picked = new Set<string>()
  let missing = 0
  for (const s of shares) {
    const id = s.target_id
    if (id && s.target_kind === 'animal' && live.has(id)) picked.add(id)
    else missing += 1
  }
  return { picked: Array.from(picked), missing }
}

/** The note under the split when saved shares point at animals that are gone (null = nothing missing). */
export function missingTargetsNote(missing: number): string | null {
  if (missing < 1) return null
  const who = missing === 1 ? '1 animal in this split is' : `${missing} animals in this split are`
  return `${who} no longer in your collection. Changing the split moves the cost onto the animals you pick; leave the split unchanged to keep it as it was.`
}

const NO_PICKS: string[] = []

const SPLIT_OPTIONS: { mode: ExpenseSplitMode; label: string }[] = [
  { mode: 'none', label: 'Nothing' },
  { mode: 'collection', label: 'Whole collection' },
  { mode: 'location', label: 'A location' },
  { mode: 'animals', label: 'Pick animals' },
]

const INPUT_CLASS =
  'w-full px-3 py-2 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-herp-teal'
const LABEL_CLASS = 'block text-sm font-medium mb-1 text-neutral-300'
const CHIP_ON = 'border-herp-teal/60 bg-herp-teal/10 text-herp-lime'
const CHIP_OFF = 'border-neutral-800 bg-neutral-900/40 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'

interface Props {
  open: boolean
  /** Owner's user id when logging into a collection shared with you; null = your own. */
  collection: string | null
  /** The expense being edited; null = add. */
  editing: Expense | null
  onClose: () => void
  onSaved: () => void
  /** The collection owner isn't premium (create / update 403). */
  onPremiumRequired: () => void
}

export default function ExpenseForm({ open, collection, editing, onClose, onSaved, onPremiumRequired }: Props) {
  const [description, setDescription] = useState('')
  const [amountText, setAmountText] = useState('')
  const [spentOn, setSpentOn] = useState(localToday())
  const [category, setCategory] = useState<ExpenseCategory>('feeders')
  const [notes, setNotes] = useState('')
  const [splitMode, setSplitMode] = useState<ExpenseSplitMode>('none')
  const [location, setLocation] = useState<string | null>(null)
  // What the keeper has picked by hand; null = not yet, so the selection is the
  // seed from the saved split (see `picked` below).
  const [userPicked, setUserPicked] = useState<string[] | null>(null)
  // Edit only: `splitTouched` is what decides whether a `split` is sent at all;
  // `seeding` is true while the saved split (shares) is being read.
  const [splitTouched, setSplitTouched] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [savedShares, setSavedShares] = useState<ExpenseShare[] | null>(null)
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
      // Seed the split from the saved shares. Failing to read them only means the
      // keeper re-picks if they choose to change the split; an untouched split
      // is never sent.
      setSeeding(true)
      getExpense(editing.id)
        .then((d) => {
          if (!alive) return
          // Seed only when no location is set yet: a keeper who already picked one
          // after "Change split" must not have it overwritten by this late response.
          setLocation((prev) => prev ?? (d.split_mode === 'location' ? d.split_label : null))
          setSavedShares(d.shares)
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
    listLocations(collection)
      .then((l) => alive && setLocations(l))
      .catch(() => alive && setLocations([]))
    return () => {
      alive = false
    }
  }, [open, collection])

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
  const living = useLivingAnimals(collection, open && (!!editing || splitMode === 'animals'))
  const seeded = useMemo(
    () => (savedShares && living.animals ? seedPicks(savedShares, living.animals.map((a) => a.id)) : null),
    [savedShares, living.animals],
  )
  const picked: string[] = userPicked ?? seeded?.picked ?? NO_PICKS
  const missingNote = missingTargetsNote(seeded?.missing ?? 0)
  // A touched split can't be built from picks until the list that filters them has arrived.
  const splitWaiting = !!editing && splitTouched && (seeding || living.loading)

  const amount = useMemo(() => parseAmount(amountText), [amountText])
  const pickedCount = picked.length

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
    if (editing && !splitTouched) {
      return editing.split_mode === 'none' ? 'Not split across any animals' : splitText(editing)
    }
    if (splitMode === 'none') return 'Not assigned to any animal. It still counts in your totals.'
    if (splitMode === 'collection') return 'Split evenly across every living animal'
    if (splitMode === 'location') {
      return location ? `Split evenly across every living animal at ${location}` : 'Choose a location to split across'
    }
    if (amount === null) {
      return pickedCount
        ? `${pickedCount} ${pickedCount === 1 ? 'animal' : 'animals'} picked. Enter an amount to see the split.`
        : 'Pick at least one animal'
    }
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
    return { mode: 'animals', animal_ids: picked }
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
          app: 'herpetoverse',
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
        <div
          className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950 p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="expense-form-title"
        >
          <h2 id="expense-form-title" className="text-lg font-semibold text-white">
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
                placeholder="e.g. 50 frozen mice"
                autoFocus
                className={INPUT_CLASS}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="expense-amount" className={LABEL_CLASS}>Amount</label>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500">$</span>
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
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                      category === c.key ? CHIP_ON : CHIP_OFF
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

            <div className="rounded-lg border border-neutral-800 p-4">
              <span className="text-sm font-semibold text-white" id="expense-split-label">Split across</span>

              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="expense-split-label">
                {SPLIT_OPTIONS.filter((o) => o.mode !== 'location' || showLocationOption).map((o) => (
                  <button
                    key={o.mode}
                    type="button"
                    aria-pressed={splitMode === o.mode}
                    disabled={seeding}
                    onClick={() => chooseMode(o.mode)}
                    className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors disabled:opacity-50 ${
                      splitMode === o.mode ? CHIP_ON : CHIP_OFF
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
                    disabled={seeding}
                    onClick={() => setLocationOpen(true)}
                    className="flex flex-1 min-w-0 items-center gap-2 px-3 py-2 text-sm text-left rounded-md bg-neutral-900 border border-neutral-800 hover:border-neutral-700 focus:outline-none focus:border-herp-teal text-neutral-100 disabled:opacity-50"
                  >
                    <span aria-hidden="true">📍</span>
                    <span className="flex-1 truncate">{location ?? 'Choose a location'}</span>
                    <span aria-hidden="true" className="text-neutral-500">▾</span>
                  </button>
                </div>
              )}

              {splitMode === 'animals' && (
                <div className="mt-3">
                  {seeding ? (
                    <p className="text-sm text-neutral-500">Loading the saved split…</p>
                  ) : (
                    <AnimalPicker
                      living={living}
                      value={picked}
                      onChange={(next) => {
                        touchSplit()
                        setUserPicked(next)
                      }}
                    />
                  )}
                </div>
              )}

              <p aria-live="polite" className="mt-3 text-sm font-medium text-neutral-200">
                {previewLine()}
              </p>

              {missingNote && <p className="mt-2 text-xs text-neutral-400">{missingNote}</p>}
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-md text-sm text-neutral-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || splitWaiting}
                className="px-4 py-2 rounded-md border border-herp-teal/40 bg-herp-teal/10 text-sm text-herp-teal hover:bg-herp-teal/20 disabled:opacity-50"
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

// ---------------------------------------------------------------------------
// Pick animals
// ---------------------------------------------------------------------------

interface PickGroup {
  key: AnimalTaxon
  label: string
  glyph: string
  items: { id: string; label: string }[]
}

interface LivingState {
  /** Null until the list for THIS collection has loaded. */
  animals: Animal[] | null
  loading: boolean
  error: string | null
}

/**
 * The keeper's LIVING animals, loaded from GET /animals/ (the same call the
 * collection page uses; its default view excludes died and transferred animals,
 * and the result is filtered again so a closed animal can never be offered),
 * scoped to the chosen collection when a co-keeper logs into someone else's.
 * Loads while `enabled`, and again when the collection changes (the old ids
 * belong to another collection). It lives in the form, not the picker, so the
 * form can tell which saved split targets are still living before the picker is
 * ever shown.
 */
function useLivingAnimals(collection: string | null, enabled: boolean): LivingState {
  const key = collection ?? 'own'
  const [loaded, setLoaded] = useState<{ key: string; animals: Animal[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (loaded && loaded.key === key) return
    let alive = true
    setError(null)
    const qs = collection ? `?collection=${encodeURIComponent(collection)}` : ''
    apiFetch<Animal[]>(`/api/v1/animals/${qs}`)
      .then((rows) => {
        if (!alive) return
        setLoaded({ key, animals: (Array.isArray(rows) ? rows : []).filter((a) => !a.died_at && !a.transferred_out_at) })
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load your animals')
      })
    return () => {
      alive = false
    }
  }, [enabled, collection, key, loaded])

  const animals = loaded && loaded.key === key ? loaded.animals : null
  return { animals, loading: enabled && !animals && !error, error: animals ? null : error }
}

/** The keeper's living animals grouped by taxon (registry order), each group with Select all / Clear. */
function AnimalPicker({
  living,
  value,
  onChange,
}: {
  living: LivingState
  value: string[]
  onChange: (next: string[]) => void
}) {
  const { loading, error } = living
  const animals = useMemo(() => living.animals ?? [], [living.animals])

  const groups = useMemo<PickGroup[]>(() => {
    const byTaxon = new Map<AnimalTaxon, PickGroup>()
    for (const a of animals) {
      const key: AnimalTaxon = a.taxon in ANIMAL_TAXA ? a.taxon : 'other'
      let g = byTaxon.get(key)
      if (!g) {
        g = { key, label: ANIMAL_TAXA[key].plural, glyph: ANIMAL_TAXA[key].glyph, items: [] }
        byTaxon.set(key, g)
      }
      g.items.push({ id: a.id, label: animalTitle(a) })
    }
    const out = ANIMAL_TAXON_ORDER.filter((t) => byTaxon.has(t)).map((t) => byTaxon.get(t) as PickGroup)
    for (const g of out) g.items.sort((x, y) => x.label.localeCompare(y.label))
    return out
  }, [animals])

  const toggleOne = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  const toggleGroup = (g: PickGroup) => {
    const ours = new Set(g.items.map((i) => i.id))
    const allOn = g.items.every((i) => value.includes(i.id))
    if (allOn) {
      // Clear only this group's rows; ids from elsewhere stay.
      onChange(value.filter((id) => !ours.has(id)))
    } else {
      onChange([...value, ...g.items.filter((i) => !value.includes(i.id)).map((i) => i.id)])
    }
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading your animals…</p>
  if (error) return <p role="alert" className="text-sm text-red-400">{error}</p>
  if (groups.length === 0) return <p className="text-sm text-neutral-500">No living animals to pick from.</p>

  return (
    <div className="max-h-64 overflow-y-auto rounded-md border border-neutral-800 divide-y divide-neutral-800">
      {groups.map((g) => {
        const n = g.items.filter((i) => value.includes(i.id)).length
        const all = n === g.items.length
        return (
          <fieldset key={g.key} className="p-3">
            <legend className="sr-only">{g.label}</legend>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm font-semibold text-neutral-100">
                <span aria-hidden="true">{g.glyph}</span> {g.label}{' '}
                <span className="font-normal text-neutral-500">
                  ({n}/{g.items.length})
                </span>
              </span>
              <button
                type="button"
                onClick={() => toggleGroup(g)}
                className="text-xs font-medium text-herp-teal hover:underline"
              >
                {all ? 'Clear' : 'Select all'}
              </button>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              {g.items.map((i) => (
                <li key={i.id}>
                  <label className="flex items-center gap-2 text-sm text-neutral-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={value.includes(i.id)}
                      onChange={() => toggleOne(i.id)}
                      className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 accent-herp-teal"
                    />
                    <span className="truncate">{i.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )
      })}
    </div>
  )
}
