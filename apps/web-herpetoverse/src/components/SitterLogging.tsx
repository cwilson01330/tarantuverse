'use client'

/**
 * Sitter logging UI (PRD-shared-keeping, rung 2) — the PIN prompt and the
 * per-animal Fed / Refused controls on /sit.
 *
 * This file only renders and calls the handlers it's given. All network and
 * session handling lives in app/sit/page.tsx, so the keeper's "preview as
 * sitter" (which passes no handlers) can never write anything.
 *
 * Written for someone standing at an enclosure with a feeder in one hand:
 * two big buttons, the usual meal already filled in, details optional.
 *
 * Mirror of apps/web/src/components/SitterLogging.tsx (theme classes differ;
 * behaviour must not).
 */

import { useState } from 'react'

export interface SitterEntry {
  id: string
  accepted: boolean
  food_type: string | null
  food_size: string | null
  quantity: number | null
  comment: string | null
  fed_at: string | null
  can_undo: boolean
  undo_until: string | null
}

export interface LogInput {
  accepted: boolean
  food_type?: string
  food_size?: string
  notes?: string
}

export type UnlockResult =
  | { ok: true }
  | { ok: false; message: string; locked?: boolean }

export interface SitterLoggingHandlers {
  unlocked: boolean
  unlock: (pin: string) => Promise<UnlockResult>
  /** Resolves to an error message, or null on success. */
  log: (kind: string, id: string, entry: LogInput) => Promise<string | null>
  undo: (entryId: string) => Promise<string | null>
}

const T = {
  panel: 'rounded-2xl border border-herp-teal/40 bg-herp-teal/10 p-4',
  title: 'font-bold text-neutral-100',
  body: 'text-sm text-neutral-300',
  muted: 'text-xs text-neutral-400',
  input: 'w-full px-3 py-2 border border-neutral-700 rounded-lg text-neutral-100 bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-herp-teal',
  primary: 'px-4 py-3 rounded-xl font-semibold text-neutral-950 bg-herp-teal hover:opacity-90 disabled:opacity-50',
  fed: 'flex-1 px-4 py-3 rounded-xl font-semibold text-white bg-green-700 hover:bg-green-800 disabled:opacity-50',
  refused: 'flex-1 px-4 py-3 rounded-xl font-semibold border border-neutral-700 text-neutral-100 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50',
  error: 'text-sm font-medium text-red-300',
  entry: 'flex items-center justify-between gap-3 rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2',
  link: 'text-sm font-medium text-herp-teal underline',
  logBox: 'rounded-xl border border-neutral-800 bg-neutral-950/60 p-3',
}

// ── PIN prompt (page level) ──────────────────────────────────────────────────

export function UnlockPanel({ handlers, keeperName, paused = false }: {
  handlers: SitterLoggingHandlers
  keeperName: string
  paused?: boolean
}) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (paused) {
    return (
      <div className={T.panel} role="status">
        <p className={T.title}>Logging is paused</p>
        <p className={T.body}>
          The PIN was entered wrong too many times, so {keeperName} has been told. You can still use this list —
          ask {keeperName} to unlock logging if you need it.
        </p>
      </div>
    )
  }

  if (handlers.unlocked) {
    return (
      <div className={T.panel} role="status">
        <p className={T.title}>Logging is on</p>
        <p className={T.body}>
          After each animal, tap <strong>Fed</strong> or <strong>Refused</strong>. {keeperName} sees it straight away.
        </p>
      </div>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{4,6}$/.test(pin)) {
      setError('The PIN is 4 to 6 digits.')
      return
    }
    setBusy(true)
    setError(null)
    const r = await handlers.unlock(pin)
    setBusy(false)
    setPin('')
    if (!r.ok) setError(r.message)
  }

  return (
    <form onSubmit={submit} className={T.panel}>
      <p className={T.title}>Log feedings as you go</p>
      <p className={`${T.body} mt-1`}>
        {keeperName} gave you a PIN separately. Enter it to mark animals as fed or refused.
      </p>
      <div className="mt-3 flex gap-2">
        <label htmlFor="sitter-pin" className="sr-only">PIN</label>
        <input
          id="sitter-pin"
          type="password"
          inputMode="numeric"
          // Not a saved password: "one-time-code" keeps browsers from offering
          // to store it, which they ignore autoComplete="off" to do.
          autoComplete="one-time-code"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="PIN"
          className={`${T.input} max-w-[10rem] tracking-widest`}
          aria-describedby={error ? 'sitter-pin-error' : undefined}
        />
        <button type="submit" disabled={busy || pin.length < 4} className={T.primary}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </div>
      {error && <p id="sitter-pin-error" role="alert" className={`${T.error} mt-2`}>{error}</p>}
    </form>
  )
}

// ── per-animal controls ──────────────────────────────────────────────────────

