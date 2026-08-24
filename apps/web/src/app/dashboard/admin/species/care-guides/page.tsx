'use client'

/**
 * Care guide editor.
 *
 * WHY THIS EXISTS
 * ---------------
 * Care sheets feed the app, the public species pages and the storefront guides
 * — and until now there was no interface for editing their content. The admin
 * species page handles name, genus, type and the verified flag; everything else
 * (the guide itself, sources, images, per-stage feeding) required a hand-written
 * API call. That friction is why 75 species state husbandry with no citation and
 * over half the catalog has no photo. Not neglect — no door.
 *
 * DESIGN
 * ------
 * Pick a species, change what's wrong, save. Three things make it usable rather
 * than merely possible:
 *
 *   1. The picker shows what's MISSING and how many keepers rely on it, sorted
 *      so the most consequential gaps are at the top. The queue is the dropdown.
 *   2. Only changed fields are sent. The API is a partial update, so an
 *      untouched field is never rewritten — which matters when 43 of them are
 *      on screen and most are already correct.
 *   3. Verified can't be ticked without a source. The honesty rule made
 *      structural rather than remembered.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import { readApiError } from '@/lib/api-error'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Species {
  id: string
  scientific_name: string
  common_names?: string[] | null
  taxon: string
  genus?: string | null
  family?: string | null
  order_name?: string | null
  care_level?: string | null
  temperament?: string | null
  native_region?: string | null
  adult_size?: string | null
  growth_rate?: string | null
  type?: string | null
  temperature_min?: number | null
  temperature_max?: number | null
  humidity_min?: number | null
  humidity_max?: number | null
  enclosure_size_sling?: string | null
  enclosure_size_juvenile?: string | null
  enclosure_size_adult?: string | null
  substrate_depth?: string | null
  substrate_type?: string | null
  feeding_mode?: string | null
  prey_size?: string | null
  feeding_frequency_sling?: string | null
  feeding_frequency_juvenile?: string | null
  feeding_frequency_adult?: string | null
  water_dish_required?: boolean | null
  webbing_amount?: string | null
  burrowing?: string | null
  communal_suitable?: boolean | null
  urticating_hairs?: boolean | null
  medically_significant_venom?: boolean | null
  venom_severity?: string | null
  venom_notes?: string | null
  care_guide?: string | null
  image_url?: string | null
  image_attribution?: string | null
  source_url?: string | null
  is_verified?: boolean | null
  times_kept?: number | null
}

/** What counts as a gap. Deliberately short — these are the three that make a
 *  sheet untrustworthy rather than merely incomplete. */
function gapsFor(s: Species): string[] {
  const g: string[] = []
  if (!s.source_url?.trim()) g.push('no source')
  if (!s.image_url?.trim()) g.push('no photo')
  if (!s.is_verified) g.push('unverified')
  if (!s.care_guide?.trim() || s.care_guide.trim().length < 200) g.push('thin guide')
  return g
}

