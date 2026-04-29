'use client'

/**
 * Log a new clutch under a pairing.
 *
 * Form is mostly optional fields — keepers fill data in as they
 * observe it. The only required field is `laid_date`. Counts +
 * incubation conditions live behind a "more details" disclosure so
 * the initial form is short and welcoming.
 */

import Link from 'next/link'
import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError } from '@/lib/apiClient'
import {
  type CreateClutchPayload,
  createClutch,
} from '@/lib/breeding'

interface Params {
  id: string
}

export default function NewClutchPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { id: pairingId } = use(params)
  const router = useRouter()

  const [laidDate, setLaidDate] = useState<string>(todayISO)
  const [pulledDate, setPulledDate] = useState<string>('')
  const [expectedHatchDate, setExpectedHatchDate] = useState<string>('')
  const [hatchDate, setHatchDate] = useState<string>('')

  const [tempMin, setTempMin] = useState<string>('')
  const [tempMax, setTempMax] = useState<string>('')
  const [humMin, setHumMin] = useState<string>('')
  const [humMax, setHumMax] = useState<string>('')

  const [expectedCount, setExpectedCount] = useState<string>('')
  const [fertileCount, setFertileCount] = useState<string>('')
  const [slugCount, setSlugCount] = useState<string>('')
  const [hatchedCount, setHatchedCount] = useState<string>('')
  const [viableCount, setViableCount] = useState<string>('')

  const [notes, setNotes] = useState<string>('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)

    const payload: CreateClutchPayload = {
      pairing_id: pairingId,
      laid_date: laidDate,
      pulled_date: pulledDate || null,
      expected_hatch_date: expectedHatchDate || null,
      hatch_date: hatchDate || null,
      incubation_temp_min_f: numOrNull(tempMin),
      incubation_temp_max_f: numOrNull(tempMax),
      incubation_humidity_min_pct: intOrNull(humMin),
      incubation_humidity_max_pct: intOrNull(humMax),
      expected_count: intOrNull(expectedCount),
      fertile_count: intOrNull(fertileCount),
      slug_count: intOrNull(slugCount),
      hatched_count: intOrNull(hatchedCount),
      viable_count: intOrNull(viableCount),
      notes: notes.trim() || null,
    }

    setSubmitting(true)
    try {
      const created = await createClutch(payload)
      router.push(`/app/breeding/clutches/${created.id}`)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't save the clutch.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <article className="max-w-2xl mx-auto">
      <Link
        href={`/app/breeding/pairings/${pairingId}`}
        className="inline-flex items-center gap-1.5 text-sm text-herp-teal hover:text-herp-lime mb-6"
      >
        <span aria-hidden="true">←</span> Pairing
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-wide mb-1">
          New clutch
        </h1>
        <p className="text-sm text-neutral-400">
          Record what was laid. You can update incubation conditions and
          counts later as the clutch develops.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Laid date" required>
          <input
            type="date"
            value={laidDate}
            onChange={(e) => setLaidDate(e.target.value)}
            required
            className={INPUT_CLS}
          />
        </Field>

        <Field
          label="Initial egg count (optional)"
          hint="Total eggs laid — fertile + slug + anything in-between."
        >
          <input
            type="number"
            min={0}
            max={200}
            value={expectedCount}
            onChange={(e) => setExpectedCount(e.target.value)}
            placeholder="e.g. 8"
            className={INPUT_CLS}
          />
        </Field>

        <details className="rounded-md border border-neutral-800 bg-neutral-900/30 p-3 group open:bg-neutral-900/50 transition-colors">
          <summary className="cursor-pointer text-xs uppercase tracking-wider text-neutral-400 hover:text-neutral-200 list-none flex items-center gap-2">
            <span aria-hidden="true" className="transition-transform group-open:rotate-90">
              ▸
            </span>
            Incubation + lifecycle (optional)
          </summary>

          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pulled">
                <input
                  type="date"
                  value={pulledDate}
                  onChange={(e) => setPulledDate(e.target.value)}
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Expected hatch">
                <input
                  type="date"
                  value={expectedHatchDate}
                  onChange={(e) => setExpectedHatchDate(e.target.value)}
                  className={INPUT_CLS}
                />
              </Field>
            </div>

            <Field label="Actual hatch date">
              <input
                type="date"
                value={hatchDate}
                onChange={(e) => setHatchDate(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Temp min (°F)">
                <input
                  type="number"
                  min={40}
                  max={120}
                  step={0.1}
                  value={tempMin}
                  onChange={(e) => setTempMin(e.target.value)}
                  placeholder="e.g. 86"
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Temp max (°F)">
                <input
                  type="number"
                  min={40}
                  max={120}
                  step={0.1}
                  value={tempMax}
                  onChange={(e) => setTempMax(e.target.value)}
                  placeholder="e.g. 91"
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Humidity min %">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={humMin}
                  onChange={(e) => setHumMin(e.target.value)}
                  placeholder="e.g. 75"
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Humidity max %">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={humMax}
                  onChange={(e) => setHumMax(e.target.value)}
                  placeholder="e.g. 95"
                  className={INPUT_CLS}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Fertile">
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={fertileCount}
                  onChange={(e) => setFertileCount(e.target.value)}
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Slugs (infertile)">
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={slugCount}
                  onChange={(e) => setSlugCount(e.target.value)}
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Hatched">
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={hatchedCount}
                  onChange={(e) => setHatchedCount(e.target.value)}
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Viable past 1 wk">
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={viableCount}
                  onChange={(e) => setViableCount(e.target.value)}
                  className={INPUT_CLS}
                />
              </Field>
            </div>
          </div>
        </details>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Maternal vs. artificial incubation, candling notes, hiccups…"
            className={INPUT_CLS}
          />
        </Field>

        {error && (
          <div
            role="alert"
            className="p-3 rounded-md border border-red-500/40 bg-red-500/10 text-xs text-red-300"
          >
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-md herp-gradient-bg text-herp-dark text-sm font-semibold disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save clutch'}
          </button>
          <Link
            href={`/app/breeding/pairings/${pairingId}`}
            className="px-4 py-2.5 rounded-md border border-neutral-800 text-neutral-300 text-sm font-medium hover:text-neutral-100"
          >
            Cancel
          </Link>
        </div>
      </form>
    </article>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-neutral-500">{hint}</p>}
    </div>
  )
}

const INPUT_CLS =
  'w-full px-3 py-2 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-sm text-neutral-100 placeholder-neutral-600'

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function numOrNull(s: string): number | null {
  if (!s.trim()) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function intOrNull(s: string): number | null {
  if (!s.trim()) return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}
