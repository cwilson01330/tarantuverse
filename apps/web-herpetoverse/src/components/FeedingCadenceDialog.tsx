'use client'

/**
 * Set or clear a keeper's own feeding interval. ADR-017.
 *
 * WHY IT MATTERS MORE ON THE REPTILE SIDE
 * ---------------------------------------
 * Invertebrate cadences cluster in days, so a species default there is a decent
 * safety net. Reptiles span a daily-fed juvenile gecko to a monthly-fed adult
 * boa, which is why the API walks a careful chain — complete diet, weight
 * bracket, the keeper's written schedule, species frequency — and returns
 * nothing rather than guessing when they all miss.
 *
 * A number the keeper states is the only cadence that can be known rather than
 * inferred, so it outranks every one of those.
 */
import { useEffect, useState } from 'react'
import { updateAnimal, bulkSetFeedingCadence } from '@/lib/animals'

/** Wider spread than the invert set — a spider's options would be wrong here. */
const PRESETS = [3, 7, 10, 14, 21, 30]

interface Props {
  open: boolean
  onClose: () => void
  animalId: string
  /** Current keeper-set value, or null when the app is working it out. */
  current: number | null
  onChange: () => void
}

export function FeedingCadenceDialog({
  open,
  onClose,
  animalId,
  current,
  onChange,
}: Props) {
  const [days, setDays] = useState('')
  const [applyAll, setApplyAll] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDays(String(current ?? 14))
    setError(null)
    // Off on every open. Applying to a whole collection is chosen deliberately,
    // never inherited from a previous visit.
    setApplyAll(false)
  }, [open, current])

  if (!open) return null

  const parsed = parseInt(days, 10)
  const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 365

  async function save(value: number | null) {
    setError(null)
    setSubmitting(true)
    try {
      if (applyAll) {
        await bulkSetFeedingCadence(value)
      } else {
        await updateAnimal(animalId, { feeding_interval_days: value })
      }
      onChange()
      onClose()
    } catch (err: unknown) {
      // Stays open so the number isn't lost.
      setError(err instanceof Error ? err.message : 'Could not save.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-neutral-900 border border-neutral-800 p-6">
        <h2 className="text-lg font-semibold text-neutral-100">Feeding schedule</h2>
        <p className="mt-1 text-sm text-neutral-400">
          How often do you feed this animal? We&apos;ll use your number instead
          of working one out — nothing else changes.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setDays(String(n))}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                parsed === n
                  ? 'border-emerald-500 bg-emerald-500 text-neutral-950'
                  : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
              }`}
            >
              {n}d
            </button>
          ))}
        </div>

        <label className="mt-5 block text-xs uppercase tracking-wider text-neutral-500">
          Or enter days
        </label>
        <input
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-emerald-500 focus:outline-none"
        />

        <label className="mt-4 flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={applyAll}
            onChange={(e) => setApplyAll(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-neutral-600"
          />
          <span className="text-sm text-neutral-300">
            Apply to every animal in my collection
            <span className="block text-xs text-neutral-500">
              You can still change any individual afterwards.
            </span>
          </span>
        </label>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <button
          type="button"
          onClick={() => valid && save(parsed)}
          disabled={!valid || submitting}
          className="mt-5 w-full rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-neutral-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {submitting
            ? 'Saving…'
            : applyAll
              ? `Feed everything every ${valid ? parsed : '—'} days`
              : `Feed every ${valid ? parsed : '—'} days`}
        </button>

        {current != null && (
          <button
            type="button"
            onClick={() => save(null)}
            disabled={submitting}
            className="mt-3 w-full text-sm text-neutral-400 underline hover:text-neutral-200 disabled:opacity-50"
          >
            Go back to working it out for me
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="mt-4 w-full rounded-lg px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-800 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
