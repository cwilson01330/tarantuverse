'use client'

/**
 * Set or clear a keeper's own feeding interval. ADR-017.
 *
 * WHY THIS EXISTS
 * ---------------
 * A keeper who feeds weekly against a care sheet saying every 3 days is told
 * she's behind on every animal she owns, every day. The sheets aren't wrong —
 * the platform median really is 4 days for slings and juveniles — but there was
 * no way to say "this is my cadence". This is that.
 *
 * WHY IT ALWAYS PUTS TO /inverts/{id}
 * -----------------------------------
 * `feeding_interval_days` exists on `inverts` only, deliberately: feeding status
 * is computed from that table, so a copy on `tarantulas` would be a shared
 * column needing dual-write mirrors for no benefit. The legacy tarantula detail
 * page normally PUTs to /tarantulas/{id}, which would silently drop this field.
 * The two tables share a primary key, so addressing /inverts/{id} works for a
 * tarantula and for every other taxon, from either page.
 *
 * The endpoint is a partial update (`exclude_unset`), so sending this one field
 * touches nothing else.
 */
import { useEffect, useState } from 'react'
import { readApiError } from '@/lib/api-error'

/** Common cadences, so the usual answer is one click rather than typing. */
const PRESETS = [3, 4, 5, 7, 10, 14]

interface Props {
  open: boolean
  animalId: string
  token: string | null
  /** Current keeper-set value, or null when the app is deriving it. */
  current: number | null
  /** The derived interval and its provenance, for honest framing. */
  derivedDays: number | null
  derivedSource: string | null
  onClose: () => void
  onSaved: () => void
}

export default function FeedingCadenceDialog({
  open,
  animalId,
  token,
  current,
  derivedDays,
  derivedSource,
  onClose,
  onSaved,
}: Props) {
  const [days, setDays] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applyAll, setApplyAll] = useState(false)

  useEffect(() => {
    if (!open) return
    // Seed with whatever is in force today — their number if set, else the
    // derived one. Starting from current reality beats an empty box.
    setDays(String(current ?? derivedDays ?? 7))
    setError(null)
    // Always defaults off. Applying to a whole collection is a big action and
    // must be chosen every time, never inherited from a previous visit.
    setApplyAll(false)
  }, [open, current, derivedDays])

  if (!open) return null

  const parsed = parseInt(days, 10)
  const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 365

  const save = async (value: number | null) => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      // ADR-017 Phase 3. Clearing applies to all as well when chosen — a
      // keeper who set a cadence collection-wide needs the same reach to undo
      // it, or the bulk action is a one-way door.
      const res = applyAll
        ? await fetch(`${API_URL}/api/v1/inverts/bulk-feeding-cadence`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ feeding_interval_days: value, apply_to_all: true }),
          })
        : await fetch(`${API_URL}/api/v1/inverts/${animalId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ feeding_interval_days: value }),
          })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(readApiError(body, 'Could not save that.'))
      }
      onSaved()
      onClose()
    } catch (e: any) {
      // Stays open on failure so the number isn't lost.
      setError(e?.message || 'Could not save that.')
    } finally {
      setSaving(false)
    }
  }

  // Name what clearing returns to, and only call it the care sheet when the
  // derived value genuinely came from one.
  const fallbackLabel =
    derivedSource === 'species'
      ? `the care sheet (every ${derivedDays} days)`
      : derivedDays
        ? `our default (every ${derivedDays} days)`
        : 'our default'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          Feed on my own schedule
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          How often do you feed this animal? We&apos;ll use your number instead of
          the care sheet — nothing else changes.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setDays(String(n))}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                parsed === n
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {n}d
            </button>
          ))}
        </div>

        <label className="mt-5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Or enter days
        </label>
        <input
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="mt-1 w-full rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
        />

        {/* Phase 3 — the answer for someone who feeds their whole collection
            the same way. Setting the same number thirty seven times is a chore
            that replaces a complaint, not a fix. Off by default and re-chosen
            every time, because it reaches everything they own. */}
        <label className="mt-4 flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={applyAll}
            onChange={(e) => setApplyAll(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600"
          />
          <span className="text-sm text-gray-600 dark:text-gray-300">
            Apply to every animal in my collection
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              You can still change any individual afterwards.
            </span>
          </span>
        </label>

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="button"
          onClick={() => valid && save(parsed)}
          disabled={!valid || saving}
          className="mt-5 w-full rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50"
        >
          {saving
            ? 'Saving…'
            : applyAll
              ? `Feed everything every ${valid ? parsed : '—'} days`
              : `Feed every ${valid ? parsed : '—'} days`}
        </button>

        {current != null && (
          <button
            type="button"
            onClick={() => save(null)}
            disabled={saving}
            className="mt-3 w-full text-sm text-gray-500 dark:text-gray-400 underline hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50"
          >
            Go back to {fallbackLabel}
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="mt-4 w-full rounded-lg px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
