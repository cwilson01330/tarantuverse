'use client'

/**
 * Sitter & sharing — the keeper's side of sitter passes (PRD-shared-keeping).
 *
 * Make a link for whoever's feeding while you're away, see exactly what they'll
 * see, and write the routine once. The link itself is shown ONCE, right after
 * it's made; the server keeps only a hash, so "send it again" means "make a new
 * link" (which retires the old one).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import UpgradeModal from '@/components/UpgradeModal'
import SitterPassView, { type Payload } from '@/components/SitterPassView'
import { getToken } from '@/lib/auth'
import {
  PASS_MAX_DAYS,
  PassApiError,
  STATUS_LABEL,
  pinProblem,
  shareUrl,
  sitterApi,
  type ActivityEntry,
  type Candidate,
  type PassCreated,
  type PassSummary,
  type SitterGuide,
} from '@/lib/sitterPasses'

type Mode =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'link'; created: PassCreated }
  | { kind: 'preview'; pass: PassSummary; data: Payload }
  | { kind: 'activity'; pass: PassSummary; entries: ActivityEntry[] }

const BTN = 'px-4 py-2 rounded-xl font-medium transition disabled:opacity-50'
const BTN_PRIMARY = `${BTN} herp-gradient-bg text-herp-dark hover:opacity-90`
const BTN_SECONDARY = `${BTN} border border-neutral-800 bg-neutral-900 text-neutral-100 hover:bg-neutral-800`
const INPUT = 'w-full px-3 py-2 rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-100 focus:outline-none focus:ring-2 focus:ring-herp-teal/50'

function dateInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function SitterPage() {
  const router = useRouter()
  // Read after mount: getToken() is localStorage-backed and null during SSR.
  const [token, setToken] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  useEffect(() => { setToken(getToken()); setAuthChecked(true) }, [])
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [passes, setPasses] = useState<PassSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [upgrade, setUpgrade] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      setPasses(await sitterApi.list(token))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your links.')
    }
  }, [token])

  useEffect(() => {
    if (!authChecked) return
    if (!token) {
      router.replace('/login?next=/app/sitter')
      return
    }
    void refresh()
  }, [authChecked, token, router, refresh])

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    try {
      await fn()
    } catch (e) {
      if (e instanceof PassApiError && e.status === 402) setUpgrade(e.message)
      else setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  // Locked links stay in "open": a lockout is something the keeper has to act
  // on (unlock or end), not history.
  const isOpen = (p: PassSummary) => p.status === 'active' || p.status === 'scheduled' || p.status === 'locked'
  const open = (passes ?? []).filter(isOpen)
  const past = (passes ?? []).filter((p) => !isOpen(p))

  return (
    <>
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-neutral-100">Sitter &amp; sharing</h1>
          <p className="text-neutral-400 mt-1">
            Going away? Send whoever&apos;s feeding a link to a care card for each animal — no account needed,
            and it ends on the date you pick.
          </p>
        </header>

        {error && (
          <div role="alert" className="p-3 rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
            {error}
          </div>
        )}

        {mode.kind === 'list' && (
          <>
            <div className="flex flex-wrap gap-3">
              <button className={BTN_PRIMARY} onClick={() => setMode({ kind: 'new' })}>New sitter link</button>
            </div>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-neutral-100">Open links</h2>
              {passes === null && <div className="h-16 rounded-xl bg-neutral-800 animate-pulse" />}
              {passes !== null && open.length === 0 && (
                <p className="text-neutral-400">No open links.</p>
              )}
              {open.map((p) => (
                <PassRow key={p.id} pass={p} busy={busy}
                  onPreview={() => act('preview', async () => setMode({ kind: 'preview', pass: p, data: await sitterApi.preview(token!, p.id) }))}
                  onRotate={() => {
                    if (!confirm('Make a new link? The old one — and anyone already using it — stops working straight away.')) return
                    void act('rotate', async () => setMode({ kind: 'link', created: await sitterApi.rotate(token!, p.id) }))
                  }}
                  onRevoke={() => {
                    if (!confirm('End this link now? Your sitter will lose access immediately.')) return
                    void act('revoke', async () => { await sitterApi.revoke(token!, p.id); await refresh() })
                  }}
                  onExtend={(iso) => act('extend', async () => { await sitterApi.update(token!, p.id, { expires_at: iso }); await refresh() })}
                  onLogging={(body) => act('logging', async () => { await sitterApi.update(token!, p.id, body); await refresh() })}
                  onUnlock={(pin) => act('unlock', async () => { await sitterApi.unlock(token!, p.id, pin); await refresh() })}
                  onActivity={() => act('activity', async () => setMode({ kind: 'activity', pass: p, entries: await sitterApi.activity(token!, p.id) }))}
                />
              ))}
            </section>

            {past.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-neutral-100">Past links</h2>
                {past.slice(0, 10).map((p) => (
                  <div key={p.id} className="flex justify-between items-center gap-3 text-sm p-3 rounded-xl bg-neutral-900 border border-neutral-800">
                    <span className="text-neutral-100">{p.label || `Link …${p.token_prefix}`}</span>
                    <span className="flex items-center gap-3 text-neutral-500">
                      {STATUS_LABEL[p.status]} · {fmt(p.expires_at)}
                      {p.log_count > 0 && (
                        <button className="underline text-neutral-400" disabled={!!busy}
                          onClick={() => act('activity', async () => setMode({ kind: 'activity', pass: p, entries: await sitterApi.activity(token!, p.id) }))}>
                          {p.log_count} logged
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </section>
            )}

            {token && <GuideEditor token={token} />}
          </>
        )}

        {mode.kind === 'new' && token && (
          <NewPass token={token}
            onCancel={() => setMode({ kind: 'list' })}
            onCreated={(created) => { setMode({ kind: 'link', created }); void refresh() }} />
        )}

        {mode.kind === 'link' && (
          <LinkReveal created={mode.created} onDone={() => { setMode({ kind: 'list' }); void refresh() }} />
        )}

        {mode.kind === 'activity' && (
          <ActivityView pass={mode.pass} entries={mode.entries} onBack={() => setMode({ kind: 'list' })} />
        )}

        {mode.kind === 'preview' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-neutral-400">
                This is exactly what your sitter sees{mode.pass.label ? ` (${mode.pass.label})` : ''}.
              </p>
              <button className={BTN_SECONDARY} onClick={() => setMode({ kind: 'list' })}>Back</button>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <SitterPassView data={mode.data} />
            </div>
          </section>
        )}
      </div>
      <UpgradeModal isOpen={upgrade !== null} onClose={() => setUpgrade(null)} source="shared_keeping"
        message={upgrade} />
    </>
  )
}

function PassRow({ pass, busy, onPreview, onRotate, onRevoke, onExtend, onLogging, onUnlock, onActivity }: {
  pass: PassSummary
  busy: string | null
  onPreview: () => void
  onRotate: () => void
  onRevoke: () => void
  onExtend: (iso: string) => void
  onLogging: (body: { can_log?: boolean; pin?: string }) => void
  onUnlock: (pin?: string) => void
  onActivity: () => void
}) {
  const maxEnd = new Date(new Date(pass.starts_at).getTime() + PASS_MAX_DAYS * 86400000 - 60000)
  const [extendTo, setExtendTo] = useState(dateInput(new Date(pass.expires_at)))
  return (
    <div className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-3">
      <div className="flex justify-between gap-3 flex-wrap">
        <div>
          <p className="font-semibold text-neutral-100">{pass.label || `Link …${pass.token_prefix}`}</p>
          <p className="text-sm text-neutral-400">
            {STATUS_LABEL[pass.status]} · {pass.animal_count} animals · {fmt(pass.starts_at)} → {fmt(pass.expires_at)}
          </p>
          <p className="text-xs text-neutral-500">
            {pass.open_count > 0 ? `Opened ${pass.open_count}× · last ${fmt(pass.last_used_at!)}` : 'Not opened yet'}
            {pass.log_count > 0 && (
              <> · <button className="underline text-neutral-400" onClick={onActivity} disabled={!!busy}>
                {pass.log_count} {pass.log_count === 1 ? 'feeding' : 'feedings'} logged
              </button></>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-start">
          <button className={BTN_SECONDARY} disabled={!!busy} onClick={onPreview}>Preview</button>
          <button className={BTN_SECONDARY} disabled={!!busy} onClick={onRotate}>New link</button>
          <button className={`${BTN} border border-red-500/40 text-red-300 hover:bg-red-500/10`}
            disabled={!!busy} onClick={onRevoke}>End now</button>
        </div>
      </div>
      {pass.status === 'locked' && <LockedBanner busy={busy} onUnlock={onUnlock} onRevoke={onRevoke} />}
      <LoggingControls pass={pass} busy={busy} onChange={onLogging} />
      <div className="flex items-end gap-2 flex-wrap">
        <label className="text-sm text-neutral-400">
          Ends on
          <input type="date" className={`${INPUT} mt-1`} value={extendTo}
            min={dateInput(new Date())} max={dateInput(maxEnd)}
            onChange={(e) => setExtendTo(e.target.value)} />
        </label>
        <button className={BTN_SECONDARY} disabled={!!busy}
          onClick={() => {
            const end = new Date(`${extendTo}T23:59:00`)
            onExtend(new Date(Math.min(end.getTime(), maxEnd.getTime())).toISOString())
          }}>Save date</button>
      </div>
    </div>
  )
}

function NewPass({ token, onCancel, onCreated }: {
  token: string
  onCancel: () => void
  onCreated: (c: PassCreated) => void
}) {
  const today = new Date()
  const [label, setLabel] = useState('')
  const [start, setStart] = useState(dateInput(today))
  const [end, setEnd] = useState(dateInput(new Date(today.getTime() + 7 * 86400000)))
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [upgrade, setUpgrade] = useState<string | null>(null)
  const [canLog, setCanLog] = useState(false)
  const [pin, setPin] = useState('')

  useEffect(() => {
    sitterApi.candidates(token).then((c) => {
      setCandidates(c)
      setSelected(new Set(c.map((x) => `${x.kind}:${x.id}`)))
    }).catch((e) => setError(e instanceof Error ? e.message : 'Could not load your animals.'))
  }, [token])

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return (candidates ?? []).filter((c) =>
      !q || [c.name, c.common_name, c.scientific_name, c.taxon].some((v) => v?.toLowerCase().includes(q)))
  }, [candidates, filter])

  const key = (c: Candidate) => `${c.kind}:${c.id}`
  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  const saveNote = async (c: Candidate) => {
    try {
      const r = await sitterApi.setNote(token, c.kind, c.id, noteDraft.trim() || null)
      setCandidates((cs) => (cs ?? []).map((x) => (key(x) === key(c) ? { ...x, sitter_note: r.sitter_note } : x)))
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that note.')
    }
  }

  const submit = async () => {
    setError(null)
    const startDate = new Date(`${start}T00:00:00`)
    const startsAt = startDate.getTime() > Date.now() ? startDate : new Date()
    const maxEnd = new Date(startsAt.getTime() + PASS_MAX_DAYS * 86400000 - 60000)
    const endAt = new Date(Math.min(new Date(`${end}T23:59:00`).getTime(), maxEnd.getTime()))
    if (endAt.getTime() <= startsAt.getTime()) {
      setError('The end date has to be after the start.')
      return
    }
    const animals = (candidates ?? []).filter((c) => selected.has(key(c))).map((c) => ({ kind: c.kind, id: c.id }))
    if (animals.length === 0) {
      setError('Pick at least one animal.')
      return
    }
    if (canLog) {
      const problem = pinProblem(pin)
      if (problem) {
        setError(`PIN: ${problem}`)
        return
      }
    }
    setSaving(true)
    try {
      onCreated(await sitterApi.create(token, {
        animals,
        label: label.trim() || undefined,
        starts_at: startDate.getTime() > Date.now() ? startsAt.toISOString() : undefined,
        expires_at: endAt.toISOString(),
        ...(canLog ? { can_log: true, pin } : {}),
      }))
    } catch (e) {
      if (e instanceof PassApiError && e.status === 402) setUpgrade(e.message)
      else setError(e instanceof Error ? e.message : 'Could not make the link.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-5 p-5 rounded-2xl bg-neutral-900 border border-neutral-800">
      <h2 className="text-lg font-semibold text-neutral-100">New sitter link</h2>
      {error && <p role="alert" className="text-red-300">{error}</p>}

      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-sm text-neutral-400 sm:col-span-3">
          Sitter&apos;s name (optional)
          <input className={`${INPUT} mt-1`} value={label} maxLength={80} placeholder="e.g. Sam"
            onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="text-sm text-neutral-400">
          Starts
          <input type="date" className={`${INPUT} mt-1`} value={start} min={dateInput(today)}
            onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="text-sm text-neutral-400">
          Ends
          <input type="date" className={`${INPUT} mt-1`} value={end} min={start}
            max={dateInput(new Date(new Date(`${start}T00:00:00`).getTime() + (PASS_MAX_DAYS - 1) * 86400000))}
            onChange={(e) => setEnd(e.target.value)} />
        </label>
        <p className="text-xs text-neutral-500 self-end">Links last up to {PASS_MAX_DAYS} days.</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-semibold text-neutral-100">
            Animals <span className="text-neutral-500 font-normal">({selected.size} selected)</span>
          </h3>
          <div className="flex gap-2">
            <button className="text-sm text-neutral-400 underline" onClick={() => setSelected(new Set((candidates ?? []).map(key)))}>All</button>
            <button className="text-sm text-neutral-400 underline" onClick={() => setSelected(new Set())}>None</button>
          </div>
        </div>
        <input className={INPUT} placeholder="Filter by name, species or type" value={filter}
          onChange={(e) => setFilter(e.target.value)} />
        {candidates === null && <div className="h-24 rounded-xl bg-neutral-800 animate-pulse" />}
        <ul className="max-h-[28rem] overflow-y-auto divide-y divide-neutral-800 rounded-xl border border-neutral-800">
          {shown.map((c) => (
            <li key={key(c)} className="p-3">
              <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-1" checked={selected.has(key(c))} onChange={() => toggle(key(c))}
                  aria-label={`Include ${c.name || c.common_name || c.scientific_name || 'this animal'}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-neutral-100">{c.name || c.common_name || c.scientific_name || 'Unnamed'}
                    {c.kind === 'colony' && <span className="ml-2 text-xs text-neutral-500">Colony</span>}</p>
                  {editing === key(c) ? (
                    <div className="mt-2 space-y-2">
                      <textarea className={INPUT} rows={3} maxLength={1000} value={noteDraft}
                        placeholder="e.g. She's shy — leave food at the burrow entrance and step back."
                        onChange={(e) => setNoteDraft(e.target.value)} />
                      <div className="flex gap-2">
                        <button className={BTN_PRIMARY} onClick={() => saveNote(c)}>Save note</button>
                        <button className={BTN_SECONDARY} onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button className="mt-1 text-left text-sm text-neutral-400 hover:underline"
                      onClick={() => { setEditing(key(c)); setNoteDraft(c.sitter_note ?? '') }}>
                      {c.sitter_note ? <>Note for sitter: <span className="italic">{c.sitter_note}</span></> : '+ Add a note for the sitter'}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-neutral-500">
          Notes are saved on the animal and reused next trip. Your private notes, prices and sources are never shown to a sitter.
        </p>
      </div>

      <fieldset className="space-y-2 p-4 rounded-xl border border-neutral-800">
        <legend className="px-1 font-semibold text-neutral-100">Logging back <span className="text-xs font-normal text-neutral-500">Premium</span></legend>
        <label className="flex items-start gap-2 text-neutral-100">
          <input type="checkbox" className="mt-1" checked={canLog} onChange={(e) => setCanLog(e.target.checked)} />
          <span>
            Let {label.trim() || 'your sitter'} mark animals as fed or refused
            <span className="block text-sm text-neutral-400">
              Their entries land in your records, labelled with their name, so nothing goes missing while you&apos;re away.
            </span>
          </span>
        </label>
        {canLog && (
          <PinField value={pin} onChange={setPin} />
        )}
      </fieldset>

      <div className="flex gap-3">
        <button className={BTN_PRIMARY} disabled={saving} onClick={submit}>{saving ? 'Making link…' : 'Make link'}</button>
        <button className={BTN_SECONDARY} onClick={onCancel}>Cancel</button>
      </div>

      <UpgradeModal isOpen={upgrade !== null} onClose={() => setUpgrade(null)} source="shared_keeping"
        message={upgrade} />
    </section>
  )
}

function LinkReveal({ created, onDone }: { created: PassCreated; onDone: () => void }) {
  const url = shareUrl(created)
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  return (
    <section className="space-y-4 p-5 rounded-2xl bg-neutral-900 border border-neutral-800">
      <h2 className="text-lg font-semibold text-neutral-100">Your sitter link is ready</h2>
      <p className="text-neutral-400">
        Send this to {created.label || 'your sitter'}. It works until {fmt(created.expires_at)}.{' '}
        <strong className="text-neutral-100">This is the only time it&apos;s shown</strong> — if you lose it, make a new one.
      </p>
      <div className="flex flex-col sm:flex-row gap-5 items-center">
        <div className="bg-white p-3 rounded-xl">
          <QRCodeSVG value={url} size={176} level="M" />
        </div>
        <div className="flex-1 w-full space-y-3">
          <input readOnly className={`${INPUT} font-mono text-xs`} value={url} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex gap-2 flex-wrap">
            <button className={BTN_PRIMARY} onClick={async () => {
              try { await navigator.clipboard.writeText(url); setCopied(true) } catch { /* select + copy manually */ }
            }}>{copied ? 'Copied' : 'Copy link'}</button>
            {canShare && (
              <button className={BTN_SECONDARY} onClick={() => navigator.share({ title: 'Feeding list', url }).catch(() => {})}>Share…</button>
            )}
          </div>
          <p className="text-xs text-neutral-500">
            Anyone with this link can see the feeding list until it ends. You can end it early at any time.
          </p>
          {created.can_log && (
            <p className="text-sm p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200">
              <strong>Tell them the PIN separately</strong> — say it, or send it in a different message.
              The link alone can only read; the PIN is what lets someone log.
            </p>
          )}
        </div>
      </div>
      <button className={BTN_SECONDARY} onClick={onDone}>Done</button>
    </section>
  )
}

