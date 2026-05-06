'use client'

import { useEffect, useState } from 'react'

/**
 * Pause-feeding modal for tarantulas.
 *
 * Mirror of the Herpetoverse `PauseFeedingSheet` for the web. Lets a
 * keeper flag a feeding pause with a canonical reason (premolt /
 * post_rehouse / recovering / mating_season / other) and an optional
 * "until" date. Premolt is the headline use case — a 7-month-premolt
 * tarantula doesn't need a screaming "200 days overdue!" badge.
 *
 * Backed by `feeding_paused_reason` + `feeding_paused_until` columns
 * (see migration pst_20260502).
 */

interface PauseFeedingModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (reason: string, until: string | null) => Promise<void>
  initialReason?: string | null
  initialUntil?: string | null
}

const REASON_OPTIONS: { value: string; label: string; help: string }[] = [
  {
    value: 'premolt',
    label: 'Premolt',
    help: "She's in premolt and won't eat — common for slings and mature females.",
  },
  {
    value: 'post_rehouse',
    label: 'Post-rehouse',
    help: 'Settling into a new enclosure. Most spiders skip a feeding or two.',
  },
  {
    value: 'recovering',
    label: 'Recovering',
    help: 'After a fall, leg loss, or other stress. Wait until she steadies.',
  },
  {
    value: 'mating_season',
    label: 'Mating season',
    help: 'Mature male wandering, or breeding pause for a female.',
  },
  {
    value: 'other',
    label: 'Other',
    help: 'Add a note in the husbandry section if you want to remember why.',
  },
]

export default function PauseFeedingModal({
  isOpen,
  onClose,
  onSubmit,
  initialReason,
  initialUntil,
}: PauseFeedingModalProps) {
  const [reason, setReason] = useState<string>(initialReason || 'premolt')
  const [until, setUntil] = useState<string>(initialUntil || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-sync local state when the modal opens against a different
  // tarantula (initial values change).
  useEffect(() => {
    if (isOpen) {
      setReason(initialReason || 'premolt')
      setUntil(initialUntil || '')
      setError(null)
    }
  }, [isOpen, initialReason, initialUntil])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(reason, until || null)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause feedings')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Pause feedings
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Suppress overdue alerts while she's not eating.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Reason
              </label>
              <div className="space-y-2">
                {REASON_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                      reason === opt.value
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pause-reason"
                      value={opt.value}
                      checked={reason === opt.value}
                      onChange={() => setReason(opt.value)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {opt.label}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {opt.help}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="pause-until"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Until <span className="text-gray-400">(optional)</span>
              </label>
              <input
                id="pause-until"
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Leave blank to pause indefinitely. Past dates auto-resume.
              </p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 p-3 text-sm text-red-800 dark:text-red-200">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Pause feedings'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
