'use client'

/**
 * Log molt for an invert (web) — ADR-006 web parity B3.
 */
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import { INVERT_TAXA, isInvertTaxon } from '@/lib/inverts'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const inputCls = 'w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary focus:outline-none focus:ring-2 focus:ring-electric-blue-500'
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5'

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AddInvertMoltPage() {
  const params = useParams()
  const id = params?.id as string
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()

  const [prefix, setPrefix] = useState<string | null>(null)
  const [date, setDate] = useState(localToday())
  const [moltNum, setMoltNum] = useState('')
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
      } catch { /* leave null */ }
    })()
  }, [id, token, isAuthenticated, isLoading, router])

  const save = async () => {
    if (!token || !prefix) return
    setSaving(true)
    try {
      const combinedNotes = [moltNum ? `Molt #${moltNum}` : null, notes.trim() || null].filter(Boolean).join('\n\n') || null
      const res = await fetch(`${API_URL}/api/v1/${prefix}/${id}/molts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ molted_at: new Date(date + 'T12:00:00').toISOString(), notes: combinedNotes }),
      })
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
        <h1 className="text-2xl font-bold text-theme-primary mb-6">Log molt</h1>
        <div className="space-y-5">
          <div><label className={labelCls}>Date molted</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Molt number (optional)</label><input value={moltNum} onChange={(e) => setMoltNum(e.target.value)} inputMode="numeric" placeholder="e.g. 4" className={inputCls} /></div>
          <div><label className={labelCls}>Notes (optional)</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls} /></div>
          <button onClick={save} disabled={saving || !prefix} className="w-full py-3 bg-gradient-brand text-white rounded-xl font-semibold disabled:opacity-60">{saving ? 'Saving…' : 'Save molt'}</button>
        </div>
      </div>
    </DashboardLayout>
  )
}
