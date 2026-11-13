'use client'

/**
 * Hatch an egg sac: start a group of slings (nymphs, scorplings) from it.
 * THE DIALOG IS THE CONFIRM. One count, an "about" box for estimates, and
 * the hatch date (today by default). On success the caller opens the new
 * group.
 *
 * At the free cap the API answers 402. The dialog stays open and says how
 * many fit; the owner gets a "See plans" action, a co-keeper is told the
 * owner can upgrade (the cap is the owner's, an upgrade prompt for anyone
 * else would sell something that doesn't help). Web counterpart of the
 * mobile HatchSheet.
 */
import { useEffect, useState } from 'react'
import { broodBucket, hatchButtonLabel } from '@/lib/inverts'
import { splitCapText } from '@/lib/broods'
import {
  HATCH_MAX,
  buildHatchPayload,
  capDetailFromBody,
  hatchCapMessage,
  type CapDetail,
} from '@/lib/eggSacs'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function todayIso(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

interface Props {
  open: boolean
  onClose: () => void
  token: string | null
  sacId: string
  taxon: string
  /** Starting count, e.g. from the sac's own count. */
  initialCount?: number | null
  /** Owner can upgrade; a co-keeper only sees the text. */
  isOwner: boolean
  onHatched: (colonyId: string) => void
  /** "See plans" on a 402 (owner only): caller closes the dialog and opens the upgrade. */
  onUpgrade: (detail: CapDetail) => void
}

export default function HatchDialog({ open, onClose, token, sacId, taxon, initialCount, isOwner, onHatched, onUpgrade }: Props) {
  const [countText, setCountText] = useState('')
  const [estimated, setEstimated] = useState(false)
  const [date, setDate] = useState(todayIso())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [cap, setCap] = useState<CapDetail | null>(null)

  // A fresh open starts clean: no stale error or cap, today's date, the sac's own count.
  useEffect(() => {
    if (open) {
      setError('')
      setCap(null)
      setSaving(false)
      setEstimated(false)
      setDate(todayIso())
      setCountText(initialCount ? String(initialCount) : '')
    }
  }, [open, initialCount])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving, onClose])

  if (!open) return null

  const bucket = broodBucket(taxon)

  const close = () => {
    if (saving) return
    setError('')
    setCap(null)
    onClose()
  }

  const submit = async () => {
    if (saving || !token) return
    const built = buildHatchPayload({ countText, estimated, hatchedOn: date })
    if (!built.ok) {
      setError(built.error)
      return
    }
    setSaving(true)
    setError('')
    setCap(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/egg-sacs/${sacId}/hatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(built.payload),
      })
      if (res.status === 402) {
        const detail = capDetailFromBody(await res.json().catch(() => null))
        setCap(detail)
        setError(hatchCapMessage(splitCapText(detail.can_add ?? 0), isOwner))
        setSaving(false)
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const msg = typeof body?.detail === 'string' ? body.detail : 'Couldn’t save that. Nothing has changed. Try again.'
        setError(msg)
        setSaving(false)
        return
      }
      const data = await res.json()
      setSaving(false)
      onHatched(data.colony.id)
    } catch {
      // Stay open on failure: closing would look like it worked.
      setError('Couldn’t save that. Nothing has changed. Try again.')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={close}
      role="presentation"
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={hatchButtonLabel(taxon)}
      >
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">{hatchButtonLabel(taxon)}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
          {`This starts one group of ${bucket} you can feed, track and split up later.`}
        </p>

        <label htmlFor="hatch-count" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-5 mb-1">
          {`How many ${bucket}`}
        </label>
        <input
          id="hatch-count"
          type="text"
          inputMode="numeric"
          value={countText}
          onChange={(e) => setCountText(e.target.value)}
          placeholder={`1 to ${HATCH_MAX}`}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <label className="mt-3 flex items-center gap-2 text-sm text-gray-900 dark:text-white cursor-pointer">
          <input
            type="checkbox"
            checked={estimated}
            onChange={(e) => setEstimated(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500"
          />
          About this many
        </label>

        <label htmlFor="hatch-date" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-4 mb-1">
          Date hatched
        </label>
        <input
          id="hatch-date"
          type="date"
          value={date}
          max={todayIso()}
          onChange={(e) => setDate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />

        {error !== '' && (
          <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        {cap && isOwner && (
          <button
            type="button"
            onClick={() => {
              setError('')
              const c = cap
              setCap(null)
              onUpgrade(c)
            }}
            className="mt-2 text-sm font-semibold text-purple-700 dark:text-purple-400 hover:underline"
          >
            See plans
          </button>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="w-full px-4 py-2.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'Saving…' : `Start the ${bucket} group`}
          </button>
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="w-full px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
