'use client'

/**
 * Typed-confirm delete for one animal.
 *
 * Deleting an animal also deletes every pairing it is a parent in (FK
 * cascade), and those pairings take their clutches and offspring records
 * with them. That used to happen silently — the confirm only mentioned
 * logs and photos. This modal asks the API what else goes
 * (GET /animals/{id}/delete-impact) and says so, with counts, before the
 * keeper types the name.
 *
 * Used by the edit page's Danger Zone and by the detail page for records
 * that are closed (died / transferred), where Edit isn't offered.
 */
import { useEffect, useState } from 'react'
import { ApiError } from '@/lib/apiClient'
import {
  type Animal,
  type DeleteImpact,
  animalTitle,
  deleteAnimal,
  deleteAnimalConfirmText,
  getDeleteImpact,
} from '@/lib/animals'

export default function DeleteAnimalModal({
  animal,
  onCancel,
  onDeleted,
}: {
  animal: Animal
  onCancel: () => void
  onDeleted: () => void
}) {
  // Only worth suggesting for a living record — a died or handed-off one
  // is already kept as history.
  const offerMarkDied = !animal.died_at && !animal.transferred_out_at
  const title = animalTitle(animal)
  const [typed, setTyped] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // undefined = still loading; null = couldn't load (the sentence then says
  // pairings MAY go, rather than implying nothing else does).
  const [impact, setImpact] = useState<DeleteImpact | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    getDeleteImpact(animal.id)
      .then((i) => { if (!cancelled) setImpact(i) })
      .catch(() => { if (!cancelled) setImpact(null) })
    return () => { cancelled = true }
  }, [animal.id])

  const matches = typed.trim() === title

  async function handleDelete() {
    if (!matches || submitting || impact === undefined) return
    setError(null)
    setSubmitting(true)
    try {
      await deleteAnimal(animal.id)
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

  const breeding = impact != null && impact.pairings > 0

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
        <p
          className={`text-sm mb-3 ${breeding ? 'text-amber-200' : 'text-neutral-400'}`}
          aria-live="polite"
        >
          {impact === undefined
            ? 'Checking what else this removes…'
            : deleteAnimalConfirmText(impact)}
        </p>
        {breeding && offerMarkDied && (
          <p className="text-xs text-neutral-500 mb-3">
            If it died, marking it as died keeps the record and its breeding
            history instead.
          </p>
        )}
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
            disabled={!matches || submitting || impact === undefined}
            className="text-sm font-semibold px-4 py-2 rounded-md bg-red-500/80 text-white hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  )
}