function describe(e: SitterEntry): string {
  const when = e.fed_at
    ? new Date(e.fed_at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : ''
  const meal = [e.quantity && e.quantity > 1 ? `${e.quantity}×` : null, e.food_size, e.food_type]
    .filter(Boolean).join(' ')
  return `${e.accepted ? 'Fed' : 'Refused'}${meal ? ` · ${meal}` : ''}${when ? ` · ${when}` : ''}`
}

export function EntryList({ entries, handlers }: { entries: SitterEntry[]; handlers?: SitterLoggingHandlers }) {
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  if (entries.length === 0) return null
  const undo = async (id: string) => {
    if (!handlers) return
    setBusyId(id)
    setError(null)
    const err = await handlers.undo(id)
    setBusyId(null)
    if (err) setError(err)
  }
  return (
    <div className="space-y-2">
      <p className={T.muted}>Logged by you</p>
      {entries.map((e) => (
        <div key={e.id} className={T.entry}>
          <span className="text-sm text-neutral-100">
            <span aria-hidden>{e.accepted ? '✓ ' : '✗ '}</span>{describe(e)}
            {e.comment && <span className="block text-xs text-neutral-400">“{e.comment}”</span>}
          </span>
          {handlers?.unlocked && e.can_undo && (
            <button type="button" onClick={() => undo(e.id)} disabled={busyId === e.id} className={T.link}>
              {busyId === e.id ? 'Undoing…' : 'Undo'}
            </button>
          )}
        </div>
      ))}
      {error && <p role="alert" className={T.error}>{error}</p>}
    </div>
  )
}

export function LogPanel({
  kind, id, name, prefill, paused, handlers,
}: {
  kind: string
  id: string
  name: string
  prefill: { food_type: string | null; food_size: string | null } | null
  paused: boolean
  handlers: SitterLoggingHandlers
}) {
  const [open, setOpen] = useState(false)
  const [foodType, setFoodType] = useState(prefill?.food_type ?? '')
  const [foodSize, setFoodSize] = useState(prefill?.food_size ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<null | 'fed' | 'refused'>(null)
  const [error, setError] = useState<string | null>(null)
  const detailsId = `log-details-${kind}-${id}`

  const submit = async (accepted: boolean) => {
    setBusy(accepted ? 'fed' : 'refused')
    setError(null)
    const err = await handlers.log(kind, id, {
      accepted,
      food_type: foodType.trim() || undefined,
      food_size: foodSize.trim() || undefined,
      notes: note.trim() || undefined,
    })
    setBusy(null)
    if (err) setError(err)
    else {
      setNote('')
      setOpen(false)
    }
  }

  const usual = [prefill?.food_size, prefill?.food_type].filter(Boolean).join(' ')

  return (
    <div className={T.logBox}>
      {paused && (
        <p className={`${T.body} mb-2`}>
          Don&apos;t feed {name} today. Only log it if food went in by mistake, so the keeper knows.
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => submit(true)} disabled={busy !== null} className={T.fed}
          aria-label={`Log that ${name} was fed`}>
          {busy === 'fed' ? 'Saving…' : 'Fed'}
        </button>
        <button type="button" onClick={() => submit(false)} disabled={busy !== null} className={T.refused}
          aria-label={`Log that ${name} refused food`}>
          {busy === 'refused' ? 'Saving…' : 'Refused'}
        </button>
      </div>
      <p className={`${T.muted} mt-2`}>
        {usual ? `Logs as: ${usual}. ` : ''}
        <button type="button" className={T.link} aria-expanded={open} aria-controls={detailsId}
          onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide details' : usual ? 'Change food or add a note' : 'Add food or a note'}
        </button>
      </p>
      {open && (
        <div id={detailsId} className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-neutral-300">Food</span>
            <input className={T.input} value={foodType} maxLength={100}
              onChange={(e) => setFoodType(e.target.value)} placeholder="e.g. cricket" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-300">Size</span>
            <input className={T.input} value={foodSize} maxLength={50}
              onChange={(e) => setFoodSize(e.target.value)} placeholder="e.g. medium" />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-neutral-300">Note for the keeper (optional)</span>
            <input className={T.input} value={note} maxLength={500}
              onChange={(e) => setNote(e.target.value)} placeholder="e.g. took it straight away" />
          </label>
        </div>
      )}
      {error && <p role="alert" className={`${T.error} mt-2`}>{error}</p>}
    </div>
  )
}

/** Shown in the keeper's preview instead of the PIN prompt. */
export function PreviewLoggingNote() {
  return (
    <div className={T.panel}>
      <p className={T.title}>Logging is on for this link</p>
      <p className={T.body}>
        Your sitter will see a PIN box here, and Fed / Refused buttons on each animal once they enter it.
      </p>
    </div>
  )
}
