'use client'

/**
 * Edit Reptile form + Danger Zone.
 *
 * Mirrors /app/reptiles/add almost field-for-field — same sections, same
 * INPUT_CLS, same nullableStr/nullableNum helpers. Differences:
 *
 *  - We fetch the snake first and seed the form with its current values.
 *    Decimal fields arrive as strings; we keep them as strings in form state
 *    so the user can see what's there and re-type without precision loss.
 *  - On submit we PUT to /api/v1/snakes/{id}. SnakeUpdate on the backend has
 *    the same optional-field surface as SnakeCreate plus two denormalized
 *    timestamps (last_fed_at/last_shed_at) that only admin/bulk-import flows
 *    should touch — we never write those from this form.
 *  - Danger Zone: typed-confirm delete. CASCADE wipes all weight logs,
 *    feedings, sheds, and photos — the extra friction is load-bearing.
 *
 * Success routes to /app/reptiles/{id} so the keeper lands on the record
 * they just edited. Delete success routes to /app/reptiles so they don't
 * hit a 404 on the old detail URL.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import EnclosurePicker from '@/components/EnclosurePicker'
import ReptileSpeciesAutocomplete from '@/components/ReptileSpeciesAutocomplete'
import { ApiError } from '@/lib/apiClient'
import {
  type CreateSnakePayload,
  deleteSnake,
  getSnake,
  type Sex,
  type Snake,
  snakeTitle,
  type Source,
  updateSnake,
} from '@/lib/snakes'

// Form state mirrors /add — all strings so input round-tripping stays
// predictable. `null`s from the wire get normalized to '' here; we reverse
// that on submit via nullableStr/nullableNum.
interface FormState {
  name: string
  commonName: string
  scientificName: string
  speciesId: string | null
  enclosureId: string | null
  sex: Sex
  hatchDate: string
  dateAcquired: string
  source: '' | Source
  sourceBreeder: string
  pricePaid: string
  currentWeightG: string
  currentLengthIn: string
  notes: string
}

const EMPTY: FormState = {
  name: '',
  commonName: '',
  scientificName: '',
  speciesId: null,
  enclosureId: null,
  sex: 'unknown',
  hatchDate: '',
  dateAcquired: '',
  source: '',
  sourceBreeder: '',
  pricePaid: '',
  currentWeightG: '',
  currentLengthIn: '',
  notes: '',
}

// Shared styling — kept in sync with /add so the forms feel identical.
const INPUT_CLS =
  'w-full px-3 py-2.5 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-neutral-100 placeholder-neutral-600 disabled:opacity-50'
const LABEL_CLS =
  'block text-xs uppercase tracking-wider text-neutral-500 mb-1.5'
const SECTION_HDR_CLS =
  'text-[11px] uppercase tracking-[0.18em] text-herp-lime/80 font-medium mb-4'

/** Snake → FormState. Strings stay strings; nulls become ''. */
function snakeToForm(s: Snake): FormState {
  return {
    name: s.name ?? '',
    commonName: s.common_name ?? '',
    scientificName: s.scientific_name ?? '',
    speciesId: s.reptile_species_id,
    enclosureId: s.enclosure_id,
    sex: (s.sex as Sex | null) ?? 'unknown',
    hatchDate: s.hatch_date ?? '',
    dateAcquired: s.date_acquired ?? '',
    source: (s.source as Source | null) ?? '',
    sourceBreeder: s.source_breeder ?? '',
    pricePaid: s.price_paid ?? '',
    currentWeightG: s.current_weight_g ?? '',
    currentLengthIn: s.current_length_in ?? '',
    notes: s.notes ?? '',
  }
}

