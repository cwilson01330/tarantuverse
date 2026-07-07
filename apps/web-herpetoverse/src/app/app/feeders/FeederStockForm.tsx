'use client'

/**
 * Shared create/edit form for a feeder stock (ADR-012).
 *
 * Used by /app/feeders/add and /app/feeders/[id]/edit. The form covers:
 *   - name + optional species link (from the catalog)
 *   - form toggle: live vs frozen
 *   - inventory mode: count vs sized — sized reveals a bucket editor whose
 *     bucket names default from the chosen species' `typical_sizes`
 *   - storage location, low-stock threshold, notes
 *
 * A species pick doesn't force a mode, but if it supports sizes we nudge the
 * keeper toward "sized" and seed the bucket rows from its size ladder so a
 * freezer of graded rodents is a couple of clicks, not manual typing.
 *
 * On edit we intentionally do NOT let the keeper rewrite bucket counts here
 * (those move through the Used/Restock log actions so history stays honest)
 * — edit adjusts the metadata: name, species link, form, storage, threshold,
 * notes. Adding/removing a size bucket on edit is allowed since it's a
 * structural change, not a count correction.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ApiError } from '@/lib/apiClient'
import {
  type CreateFeederStockPayload,
  type FeederForm,
  type FeederSpecies,
  type FeederStock,
  type InventoryMode,
  createFeederStock,
  getFeederSpecies,
  listFeederSpecies,
  updateFeederStock,
  capitalize,
} from '@/lib/feeders'

// Shared input styling — matches the reptile add form.
const INPUT_CLS =
  'w-full px-3 py-2.5 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-neutral-100 placeholder-neutral-600 disabled:opacity-50'
const LABEL_CLS =
  'block text-xs uppercase tracking-wider text-neutral-500 mb-1.5'
const SECTION_HDR_CLS =
  'text-[11px] uppercase tracking-[0.18em] text-herp-lime/80 font-medium mb-4'

interface BucketRow {
  size: string
  count: string // kept as string for the input; parsed on submit
}

interface FormState {
  name: string
  speciesId: string | null
  speciesLabel: string
  form: FeederForm
  mode: InventoryMode
  count: string
  buckets: BucketRow[]
  storageLocation: string
  lowThreshold: string
  notes: string
}

function initialFromStock(stock?: FeederStock): FormState {
  if (!stock) {
    return {
      name: '',
      speciesId: null,
      speciesLabel: '',
      form: 'frozen',
      mode: 'sized',
      count: '',
      buckets: [{ size: '', count: '' }],
      storageLocation: '',
      lowThreshold: '',
      notes: '',
    }
  }
  const buckets: BucketRow[] =
    stock.sized_counts && Object.keys(stock.sized_counts).length > 0
      ? Object.entries(stock.sized_counts).map(([size, n]) => ({
          size,
          count: String(n),
        }))
      : [{ size: '', count: '' }]
  return {
    name: stock.name ?? '',
    speciesId: stock.hv_feeder_species_id,
    speciesLabel: stock.species_display_name ?? '',
    form: stock.form,
    mode: stock.inventory_mode,
    count: stock.count != null ? String(stock.count) : '',
    buckets,
    storageLocation: stock.storage_location ?? '',
    lowThreshold: stock.low_threshold != null ? String(stock.low_threshold) : '',
    notes: stock.notes ?? '',
  }
}

export default function FeederStockForm({
  stock,
  initialSpeciesId,
}: {
  stock?: FeederStock
  /** Pre-select a species when arriving from a care sheet's "Add to my stock". */
  initialSpeciesId?: string | null
}) {
  const router = useRouter()
  const isEdit = !!stock

  const [form, setForm] = useState<FormState>(() => initialFromStock(stock))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Catalog for the species picker. Loaded once; lightweight (<=200 rows).
  const [catalog, setCatalog] = useState<FeederSpecies[]>([])
  const [catalogErr, setCatalogErr] = useState(false)
  // Guard so the query-param pre-select only fires once, after catalog loads.
  const [seededSpecies, setSeededSpecies] = useState(false)

  useEffect(() => {
    let cancelled = false
    listFeederSpecies({ limit: 200 })
      .then((rows) => {
        if (!cancelled) setCatalog(rows)
      })
      .catch(() => {
        if (!cancelled) setCatalogErr(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Once the catalog is in and we were handed a species id (from a care sheet
  // CTA), run the same pick logic so name + size buckets get seeded — but only
  // on create, and only once.
  useEffect(() => {
    if (isEdit || seededSpecies) return
    if (!initialSpeciesId) return
    if (catalog.length === 0) return
    if (!catalog.some((s) => s.id === initialSpeciesId)) return
    setSeededSpecies(true)
    handleSpeciesPick(initialSpeciesId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, initialSpeciesId, isEdit, seededSpecies])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const selectedSpecies = useMemo(
    () => catalog.find((s) => s.id === form.speciesId) ?? null,
    [catalog, form.speciesId],
  )

  // When the keeper picks a species, seed helpful defaults:
  //  - name (only if empty) from the common name
  //  - if it supports sizes and we're on a fresh/empty bucket set, seed the
  //    bucket rows from its typical_sizes ladder + nudge mode to "sized"
  async function handleSpeciesPick(id: string) {
    if (!id) {
      setForm((prev) => ({ ...prev, speciesId: null, speciesLabel: '' }))
      return
    }
    let species = catalog.find((s) => s.id === id) ?? null
    if (!species) {
      // Shouldn't happen (picker is fed from catalog) but stay safe.
      try {
        species = await getFeederSpecies(id)
      } catch {
        species = null
      }
    }
    setForm((prev) => {
      const label = species
        ? species.common_names[0] || species.scientific_name
        : prev.speciesLabel
      const emptyBuckets =
        prev.buckets.length === 0 ||
        prev.buckets.every((b) => b.size.trim() === '' && b.count.trim() === '')
      const seedSized =
        !isEdit &&
        !!species?.supports_sizes &&
        species.typical_sizes.length > 0 &&
        emptyBuckets
      return {
        ...prev,
        speciesId: id,
        speciesLabel: label,
        name: prev.name.trim() === '' ? label : prev.name,
        mode: seedSized ? 'sized' : prev.mode,
        buckets: seedSized
          ? species!.typical_sizes.map((size) => ({ size, count: '' }))
          : prev.buckets,
      }
    })
  }

  function updateBucket(idx: number, patch: Partial<BucketRow>) {
    setForm((prev) => {
      const buckets = prev.buckets.slice()
      buckets[idx] = { ...buckets[idx], ...patch }
      return { ...prev, buckets }
    })
  }

  function addBucket() {
    setForm((prev) => ({
      ...prev,
      buckets: [...prev.buckets, { size: '', count: '' }],
    }))
  }

  function removeBucket(idx: number) {
    setForm((prev) => ({
      ...prev,
      buckets: prev.buckets.filter((_, i) => i !== idx),
    }))
  }

  function seedFromSpeciesLadder() {
    const ladder = selectedSpecies?.typical_sizes ?? []
    if (ladder.length === 0) return
    setForm((prev) => {
      // Merge: keep existing counts for buckets already present.
      const existing = new Map(
        prev.buckets.map((b) => [b.size.trim().toLowerCase(), b.count]),
      )
      const buckets = ladder.map((size) => ({
        size,
        count: existing.get(size.toLowerCase()) ?? '',
      }))
      return { ...prev, buckets, mode: 'sized' }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)

    if (form.name.trim() === '') {
      setError('Give this stock a name.')
      return
    }

    // Build the sized_counts / count payload from the chosen mode.
    let count: number | null = null
    let sizedCounts: Record<string, number> | null = null

    if (form.mode === 'count') {
      const raw = form.count.trim()
      if (raw !== '') {
        const n = Math.floor(Number(raw))
        if (!Number.isFinite(n) || n < 0) {
          setError('Count must be a whole number of 0 or more.')
          return
        }
        count = n
      } else {
        count = 0
      }
    } else {
      const cleaned = form.buckets
        .map((b) => ({ size: b.size.trim(), count: b.count.trim() }))
        .filter((b) => b.size !== '')
      if (cleaned.length === 0) {
        setError('Add at least one size bucket, or switch to a single count.')
        return
      }
      // Reject duplicate bucket names (case-insensitive).
      const seen = new Set<string>()
      const out: Record<string, number> = {}
      for (const b of cleaned) {
        const key = b.size.toLowerCase()
        if (seen.has(key)) {
          setError(`Duplicate size "${b.size}". Each size can appear once.`)
          return
        }
        seen.add(key)
        const n = b.count === '' ? 0 : Math.floor(Number(b.count))
        if (!Number.isFinite(n) || n < 0) {
          setError(`Count for "${b.size}" must be a whole number of 0 or more.`)
          return
        }
        out[b.size] = n
      }
      sizedCounts = out
    }

    const lowRaw = form.lowThreshold.trim()
    let lowThreshold: number | null = null
    if (lowRaw !== '') {
      const n = Math.floor(Number(lowRaw))
      if (!Number.isFinite(n) || n < 0) {
        setError('Low-stock threshold must be a whole number of 0 or more.')
        return
      }
      lowThreshold = n
    }

    const payload: CreateFeederStockPayload = {
      name: form.name.trim(),
      hv_feeder_species_id: form.speciesId,
      form: form.form,
      inventory_mode: form.mode,
      count,
      sized_counts: sizedCounts,
      storage_location:
        form.storageLocation.trim() === '' ? null : form.storageLocation.trim(),
      low_threshold: lowThreshold,
      notes: form.notes.trim() === '' ? null : form.notes.trim(),
    }

    setSubmitting(true)
    try {
      if (isEdit && stock) {
        await updateFeederStock(stock.id, payload)
        router.push(`/app/feeders/${stock.id}`)
      } else {
        const created = await createFeederStock(payload)
        router.push(`/app/feeders/${created.id}`)
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message || 'Could not save. Please try again.'
          : 'Could not save. Check your connection and try again.',
      )
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-8">
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
          {isEdit ? 'Edit stock' : 'New stock'}
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-wide text-white mb-2">
          {isEdit ? 'Edit feeder stock' : 'Add feeder stock'}
        </h1>
        <p className="text-neutral-400 text-sm">
          Track a live colony or a freezer of frozen feeders. Sized stock
          (like graded rodents) gets per-size buckets you can draw down one tap
          at a time.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8" noValidate>
        {/* Identity ------------------------------------------------------- */}
        <section className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/40">
          <h2 className={SECTION_HDR_CLS}>Identity</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Field label="Name" hint="What you'll call this stock.">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="Freezer rats"
                  maxLength={120}
                  className={INPUT_CLS}
                  autoFocus
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field
                label="Species"
                hint={
                  catalogErr
                    ? 'Catalog unavailable — you can still save without linking.'
                    : 'Optional — links to a care sheet and suggests size buckets.'
                }
              >
                <select
                  value={form.speciesId ?? ''}
                  onChange={(e) => handleSpeciesPick(e.target.value)}
                  className={INPUT_CLS}
                  disabled={catalog.length === 0}
                >
                  <option value="">— No species link —</option>
                  {catalog.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.common_names[0] || s.scientific_name}
                      {s.common_names[0] ? ` (${s.scientific_name})` : ''}
                    </option>
                  ))}
                </select>
              </Field>
              {selectedSpecies && (
                <Link
                  href={`/app/feeders/catalog/${selectedSpecies.id}`}
                  className="mt-2 inline-block text-xs text-herp-teal hover:text-herp-lime transition-colors"
                >
                  View care sheet →
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* Form + mode --------------------------------------------------- */}
        <section className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/40">
          <h2 className={SECTION_HDR_CLS}>Type</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <span className={LABEL_CLS}>Form</span>
              <SegToggle
                options={[
                  { value: 'frozen', label: '❄ Frozen' },
                  { value: 'live', label: '● Live' },
                ]}
                value={form.form}
                onChange={(v) => update('form', v as FeederForm)}
              />
              <p className="mt-2 text-[11px] text-neutral-500">
                Frozen = freezer inventory. Live = a colony you keep going.
              </p>
            </div>

            <div>
              <span className={LABEL_CLS}>Inventory</span>
              <SegToggle
                options={[
                  { value: 'sized', label: 'By size' },
                  { value: 'count', label: 'Single count' },
                ]}
                value={form.mode}
                onChange={(v) => update('mode', v as InventoryMode)}
              />
              <p className="mt-2 text-[11px] text-neutral-500">
                By size tracks buckets (pinky, hopper, adult…). Single count is
                one number.
              </p>
            </div>
          </div>
        </section>

        {/* Inventory ----------------------------------------------------- */}
        <section className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/40">
          <h2 className={SECTION_HDR_CLS}>Inventory</h2>

          {form.mode === 'count' ? (
            <Field
              label="Count on hand"
              hint="Leave blank for 0 — you can restock anytime."
            >
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="0"
                value={form.count}
                onChange={(e) => update('count', e.target.value)}
                placeholder="0"
                className={`${INPUT_CLS} max-w-[10rem]`}
              />
            </Field>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className={LABEL_CLS + ' mb-0'}>Size buckets</span>
                {selectedSpecies &&
                  selectedSpecies.typical_sizes.length > 0 && (
                    <button
                      type="button"
                      onClick={seedFromSpeciesLadder}
                      className="text-xs text-herp-teal hover:text-herp-lime transition-colors"
                    >
                      Use {selectedSpecies.common_names[0] ||
                        selectedSpecies.scientific_name}{' '}
                      sizes
                    </button>
                  )}
              </div>

              <ul className="space-y-2">
                {form.buckets.map((b, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={b.size}
                      onChange={(e) =>
                        updateBucket(idx, { size: e.target.value })
                      }
                      placeholder="Size (e.g. pinky)"
                      maxLength={40}
                      className={`${INPUT_CLS} flex-1`}
                      list={`size-suggestions-${idx}`}
                    />
                    {selectedSpecies &&
                      selectedSpecies.typical_sizes.length > 0 && (
                        <datalist id={`size-suggestions-${idx}`}>
                          {selectedSpecies.typical_sizes.map((s) => (
                            <option key={s} value={s}>
                              {capitalize(s)}
                            </option>
                          ))}
                        </datalist>
                      )}
                    <input
                      type="number"
                      inputMode="numeric"
                      step="1"
                      min="0"
                      value={b.count}
                      onChange={(e) =>
                        updateBucket(idx, { count: e.target.value })
                      }
                      placeholder="0"
                      className={`${INPUT_CLS} w-24`}
                      aria-label={`Count for ${b.size || 'this size'}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeBucket(idx)}
                      disabled={form.buckets.length <= 1}
                      className="p-2 rounded-md text-neutral-500 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      aria-label="Remove size"
                      title="Remove size"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={addBucket}
                className="mt-3 text-xs text-herp-teal hover:text-herp-lime transition-colors"
              >
                ＋ Add another size
              </button>

              {isEdit && (
                <p className="mt-3 text-[11px] text-neutral-500">
                  Editing counts here overwrites the current numbers. For
                  day-to-day changes, use the Used / Restock buttons so your
                  history stays accurate.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Storage + threshold ------------------------------------------ */}
        <section className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/40">
          <h2 className={SECTION_HDR_CLS}>Storage &amp; alerts</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Storage location" hint="Optional.">
              <input
                type="text"
                value={form.storageLocation}
                onChange={(e) => update('storageLocation', e.target.value)}
                placeholder={form.form === 'frozen' ? 'Chest freezer' : 'Garage shelf'}
                maxLength={120}
                className={INPUT_CLS}
              />
            </Field>

            <Field
              label="Low-stock threshold"
              hint="Flag this stock when the total drops to or below this."
            >
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="0"
                value={form.lowThreshold}
                onChange={(e) => update('lowThreshold', e.target.value)}
                placeholder="5"
                className={`${INPUT_CLS} max-w-[10rem]`}
              />
            </Field>
          </div>
        </section>

        {/* Notes --------------------------------------------------------- */}
        <section className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/40">
          <h2 className={SECTION_HDR_CLS}>Notes</h2>
          <Field label="Anything worth remembering">
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={4}
              placeholder="Supplier, breeding notes, quality observations…"
              className={`${INPUT_CLS} resize-y`}
            />
          </Field>
        </section>

        {error && (
          <div
            role="alert"
            className="p-3 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-4 pt-2">
          <Link
            href={isEdit && stock ? `/app/feeders/${stock.id}` : '/app/feeders'}
            className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            ← Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="herp-gradient-bg text-herp-dark font-bold px-6 py-2.5 rounded-md tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add stock'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Local primitives
// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className={LABEL_CLS}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-neutral-500">{hint}</p>}
    </div>
  )
}

function SegToggle({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`px-4 py-2 rounded-md border text-sm transition-colors ${
              active
                ? 'border-herp-teal bg-herp-teal/10 text-herp-teal'
                : 'border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-neutral-700'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