export default function CareGuideEditorPage() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth()

  const [all, setAll] = useState<Species[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [onlyGaps, setOnlyGaps] = useState(true)
  const [form, setForm] = useState<Species | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const original = useMemo(
    () => all.find((s) => s.id === selectedId) || null,
    [all, selectedId],
  )

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated || !token) {
      router.push('/login')
      return
    }
    if (!user?.is_superuser && !(user as any)?.is_admin) {
      router.push('/dashboard')
      return
    }
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/invert-species/?limit=1000`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error(`Failed (${res.status})`)
        setAll(await res.json())
      } catch (e: any) {
        // Surfaced, not swallowed — an empty dropdown with no explanation
        // reads as "there are no species".
        setLoadError(e?.message || 'Could not load the catalog.')
      } finally {
        setLoading(false)
      }
    })()
  }, [authLoading, isAuthenticated, token, user, router])

  // Sorted so the dropdown IS the work queue: sheets with gaps first, and
  // within those the ones the most keepers actually rely on.
  const options = useMemo(() => {
    const list = onlyGaps ? all.filter((s) => gapsFor(s).length > 0) : all
    return [...list].sort((a, b) => {
      const ga = gapsFor(a).length > 0 ? 0 : 1
      const gb = gapsFor(b).length > 0 ? 0 : 1
      if (ga !== gb) return ga - gb
      const ka = a.times_kept ?? 0
      const kb = b.times_kept ?? 0
      if (ka !== kb) return kb - ka
      return a.scientific_name.localeCompare(b.scientific_name)
    })
  }, [all, onlyGaps])

  function select(id: string) {
    setSelectedId(id)
    setSaveError(null)
    setSaved(false)
    const s = all.find((x) => x.id === id)
    setForm(s ? { ...s } : null)
  }

  const dirty = useMemo(() => {
    if (!form || !original) return {} as Record<string, any>
    const out: Record<string, any> = {}
    for (const k of Object.keys(form) as (keyof Species)[]) {
      if (k === 'id' || k === 'taxon' || k === 'times_kept') continue
      const a = (form as any)[k]
      const b = (original as any)[k]
      if (Array.isArray(a) || Array.isArray(b)) {
        if (JSON.stringify(a ?? []) !== JSON.stringify(b ?? [])) out[k] = a
      } else if ((a ?? null) !== (b ?? null)) {
        out[k] = a
      }
    }
    return out
  }, [form, original])

  const dirtyCount = Object.keys(dirty).length
  const gaps = form ? gapsFor(form) : []
  // Verification is a claim that the content was checked against a source. A
  // sheet with no source cannot honestly carry it.
  const canVerify = !!form?.source_url?.trim()

  async function save() {
    if (!form || saving || dirtyCount === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/invert-species/${form.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(dirty),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(readApiError(body, 'Could not save.'))
      // Replace in place so the picker's gap badges update without a reload.
      setAll((prev) => prev.map((s) => (s.id === body.id ? body : s)))
      setForm(body)
      setSaved(true)
    } catch (e: any) {
      setSaveError(e?.message || 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const set = (k: keyof Species, v: any) =>
    setForm((f) => (f ? { ...f, [k]: v } : f))

  if (authLoading || loading) {
    return (
      <DashboardLayout>
        <div className="p-6 text-theme-secondary">Loading catalog…</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Care guides</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Pick a species, fix what&apos;s wrong, save. Only the fields you change
          are sent — everything else is left exactly as it is.
        </p>

        {loadError && (
          <p className="mt-4 rounded-lg bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-700 dark:text-red-300">
            {loadError}
          </p>
        )}

        {/* Picker. The option label carries the signal, so the dropdown is the
            work queue rather than an alphabetical list to hunt through. */}
        <div className="mt-6 rounded-xl border border-theme bg-surface p-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Species
          </label>
          <select
            value={selectedId}
            onChange={(e) => select(e.target.value)}
            className="mt-1 w-full rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-white"
          >
            <option value="">— choose a species —</option>
            {options.map((s) => {
              const g = gapsFor(s)
              const keepers = s.times_kept ?? 0
              return (
                <option key={s.id} value={s.id}>
                  {s.scientific_name}
                  {keepers ? ` · ${keepers} kept` : ''}
                  {g.length ? ` · ${g.join(', ')}` : ' · complete'}
                </option>
              )
            })}
          </select>
          <label className="mt-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={onlyGaps}
              onChange={(e) => setOnlyGaps(e.target.checked)}
              className="h-4 w-4"
            />
            Only show sheets needing work ({all.filter((s) => gapsFor(s).length > 0).length} of {all.length})
          </label>
        </div>

        {form && (
          <>
            {/* Why you're here, stated plainly. */}
            <div className="mt-4 rounded-xl border border-theme bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-gray-900 dark:text-white">
                  {form.scientific_name}
                </span>
                {(form.times_kept ?? 0) > 0 && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {form.times_kept} keeper{form.times_kept === 1 ? '' : 's'} rely on this
                  </span>
                )}
              </div>
              {gaps.length ? (
                <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                  Needs: {gaps.join(' · ')}
                </p>
              ) : (
                <p className="mt-2 text-sm text-green-700 dark:text-green-400">
                  Nothing flagged on this one.
                </p>
              )}
            </div>

            <Section title="The guide">
              <Field label="Care guide" hint="The long-form text keepers actually read.">
                <textarea
                  rows={14}
                  value={form.care_guide ?? ''}
                  onChange={(e) => set('care_guide', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field
                label="Source URL"
                hint="Where the husbandry numbers came from. Required before this sheet can be marked verified."
              >
                <input value={form.source_url ?? ''} onChange={(e) => set('source_url', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Image URL">
                <input value={form.image_url ?? ''} onChange={(e) => set('image_url', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Image attribution" hint="Required if the photo isn't yours.">
                <input value={form.image_attribution ?? ''} onChange={(e) => set('image_attribution', e.target.value)} className={inputCls} />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.is_verified}
                  disabled={!canVerify}
                  onChange={(e) => set('is_verified', e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className={canVerify ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400'}>
                  Verified — content checked against the source
                  {!canVerify && (
                    <span className="block text-xs">
                      Add a source URL first. A sheet with nothing behind it can&apos;t claim to be checked.
                    </span>
                  )}
                </span>
              </label>
            </Section>

            <Section title="Identity">
              <Field label="Scientific name">
                <input value={form.scientific_name ?? ''} onChange={(e) => set('scientific_name', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Common names" hint="Comma separated.">
                <input
                  value={(form.common_names ?? []).join(', ')}
                  onChange={(e) =>
                    set('common_names', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))
                  }
                  className={inputCls}
                />
              </Field>
              <Two>
                <Field label="Genus"><input value={form.genus ?? ''} onChange={(e) => set('genus', e.target.value)} className={inputCls} /></Field>
                <Field label="Family"><input value={form.family ?? ''} onChange={(e) => set('family', e.target.value)} className={inputCls} /></Field>
              </Two>
              <Two>
                <Field label="Native region"><input value={form.native_region ?? ''} onChange={(e) => set('native_region', e.target.value)} className={inputCls} /></Field>
                <Field label="Temperament"><input value={form.temperament ?? ''} onChange={(e) => set('temperament', e.target.value)} className={inputCls} /></Field>
              </Two>
              <Two>
                <Field label="Care level">
                  <select value={form.care_level ?? ''} onChange={(e) => set('care_level', e.target.value || null)} className={inputCls}>
                    <option value="">—</option>
                    <option value="beginner">beginner</option>
                    <option value="intermediate">intermediate</option>
                    <option value="advanced">advanced</option>
                  </select>
                </Field>
                <Field label="Adult size"><input value={form.adult_size ?? ''} onChange={(e) => set('adult_size', e.target.value)} className={inputCls} /></Field>
              </Two>
            </Section>

            <Section title="Climate">
              <Two>
                <Field label="Temp min (°F)"><NumberInput value={form.temperature_min} onChange={(v) => set('temperature_min', v)} /></Field>
                <Field label="Temp max (°F)"><NumberInput value={form.temperature_max} onChange={(v) => set('temperature_max', v)} /></Field>
              </Two>
              <Two>
                <Field label="Humidity min (%)"><NumberInput value={form.humidity_min} onChange={(v) => set('humidity_min', v)} /></Field>
                <Field label="Humidity max (%)"><NumberInput value={form.humidity_max} onChange={(v) => set('humidity_max', v)} /></Field>
              </Two>
            </Section>

            <Section title="Enclosure">
              <Field label="Sling"><input value={form.enclosure_size_sling ?? ''} onChange={(e) => set('enclosure_size_sling', e.target.value)} className={inputCls} /></Field>
              <Field label="Juvenile"><input value={form.enclosure_size_juvenile ?? ''} onChange={(e) => set('enclosure_size_juvenile', e.target.value)} className={inputCls} /></Field>
              <Field label="Adult"><input value={form.enclosure_size_adult ?? ''} onChange={(e) => set('enclosure_size_adult', e.target.value)} className={inputCls} /></Field>
              <Two>
                <Field label="Substrate depth"><input value={form.substrate_depth ?? ''} onChange={(e) => set('substrate_depth', e.target.value)} className={inputCls} /></Field>
                <Field label="Substrate type"><input value={form.substrate_type ?? ''} onChange={(e) => set('substrate_type', e.target.value)} className={inputCls} /></Field>
              </Two>
            </Section>

            <Section title="Feeding">
              <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1 mb-3">
                Phrasing matters: &quot;Every 5-7 days&quot; and &quot;Twice per week&quot;
                are both parsed, but a blank stage borrows another stage&apos;s cadence.
              </p>
              <Field label="Sling"><input value={form.feeding_frequency_sling ?? ''} onChange={(e) => set('feeding_frequency_sling', e.target.value)} className={inputCls} /></Field>
              <Field label="Juvenile"><input value={form.feeding_frequency_juvenile ?? ''} onChange={(e) => set('feeding_frequency_juvenile', e.target.value)} className={inputCls} /></Field>
              <Field label="Adult"><input value={form.feeding_frequency_adult ?? ''} onChange={(e) => set('feeding_frequency_adult', e.target.value)} className={inputCls} /></Field>
              <Two>
                <Field label="Prey size"><input value={form.prey_size ?? ''} onChange={(e) => set('prey_size', e.target.value)} className={inputCls} /></Field>
                <Field label="Feeding mode" hint="Detritivores are never marked overdue.">
                  <select value={form.feeding_mode ?? ''} onChange={(e) => set('feeding_mode', e.target.value || null)} className={inputCls}>
                    <option value="">—</option>
                    <option value="predator">predator</option>
                    <option value="detritivore">detritivore</option>
                    <option value="omnivore">omnivore</option>
                  </select>
                </Field>
              </Two>
            </Section>

            <Section title="Behaviour and safety">
              <Two>
                <Field label="Webbing"><input value={form.webbing_amount ?? ''} onChange={(e) => set('webbing_amount', e.target.value)} className={inputCls} /></Field>
                <Field label="Burrowing"><input value={form.burrowing ?? ''} onChange={(e) => set('burrowing', e.target.value)} className={inputCls} /></Field>
              </Two>
              <Field label="Venom severity">
                <select value={form.venom_severity ?? ''} onChange={(e) => set('venom_severity', e.target.value || null)} className={inputCls}>
                  <option value="">—</option>
                  <option value="mild">mild</option>
                  <option value="moderate">moderate</option>
                  <option value="medically_significant">medically significant</option>
                </select>
              </Field>
              <Field label="Venom notes">
                <textarea rows={3} value={form.venom_notes ?? ''} onChange={(e) => set('venom_notes', e.target.value)} className={inputCls} />
              </Field>
              <div className="flex flex-wrap gap-4 text-sm text-gray-700 dark:text-gray-300">
                <Check label="Urticating hairs" checked={!!form.urticating_hairs} onChange={(v) => set('urticating_hairs', v)} />
                <Check label="Medically significant venom" checked={!!form.medically_significant_venom} onChange={(v) => set('medically_significant_venom', v)} />
                <Check label="Water dish required" checked={!!form.water_dish_required} onChange={(v) => set('water_dish_required', v)} />
                <Check label="Communal suitable" checked={!!form.communal_suitable} onChange={(v) => set('communal_suitable', v)} />
              </div>
            </Section>

            {/* Save bar. Sticky because the form is long and the button should
                never be something you have to scroll to find. */}
            <div className="sticky bottom-0 mt-6 -mx-6 border-t border-theme bg-surface px-6 py-4">
              {saveError && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{saveError}</p>}
              {saved && dirtyCount === 0 && (
                <p className="mb-2 text-sm text-green-700 dark:text-green-400">Saved.</p>
              )}
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {dirtyCount === 0
                    ? 'No changes yet'
                    : `${dirtyCount} field${dirtyCount === 1 ? '' : 's'} changed`}
                </span>
                <button
                  onClick={save}
                  disabled={saving || dirtyCount === 0}
                  className="rounded-lg bg-primary-600 px-6 py-2 font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

const inputCls =
  'w-full rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-xl border border-theme bg-surface p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      <div className="mt-1">{children}</div>
    </div>
  )
}

function Two({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
}

function NumberInput({
  value,
  onChange,
}: {
  value?: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      // Empty means "unknown", not zero — a blank climate field must stay blank
      // rather than becoming a confident 0°F.
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className={inputCls}
    />
  )
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  )
}