function GuideEditor({ token }: { token: string }) {
  const [guide, setGuide] = useState<SitterGuide | null>(null)
  const [steps, setSteps] = useState('')
  const [ownEmergency, setOwnEmergency] = useState(false)
  const [emergency, setEmergency] = useState('')
  const [contact, setContact] = useState('')
  const [vet, setVet] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    sitterApi.guide(token).then((g) => {
      setGuide(g)
      setSteps(g.routine_steps.join('\n'))
      setOwnEmergency(g.emergency_text !== null)
      setEmergency(g.emergency_text ?? g.default_emergency.join('\n'))
      setContact(g.contact_line ?? '')
      setVet(g.vet_contact ?? '')
    }).catch(() => setStatus('Could not load your routine.'))
  }, [token])

  const save = async () => {
    setStatus(null)
    try {
      await sitterApi.saveGuide(token, {
        routine_steps: steps.split('\n').map((s) => s.trim()).filter(Boolean),
        emergency_text: ownEmergency ? emergency : null,
        contact_line: contact.trim() || null,
        vet_contact: vet.trim() || null,
      })
      setStatus('Saved.')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not save.')
    }
  }

  if (!guide) return null
  return (
    <section className="space-y-4 p-5 rounded-2xl bg-neutral-900 border border-neutral-800">
      <div>
        <h2 className="text-lg font-semibold text-neutral-100">Your routine</h2>
        <p className="text-sm text-neutral-400">Written once, shown on every sitter link.</p>
      </div>
      <label className="block text-sm text-neutral-400">
        The round, one step per line
        <textarea className={`${INPUT} mt-1`} rows={5} value={steps}
          placeholder={'Feeders are in the green tub in the garage.\nStart with the rack by the window.\nTurn the room light off when you leave.'}
          onChange={(e) => setSteps(e.target.value)} />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm text-neutral-400">If something goes wrong</legend>
        <label className="flex items-center gap-2 text-neutral-100">
          <input type="radio" checked={!ownEmergency} onChange={() => setOwnEmergency(false)} />
          Use the built-in advice (escapes, molts, deaths, mould)
        </label>
        <label className="flex items-center gap-2 text-neutral-100">
          <input type="radio" checked={ownEmergency} onChange={() => setOwnEmergency(true)} />
          Write my own
        </label>
        {ownEmergency && (
          <textarea className={INPUT} rows={5} value={emergency} onChange={(e) => setEmergency(e.target.value)} />
        )}
      </fieldset>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm text-neutral-400">
          How to reach you
          <input className={`${INPUT} mt-1`} maxLength={200} value={contact} placeholder="Text me: 555-0100"
            onChange={(e) => setContact(e.target.value)} />
        </label>
        <label className="text-sm text-neutral-400">
          Vet or backup keeper (optional)
          <input className={`${INPUT} mt-1`} maxLength={200} value={vet} onChange={(e) => setVet(e.target.value)} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button className={BTN_PRIMARY} onClick={save}>Save routine</button>
        {status && <span role="status" className="text-sm text-neutral-400">{status}</span>}
      </div>
    </section>
  )
}

