'use client'

/**
 * Split animals out of a group: each becomes its own animal in the
 * collection (named "<group> #n" by the server). THE DIALOG IS THE CONFIRM.
 * Count steps 1..splitMax(total); the date defaults to today; life stage
 * defaults to sling. At the free cap the API answers 402; the dialog stays
 * open and says how many fit; the owner gets a "See plans" action, a
 * co-keeper is told to ask the owner. Web counterpart of the mobile
 * SplitOutSheet.
 */
import { useEffect, useState } from 'react'
import { splitCapText, splitMax, splitNoun } from '@/lib/broods'
import {
  SPLIT_STAGES,
  capDetailFromBody,
  splitCapMessage,
  type CapDetail,
  type SplitLifeStage,
  type SplitResult,
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
  colonyId: string
  taxon: string
  total: number
  name: string
  onDone: (result: SplitResult) => void
  /** Owner can upgrade; a co-keeper only sees the text (ask the owner). */
  isOwner: boolean
  /** "See plans" on a 402 (owner only): caller closes the dialog and opens the upgrade. */
  onUpgrade: (detail: CapDetail) => void
}

export default function SplitOutDialog({ open, onClose, token, colonyId, taxon, total, name, onDone, isOwner, onUpgrade }: Props) {
  const max = splitMax(total)
  const [count, setCount] = useState(1)
  const [date, setDate] = useState(todayIso())
  const [stage, setStage] = useState<SplitLifeStage>('sling')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [cap, setCap] = useState<CapDetail | null>(null)

  // A fresh open never shows the last attempt's error.
  useEffect(() => {
    if (open) {
      setError('')
      setCap(null)
      setSaving(false)
      setCount(1)
      setDate(todayIso())
      setStage('sling')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving, onClose])

  if (!open) return null

  const noun = splitNoun(taxon)
  const shown = Math.min(Math.max(count, 1), Math.max(max, 1))

  const close = () => {
    if (saving) return
    setError('')
    setCap(null)
    onClose()
  }

  const step = (delta: number) => setCount(Math.min(Math.max(shown + delta, 1), Math.max(max, 1)))

  const submit = async () => {
    if (saving || max < 1 || !token) return
    if (!date) {
      setError('Pick a date.')
      return
    }
    setSaving(true)
    setError('')
    setCap(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/colonies/${colonyId}/split-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ count: shown, split_on: date, life_stage: stage }),
      })
      if (res.status === 402) {
        const detail = capDetailFromBody(await res.json().catch(() => null))
        setCap(detail)
        setError(splitCapMessage(splitCapText(detail.can_add ?? 0), isOwner))
        setSaving(false)
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(typeof body?.detail === 'string' ? body.detail : 'Couldn’t split those out. Nothing has changed. Try again.')
        setSaving(false)
        return
      }
      const result: SplitResult = await res.json()
      setSaving(false)
      setCount(1)
      onDone(result)
    } catch {
      setError('Couldn’t split those out. Nothing has changed. Try again.')
      setSaving(false)
    }
  }

  const stepBtn =
    'w-11 h-11 rounded-lg border border-gray-300 dark:border-gray-600 text-xl text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-transparent'

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
        aria-label="Split out"
      >
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Split out</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
          {`Each one becomes its own animal in your collection, and ${name} keeps the rest.`}
        </p>

        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-5 mb-1">
          {`How many ${noun}`}
        </p>
        <div className="flex items-center gap-5">
          <button type="button" className={stepBtn} onClick={() => step(-1)} disabled={shown <= 1 || saving} aria-label="One fewer">
            −
          </button>
          <span className="text-2xl font-bold text-gray-900 dark:text-white min-w-[2ch] text-center" aria-live="polite">
            {shown}
          </span>
          <button type="button" className={stepBtn} onClick={() => step(1)} disabled={shown >= max || saving} aria-label="One more">
            +
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{`Up to ${max} at a time`}</p>

        <label htmlFor="split-date" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-4 mb-1">
          Date
        </label>
        <input
          id="split-date"
          type="date"
          value={date}
          max={todayIso()}
          onChange={(e) => setDate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />

        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-4 mb-2">Life stage</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Life stage">
          {SPLIT_STAGES.map((s) => {
            const sel = s.value === stage
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setStage(s.value)}
                aria-pressed={sel}
                className={`px-3 py-1.5 rounded-full border text-sm font-medium ${
                  sel
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                    : 'bg-transparent text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>

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
            disabled={saving || max < 1}
            className="w-full px-4 py-2.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'Saving…' : `Split out ${shown}`}
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
