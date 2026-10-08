'use client'

/**
 * Generic invert edit form (web) — ADR-006 web parity B3.
 *
 * GET /inverts/{id} to prefill, PUT /inverts/{id} to save. Husbandry lives
 * here (added incrementally), matching the mobile edit screen.
 *
 * Taxon is editable as of 2026-09-13, but NOT through this form's PUT — it
 * goes out through its own endpoint via ChangeTaxonDialog, because the change
 * rewrites foreign keys across every log table. See that component.
 */
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { LocationField } from '@/components/LocationPicker'
import DashboardLayout from '@/components/DashboardLayout'
import ChangeTaxonDialog, { describeTaxonChangeFailure } from '@/components/ChangeTaxonDialog'
import { INVERT_TAXA, isInvertTaxon, stageCountLabel, type InvertTaxon } from '@/lib/inverts'
import SpeciesSuggestion, { useSpeciesMatch } from '@/components/SpeciesSuggestion'
import { useUnitField } from '@/hooks/useUnitField'
import { useUnits } from '@/components/UnitsProvider'
import { withMmUnit } from '@/lib/units'

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
  const [taxonDialog, setTaxonDialog] = useState(false)
  // species_id as loaded. It is only sent on save when it CHANGED, so an
  // animal whose stored link is stale (or in another taxon) can still have
  // its nickname edited without the whole save being rejected.
  const [loadedSpeciesId, setLoadedSpeciesId] = useState<string | null>(null)
  // Stored in mm / °F, edited in the keeper's units. Untouched fields save
  // their original value, so opening and saving never drifts them.
  const { units } = useUnits()
  const sizeField = useUnitField('lengthMm')
  const tempMinField = useUnitField('temp')
  const tempMaxField = useUnitField('temp')
  const loadSize = sizeField.load
  const loadTempMin = tempMinField.load
  const loadTempMax = tempMaxField.load

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
        const loaded = await res.json()
        setForm(loaded)
        setLoadedSpeciesId(loaded?.species_id ?? null)
        loadSize(loaded?.current_length_mm)
        loadTempMin(loaded?.target_temp_min)
        loadTempMax(loaded?.target_temp_max)
      } catch {
        alert('Could not load this animal.')
        router.back()
      } finally {
        setLoading(false)
      }
    })()
  }, [id, token, isAuthenticated, isLoading, router, loadSize, loadTempMin, loadTempMax])

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))
  const isOwner = !!form?.user_id && !!user?.id && form.user_id === user.id
  const isPublic = form?.visibility ? form.visibility === 'public' : !!form?.is_public

  /**
   * Apply a taxon change immediately — its own endpoint, its own commit.
   *
   * Merges back only the four fields the server rewrites. Replacing the whole
   * form with the response would silently discard any edit in progress (the
   * keeper may well have come here to fix a nickname AND the type), and those
   * unsaved fields still need to go out with the normal Save.
   */
  const handleChangeTaxon = async (taxon: InvertTaxon, speciesId: string | null) => {
    if (!token) return
    const res = await fetch(`${API_URL}/api/v1/inverts/${id}/change-taxon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ taxon, species_id: speciesId }),
    })
    if (!res.ok) {
      // Refusals change nothing server-side, so the form is still accurate.
      alert(await describeTaxonChangeFailure(res))
      return
    }
    const updated = await res.json()
    setForm((p: any) => ({
      ...p,
      taxon: updated.taxon,
      species_id: updated.species_id,
      scientific_name: updated.scientific_name,
      common_name: updated.common_name,
    }))
    // The server already wrote this species_id; don't send it again on Save.
    setLoadedSpeciesId(updated.species_id ?? null)
    setTaxonDialog(false)
  }

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
          ...((form.species_id ?? null) !== loadedSpeciesId ? { species_id: form.species_id ?? null } : {}),
          sex: form.sex,
          current_instar: form.current_instar,
          current_length_mm: sizeField.toStorage(),
          date_acquired: form.date_acquired || null,
          source: form.source || null,
          price_paid: form.price_paid || null,
          enclosure_type: form.enclosure_type,
          enclosure_size: form.enclosure_size,
          location: form.location ?? null,
          substrate_type: form.substrate_type,
          substrate_depth: form.substrate_depth,
          target_temp_min: tempMinField.toStorage(),
          target_temp_max: tempMaxField.toStorage(),
          target_humidity_min: form.target_humidity_min,
          target_humidity_max: form.target_humidity_max,
          water_dish: form.water_dish,
          misting_schedule: form.misting_schedule || null,
          last_enclosure_cleaning: form.last_enclosure_cleaning || null,
          enclosure_notes: form.enclosure_notes || null,
          last_substrate_change: form.last_substrate_change || null,
          notes: form.notes,
          // Tarantula only — drives the care-sheet feeding cadence. Normalised
          // so an unexpected stored casing can't fail the whole save.
          ...(form.taxon === 'tarantula' ? { life_stage: lifeStageValue(form.life_stage) } : {}),
          // Owner only (the server strips it from a co-keeper's write too).
          // `visibility` is what the keeper profile reads; is_public follows it.
          ...(isOwner ? { visibility: isPublic ? 'public' : 'private', is_public: isPublic } : {}),
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
              {/* Type leads because it scopes everything under it — the
                  species catalog, the size label, the care sheet. It's a row
                  with its own button rather than a select: changing it is a
                  separate server operation with side effects across every log
                  table. See ChangeTaxonDialog. */}
              <Field label="Type">
                <div className="flex items-center gap-3 px-3 py-2 border border-theme rounded-lg bg-surface">
                  <span className="text-xl" aria-hidden="true">{meta?.glyph ?? '🐾'}</span>
                  <span className="flex-1 font-semibold text-theme-primary">{meta?.label ?? form.taxon}</span>
                  {/* text-primary / bg-primary-soft are the real utilities
                      (globals.css). `text-primary-600` reads like Tailwind but
                      this config defines no `primary` palette, so that class
                      generates nothing — it's dead in ~34 other files. These
                      read --primary, so they theme themselves: no dark:
                      variant needed. */}
                  <button
                    type="button"
                    onClick={() => setTaxonDialog(true)}
                    aria-label="Change type"
                    className="px-3.5 py-1.5 rounded-full border border-theme text-primary text-xs font-bold hover:bg-primary-soft transition"
                  >
                    Change
                  </button>
                </div>
              </Field>
              {/* Species — within the animal's CURRENT type only. Changing the
                  type stays in the dialog above, because it rewrites more than
                  this form can. Typing over a linked species unlinks it, the
                  same as the add form and the mobile picker. */}
              {isInvertTaxon(formTaxon) && formTaxon !== 'other' && (
                <SpeciesField
                  taxon={formTaxon}
                  text={form.scientific_name ?? ''}
                  speciesId={form.species_id ?? null}
                  onText={(t) => setForm((p: any) => ({ ...p, scientific_name: t, species_id: null }))}
                  onPick={(sp) =>
                    setForm((p: any) => ({
                      ...p,
                      species_id: sp.id,
                      scientific_name: sp.scientific_name,
                      common_name: p.common_name ? p.common_name : sp.common_names?.[0] ?? p.common_name,
                    }))
                  }
                  onUnlink={() => setForm((p: any) => ({ ...p, species_id: null }))}
                />
              )}
              <Field label="Nickname"><input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} className={inputCls} /></Field>
              <Field label="Common name"><input value={form.common_name ?? ''} onChange={(e) => set('common_name', e.target.value)} className={inputCls} /></Field>
              {/* Every other type edits its scientific name through the Species
                  field above; "Other" has no catalog to search. */}
              {!(isInvertTaxon(formTaxon) && formTaxon !== 'other') && (
                <Field label="Scientific name"><input value={form.scientific_name ?? ''} onChange={(e) => set('scientific_name', e.target.value)} className={inputCls} /></Field>
              )}

              <Field label="Sex">
                <div className="flex gap-2">
                  {(['unknown', 'female', 'male'] as const).map((s) => (
                    <button key={s} onClick={() => set('sex', s)} className={`px-4 py-2 rounded-full text-sm font-semibold capitalize ${form.sex === s ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}>{s}</button>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label={stageCountLabel(form.taxon)}><input value={form.current_instar ?? ''} onChange={(e) => set('current_instar', e.target.value ? Number(e.target.value) : null)} inputMode="numeric" className={inputCls} /></Field>
                <Field label={withMmUnit(meta?.sizeLabel ?? 'Size', units)}><input value={sizeField.value} onChange={(e) => sizeField.setValue(e.target.value)} inputMode="decimal" className={inputCls} /></Field>
              </div>

              {form.taxon === 'tarantula' && (
                <Field label="Life stage">
                  <div className="flex gap-2 flex-wrap">
                    {LIFE_STAGES.map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => set('life_stage', lifeStageValue(form.life_stage) === st ? null : st)}
                        aria-pressed={lifeStageValue(form.life_stage) === st}
                        className={`px-4 py-2 rounded-full text-sm font-semibold capitalize ${lifeStageValue(form.life_stage) === st ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-theme-tertiary">
                    With a linked care sheet, this sets the suggested feeding schedule.
                  </p>
                </Field>
              )}

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
              <Field label="Location"><LocationField token={token} value={form.location} onChange={(v) => set('location', v)} /></Field>
              <Field label="Substrate type"><input value={form.substrate_type ?? ''} onChange={(e) => set('substrate_type', e.target.value)} className={inputCls} /></Field>
              <Field label="Substrate depth"><input value={form.substrate_depth ?? ''} onChange={(e) => set('substrate_depth', e.target.value)} className={inputCls} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={`Temp min (${tempMinField.unit})`}><input value={tempMinField.value} onChange={(e) => tempMinField.setValue(e.target.value)} inputMode="decimal" className={inputCls} /></Field>
                <Field label={`Temp max (${tempMaxField.unit})`}><input value={tempMaxField.value} onChange={(e) => tempMaxField.setValue(e.target.value)} inputMode="decimal" className={inputCls} /></Field>
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
              <div className="grid grid-cols-2 gap-4">
                <Field label="Last substrate change"><input type="date" value={form.last_substrate_change ?? ''} onChange={(e) => set('last_substrate_change', e.target.value)} className={inputCls} /></Field>
                <Field label="Last enclosure cleaning"><input type="date" value={form.last_enclosure_cleaning ?? ''} onChange={(e) => set('last_enclosure_cleaning', e.target.value)} className={inputCls} /></Field>
              </div>
              <Field label="Enclosure notes"><textarea value={form.enclosure_notes ?? ''} onChange={(e) => set('enclosure_notes', e.target.value)} rows={2} placeholder="Decor, modifications, etc." className={inputCls} /></Field>

              <Field label="Notes"><textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={3} className={inputCls} /></Field>

              {isOwner && (
                <Field label="Visibility">
                  <div className="flex gap-2">
                    {([['public', 'Public'], ['private', 'Private']] as const).map(([v, lbl]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setForm((p: any) => ({ ...p, visibility: v, is_public: v === 'public' }))}
                        aria-pressed={(v === 'public') === isPublic}
                        className={`px-4 py-2 rounded-full text-sm font-semibold ${(v === 'public') === isPublic ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-theme-tertiary">
                    Public animals are listed on your keeper profile when your collection is public.
                  </p>
                </Field>
              )}

              <button onClick={handleSave} disabled={saving} className="w-full py-3 bg-gradient-brand text-white rounded-xl font-semibold disabled:opacity-60">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>

            {isInvertTaxon(formTaxon) && (
              <ChangeTaxonDialog
                open={taxonDialog}
                current={formTaxon}
                animalName={form.name || 'this animal'}
                onClose={() => setTaxonDialog(false)}
                onConfirm={handleChangeTaxon}
              />
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

interface SpeciesHit {
  id: string
  scientific_name: string
  common_names?: string[]
}

/**
 * Species search + link for the edit form (mirrors the add form and the mobile
 * InvertSpeciesPicker). The text is the animal's scientific name; picking a row
 * links the care sheet, typing over a linked row unlinks it, and "Unlink" drops
 * the link while keeping the text.
 */
function SpeciesField({
  taxon, text, speciesId, onText, onPick, onUnlink,
}: {
  taxon: InvertTaxon
  text: string
  speciesId: string | null
  onText: (t: string) => void
  onPick: (s: SpeciesHit) => void
  onUnlink: () => void
}) {
  const [hits, setHits] = useState<SpeciesHit[]>([])
  const [open, setOpen] = useState(false)
  // The last search for the current text came back empty.
  const [noHits, setNoHits] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Search is a substring match, so capitals, a typo or a bare epithet find
  // nothing; the matcher catches those once it does. Same taxon only.
  const nameMatch = useSpeciesMatch(noHits && !speciesId ? text : '', taxon)
  const suggestion = nameMatch?.match && nameMatch.match.taxon === taxon ? nameMatch.match : null

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current) }, [])

  const change = (value: string) => {
    onText(value)
    setOpen(true)
    setNoHits(false)
    if (debounce.current) clearTimeout(debounce.current)
    if (!value.trim()) { setHits([]); return }
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/v1/invert-species/search?q=${encodeURIComponent(value.trim())}&taxon=${taxon}&limit=8`,
        )
        const rows: SpeciesHit[] = res.ok ? await res.json() : []
        setHits(rows)
        setNoHits(rows.length === 0)
      } catch {
        setHits([])
      }
    }, 250)
  }

  const pick = (sp: SpeciesHit) => {
    onPick(sp)
    setOpen(false)
    setHits([])
    setNoHits(false)
  }

  return (
    <Field label="Species">
      <div className="relative">
        <input
          value={text}
          onChange={(e) => change(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search species…"
          autoComplete="off"
          className={inputCls}
        />
        {open && hits.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 bg-surface border border-theme rounded-lg shadow-lg max-h-60 overflow-auto">
            {hits.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => pick(h)}
                className="w-full text-left px-3 py-2 hover:bg-surface-elevated border-b border-theme last:border-0"
              >
                <div className="text-sm italic font-semibold text-theme-primary">{h.scientific_name}</div>
                {h.common_names?.[0] && <div className="text-xs text-theme-secondary">{h.common_names[0]}</div>}
              </button>
            ))}
          </div>
        )}
      </div>
      {speciesId ? (
        <div className="mt-1.5 flex items-center gap-3 text-xs text-theme-secondary">
          <span>Linked to the care sheet for this species.</span>
          <button
            type="button"
            onClick={onUnlink}
            className="font-semibold text-theme-primary underline underline-offset-2 hover:opacity-80"
          >
            Unlink
          </button>
        </div>
      ) : suggestion ? (
        <SpeciesSuggestion
          match={suggestion}
          currentTaxon={taxon}
          onUse={() => pick({ id: suggestion.id, scientific_name: suggestion.scientific_name, common_names: suggestion.common_name ? [suggestion.common_name] : [] })}
        />
      ) : noHits && text.trim() ? (
        <p className="mt-1 text-xs text-theme-tertiary">Not in our species list yet. It will be saved as you typed it.</p>
      ) : text.trim() ? (
        <p className="mt-1 text-xs text-theme-tertiary">Not linked to a care sheet. Pick a species from the list to link one.</p>
      ) : null}
    </Field>
  )
}

const LIFE_STAGES = ['sling', 'juvenile', 'adult'] as const

function lifeStageValue(v: unknown): string | null {
  const s = typeof v === 'string' ? v.toLowerCase() : ''
  return (LIFE_STAGES as readonly string[]).includes(s) ? s : null
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5">{label}</label>
      {children}
    </div>
  )
}
