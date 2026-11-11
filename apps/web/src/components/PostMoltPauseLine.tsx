'use client'

/**
 * "Feeding reminders pause until Nov 24 — check the fangs are fully black…"
 * line for the molt form (Effortless logging, task 6). Web twin of
 * apps/mobile/src/components/PostMoltPauseLine.tsx.
 *
 * Shown only when the owner's switch is on and the taxon has a window (or an
 * existing molt carries an override above zero). `Change` offers a last paused day
 * or "Don't pause". The parent sends `feeding_pause_days` only when the keeper
 * touched it, so an untouched form keeps the default (null on the server).
 */
import { useCallback, useEffect, useState } from 'react'
import { effectivePauseDays, isPauseActive, moltFormLine, pauseDaysFor, pauseUntil } from '@/lib/postMolt'

/** The keeper's local calendar day as YYYY-MM-DD. */
function localToday(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface PauseInfo {
  enabled: boolean
  default_days: number | null
}

/** Form state: the molt's own window (null = default) and whether the keeper touched it. */
export function usePostMoltPause() {
  const [override, setOverride] = useState<number | null>(null)
  const [touched, setTouched] = useState(false)
  /** Seed from a saved molt (edit mode). Not a keeper change, so nothing is sent. */
  const load = useCallback((saved: number | null | undefined) => {
    setOverride(saved ?? null)
  }, [])
  const choose = useCallback((days: number) => {
    setOverride(days)
    setTouched(true)
  }, [])
  /** Spread into the save payload: nothing unless the keeper changed it. */
  const payload: { feeding_pause_days?: number } =
    touched && override != null ? { feeding_pause_days: override } : {}
  return { override, touched, load, choose, payload }
}

interface Props {
  /** Animal id for the settings lookup (a tarantula's id is its invert id). */
  invertId: string | undefined
  token: string | null | undefined
  /** Molt day, YYYY-MM-DD (local). */
  moltDate: string
  override: number | null
  onChoose: (days: number) => void
}

export default function PostMoltPauseLine({ invertId, token, moltDate, override, onChoose }: Props) {
  const [info, setInfo] = useState<PauseInfo | null>(null)
  const [changing, setChanging] = useState(false)

  useEffect(() => {
    if (!invertId || !token) return
    let live = true
    fetch(`${API_URL}/api/v1/inverts/${invertId}/post-molt-pause`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d) setInfo(d) })
      .catch(() => { /* no line is the safe fallback */ })
    return () => { live = false }
  }, [invertId, token])

  if (!info?.enabled) return null
  if (!info.default_days && !((override ?? 0) > 0)) return null

  const days = effectivePauseDays(info.default_days, override)
  const until = days != null ? pauseUntil(moltDate, days) : null

  // A back-dated molt whose window already ended pauses nothing: no line.
  if (until && !isPauseActive(until, localToday())) return null

  return (
    <div className="rounded-lg border border-theme bg-surface p-3 text-sm space-y-1.5">
      <p className="text-theme-secondary">
        {until ? moltFormLine(until) : "Feeding reminders won't pause after this molt."}
      </p>
      <button
        type="button"
        onClick={() => setChanging((v) => !v)}
        aria-expanded={changing}
        className="font-semibold text-primary-600 dark:text-primary-400 hover:underline"
      >
        Change
      </button>
      {changing && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-theme-tertiary">
            Pause until
            <input
              type="date"
              value={until ?? moltDate}
              min={moltDate}
              onChange={(e) => {
                if (!e.target.value) return
                const n = pauseDaysFor(moltDate, e.target.value)
                if (n != null) onChoose(n)
                setChanging(false)
              }}
              className="ml-2 px-3 py-1.5 border border-theme rounded-lg bg-surface text-theme-primary normal-case tracking-normal font-normal focus:outline-none focus:ring-2 focus:ring-electric-blue-500"
            />
          </label>
          <button
            type="button"
            onClick={() => { onChoose(0); setChanging(false) }}
            className="font-semibold text-theme-secondary hover:underline"
          >
            Don&apos;t pause
          </button>
        </div>
      )}
    </div>
  )
}
