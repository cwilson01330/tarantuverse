'use client'

/**
 * Generic invert edit form (web) — ADR-006 web parity B3.
 *
 * GET /inverts/{id} to prefill, PUT /inverts/{id} to save. Husbandry lives
 * here (added incrementally), matching the mobile edit screen. Taxon is
 * immutable, so it's read-only context.
 */
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import { INVERT_TAXA, isInvertTaxon } from '@/lib/inverts'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const inputCls =
  'w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary placeholder-theme-tertiary focus:outline-none focus:ring-2 focus:ring-electric-blue-500'

export default function EditInvertPage() {
  const params = useParams()
  const id = params?.id as string
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()

  const [form, setForm] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || !token) {
      router.push('/login')
      return
    }
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/inverts/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error()
        setForm(await res.json())
      } catch {
        alert('Could not load this animal.')
        router.back()
      } finally {
        setLoading(false)
      }
    })()
  }, [id, token, isAuthenticated, isLoading, router])

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!token || !form) return
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/inverts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: form.name,
          common_name: form.common_name,
          scientific_name: form.scientific_name,
          sex: form.sex,
          current_instar: form.current_instar,
          current_length_mm: form.current_length_mm,
          date_acquired: form.date_acquired || null,
          source: form.source || null,
          price_paid: form.price_paid || null,
          enclosure_type: form.enclosure_type,
          enclosure_size: form.enclosure_size,
          substrate_type: form.substrate_type,
          substrate_depth: form.substrate_depth,
          target_temp_min: form.target_temp_min,
          target_temp_max: form.target_temp_max,
          target_humidity_min: form.target_humidity_min,
          target_humidity_max: form.target_humidity_max,
          water_dish: form.water_dish,
          misting_schedule: form.misting_schedule || null,
          last_enclosure_cleaning: form.last_enclosure_cleaning || null,
          enclosure_notes: form.enclosure_notes || null,
          notes: form.notes,
        }),
      })
      if (!res.ok) throw new Error()
      router.push(`/dashboard/inverts/${id}`)
    } catch {
      alert('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const formTaxon: string | undefined = form?.taxon
  const meta = isInvertTaxon(formTaxon) ? INVERT_TAXA[formTaxon] : null

  return (
    <DashboardLayout userName={user?.name ?? undefined} userEmail={user?.email ?? undefined} userAvatar={user?.image ?? undefined}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button onClick={() => router.back()} className="text-sm text-primary-600 hover:underline mb-4">← Back</button>
        {loading || !form ? (
          <p className="text-theme-secondary">Loading…</p>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-theme-primary mb-6">
              {meta?.glyph} Edit {meta?.label ?? 'animal'}
            </h1>
            <div className="space-y-5">
              <Field label="Nickname"><input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} className={inputCls} /></Field>
              <Field label="Common name"><input value={form.common_name ?? ''} onChange={(e) => set('common_name', e.target.value)} className={inputCls} /></Field>
              <Field label="Scientific name"><input value={form.scientific_name ?? ''} onChange={(e) => set('scientific_name', e.target.value)} className={inputCls} /></Field>

              <Field label="Sex">
                <div className="flex gap-2">
                  {(['unknown', 'female', 'male'] as const).map((s) => (
                    <button key={s} onClick={() => set('sex', s)} className={`px-4 py-2 rounded-full text-sm font-semibold capitalize ${form.sex === s ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}>{s}</button>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Molts"><input value={form.current_instar ?? ''} onChange={(e) => set('current_instar', e.target.value ? Number(e.target.value) : null)} inputMode="numeric" className={inputCls} /></Field>
                <Field label={meta?.sizeLabel ?? 'Size (mm)'}><input value={form.current_length_mm ?? ''} onChange={(e) => set('current_length_mm', e.target.value)} inputMode="decimal" className={inputCls} /></Field>
              </div>

              <h2 className="text-xs font-bold uppercase tracking-wide text-theme-tertiary border-b border-theme pb-2 pt-2">Acquisition</h2>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Date acquired"><input type="date" value={form.date_acquired ?? ''} onChange={(e) => set('date_acquired', e.target.value)} className={inputCls} /></Field>
                <Field label="Price paid"><input value={form.price_paid ?? ''} onChange={(e) => set('price_paid', e.target.value)} inputMode="decimal" className={inputCls} /></Field>
              </div>
              <Field label="Source">
                <div className="flex gap-2 flex-wrap">
                  {([['bred', 'Captive bred'], ['bought', 'Bought'], ['wild_caught', 'Wild caught']] as const).map(([v, lbl]) => (
                    <button key={v} onClick={() => set('source', form.source === v ? null : v)} className={`px-4 py-2 rounded-full text-sm font-semibold ${form.source === v ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}>{lbl}</button>
                  ))}
                </div>
              </Field>

              <h2 className="text-xs font-bold uppercase tracking-wide text-theme-tertiary border-b border-theme pb-2 pt-2">Enclosure</h2>

              <Field label="Type">
                <div className="flex gap-2 flex-wrap">
                  {(['arboreal', 'terrestrial', 'fossorial'] as const).map((t) => (
                    <button key={t} onClick={() => set('enclosure_type', t)} className={`px-4 py-2 rounded-full text-sm font-semibold capitalize ${form.enclosure_type === t ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}>{t}</button>
                  ))}
                </div>
              </Field>
              <Field label="Size"><input value={form.enclosure_size ?? ''} onChange={(e) => set('enclosure_size', e.target.value)} placeholder='e.g. 12x12x18"' className={inputCls} /></Field>
              <Field label="Substrate type"><input value={form.substrate_type ?? ''} onChange={(e) => set('substrate_type', e.target.value)} className={inputCls} /></Field>
              <Field label="Substrate depth"><input value={form.substrate_depth ?? ''} onChange={(e) => set('substrate_depth', e.target.value)} className={inputCls} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Temp min (°F)"><input value={form.target_temp_min ?? ''} onChange={(e) => set('target_temp_min', e.target.value)} inputMode="decimal" className={inputCls} /></Field>
                <Field label="Temp max (°F)"><input value={form.target_temp_max ?? ''} onChange={(e) => set('target_temp_max', e.target.value)} inputMode="decimal" className={inputCls} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Humidity min %"><input value={form.target_humidity_min ?? ''} onChange={(e) => set('target_humidity_min', e.target.value)} inputMode="decimal" className={inputCls} /></Field>
                <Field label="Humidity max %"><input value={form.target_humidity_max ?? ''} onChange={(e) => set('target_humidity_max', e.target.value)} inputMode="decimal" className={inputCls} /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-theme-primary">
                <input type="checkbox" checked={!!form.water_dish} onChange={(e) => set('water_dish', e.target.checked)} />
                Water dish
              </label>
              <Field label="Misting schedule"><input value={form.misting_schedule ?? ''} onChange={(e) => set('misting_schedule', e.target.value)} placeholder="e.g. 2x per week" className={inputCls} /></Field>
              <Field label="Last enclosure cleaning"><input type="date" value={form.last_enclosure_cleaning ?? ''} onChange={(e) => set('last_enclosure_cleaning', e.target.value)} className={inputCls} /></Field>
              <Field label="Enclosure notes"><textarea value={form.enclosure_notes ?? ''} onChange={(e) => set('enclosure_notes', e.target.value)} rows={2} placeholder="Decor, modifications, etc." className={inputCls} /></Field>

              <Field label="Notes"><textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={3} className={inputCls} /></Field>

              <button onClick={handleSave} disabled={saving} className="w-full py-3 bg-gradient-brand text-white rounded-xl font-semibold disabled:opacity-60">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5">{label}</label>
      {children}
    </div>
  )
}
