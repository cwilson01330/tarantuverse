'use client'

/**
 * New offspring (hatchling) under a clutch.
 *
 * v1 keeps the form to the basics — most fields evolve over a
 * hatchling's life (status moves through hatched → kept/sold/etc.,
 * sale info added later, genotype refined as the morph clarifies).
 * The keeper can flesh those out on the offspring detail page once
 * the row exists.
 */

import Link from 'next/link'
import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError } from '@/lib/apiClient'
import {
  type CreateOffspringPayload,
  type OffspringStatus,
  OFFSPRING_STATUS_LABEL,
  createOffspring,
} from '@/lib/breeding'

interface Params {
  id: string
}

export default function NewOffspringPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { id: clutchId } = use(params)
  const router = useRouter()

  const [morphLabel, setMorphLabel] = useState('')
  const [status, setStatus] = useState<OffspringStatus>('hatched')
  const [statusDate, setStatusDate] = useState<string>(todayISO)
  const [hatchWeight, setHatchWeight] = useState<string>('')
  const [hatchLength, setHatchLength] = useState<string>('')
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    const payload: CreateOffspringPayload = {
      clutch_id: clutchId,
      morph_label: morphLabel.trim() || null,
      status,
      status_date: statusDate || null,
      hatch_weight_g: numOrNull(hatchWeight),
      hatch_length_in: numOrNull(hatchLength),
      notes: notes.trim() || null,
    }
    setSubmitting(true)
    try {
      const created = await createOffspring(payload)
      router.push(`/app/breeding/offspring/${created.id}`)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't save this offspring.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <article className="max-w-xl mx-auto">
      <Link
        href={`/app/breeding/clutches/${clutchId}`}
        className="inline-flex items-center gap-1.5 text-sm text-herp-teal hover:text-herp-lime mb-6"
      >
        <span aria-hidden="true">←</span> Clutch
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-wide mb-1">
          New hatchling
        </h1>
        <p className="text-sm text-neutral-400">
          Quick record. You can fill in genotype, sale, and status updates
          on the offspring detail page later.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="Morph label"
          hint='Free-text — e.g. "Pied het Albino", or just a name like "Hex Jr."'
        >
          <input
            value={morphLabel}
            onChange={(e) => setMorphLabel(e.target.value)}
            placeholder="Pied het Albino"
            className={INPUT_CLS}
          />
        </Field>

        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as OffspringStatus)}
            className={INPUT_CLS}
          >
            {(Object.keys(OFFSPRING_STATUS_LABEL) as OffspringStatus[]).map(
              (k) => (
                <option key={k} value={k}>
                  {OFFSPRING_STATUS_LABEL[k]}
                </option>
              ),
            )}
          </select>
        </Field>

        <Field label="Status date">
          <input
            type="date"
            value={statusDate}
            onChange={(e) => setStatusDate(e.target.value)}
            className={INPUT_CLS}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Hatch weight (g)">
            <input
              type="number"
              min={0}
              step={0.1}
              value={hatchWeight}
              onChange={(e) => setHatchWeight(e.target.value)}
              placeholder="e.g. 80"
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Hatch length (in)">
            <input
              type="number"
              min={0}
              step={0.1}
              value={hatchLength}
              onChange={(e) => setHatchLength(e.target.value)}
              placeholder="e.g. 14"
              className={INPUT_CLS}
            />
          </Field>
        </div>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="First feed, color/pattern observations…"
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

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-md herp-gradient-bg text-herp-dark text-sm font-semibold disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save hatchling'}
          </button>
          <Link
            href={`/app/breeding/clutches/${clutchId}`}
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
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">
        {label}
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function numOrNull(s: string): number | null {
  if (!s.trim()) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