function PinField({ value, onChange, label = 'PIN for logging' }: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  const problem = value.length >= 4 ? pinProblem(value) : null
  return (
    <label className="block text-sm text-neutral-400 max-w-xs">
      {label}
      <input className={`${INPUT} mt-1 tracking-widest`} inputMode="numeric" autoComplete="off" maxLength={6}
        value={value} placeholder="4–6 digits" onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        aria-invalid={!!problem} />
      <span className={`block mt-1 text-xs ${problem ? 'text-red-300' : 'text-neutral-500'}`}>
        {problem ?? 'Tell your sitter this separately from the link. 5 wrong tries pause the link and tell you.'}
      </span>
    </label>
  )
}

function LoggingControls({ pass, busy, onChange }: {
  pass: PassSummary
  busy: string | null
  onChange: (body: { can_log?: boolean; pin?: string }) => void
}) {
  const [editing, setEditing] = useState(false)
  const [pin, setPin] = useState('')
  const ok = pinProblem(pin) === null
  const save = (body: { can_log?: boolean; pin?: string }) => {
    onChange(body)
    setEditing(false)
    setPin('')
  }
  return (
    <div className="p-3 rounded-xl bg-neutral-800 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-neutral-100">
          <span className="font-medium">Logging back:</span>{' '}
          {pass.can_log ? 'On — your sitter can mark feedings with the PIN.' : 'Off — the link is read-only.'}
        </p>
        {!editing && (
          <div className="flex gap-2">
            {pass.can_log ? (
              <>
                <button className="text-sm underline text-neutral-400" disabled={!!busy} onClick={() => setEditing(true)}>Change PIN</button>
                <button className="text-sm underline text-neutral-400" disabled={!!busy}
                  onClick={() => { if (confirm('Turn off logging? Your sitter can still see the list, but can no longer mark feedings.')) save({ can_log: false }) }}>
                  Turn off
                </button>
              </>
            ) : (
              <button className="text-sm underline text-neutral-400" disabled={!!busy} onClick={() => setEditing(true)}>Turn on</button>
            )}
          </div>
        )}
      </div>
      {editing && (
        <div className="flex items-end gap-2 flex-wrap">
          <PinField value={pin} onChange={setPin} label={pass.can_log ? 'New PIN' : 'PIN for logging'} />
          <button className={BTN_PRIMARY} disabled={!!busy || !ok}
            onClick={() => save(pass.can_log ? { pin } : { can_log: true, pin })}>
            {pass.can_log ? 'Save PIN' : 'Turn on logging'}
          </button>
          <button className={BTN_SECONDARY} onClick={() => { setEditing(false); setPin('') }}>Cancel</button>
        </div>
      )}
    </div>
  )
}

