'use client'

/**
 * PauseFeedingDialog — set or clear the `feeding_paused_reason` /
 * `feeding_paused_until` flags on a snake or lizard.
 *
 * Why this exists: snakes (especially ball pythons) routinely refuse food
 * for months during hunger strikes, brumation prep, post-rehouse settling,
 * or breeding. Without a way to mute the FeedingStatusBanner, a 6-month
 * hunger strike pulses red every day, and the keeper tunes out alerts
 * across their whole collection. This is the mute button.
 *
 * UX mirrors the mobile PauseFeedingSheet so keepers using both surfaces
 * see the same reasons and copy:
 *   - 5 reason chips: hunger_strike / post_rehouse / recovering /
 *     breeding_season / other
 *   - Optional `until` date (YYYY-MM-DD). Blank = indefinite.
 *   - Save → updateSnake/updateLizard with the two fields
 *   - Resume → updateSnake/updateLizard with both cleared to null
 *
 * Brumation is a separate flag (`brumation_active`) handled elsewhere.
 */

import { useEffect, useState } from 'react'
import { updateSnake } from '@/lib/snakes'
import { updateLizard } from '@/lib/lizards'

type Taxon = 'snake' | 'lizard'

interface Props {
  open: boolean
  onClose: () => void
  taxon: Taxon
  animalId: string
  animalName?: string | null
  /** Current pause reason on the animal, if any. Drives the resume button. */
  currentReason: string | null
  currentUntil: string | null
  /** Called after a successful save/resume so the parent can refetch. */
  onChange: () => void
}

const REASON_OPTIONS: Array<{ value: string; label: string; helper: string }> = [
  {
    value: 'hunger_strike',
    label: 'Hunger strike',
    helper: 'Refusing meals — common for ball pythons in winter.',
  },
  {
    value: 'post_rehouse',
    label: 'Post-rehouse',
    helper: 'Settling into a new enclosure.',
  },
  {
    value: 'recovering',
    label: 'Recovering',
    helper: 'Post-illness, post-surgery, or post-regurgitation.',
  },
  {
    value: 'breeding_season',
    label: 'Breeding season',
    helper: 'Off-feed during pairing or post-laying.',
  },
  {
    value: 'other',
    label: 'Other',
    helper: 'Any other keeper-known reason.',
  },
]

export function PauseFeedingDialog({
  open,
  onClose,
  taxon,
  animalId,
  animalName,
  currentReason,
  currentUntil,
  onChange,
}: Props) {
  const isPaused = !!currentReason
  const [reason, setReason] = useState<string | null>(currentReason)
  const [until, setUntil] = useState<string>(currentUntil ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setReason(currentReason || 'hunger_strike')
      setUntil(currentUntil ?? '')
      setError(null)
      setSubmitting(false)
    }
  }, [open, currentReason, currentUntil])

  if (!open) return null

  function validateUntil(): string | null {
    if (!until.trim()) return null
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until.trim())) {
      return 'Use YYYY-MM-DD or leave blank for indefinite.'
    }
    const d = new Date(until.trim() + 'T00:00:00')
    if (Number.isNaN(d.getTime())) return "That date doesn't look right."
    return null
  }

  async function handleSave() {
    if (!reason) {
      setError('Pick a reason for the pause.')
      return
    }
    const v = validateUntil()
    if (v) {
      setError(v)
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const payload = {
        feeding_paused_reason: reason,
        feeding_paused_until: until.trim() || null,
      }
      if (taxon === 'snake') {
        await updateSnake(animalId, payload)
      } else {
        await updateLizard(animalId, payload)
      }
      onChange()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save.'
      setError(msg)
      setSubmitting(false)
    }
  }

  async function handleResume() {
    setError(null)
    setSubmitting(true)
    try {
      const payload = {
        feeding_paused_reason: null,
        feeding_paused_until: null,
      }
      if (taxon === 'snake') {
        await updateSnake(animalId, payload)
      } else {
        await updateLizard(animalId, payload)
      }
      onChange()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not resume.'
      setError(msg)
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isPaused ? 'Edit feeding pause' : 'Pause feeding reminders'}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-neutral-800">
          <h2 className="text-sm font-semibold text-white tracking-wide">
            {isPaused ? 'Edit pause' : 'Pause feeding reminders'}
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
            {animalName
              ? `Reminders for ${animalName} won't escalate to "overdue" while paused.`
              : "Reminders won't escalate to \"overdue\" while paused."}
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
              Reason
            </div>
            <div className="space-y-2">
              {REASON_OPTIONS.map((opt) => {
                const selected = reason === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setReason(opt.value)}
                    className={`w-full text-left flex items-start gap-3 p-3 rounded-md border transition ${
                      selected
                        ? 'border-herp-teal bg-neutral-900'
                        : 'border-neutral-800 hover:bg-neutral-900/50'
                    }`}
                  >
                    <div
                      className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 ${
                        selected ? 'border-herp-teal bg-herp-teal/30' : 'border-neutral-600'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white">{opt.label}</div>
                      <div className="text-xs text-neutral-400 mt-0.5">{opt.helper}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="pause-until"
              className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block mb-1"
            >
              Auto-resume on{' '}
              <span className="font-normal normal-case text-neutral-600">(optional)</span>
            </label>
            <input
              id="pause-until"
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md bg-neutral-900 border border-neutral-800 text-white focus:outline-none focus:border-herp-teal"
            />
            <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
              Leave blank if you don&apos;t know when feeding will resume.
              Hunger strikes can run months — that&apos;s fine.
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-900/30 border border-red-700/50 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-neutral-800 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className="herp-gradient-bg text-herp-dark font-semibold text-sm px-4 py-2 rounded-md disabled:opacity-50"
          >
            {submitting ? 'Saving…' : isPaused ? 'Update pause' : 'Pause feeding'}
          </button>

          {isPaused && (
            <button
              type="button"
              onClick={handleResume}
              disabled={submitting}
              className="text-sm font-medium text-neutral-300 hover:text-white border border-neutral-800 hover:border-neutral-700 rounded-md px-4 py-2 transition disabled:opacity-50"
            >
              Resume feeding now
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-sm text-neutral-500 hover:text-neutral-300 px-4 py-2 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default PauseFeedingDialog
