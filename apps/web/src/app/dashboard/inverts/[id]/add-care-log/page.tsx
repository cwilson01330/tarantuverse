'use client'

/**
 * Log a hydration event for an invert (web) — car_20260909.
 *
 * Requested by a keeper: track giving water alongside tracking food.
 *
 * NO SCHEDULE. This page records an act and nothing derives a due date from
 * it. If a "next watering" field ever appears here, that's a product decision
 * to reopen rather than a gap someone filled in — see the care_log model.
 */
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const inputCls = 'w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary focus:outline-none focus:ring-2 focus:ring-electric-blue-500'
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5'

type CareLogType = 'water_dish' | 'overflow' | 'misted'

// Keep in lockstep with CARE_LOG_TYPES in app/models/care_log.py.
const TYPES: { key: CareLogType; label: string; hint: string }[] = [
  {
    key: 'water_dish',
    label: 'Water dish refreshed',
    hint: 'Topped up or replaced the water in the dish.',
  },
  {
    key: 'overflow',
    label: 'Dish overflowed',
    hint: 'Deliberately overfilled the dish to damp the substrate — how moisture-dependent species get their humidity.',
  },
  {
    key: 'misted',
    label: 'Misted',
    hint: 'Misted the enclosure, substrate or webbing. Slings and mantids drink from the droplets.',
  },
]

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AddInvertCareLogPage() {
  const params = useParams()
  const id = params?.id as string
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()

  // logId present ⇒ edit mode (PUT). Query read via window.location to avoid
  // the useSearchParams Suspense build requirement that fails Vercel's static
  // prerender while passing local dev.
  const [logId, setLogId] = useState<string | null>(null)
  const [type, setType] = useState<CareLogType>('water_dish')
  const [date, setDate] = useState(localToday())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEdit = !!logId

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || !token) { router.push('/login'); return }
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search)
      const lid = sp.get('logId')
      if (lid) {
        setLogId(lid)
        const lt = sp.get('log_type')
        if (lt && TYPES.some((t) => t.key === lt)) setType(lt as CareLogType)
        const la = sp.get('logged_at'); if (la) setDate(la.slice(0, 10))
        const nt = sp.get('notes'); if (nt != null) setNotes(nt)
      }
    }
    // No taxon lookup, unlike the substrate form — that one needs the taxon to
    // pick an endpoint. Care logs have exactly one, so nothing gates the save.
  }, [id, token, isAuthenticated, isLoading, router])

  const save = async () => {
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      // The column is a timestamp, the keeper picks a date. Rather than
      // stamping a fabricated midnight, combine the chosen day with the
      // current time of day — roughly when they're recording it — and never
      // display a time for these entries anywhere.
      const chosen = new Date(`${date}T00:00:00`)
      const now = new Date()
      chosen.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0)
      const stamp = chosen > now ? now : chosen

      const res = await fetch(
        isEdit ? `${API_URL}/api/v1/care-logs/${logId}` : `${API_URL}/api/v1/inverts/${id}/care-logs`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            log_type: type,
            logged_at: stamp.toISOString(),
            notes: notes.trim() || null,
          }),
        },
      )
      if (!res.ok) {
        // Surface the field a 422 names instead of a generic retry prompt —
        // retrying a deterministic payload can never work.
        let detail = ''
        try {
          const body = await res.json()
          if (Array.isArray(body?.detail)) {
            detail = body.detail
              .map((d: any) => d?.loc?.[d.loc.length - 1])
              .filter((f: any) => typeof f === 'string' && f !== 'body')
              .join(', ')
          } else if (typeof body?.detail === 'string') {
            detail = body.detail
          }
        } catch { /* fall through to the generic message */ }
        throw new Error(detail ? `The server rejected ${detail}.` : '')
      }
      router.push(`/dashboard/inverts/${id}`)
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const active = TYPES.find((t) => t.key === type)

  return (
    <DashboardLayout userName={user?.name ?? undefined} userEmail={user?.email ?? undefined} userAvatar={user?.image ?? undefined}>
      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button onClick={() => router.back()} className="text-sm text-primary-600 hover:underline mb-4">← Back</button>
        <h1 className="text-2xl font-bold text-theme-primary mb-6">{isEdit ? 'Edit water log' : 'Log water'}</h1>
        <div className="space-y-5">
          <div>
            <label className={labelCls}>What did you do?</label>
            <div className="space-y-2">
              {TYPES.map((t) => {
                const sel = t.key === type
                return (
                  <button
                    key={t.key}
                    onClick={() => setType(t.key)}
                    aria-pressed={sel}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-semibold transition ${
                      sel
                        ? 'border-primary-600 bg-surface-elevated text-theme-primary'
                        : 'border-theme bg-surface text-theme-secondary hover:bg-surface-elevated'
                    }`}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
            {/* The difference between a top-up and an overflow isn't obvious
                unless you already keep something that needs one. */}
            {active && <p className="mt-2 text-xs text-theme-tertiary leading-relaxed">{active.hint}</p>}
          </div>

          <div>
            <label className={labelCls}>Date</label>
            <input
              type="date"
              value={date}
              max={localToday()}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls} />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
          )}

          <button
            onClick={save}
            disabled={saving}
            className="w-full py-3 bg-gradient-brand text-white rounded-xl font-semibold disabled:opacity-60"
          >
            {saving ? 'Saving…' : isEdit ? 'Update water log' : 'Save water log'}
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}
