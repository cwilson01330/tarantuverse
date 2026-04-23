'use client'

/**
 * Add Reptile form.
 *
 * This is the *first* snake-creation UI in Herpetoverse — no mobile flow exists
 * yet, so every reptile in the product enters through this form. Accordingly:
 *
 *  - Sane defaults: sex=unknown, no required fields except a common name.
 *  - Species picker is encouraged (not forced) — without reptile_species_id the
 *    prey-suggestion endpoint can't compute stage/interval/ranges, so we nudge
 *    in UI rather than block submission.
 *  - Starting weight is offered inline so the weight trend chart has a data
 *    point day one. We submit that as current_weight_g on the snake; the
 *    keeper can add a formal weight log later.
 *
 * On success: router.push to /app/reptiles/{id} so the keeper immediately sees
 * the detail page they just populated.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import EnclosurePicker from '@/components/EnclosurePicker'
import ReptileSpeciesAutocomplete from '@/components/ReptileSpeciesAutocomplete'
import { ApiError } from '@/lib/apiClient'
import {
  createSnake,
  type CreateSnakePayload,
  type Sex,
  type Source,
} from '@/lib/snakes'

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

const INITIAL: FormState = {
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

// Shared input styling — matches the dark palette used elsewhere.
const INPUT_CLS =
  'w-full px-3 py-2.5 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-neutral-100 placeholder-neutral-600 disabled:opacity-50'
const LABEL_CLS =
  'block text-xs uppercase tracking-wider text-neutral-500 mb-1.5'
const SECTION_HDR_CLS =
  'text-[11px] uppercase tracking-[0.18em] text-herp-lime/80 font-medium mb-4'

export default function AddReptilePage() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(INITIAL)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Convert "" to null — backend prefers absent over empty strings.
  function nullableStr(s: string): string | null {
    const trimmed = s.trim()
    return trimmed === '' ? null : trimmed
  }

  function nullableNum(s: string): string | null {
    const trimmed = s.trim()
    if (trimmed === '') return null
    // Let Pydantic validate — sending the raw string is fine for Decimal fields.
    return trimmed
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)

    // Light client-side guard: if the user typed a weight/price/length that
    // isn't a number, catch it before hitting the server.
    const numericFields: Array<[keyof FormState, string]> = [
      ['pricePaid', 'Price paid'],
      ['currentWeightG', 'Starting weight'],
      ['currentLengthIn', 'Starting length'],
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
      const snake = await createSnake(payload)
      router.push(`/app/reptiles/${snake.id}`)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Could not save. Please try again.')
      } else {
        setError('Could not save. Check your connection and try again.')
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-8">
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
          New reptile
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-wide text-white mb-2">
          Add a reptile
        </h1>
        <p className="text-neutral-400 text-sm">
          The basics are enough to get started — you can always fill in more
          from the detail page.
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
                autoFocus
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
                    // Auto-fill common name only if the keeper hasn't typed one.
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
                hint="Optional — you can attach this later from the detail page."
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
        {/* Starting measurements */}
        {/* ------------------------------------------------------------- */}
        <section className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/40">
          <h2 className={SECTION_HDR_CLS}>Starting measurements</h2>
          <p className="text-xs text-neutral-500 mb-4">
            If you have them. A starting weight seeds the trend chart so the
            first real log has something to compare against.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Starting weight (g)">
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

            <Field label="Starting length (in)">
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
            href="/app/reptiles"
            className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            ← Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="herp-gradient-bg text-herp-dark font-bold px-6 py-2.5 rounded-md tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {submitting ? 'Saving…' : 'Save reptile'}
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