function LockedBanner({ busy, onUnlock, onRevoke }: {
  busy: string | null
  onUnlock: (pin?: string) => void
  onRevoke: () => void
}) {
  const [pin, setPin] = useState('')
  const pinOk = pin === '' || pinProblem(pin) === null
  return (
    <div role="alert" className="p-3 rounded-xl border border-red-500/40 bg-red-500/10 space-y-2">
      <p className="text-sm text-red-200">
        <strong>Logging on this link is paused.</strong> Someone entered the wrong PIN 5 times. Your sitter can
        still see the feeding list. If it was them, unlock logging — a new PIN is safest. If you&apos;re not sure who
        it was, end the link and send a new one.
      </p>
      <div className="flex items-end gap-2 flex-wrap">
        <PinField value={pin} onChange={setPin} label="New PIN (optional)" />
        <button className={BTN_PRIMARY} disabled={!!busy || !pinOk} onClick={() => onUnlock(pin || undefined)}>Unlock</button>
        <button className={`${BTN} border border-red-500/40 text-red-300`} disabled={!!busy} onClick={onRevoke}>End it</button>
      </div>
    </div>
  )
}

function ActivityView({ pass, entries, onBack }: { pass: PassSummary; entries: ActivityEntry[]; onBack: () => void }) {
  const who = pass.label || 'Your sitter'
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-neutral-100">What {who} logged</h2>
          <p className="text-sm text-neutral-400">
            These are in your feeding records too, marked &ldquo;Fed by {who} (sitter link)&rdquo;. Edit or delete them there.
          </p>
        </div>
        <button className={BTN_SECONDARY} onClick={onBack}>Back</button>
      </div>
      {entries.length === 0 && <p className="text-neutral-400">Nothing logged yet.</p>}
      <ul className="space-y-2">
        {entries.map((e) => (
          <li key={e.id} className="p-3 rounded-xl bg-neutral-900 border border-neutral-800">
            <div className="flex justify-between gap-3 flex-wrap">
              <span className="font-medium text-neutral-100">
                <span aria-hidden>{e.accepted ? '✓ ' : '✗ '}</span>
                {e.animal_name} — {e.accepted ? 'fed' : 'refused'}
                {(e.food_type || e.food_size) && (
                  <span className="font-normal text-neutral-400"> · {[e.quantity && e.quantity > 1 ? `${e.quantity}×` : null, e.food_size, e.food_type].filter(Boolean).join(' ')}</span>
                )}
              </span>
              <span className="text-sm text-neutral-500">
                {e.fed_at ? new Date(e.fed_at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}
              </span>
            </div>
            {e.notes && <p className="mt-1 text-sm text-neutral-400 italic">&ldquo;{e.notes}&rdquo;</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
