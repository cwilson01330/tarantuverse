'use client'

/**
 * Add Reptile form.
 *
 * The web entry point for keeper-created reptiles in Herpetoverse (the
 * mobile app has its own create flow at app/reptile/add.tsx).
 * The form is taxon-aware: a segmented toggle at the top switches
 * between snake, lizard, and frog creation. All other fields are
 * identical across taxa — ADR-003 collapsed them onto one AnimalBase
 * schema, so the form shape never branches.
 *
 * Design notes:
 *  - Sane defaults: sex=unknown, no required fields except a common name.
 *  - Species picker is encouraged (not forced) — without a
 *    herp_species_id the prey-suggestion endpoint can't compute
 *    stage/interval/ranges, so we nudge in UI rather than block submit.
 *    The species library is shared across taxa; today nothing prevents
 *    a keeper from picking a snake species for a lizard record. That's
 *    a known rough edge — intentional for v1 so the search surface
 *    stays simple. Taxon-filtered search is a follow-up.
 *  - Starting weight is offered inline so the weight trend chart has a
 *    data point day one.
 *
 * On success: router.push to the unified detail page
 * (/app/reptiles/{id} — ADR-003 collapsed the per-taxon route trees) so
 * the keeper immediately sees the record they just created.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import EnclosurePicker from '@/components/EnclosurePicker'
import ReptileSpeciesAutocomplete from '@/components/ReptileSpeciesAutocomplete'
import { ApiError } from '@/lib/apiClient'
import {
  createAnimal,
  type CreateAnimalPayload,
  type Sex,
  type Source,
} from '@/lib/animals'

type Taxon = 'snake' | 'lizard' | 'frog'

// Per-taxon example values for input placeholders, so the form speaks
// the keeper's animal instead of always sounding snake-first.
const TAXON_EXAMPLES: Record<
  Taxon,
  {
    nickname: string
    scientific: string
    common: string
    weight: string
    length: string
  }
> = {
  snake: {
    nickname: 'Samson',
    scientific: 'Python regius',
    common: 'Ball python',
    weight: '145',
    length: '24',
  },
  lizard: {
    nickname: 'Kiwi',
    scientific: 'Eublepharis macularius',
    common: 'Leopard gecko',
    weight: '60',
    length: '8',
  },
  frog: {
    nickname: 'Bean',
    scientific: 'Ceratophrys ornata',
    common: 'Pacman frog',
    weight: '90',
    length: '4',
  },
}

interface FormState {
  taxon: Taxon
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
  taxon: 'snake',
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

    // ADR-003: one unified animals endpoint — the taxon discriminator
    // rides in the payload instead of routing to per-taxon endpoints.
    const payload: CreateAnimalPayload = {
      taxon: form.taxon,
      name: nullableStr(form.name),
      common_name: nullableStr(form.commonName),
      scientific_name: nullableStr(form.scientificName),
      herp_species_id: form.speciesId,
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
      const animal = await createAnimal(payload)
      // ADR-003: one taxon-agnostic detail route for every taxon.
      router.push(`/app/reptiles/${animal.id}`)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Could not save. Please try again.')
      } else {
        setError('Could not save. Check your connection and try again.')
      }
      setSubmitting(false)
    }
  }

  // Placeholder examples for the currently-selected taxon.
  const ex = TAXON_EXAMPLES[form.taxon]

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
        {/* Taxon picker — sets the `taxon` discriminator on the record   */}
        {/* and drives the taxon-aware placeholder examples below.        */}
        {/* ------------------------------------------------------------- */}
        <TaxonToggle
          value={form.taxon}
          onChange={(next) => update('taxon', next)}
        />

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
                placeholder={ex.nickname}
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
                  placeholder={ex.scientific}
                />
              </Field>
            </div>

            <Field label="Common name">
              <input
                type="text"
                value={form.commonName}
                onChange={(e) => update('commonName', e.target.value)}
                placeholder={ex.common}
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
                placeholder={ex.weight}
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
                placeholder={ex.length}
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
            {submitting ? 'Saving…' : `Save ${form.taxon}`}
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

/**
 * Segmented taxon toggle. Rendered as radio buttons under the hood
 * (group labeled "Animal type") so keyboard + screen reader users get a
 * proper grouped-control experience, not three disconnected buttons.
 */
function TaxonToggle({
  value,
  onChange,
}: {
  value: Taxon
  onChange: (next: Taxon) => void
}) {
  const options: Array<{ value: Taxon; label: string; glyph: string }> = [
    { value: 'snake', label: 'Snake', glyph: '🐍' },
    { value: 'lizard', label: 'Lizard', glyph: '🦎' },
    { value: 'frog', label: 'Frog', glyph: '🐸' },
  ]

  return (
    <fieldset className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/40">
      <legend className={`${SECTION_HDR_CLS} px-2`}>What are you adding?</legend>
      <div
        role="radiogroup"
        aria-label="Animal type"
        className="grid grid-cols-3 gap-3"
      >
        {options.map((opt) => {
          const active = opt.value === value
          return (
            <label
              key={opt.value}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-md border cursor-pointer transition-colors ${
                active
                  ? 'border-herp-teal bg-herp-teal/10 text-herp-teal'
                  : 'border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900'
              }`}
            >
              <input
                type="radio"
                name="taxon"
                value={opt.value}
                checked={active}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
              <span aria-hidden="true" className="text-base">
                {opt.glyph}
              </span>
              <span className="text-sm font-medium tracking-wide">
                {opt.label}
              </span>
            </label>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] text-neutral-500 px-1">
        Don&apos;t worry — you can still log feedings, weights, sheds, and
        photos for any of them. This just sets what kind of animal the
        record is.
      </p>
    </fieldset>
  )
}
