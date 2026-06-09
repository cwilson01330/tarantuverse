'use client'

/**
 * Log feeding for an invert (web) — ADR-006 web parity B3.
 * Resolves the taxon via GET /inverts/{id}, then POSTs to the per-taxon
 * feeding endpoint (e.g. /whip-spiders/{id}/feedings).
 */
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import { INVERT_TAXA, isInvertTaxon } from '@/lib/inverts'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const inputCls = 'w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary focus:outline-none focus:ring-2 focus:ring-electric-blue-500'
const FOODS = ['Cricket', 'Dubia Roach', 'Red Runner', 'Mealworm', 'Superworm', 'Other']

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AddInvertFeedingPage() {
  const params = useParams()
  const id = params?.id as string
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()

  const [prefix, setPrefix] = useState<string | null>(null)
  const [date, setDate] = useState(localToday())
  const [food, setFood] = useState('Cricket')
  const [accepted, setAccepted] = useState(true)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || !token) { router.push('/login'); return }
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/inverts/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        const t: string | undefined = data?.taxon
        setPrefix(isInvertTaxon(t) ? INVERT_TAXA[t].prefix : null)
      } catch { /* leave null; save will warn */ }
    })()
  }, [id, token, isAuthenticated, isLoading, router])

  const save = async () => {
    if (!token || !prefix) return
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/inverts/${id}/feedings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fed_at: new Date(date + 'T12:00:00').toISOString(),
          food_type: food,
          accepted,
          notes: notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error()
      router.push(`/dashboard/inverts/${id}`)
    } catch {
      alert('Could not save feeding. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout userName={user?.name ?? undefined} userEmail={user?.email ?? undefined} userAvatar={user?.image ?? undefined}>
      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button onClick={() => router.back()} className="text-sm text-primary-600 hover:underline mb-4">← Back</button>
        <h1 className="text-2xl font-bold text-theme-primary mb-6">Log feeding</h1>
        <div className="space-y-5">
          <div><label className={labelCls}>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></div>
          <div>
            <label className={labelCls}>Food type</label>
            <div className="flex flex-wrap gap-2">
              {FOODS.map((f) => (
                <button key={f} onClick={() => setFood(f)} className={`px-3 py-2 rounded-full text-sm font-semibold ${food === f ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}>{f}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Outcome</label>
            <div className="flex gap-2">
              <button onClick={() => setAccepted(true)} className={`flex-1 py-2 rounded-lg text-sm font-semibold ${accepted ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}>✓ Accepted</button>
              <button onClick={() => setAccepted(false)} className={`flex-1 py-2 rounded-lg text-sm font-semibold ${!accepted ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}>✗ Refused</button>
            </div>
          </div>
          <div><label className={labelCls}>Notes (optional)</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls} /></div>
          <button onClick={save} disabled={saving || !prefix} className="w-full py-3 bg-gradient-brand text-white rounded-xl font-semibold disabled:opacity-60">{saving ? 'Saving…' : 'Save feeding'}</button>
        </div>
      </div>
    </DashboardLayout>
  )
}

const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5'
