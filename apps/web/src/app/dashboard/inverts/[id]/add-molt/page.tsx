'use client'

/**
 * Log molt for an invert (web) — ADR-006 web parity B3.
 */
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import { INVERT_TAXA, isInvertTaxon, growthLengthLabel } from '@/lib/inverts'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const inputCls = 'w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary focus:outline-none focus:ring-2 focus:ring-electric-blue-500'
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5'

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MOLT_OUTCOMES = [
  { value: 'successful', label: 'Went fine', selected: 'bg-green-600 border-green-600 text-white' },
  { value: 'stuck', label: 'Stuck molt', selected: 'bg-amber-600 border-amber-600 text-white' },
  { value: 'lost_limb', label: 'Lost a limb', selected: 'bg-amber-600 border-amber-600 text-white' },
  { value: 'fatal', label: 'Died in molt', selected: 'bg-red-600 border-red-600 text-white' },
]

export default function AddInvertMoltPage() {
  const params = useParams()
  const id = params?.id as string
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()

  const [prefix, setPrefix] = useState<string | null>(null)
  const [taxon, setTaxon] = useState<string | null>(null)
  // logId present ⇒ edit mode (PUT); prefill notes verbatim (molt # is
  // embedded there). Query read via window.location to avoid useSearchParams.
  const [logId, setLogId] = useState<string | null>(null)
  const [date, setDate] = useState(localToday())
  const [moltNum, setMoltNum] = useState('')
  const [notes, setNotes] = useState('')
  // Optional per-molt measurements (ADR-008 growth module). Stored on the
  // legacy leg_span_* columns; label adapts per taxon.
  const [lengthBefore, setLengthBefore] = useState('')
  const [lengthAfter, setLengthAfter] = useState('')
  const [weightBefore, setWeightBefore] = useState('')
  const [weightAfter, setWeightAfter] = useState('')
  // Molt outcome (ADR-015). Blank by default and stays blank — most molts are
  // routine, and a pre-selected "Went fine" would record a judgment nobody made.
  const [outcome, setOutcome] = useState('')
  const [complication, setComplication] = useState('')
  const [saving, setSaving] = useState(false)
  const isEdit = !!logId

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || !token) { router.push('/login'); return }
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search)
      const lid = sp.get('logId')
      if (lid) {
        setLogId(lid)
        const ma = sp.get('molted_at'); if (ma) { const d = new Date(ma); setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`) }
        const nt = sp.get('notes'); if (nt != null) setNotes(nt)
        // Measurements aren't in the URL — fetch the log to prefill them
        ;(async () => {
          try {
            const res = await fetch(`${API_URL}/api/v1/molts/${lid}`, { headers: { Authorization: `Bearer ${token}` } })
            if (!res.ok) return
            const m = await res.json()
            if (m.leg_span_before != null) setLengthBefore(String(m.leg_span_before))
            if (m.leg_span_after != null) setLengthAfter(String(m.leg_span_after))
            // A keeper often learns a molt went badly days later, so these must
            // prefill on edit or the correction silently reverts.
            if (m.outcome) setOutcome(m.outcome)
            if (m.complication_notes) setComplication(m.complication_notes)
            if (m.weight_before != null) setWeightBefore(String(m.weight_before))
            if (m.weight_after != null) setWeightAfter(String(m.weight_after))
          } catch { /* leave blank */ }
        })()
      }
    }
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/inverts/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        const t: string | undefined = data?.taxon
        setTaxon(t ?? null)
        setPrefix(isInvertTaxon(t) ? INVERT_TAXA[t].prefix : null)
      } catch { /* leave null */ }
    })()
  }, [id, token, isAuthenticated, isLoading, router])

  const lengthLabel = growthLengthLabel(taxon ?? '')
  const parseMeasure = (v: string): number | null => {
    const n = parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  const save = async () => {
    if (!token || !prefix) return
    setSaving(true)
    try {
      const combinedNotes = [moltNum ? `Molt #${moltNum}` : null, notes.trim() || null].filter(Boolean).join('\n\n') || null
      const res = await fetch(
        isEdit ? `${API_URL}/api/v1/molts/${logId}` : `${API_URL}/api/v1/inverts/${id}/molts`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            molted_at: new Date(date + 'T12:00:00').toISOString(),
            notes: combinedNotes,
            leg_span_before: parseMeasure(lengthBefore),
            leg_span_after: parseMeasure(lengthAfter),
            weight_before: parseMeasure(weightBefore),
            weight_after: parseMeasure(weightAfter),
            outcome: outcome || null,
            complication_notes: complication.trim() || null,
          }),
        },
      )
      if (!res.ok) throw new Error()
      router.push(`/dashboard/inverts/${id}`)
    } catch {
      alert('Could not save molt. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout userName={user?.name ?? undefined} userEmail={user?.email ?? undefined} userAvatar={user?.image ?? undefined}>
      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button onClick={() => router.back()} className="text-sm text-primary-600 hover:underline mb-4">← Back</button>
        <h1 className="text-2xl font-bold text-theme-primary mb-6">{isEdit ? 'Edit molt' : 'Log molt'}</h1>
        <div className="space-y-5">
          <div><label className={labelCls}>Date molted</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Molt number (optional)</label><input value={moltNum} onChange={(e) => setMoltNum(e.target.value)} inputMode="numeric" placeholder="e.g. 4" className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>{lengthLabel} before (cm)</label><input value={lengthBefore} onChange={(e) => setLengthBefore(e.target.value)} inputMode="decimal" placeholder="Optional" className={inputCls} /></div>
            <div><label className={labelCls}>{lengthLabel} after (cm)</label><input value={lengthAfter} onChange={(e) => setLengthAfter(e.target.value)} inputMode="decimal" placeholder="Optional" className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>Weight before (g)</label><input value={weightBefore} onChange={(e) => setWeightBefore(e.target.value)} inputMode="decimal" placeholder="Optional" className={inputCls} /></div>
            <div><label className={labelCls}>Weight after (g)</label><input value={weightAfter} onChange={(e) => setWeightAfter(e.target.value)} inputMode="decimal" placeholder="Optional" className={inputCls} /></div>
          </div>
          {/* Molting is the most dangerous thing these animals do and the most
              common way one dies. Until now there was nowhere to say a molt
              went wrong except free text, where nothing could find it. */}
          <div>
            <label className={labelCls}>How did it go? (optional)</label>
            <div className="flex flex-wrap gap-2">
              {MOLT_OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setOutcome(outcome === o.value ? '' : o.value)}
                  aria-pressed={outcome === o.value}
                  className={`px-3 py-1.5 rounded-full border text-sm font-medium transition ${
                    outcome === o.value
                      ? o.selected
                      : 'border-theme bg-surface text-theme-primary hover:border-primary-400'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-theme-tertiary">
              Leave blank if it was unremarkable — we won&apos;t assume either way.
            </p>
          </div>
          {outcome !== '' && outcome !== 'successful' && (
            <div>
              <label className={labelCls}>What happened? (optional)</label>
              <textarea
                value={complication}
                onChange={(e) => setComplication(e.target.value)}
                rows={2}
                placeholder="e.g. stuck on the old exuvia, lost a rear leg"
                className={inputCls}
              />
            </div>
          )}
          {outcome === 'fatal' && (
            /* A prompt, not an action. Inferring a death from a log entry and
               silently retiring the animal would be the app deciding something
               that grave on the keeper's behalf. */
            <p className="text-xs text-theme-tertiary">
              You can mark this animal as died on its own page when you&apos;re
              ready. Saving this molt won&apos;t do it for you.
            </p>
          )}
          <div><label className={labelCls}>Notes (optional)</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls} /></div>
          <button onClick={save} disabled={saving || !prefix} className="w-full py-3 bg-gradient-brand text-white rounded-xl font-semibold disabled:opacity-60">{saving ? 'Saving…' : isEdit ? 'Update molt' : 'Save molt'}</button>
        </div>
      </div>
    </DashboardLayout>
  )
}