export default function EditReptileClient({ snakeId }: { snakeId: string }) {
  const router = useRouter()
  const [snake, setSnake] = useState<Snake | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load the snake once on mount. The auth layout above has already gated
  // on sign-in, so 401s here mean the token went stale — the apiClient
  // handles that with a session clear and re-login redirect.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getSnake(snakeId)
      .then((s) => {
        if (cancelled) return
        setSnake(s)
        setForm(snakeToForm(s))
        setLoadError(null)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) {
          setLoadError('Reptile not found.')
        } else if (err instanceof ApiError && err.status !== 401) {
          setLoadError(err.message)
        } else if (!(err instanceof ApiError)) {
          setLoadError('Could not load this reptile.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [snakeId])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function nullableStr(s: string): string | null {
    const trimmed = s.trim()
    return trimmed === '' ? null : trimmed
  }

  function nullableNum(s: string): string | null {
    const trimmed = s.trim()
    if (trimmed === '') return null
    return trimmed
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)

    // Same client-side numeric guard as /add — catches fat-fingered weight
    // before it round-trips to Pydantic.
    const numericFields: Array<[keyof FormState, string]> = [
      ['pricePaid', 'Price paid'],
      ['currentWeightG', 'Current weight'],
      ['currentLengthIn', 'Current length'],
    ]
    for (const [key, label] of numericFields) {
      const v = (form[key] as string).trim()
      if (v !== '' && Number.isNaN(Number(v))) {
        setError(`${label} must be a number.`)
        return
      }
    }

    const payload: CreateSnakePayload = {
      name: nullableStr(form.name),
      common_name: nullableStr(form.commonName),
      scientific_name: nullableStr(form.scientificName),
      reptile_species_id: form.speciesId,
      enclosure_id: form.enclosureId,
      sex: form.sex,
      hatch_date: nullableStr(form.hatchDate),
      date_acquired: nullableStr(form.dateAcquired),
      source: form.source === '' ? null : form.source,
      source_breeder: nullableStr(form.sourceBreeder),
      price_paid: nullableNum(form.pricePaid),
      current_weight_g: nullableNum(form.currentWeightG),
      current_length_in: nullableNum(form.currentLengthIn),
      notes: nullableStr(form.notes),
    }

    setSubmitting(true)
    try {
      await updateSnake(snakeId, payload)
      router.push(`/app/reptiles/${snakeId}`)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Could not save changes.')
      } else {
        setError('Could not save. Check your connection and try again.')
      }
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingShell />
  if (loadError || !snake) {
    return (
      <div className="max-w-3xl mx-auto">
        <BackLink snakeId={snakeId} />
        <div
          role="alert"
          className="mt-6 p-4 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
        >
          {loadError || 'Could not load this reptile.'}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <BackLink snakeId={snakeId} />
      <header className="mt-6 mb-8">
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
          Edit reptile
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-wide text-white mb-2">
          Edit {snakeTitle(snake)}
        </h1>
        <p className="text-neutral-400 text-sm">
          Changes save to the detail page. Deleting is permanent.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8" noValidate>
        {/* ------------------------------------------------------------- */}
        {/* Identity */}
        {/* ------------------------------------------------------------- */}
        <section className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/40">
          <h2 className={SECTION_HDR_CLS}>Identity</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nickname" hint="Optional — what you call them.">
              <input
                type="text"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Samson"
                maxLength={100}
                className={INPUT_CLS}
              />
            </Field>

            <Field label="Sex">
              <select
                value={form.sex}
                onChange={(e) => update('sex', e.target.value as Sex)}
                className={INPUT_CLS}
              >
                <option value="unknown">Unknown</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </Field>

            <div className="sm:col-span-2">
              <Field
                label="Species"
                hint={
                  form.speciesId
                    ? 'Linked — prey suggestions will work.'
                    : 'Pick from the library to unlock prey suggestions.'
                }
              >
                <ReptileSpeciesAutocomplete
                  speciesId={form.speciesId}
                  scientificName={form.scientificName}
                  onChange={({ id, scientificName }) => {
                    setForm((prev) => ({
                      ...prev,
                      speciesId: id,
                      scientificName,
                    }))
                  }}
                  onPick={(species) => {
                    // Only overwrite common name if it was blank — we don't
                    // want the picker to stomp a keeper's custom label.
                    setForm((prev) => ({
                      ...prev,
                      commonName:
                        prev.commonName.trim() === ''
                          ? species.common_names[0] || prev.commonName
                          : prev.commonName,
                    }))
                  }}
                />
              </Field>
            </div>

            <Field label="Common name">
              <input
                type="text"
                value={form.commonName}
                onChange={(e) => update('commonName', e.target.value)}
                placeholder="Ball python"
                maxLength={100}
                className={INPUT_CLS}
              />
            </Field>

            <Field label="Hatch date" hint="Drives stage-based prey ranges.">
              <input
                type="date"
                value={form.hatchDate}
                onChange={(e) => update('hatchDate', e.target.value)}
                className={INPUT_CLS}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field
                label="Enclosure"
                hint="Optional — you can attach or change this later from the detail page."
              >
                <EnclosurePicker
                  value={form.enclosureId}
                  onChange={(next) => update('enclosureId', next)}
                  className={INPUT_CLS}
                />
              </Field>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- */}
        {/* Measurements */}
        {/* ------------------------------------------------------------- */}
        <section className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/40">
          <h2 className={SECTION_HDR_CLS}>Current measurements</h2>
          <p className="text-xs text-neutral-500 mb-4">
            These are the denormalized values shown on the card. Weight is
            typically kept in sync by logging a weigh-in on the detail page —
            edit here only if you&rsquo;re correcting a data issue.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Current weight (g)">
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={form.currentWeightG}
                onChange={(e) => update('currentWeightG', e.target.value)}
                placeholder="145"
                className={INPUT_CLS}
              />
            </Field>

            <Field label="Current length (in)">
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={form.currentLengthIn}
                onChange={(e) => update('currentLengthIn', e.target.value)}
                placeholder="24"
                className={INPUT_CLS}
              />
            </Field>
          </div>
        </section>

        {/* ------------------------------------------------------------- */}
        {/* Acquisition */}
        {/* ------------------------------------------------------------- */}
        <section className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/40">
          <h2 className={SECTION_HDR_CLS}>Acquisition</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Date acquired">
              <input
                type="date"
                value={form.dateAcquired}
                onChange={(e) => update('dateAcquired', e.target.value)}
                className={INPUT_CLS}
              />
            </Field>

            <Field label="Source">
              <select
                value={form.source}
                onChange={(e) =>
                  update('source', e.target.value as FormState['source'])
                }
                className={INPUT_CLS}
              >
                <option value="">—</option>
                <option value="bred">Bred in-house</option>
                <option value="bought">Bought</option>
                <option value="wild_caught">Wild caught</option>
              </select>
            </Field>

            <Field label="Breeder / source name">
              <input
                type="text"
                value={form.sourceBreeder}
                onChange={(e) => update('sourceBreeder', e.target.value)}
                placeholder="Appalachian Tarantulas"
                maxLength={255}
                className={INPUT_CLS}
              />
            </Field>

            <Field label="Price paid (USD)">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={form.pricePaid}
                onChange={(e) => update('pricePaid', e.target.value)}
                placeholder="150.00"
                className={INPUT_CLS}
              />
            </Field>
          </div>
        </section>

        {/* ------------------------------------------------------------- */}
        {/* Notes */}
        {/* ------------------------------------------------------------- */}
        <section className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/40">
          <h2 className={SECTION_HDR_CLS}>Notes</h2>
          <Field label="Anything worth remembering">
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={4}
              placeholder="Temperament, feeding quirks, history…"
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
            href={`/app/reptiles/${snakeId}`}
            className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            ← Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="herp-gradient-bg text-herp-dark font-bold px-6 py-2.5 rounded-md tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      {/* ------------------------------------------------------------- */}
      {/* Danger Zone — separated from the form on purpose so it can't be */}
      {/* activated by an Enter keypress inside an input.                 */}
      {/* ------------------------------------------------------------- */}
      <DangerZone snake={snake} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Danger Zone — typed-confirm delete
// ---------------------------------------------------------------------------

function DangerZone({ snake }: { snake: Snake }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <section className="mt-12 p-6 rounded-lg border border-red-500/30 bg-red-500/5">
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-red-300/90 font-medium mb-3">
        Danger zone
      </h2>
      <p className="text-sm text-neutral-300 mb-1">
        Delete this reptile permanently.
      </p>
      <p className="text-xs text-neutral-500 mb-4 max-w-xl">
        This removes the record plus every weight log, feeding, shed, and
        photo attached to it. We don&rsquo;t keep a backup you can restore
        from. If you&rsquo;re rehoming, consider exporting first.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium px-4 py-2 rounded-md border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-500/60 transition-colors"
      >
        Delete this reptile…
      </button>

      {open && (
        <DeleteConfirmModal
          snake={snake}
          onCancel={() => setOpen(false)}
          onDeleted={() => {
            // After deletion the detail URL 404s, so punt back to the list.
            router.replace('/app/reptiles')
          }}
        />
      )}
    </section>
  )
}

function DeleteConfirmModal({
  snake,
  onCancel,
  onDeleted,
}: {
  snake: Snake
  onCancel: () => void
  onDeleted: () => void
}) {
  const title = snakeTitle(snake)
  const [typed, setTyped] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = typed.trim() === title

  async function handleDelete() {
    if (!matches || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await deleteSnake(snake.id)
      onDeleted()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Could not delete. Try again.')
      } else {
        setError('Could not delete. Check your connection and try again.')
      }
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-heading"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        // Click on the backdrop only — not on the modal body.
        if (e.target === e.currentTarget && !submitting) onCancel()
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-red-500/40 bg-neutral-950 p-6 shadow-xl">
        <h3
          id="delete-heading"
          className="text-lg font-semibold text-white mb-2"
        >
          Delete {title}?
        </h3>
        <p className="text-sm text-neutral-400 mb-1">
          This cannot be undone. All logs and photos attached to this reptile
          will be removed.
        </p>
        <p className="text-sm text-neutral-400 mb-4">
          Type{' '}
          <span className="font-mono text-red-300 px-1 py-0.5 rounded bg-red-500/10">
            {title}
          </span>{' '}
          to confirm.
        </p>

        <input
          type="text"
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={title}
          disabled={submitting}
          className="w-full px-3 py-2 rounded-md bg-neutral-900 border border-neutral-800 focus:border-red-500/60 focus:outline-none focus:ring-1 focus:ring-red-500/40 text-neutral-100 placeholder-neutral-600 disabled:opacity-50"
        />

        {error && (
          <div
            role="alert"
            className="mt-3 p-2.5 rounded-md border border-red-500/40 bg-red-500/10 text-xs text-red-300"
          >
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="text-sm text-neutral-400 hover:text-neutral-200 px-3 py-2 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!matches || submitting}
            className="text-sm font-semibold px-4 py-2 rounded-md bg-red-500/80 text-white hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Local primitives (kept local to this file — they match the add-form ones
// but importing across page boundaries would mean hoisting INPUT_CLS too,
// and the duplication is tiny)
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

function BackLink({ snakeId }: { snakeId: string }) {
  return (
    <Link
      href={`/app/reptiles/${snakeId}`}
      className="inline-flex items-center gap-1.5 text-sm text-herp-teal hover:text-herp-lime transition-colors"
    >
      <span aria-hidden="true">←</span> Back to detail
    </Link>
  )
}

function LoadingShell() {
  return (
    <div className="max-w-3xl mx-auto">
      <div
        className="mt-6 space-y-6"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="h-8 w-1/3 bg-neutral-900 rounded animate-pulse" />
        <div className="h-4 w-1/2 bg-neutral-900/70 rounded animate-pulse" />
        <div className="h-60 bg-neutral-900 rounded animate-pulse" />
        <div className="h-40 bg-neutral-900/70 rounded animate-pulse" />
      </div>
    </div>
  )
}
