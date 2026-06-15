'use client'

/**
 * Generic invert add form (web) — ADR-006 web parity B3.
 *
 * Reads ?taxon=scorpion|centipede|whip_spider, posts to the generic
 * POST /inverts/ with the taxon set. Species autocomplete is scoped to the
 * taxon's catalog. Tarantulas use their own /dashboard/tarantulas/add.
 *
 * useSearchParams requires a Suspense boundary for the Next 14 static
 * prerender, so the form is split into an inner component.
 */
import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import { INVERT_TAXA, isInvertTaxon, type InvertTaxon } from '@/lib/inverts'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface SpeciesHit {
  id: string
  scientific_name: string
  common_names?: string[]
}

function AddInvertForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, token } = useAuth()

  const taxonParam = searchParams.get('taxon')
  const taxon: InvertTaxon = isInvertTaxon(taxonParam) ? taxonParam : 'scorpion'
  const meta = INVERT_TAXA[taxon]

  const [name, setName] = useState('')
  const [commonName, setCommonName] = useState('')
  const [scientificName, setScientificName] = useState('')
  const [speciesId, setSpeciesId] = useState<string | null>(null)
  const [sex, setSex] = useState<'unknown' | 'male' | 'female'>('unknown')
  const [molts, setMolts] = useState('')
  const [sizeMm, setSizeMm] = useState('')
  // Acquisition + husbandry (parity with the tarantula add form)
  const [dateAcquired, setDateAcquired] = useState('')
  const [source, setSource] = useState<'bred' | 'bought' | 'wild_caught' | ''>('')
  const [pricePaid, setPricePaid] = useState('')
  const [enclosureType, setEnclosureType] = useState<'terrestrial' | 'arboreal' | 'fossorial'>('terrestrial')
  const [enclosureSize, setEnclosureSize] = useState('')
  const [substrateType, setSubstrateType] = useState('')
  const [substrateDepth, setSubstrateDepth] = useState('')
  const [tempMin, setTempMin] = useState('')
  const [tempMax, setTempMax] = useState('')
  const [humidityMin, setHumidityMin] = useState('')
  const [humidityMax, setHumidityMax] = useState('')
  const [waterDish, setWaterDish] = useState(true)
  const [mistingSchedule, setMistingSchedule] = useState('')
  const [lastCleaning, setLastCleaning] = useState('')
  const [enclosureNotes, setEnclosureNotes] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Species autocomplete
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SpeciesHit[]>([])
  const [open, setOpen] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onQueryChange = (text: string) => {
    setQuery(text)
    setScientificName(text)
    setSpeciesId(null)
    setOpen(true)
    if (debounce.current) clearTimeout(debounce.current)
    if (!text.trim()) {
      setHits([])
      return
    }
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/v1/invert-species/search?q=${encodeURIComponent(text.trim())}&taxon=${taxon}&limit=8`,
        )
        setHits(res.ok ? await res.json() : [])
      } catch {
        setHits([])
      }
    }, 250)
  }

  const pickSpecies = (s: SpeciesHit) => {
    setSpeciesId(s.id)
    setScientificName(s.scientific_name)
    setQuery(s.scientific_name)
    if (!commonName && s.common_names?.[0]) setCommonName(s.common_names[0])
    setOpen(false)
    setHits([])
  }

  const handleSave = async () => {
    if (!token) return
    if (!name && !commonName && !scientificName) {
      alert(`Pick a species or give your ${meta.label.toLowerCase()} a name before saving.`)
      return
    }
    setSaving(true)
    try {
      // Generic create — taxon in the body. TAXON_PATTERN now covers every
      // taxon, so this works without per-taxon routers (ADR-007 parity).
      const res = await fetch(`${API_URL}/api/v1/inverts/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          taxon,
          name: name.trim() || null,
          common_name: commonName.trim() || null,
          scientific_name: scientificName.trim() || null,
          species_id: speciesId,
          sex,
          current_instar: molts ? Number(molts) : null,
          current_length_mm: sizeMm.trim() || null,
          date_acquired: dateAcquired.trim() || null,
          source: source || null,
          price_paid: pricePaid.trim() || null,
          enclosure_type: enclosureType,
          enclosure_size: enclosureSize.trim() || null,
          substrate_type: substrateType.trim() || null,
          substrate_depth: substrateDepth.trim() || null,
          target_temp_min: tempMin.trim() || null,
          target_temp_max: tempMax.trim() || null,
          target_humidity_min: humidityMin.trim() || null,
          target_humidity_max: humidityMax.trim() || null,
          water_dish: waterDish,
          misting_schedule: mistingSchedule.trim() || null,
          last_enclosure_cleaning: lastCleaning.trim() || null,
          enclosure_notes: enclosureNotes.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      if (res.status === 402) {
        alert("You've reached the free tier limit of 15 animals. Upgrade to Premium for unlimited tracking.")
        return
      }
      if (!res.ok) throw new Error()
      const created = await res.json()
      router.replace(`/dashboard/inverts/${created.id}`)
    } catch {
      alert('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout userName={user?.name ?? undefined} userEmail={user?.email ?? undefined} userAvatar={user?.image ?? undefined}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button onClick={() => router.back()} className="text-sm text-primary-600 hover:underline mb-4">← Back</button>
        <h1 className="text-3xl font-bold text-theme-primary mb-6">{meta.glyph} Add {meta.label}</h1>

        <div className="space-y-5">
          {/* Species autocomplete */}
          <Field label="Species">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
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
                      onClick={() => pickSpecies(h)}
                      className="w-full text-left px-3 py-2 hover:bg-surface-elevated border-b border-theme last:border-0"
                    >
                      <div className="text-sm italic font-semibold text-theme-primary">{h.scientific_name}</div>
                      {h.common_names?.[0] && <div className="text-xs text-theme-secondary">{h.common_names[0]}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>

          <Field label="Nickname"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" className={inputCls} /></Field>
          <Field label="Common name (override)"><input value={commonName} onChange={(e) => setCommonName(e.target.value)} className={inputCls} /></Field>
          <Field label="Scientific name (override)"><input value={scientificName} onChange={(e) => setScientificName(e.target.value)} autoComplete="off" className={inputCls} /></Field>

          <Field label="Sex">
            <div className="flex gap-2">
              {(['unknown', 'female', 'male'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSex(s)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold capitalize ${sex === s ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Molts"><input value={molts} onChange={(e) => setMolts(e.target.value)} inputMode="numeric" placeholder="e.g. 4" className={inputCls} /></Field>
            <Field label={meta.sizeLabel}><input value={sizeMm} onChange={(e) => setSizeMm(e.target.value)} inputMode="decimal" placeholder="e.g. 180" className={inputCls} /></Field>
          </div>

          <h2 className="text-sm font-bold uppercase tracking-wide text-theme-secondary pt-2">Acquisition</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date acquired"><input type="date" value={dateAcquired} onChange={(e) => setDateAcquired(e.target.value)} className={inputCls} /></Field>
            <Field label="Price paid"><input value={pricePaid} onChange={(e) => setPricePaid(e.target.value)} inputMode="decimal" placeholder="e.g. 45" className={inputCls} /></Field>
          </div>
          <Field label="Source">
            <div className="flex gap-2">
              {([['bred', 'Captive bred'], ['bought', 'Bought'], ['wild_caught', 'Wild caught']] as const).map(([v, lbl]) => (
                <button key={v} onClick={() => setSource(source === v ? '' : v)} className={`px-4 py-2 rounded-full text-sm font-semibold ${source === v ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}>{lbl}</button>
              ))}
            </div>
          </Field>

          <h2 className="text-sm font-bold uppercase tracking-wide text-theme-secondary pt-2">Husbandry</h2>
          <Field label="Enclosure type">
            <div className="flex gap-2">
              {(['terrestrial', 'arboreal', 'fossorial'] as const).map((v) => (
                <button key={v} onClick={() => setEnclosureType(v)} className={`px-4 py-2 rounded-full text-sm font-semibold capitalize ${enclosureType === v ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}>{v}</button>
              ))}
            </div>
          </Field>
          <Field label="Enclosure size"><input value={enclosureSize} onChange={(e) => setEnclosureSize(e.target.value)} placeholder='e.g. 6x6x6"' className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Substrate type"><input value={substrateType} onChange={(e) => setSubstrateType(e.target.value)} placeholder="e.g. coco fiber" className={inputCls} /></Field>
            <Field label="Substrate depth"><input value={substrateDepth} onChange={(e) => setSubstrateDepth(e.target.value)} placeholder='e.g. 3"' className={inputCls} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Temp min (°F)"><input value={tempMin} onChange={(e) => setTempMin(e.target.value)} inputMode="numeric" placeholder="72" className={inputCls} /></Field>
            <Field label="Temp max (°F)"><input value={tempMax} onChange={(e) => setTempMax(e.target.value)} inputMode="numeric" placeholder="82" className={inputCls} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Humidity min (%)"><input value={humidityMin} onChange={(e) => setHumidityMin(e.target.value)} inputMode="numeric" placeholder="60" className={inputCls} /></Field>
            <Field label="Humidity max (%)"><input value={humidityMax} onChange={(e) => setHumidityMax(e.target.value)} inputMode="numeric" placeholder="75" className={inputCls} /></Field>
          </div>
          <Field label="Water dish">
            <div className="flex gap-2">
              {([['yes', true], ['no', false]] as const).map(([lbl, val]) => (
                <button key={lbl} onClick={() => setWaterDish(val)} className={`px-4 py-2 rounded-full text-sm font-semibold capitalize ${waterDish === val ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}>{lbl}</button>
              ))}
            </div>
          </Field>
          <Field label="Misting schedule"><input value={mistingSchedule} onChange={(e) => setMistingSchedule(e.target.value)} placeholder="e.g. 2x per week" className={inputCls} /></Field>
          <Field label="Last enclosure cleaning"><input type="date" value={lastCleaning} onChange={(e) => setLastCleaning(e.target.value)} className={inputCls} /></Field>
          <Field label="Enclosure notes"><textarea value={enclosureNotes} onChange={(e) => setEnclosureNotes(e.target.value)} rows={2} placeholder="Decor, modifications, etc." className={inputCls} /></Field>

          <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls} /></Field>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-gradient-brand text-white rounded-xl font-semibold disabled:opacity-60"
          >
            {saving ? 'Saving…' : `Save ${meta.label.toLowerCase()}`}
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}

const inputCls =
  'w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary placeholder-theme-tertiary focus:outline-none focus:ring-2 focus:ring-electric-blue-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5">{label}</label>
      {children}
    </div>
  )
}

export default function AddInvertPage() {
  return (
    <Suspense fallback={null}>
      <AddInvertForm />
    </Suspense>
  )
}
