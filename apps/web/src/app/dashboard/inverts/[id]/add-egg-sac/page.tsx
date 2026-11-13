'use client'

/**
 * Log an egg sac (ootheca, brood) for a female. No pairing needed: jumpers
 * and many other keepers never record one. Only the date is required; the
 * sac can be hatched or marked "didn't hatch" later from its detail page.
 * Web counterpart of mobile app/invert/add-egg-sac.tsx. No photo field: no
 * upload route returns a URL for a sac photo.
 */
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import { clutchSingularLabel, isLiveBirth, offspringNoun } from '@/lib/inverts'
import { buildSacPayload } from '@/lib/eggSacs'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const inputCls = 'w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary focus:outline-none focus:ring-2 focus:ring-electric-blue-500'
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5'

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AddEggSacPage() {
  const params = useParams()
  const id = params?.id as string
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()

  const [animal, setAnimal] = useState<{ taxon: string; name: string } | null>(null)
  const [loadError, setLoadError] = useState('')
  const [laid, setLaid] = useState(localToday())
  const [expected, setExpected] = useState('')
  const [count, setCount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || !token) { router.push('/login'); return }
    fetch(`${API_URL}/api/v1/inverts/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error()
        const d = await r.json()
        setAnimal({ taxon: d.taxon, name: d.name || d.common_name || 'this animal' })
      })
      .catch(() => setLoadError("Couldn't load this animal."))
  }, [id, token, isAuthenticated, isLoading, router])

  const taxon = animal?.taxon ?? 'true_spider'
  const live = isLiveBirth(taxon)
  const noun = clutchSingularLabel(taxon)

  const save = async () => {
    if (saving || !token) return
    const built = buildSacPayload({
      laidDate: laid,
      expectedHatch: expected || null,
      countText: count,
      notes,
      liveBirth: live,
    })
    if (!built.ok) {
      setError(built.error)
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/api/v1/inverts/${id}/egg-sacs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(built.payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(typeof body?.detail === 'string' ? body.detail : '')
      }
      router.push(`/dashboard/inverts/${id}`)
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : `Couldn't save this ${noun.toLowerCase()}. Nothing has changed. Try again.`,
      )
      setSaving(false)
    }
  }

  return (
    <DashboardLayout userName={user?.name ?? undefined} userEmail={user?.email ?? undefined} userAvatar={user?.image ?? undefined}>
      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button onClick={() => router.back()} className="text-sm text-primary-600 hover:underline mb-4">← Back</button>
        <h1 className="text-2xl font-bold text-theme-primary mb-2">{`Log ${noun.toLowerCase()}`}</h1>
        {loadError && <p className="text-sm text-red-600 dark:text-red-400 mb-4" role="alert">{loadError}</p>}
        {animal && (
          <p className="text-sm text-theme-secondary mb-6">
            {live
              ? `Record the ${noun.toLowerCase()} ${animal.name} produced.`
              : `Record what ${animal.name} laid. No pairing needed. When it hatches, open it to start a group of ${offspringNoun(taxon)}.`}
          </p>
        )}
        <div className="space-y-5">
          <div>
            <label htmlFor="sac-laid" className={labelCls}>{live ? 'Date born' : 'Date laid'}</label>
            <input id="sac-laid" type="date" value={laid} max={localToday()} onChange={(e) => setLaid(e.target.value)} className={inputCls} />
          </div>

          {!live && (
            <div>
              <label htmlFor="sac-expected" className={labelCls}>Expected hatch (optional)</label>
              <input id="sac-expected" type="date" value={expected} min={laid} onChange={(e) => setExpected(e.target.value)} className={inputCls} />
              {expected && (
                <button type="button" onClick={() => setExpected('')} className="mt-1 text-xs font-semibold text-primary-600 hover:underline">
                  Clear expected hatch
                </button>
              )}
            </div>
          )}

          {live && (
            <div>
              <label htmlFor="sac-count" className={labelCls}>Count (optional)</label>
              <input id="sac-count" type="text" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} className={inputCls} />
            </div>
          )}

          <div>
            <label htmlFor="sac-notes" className={labelCls}>Notes (optional)</label>
            <textarea id="sac-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls} />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}

          <button
            onClick={save}
            disabled={saving || !animal}
            className="w-full py-3 bg-gradient-brand text-white rounded-xl font-semibold disabled:opacity-60"
          >
            {saving ? 'Saving…' : `Save ${noun.toLowerCase()}`}
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}
