'use client'

/**
 * Log or edit a feeding for any invert (web) — ADR-006 web parity B3.
 * Resolves the taxon via GET /inverts/{id} (it picks the food chips), then
 * POSTs to /inverts/{id}/feedings, or PUTs /feedings/{logId} in edit mode.
 */
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import { foodTypeToSave, foodVocabularyFor, isInvertTaxon, splitStoredFood, type InvertTaxon } from '@/lib/inverts'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const inputCls = 'w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary focus:outline-none focus:ring-2 focus:ring-electric-blue-500'
// Same three values the mobile form and the old tarantula form use — food_size
// is free text, so a fourth spelling of "medium" would split the data.
const FOOD_SIZES = ['Small', 'Medium', 'Large']

function localDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface StoredFeeding {
  fed_at?: string | null
  food_type?: string | null
  food_size?: string | null
  accepted?: boolean | null
  notes?: string | null
}

export default function AddInvertFeedingPage() {
  const params = useParams()
  const id = params?.id as string
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()

  const [taxon, setTaxon] = useState<InvertTaxon | null>(null)
  const [taxonError, setTaxonError] = useState(false)
  // logId present ⇒ edit mode (PUT). Read from the query string via
  // window.location (NOT useSearchParams — that forces a Suspense boundary
  // or the Vercel static-prerender build fails).
  const [logId, setLogId] = useState<string | null>(null)
  const [date, setDate] = useState(localDay(new Date()))
  /** Selected chip ('' = none: an edited feeding that never had a food type
   *  stays without one instead of becoming a guessed "Cricket"). */
  const [food, setFood] = useState('')
  /** Free text under "Other" — saved as the food_type itself. */
  const [otherFood, setOtherFood] = useState('')
  /** '' = not recorded. Optional and deselectable, like mobile. */
  const [foodSize, setFoodSize] = useState('')
  const [accepted, setAccepted] = useState(true)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const isEdit = !!logId
  const vocab = foodVocabularyFor(taxon)

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || !token) { router.push('/login'); return }
    const sp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const lid = sp?.get('logId') || null
    setLogId(lid)
    ;(async () => {
      let resolved: InvertTaxon | null = null
      try {
        const res = await fetch(`${API_URL}/api/v1/inverts/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        resolved = isInvertTaxon(data?.taxon) ? data.taxon : null
      } catch { /* handled below */ }
      setTaxon(resolved)
      setTaxonError(!resolved)
      const { foods } = foodVocabularyFor(resolved)

      if (!lid) {
        // New feeding: the taxon's most common food.
        setFood(foods[0])
        return
      }
      // Edit: the query string carries what the detail page had; the log
      // itself is authoritative (and is the only source of food_size, which the
      // detail page's edit link doesn't pass).
      let stored: StoredFeeding = {
        fed_at: sp?.get('fed_at'),
        food_type: sp?.get('food_type'),
        accepted: sp?.get('accepted') != null ? sp?.get('accepted') === 'true' : null,
        notes: sp?.get('notes'),
      }
      try {
        const res = await fetch(`${API_URL}/api/v1/feedings/${lid}`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) stored = await res.json()
      } catch { /* fall back to the query string */ }
      if (stored.fed_at) setDate(localDay(new Date(stored.fed_at)))
      const split = splitStoredFood(stored.food_type, foods)
      setFood(split.chip)
      setOtherFood(split.other)
      setFoodSize(stored.food_size ?? '')
      if (stored.accepted != null) setAccepted(!!stored.accepted)
      if (stored.notes != null) setNotes(stored.notes)
    })()
  }, [id, token, isAuthenticated, isLoading, router])

  const save = async () => {
    if (!token || !taxon) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        fed_at: new Date(date + 'T12:00:00').toISOString(),
        food_type: foodTypeToSave(food, otherFood),
        accepted,
        notes: notes.trim() || null,
      }
      // null, not '' — an unrecorded size reads as absent, and an edit must be
      // able to clear one. Taxa without a size picker leave a stored size alone.
      if (vocab.preySize) payload.food_size = foodSize || null
      else if (!isEdit) payload.food_size = null
      const res = await fetch(
        isEdit ? `${API_URL}/api/v1/feedings/${logId}` : `${API_URL}/api/v1/inverts/${id}/feedings`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        },
      )
      if (!res.ok) throw new Error()
      router.push(`/dashboard/inverts/${id}`)
    } catch {
      alert('Could not save feeding. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const chipCls = (selected: boolean) =>
    `px-3 py-2 rounded-full text-sm font-semibold ${selected ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`

  return (
    <DashboardLayout userName={user?.name ?? undefined} userEmail={user?.email ?? undefined} userAvatar={user?.image ?? undefined}>
      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button onClick={() => router.back()} className="text-sm text-primary-600 hover:underline mb-4">← Back</button>
        <h1 className="text-2xl font-bold text-theme-primary mb-6">{isEdit ? 'Edit feeding' : 'Log feeding'}</h1>
        {taxonError && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">Could not load this animal. Go back and try again.</p>
        )}
        <div className="space-y-5">
          <div><label className={labelCls}>Date</label><input type="date" value={date} max={localDay(new Date())} onChange={(e) => setDate(e.target.value)} className={inputCls} /></div>
          <div>
            <label className={labelCls}>Food type</label>
            <div className="flex flex-wrap gap-2">
              {vocab.foods.map((f) => (
                <button key={f} type="button" onClick={() => setFood(f)} aria-pressed={food === f} className={chipCls(food === f)}>{f}</button>
              ))}
            </div>
            {food === 'Other' && (
              <input
                value={otherFood}
                onChange={(e) => setOtherFood(e.target.value)}
                placeholder="What did you feed?"
                aria-label="Food fed"
                maxLength={100}
                className={`${inputCls} mt-2`}
              />
            )}
          </div>
          {vocab.preySize && (
            <div>
              <label className={labelCls}>Prey size (optional)</label>
              {/* Tap the selected size again to clear it — a keeper who doesn't
                  measure prey shouldn't be forced into a guess. */}
              <div className="flex flex-wrap gap-2">
                {FOOD_SIZES.map((s) => (
                  <button key={s} type="button" onClick={() => setFoodSize(foodSize === s ? '' : s)} aria-pressed={foodSize === s} className={chipCls(foodSize === s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className={labelCls}>Outcome</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAccepted(true)} aria-pressed={accepted} className={`flex-1 py-2 rounded-lg text-sm font-semibold ${accepted ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}>✓ Accepted</button>
              <button type="button" onClick={() => setAccepted(false)} aria-pressed={!accepted} className={`flex-1 py-2 rounded-lg text-sm font-semibold ${!accepted ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}>✗ Refused</button>
            </div>
          </div>
          <div><label className={labelCls}>Notes (optional)</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls} /></div>
          <button onClick={save} disabled={saving || !taxon} className="w-full py-3 bg-gradient-brand text-white rounded-xl font-semibold disabled:opacity-60">{saving ? 'Saving…' : isEdit ? 'Update feeding' : 'Save feeding'}</button>
        </div>
      </div>
    </DashboardLayout>
  )
}

const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5'
