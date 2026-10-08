'use client'

/**
 * Generic invert add form (web) — ADR-006 web parity B3, audit-2 M7/M12.
 *
 * URL params (all optional):
 *   ?taxon=<taxon>         which kind of animal. Missing or unknown → a taxon
 *                          picker (it used to quietly become a scorpion).
 *   ?species_id=<uuid>     prefill from a care sheet ("Add to collection").
 *                          `speciesId` is accepted too (the mobile spelling).
 *                          The species' taxon wins over a missing/different
 *                          ?taxon, because a care sheet is never wrong about
 *                          what it describes.
 *   ?enclosure_id=<uuid>   put the new animal in that enclosure ("+ Add new
 *                          animal" on an enclosure page). Ignored with
 *                          ?collection=, like mobile: the enclosure is yours,
 *                          the animal would be the owner's.
 *   ?collection=<uuid>     co-keeper add into a shared collection.
 *
 * Posts to the generic POST /inverts/ for every taxon (a tarantula is mirrored
 * onto the legacy table server-side). Defaults mirror mobile app/add.tsx:
 * per-taxon enclosure type (mobile src/lib/inverts.ts defaultEnclosureType),
 * life stage (juvenile, clearable), and a picked species fills the husbandry
 * fields from its care sheet.
 *
 * useSearchParams requires a Suspense boundary for the Next 14 static
 * prerender, so the form is split into an inner component.
 */
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { LocationField } from '@/components/LocationPicker'
import DashboardLayout from '@/components/DashboardLayout'
import UpgradeModal from '@/components/UpgradeModal'
import { INVERT_TAXA, PICKER_TAXA, isInvertTaxon, stageCountLabel, type InvertTaxon } from '@/lib/inverts'
import SpeciesSuggestion, { useSpeciesMatch } from '@/components/SpeciesSuggestion'
import { useUnitField } from '@/hooks/useUnitField'
import { formatTempRange, withMmUnit } from '@/lib/units'
import { useUnits } from '@/components/UnitsProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type EnclosureType = 'terrestrial' | 'arboreal' | 'fossorial'
type LifeStage = 'sling' | 'juvenile' | 'adult'
const LIFE_STAGES: LifeStage[] = ['sling', 'juvenile', 'adult']

/**
 * Starting enclosure orientation per taxon. Mirrors `defaultEnclosureType` in
 * apps/mobile/src/lib/inverts.ts (INVERT_TAXA) — keep the two in step
 * (pinned by apps/api/tests/test_d_add_form_defaults.py; the Record type makes
 * a missing taxon a compile error). A picked species' own habit replaces it.
 */
const DEFAULT_ENCLOSURE_TYPE: Record<InvertTaxon, EnclosureType> = {
  tarantula: 'terrestrial',
  scorpion: 'fossorial',
  centipede: 'fossorial',
  whip_spider: 'arboreal',
  vinegaroon: 'fossorial',
  true_spider: 'arboreal',
  millipede: 'terrestrial',
  mantis: 'arboreal',
  roach: 'terrestrial',
  isopod: 'terrestrial',
  other: 'terrestrial',
}


/** A care sheet's free-text habit → the three-value enclosure enum. First
 *  term wins ("terrestrial/semi-arboreal" is terrestrial); anything else is
 *  left to the keeper rather than guessed. Mirrors mobile
 *  src/lib/species-catalog.ts::normalizeEnclosureType. */
function normalizeEnclosureType(raw: string | null | undefined): EnclosureType | null {
  if (!raw) return null
  const s = raw.toLowerCase()
  const found = (['terrestrial', 'arboreal', 'fossorial'] as const)
    .map((term) => ({ term, at: s.indexOf(term) }))
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at)
  return found.length ? found[0].term : null
}

interface SpeciesHit {
  id: string
  scientific_name: string
  common_names?: string[]
  taxon?: string
  // Care-sheet husbandry (present on /invert-species/search and /{id}).
  type?: string | null
  enclosure_size_sling?: string | null
  enclosure_size_juvenile?: string | null
  enclosure_size_adult?: string | null
  substrate_type?: string | null
  substrate_depth?: string | null
  temperature_min?: number | null
  temperature_max?: number | null
  humidity_min?: number | null
  humidity_max?: number | null
  water_dish_required?: boolean | null
}

const hasHusbandry = (s: SpeciesHit) => 'type' in s || 'substrate_type' in s || 'temperature_min' in s

function sizeForStage(s: SpeciesHit, stage: LifeStage | null): string | null {
  if (stage === 'sling') return s.enclosure_size_sling ?? null
  if (stage === 'adult') return s.enclosure_size_adult ?? null
  return s.enclosure_size_juvenile ?? null
}

function AddInvertForm() {
  const searchParams = useSearchParams()
  const taxonParam = searchParams.get('taxon')
  const speciesParam = searchParams.get('species_id') || searchParams.get('speciesId')

  // A species link without a taxon is resolved by the form (it knows the
  // species' taxon once it loads), so only show the picker when there's
  // neither.
  if (!isInvertTaxon(taxonParam) && !speciesParam) return <TaxonPicker />
  // Not keyed by taxon: a "did you mean" that switches taxon keeps
  // everything typed so far.
  return <AddInvertFields />
}

/** Shown when the URL names no taxon: pick one, keeping every other param. */
function TaxonPicker() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const go = (t: InvertTaxon) => {
    const q = new URLSearchParams(searchParams.toString())
    q.set('taxon', t)
    router.replace(`/dashboard/inverts/add?${q}`, { scroll: false })
  }
  return (
    <DashboardLayout userName={user?.name ?? undefined} userEmail={user?.email ?? undefined} userAvatar={user?.image ?? undefined}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button onClick={() => router.back()} className="text-sm text-primary hover:underline mb-4">← Back</button>
        <h1 className="text-3xl font-bold text-theme-primary mb-2">Add an animal</h1>
        <p className="text-theme-secondary mb-6">What kind of animal is it?</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {/* Registry order (tarantula first), same as mobile INVERT_TAXON_ORDER. */}
          {PICKER_TAXA.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => go(t)}
              className="flex items-center gap-3 p-4 rounded-xl border border-theme bg-surface hover:bg-surface-elevated text-left transition"
            >
              <span className="text-2xl" aria-hidden="true">{INVERT_TAXA[t].glyph}</span>
              <span className="font-semibold text-theme-primary">{INVERT_TAXA[t].label}</span>
            </button>
          ))}
        </div>
      </div>
    </DashboardLayout>
  )
}

function AddInvertFields() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, token } = useAuth()

  const taxonParam = searchParams.get('taxon')
  const speciesParam = searchParams.get('species_id') || searchParams.get('speciesId')
  // Set when a keeper adds to a collection shared with them (co-keepers).
  // The animal belongs to that owner and counts toward the owner's plan.
  const collection = searchParams.get('collection')
  const enclosureParam = searchParams.get('enclosure_id')
  const enclosureId = !collection && enclosureParam ? enclosureParam : null
  // Only reachable without a taxon while a ?species_id= is loading; the
  // species' taxon replaces this placeholder as soon as it arrives.
  const taxon: InvertTaxon = isInvertTaxon(taxonParam) ? taxonParam : 'other'
  const taxonKnown = isInvertTaxon(taxonParam)
  const meta = INVERT_TAXA[taxon]

  const [name, setName] = useState('')
  const [commonName, setCommonName] = useState('')
  const [scientificName, setScientificName] = useState('')
  const [speciesId, setSpeciesId] = useState<string | null>(null)
  const [sex, setSex] = useState<'unknown' | 'male' | 'female'>('unknown')
  // Mobile add starts at juvenile; tap it again to clear (a guess sets a
  // wrong feeding schedule, a blank one falls back to the safe default).
  const [lifeStage, setLifeStage] = useState<LifeStage | null>('juvenile')
  const [molts, setMolts] = useState('')
  // Stored in mm / °F; typed in the keeper's units.
  const { units } = useUnits()
  const sizeMm = useUnitField('lengthMm')
  // Acquisition + husbandry
  const [dateAcquired, setDateAcquired] = useState('')
  const [source, setSource] = useState<'bred' | 'bought' | 'wild_caught' | ''>('')
  const [pricePaid, setPricePaid] = useState('')
  const [enclosureType, setEnclosureType] = useState<EnclosureType>(DEFAULT_ENCLOSURE_TYPE[taxon])
  const [enclosureSize, setEnclosureSize] = useState('')
  const [location, setLocation] = useState<string | null>(null)
  const [substrateType, setSubstrateType] = useState('')
  const [substrateDepth, setSubstrateDepth] = useState('')
  const tempMin = useUnitField('temp')
  const tempMax = useUnitField('temp')
  const loadTempMin = tempMin.load
  const loadTempMax = tempMax.load
  const [humidityMin, setHumidityMin] = useState('')
  const [humidityMax, setHumidityMax] = useState('')
  const [waterDish, setWaterDish] = useState(true)
  const [mistingSchedule, setMistingSchedule] = useState('')
  const [lastCleaning, setLastCleaning] = useState('')
  const [enclosureNotes, setEnclosureNotes] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null)
  // The care sheet the husbandry came from, and the enclosure size it filled
  // (so a life-stage change can swap it only while the keeper hasn't typed
  // their own).
  const [careSheet, setCareSheet] = useState<SpeciesHit | null>(null)
  const autoSize = useRef<string | null>(null)
  // The keeper or a care sheet chose the enclosure type; a taxon switch
  // then leaves it alone.
  const habitFromSheet = useRef(false)
  const [enclosureName, setEnclosureName] = useState<string | null>(null)
  const [speciesLoadFailed, setSpeciesLoadFailed] = useState(false)

  // A taxon switch (picker link, "did you mean", care-sheet species) moves
  // the starting enclosure type to the new taxon's default.
  useEffect(() => {
    if (!habitFromSheet.current) setEnclosureType(DEFAULT_ENCLOSURE_TYPE[taxon])
  }, [taxon])

  // Species autocomplete
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SpeciesHit[]>([])
  const [open, setOpen] = useState(false)
  // The last search for the current text came back empty.
  const [noHits, setNoHits] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Search is a substring match, so capitals, a typo or a bare epithet find
  // nothing; the matcher catches those (and other taxa) once it does.
  const nameMatch = useSpeciesMatch(noHits && !speciesId ? query : '', taxon)
  const suggestion = nameMatch?.match ?? null

  /** Fill the husbandry fields from a care sheet. Only values the sheet has
   *  are written; everything stays editable. */
  const applyCareSheet = useCallback((s: SpeciesHit, stage: LifeStage | null) => {
    setCareSheet(s)
    const habit = normalizeEnclosureType(s.type)
    if (habit) {
      setEnclosureType(habit)
      habitFromSheet.current = true
    }
    const size = sizeForStage(s, stage)
    if (size) {
      setEnclosureSize(size)
      autoSize.current = size
    }
    if (s.substrate_type) setSubstrateType(s.substrate_type)
    if (s.substrate_depth) setSubstrateDepth(s.substrate_depth)
    if (s.temperature_min != null) loadTempMin(s.temperature_min)
    if (s.temperature_max != null) loadTempMax(s.temperature_max)
    if (s.humidity_min != null) setHumidityMin(String(s.humidity_min))
    if (s.humidity_max != null) setHumidityMax(String(s.humidity_max))
    if (typeof s.water_dish_required === 'boolean') setWaterDish(s.water_dish_required)
  }, [loadTempMin, loadTempMax])

  const linkSpecies = useCallback((s: SpeciesHit) => {
    setSpeciesId(s.id)
    setScientificName(s.scientific_name)
    setQuery(s.scientific_name)
    setCommonName((prev) => prev || s.common_names?.[0] || '')
    setOpen(false)
    setHits([])
    setNoHits(false)
  }, [])

  // Where the new animal is going, for the banner. A failed read (not your
  // enclosure, or gone) just drops the banner; the API re-checks on save.
  useEffect(() => {
    if (!enclosureId || !token) return
    let alive = true
    fetch(`${API_URL}/api/v1/enclosures/${enclosureId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((e) => { if (alive) setEnclosureName(e?.name ?? null) })
      .catch(() => {})
    return () => { alive = false }
  }, [enclosureId, token])

  // ?species_id= prefill. Runs once per species id.
  const prefilled = useRef<string | null>(null)
  useEffect(() => {
    if (!speciesParam || prefilled.current === speciesParam) return
    prefilled.current = speciesParam
    ;(async () => {
      try {
        const r = await fetch(`${API_URL}/api/v1/invert-species/${encodeURIComponent(speciesParam)}`)
        if (!r.ok) throw new Error()
        const s: SpeciesHit = await r.json()
        if (s.taxon && isInvertTaxon(s.taxon) && s.taxon !== taxonParam) {
          // File it under the species' own taxon. Same component, so the
          // fill below survives the URL change.
          const q = new URLSearchParams(searchParams.toString())
          q.set('taxon', s.taxon)
          router.replace(`/dashboard/inverts/add?${q}`, { scroll: false })
        }
        linkSpecies(s)
        applyCareSheet(s, lifeStage)
      } catch {
        setSpeciesLoadFailed(true)
      }
    })()
    // lifeStage is read once, at prefill time, on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speciesParam, taxonParam, linkSpecies, applyCareSheet, router, searchParams])

  const onQueryChange = (text: string) => {
    setQuery(text)
    setScientificName(text)
    setSpeciesId(null)
    setOpen(true)
    setNoHits(false)
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
        const rows: SpeciesHit[] = res.ok ? await res.json() : []
        setHits(rows)
        setNoHits(rows.length === 0)
      } catch {
        setHits([])
      }
    }, 250)
  }

  const pickSpecies = async (s: SpeciesHit) => {
    linkSpecies(s)
    if (hasHusbandry(s)) {
      applyCareSheet(s, lifeStage)
      return
    }
    try {
      const r = await fetch(`${API_URL}/api/v1/invert-species/${encodeURIComponent(s.id)}`)
      if (r.ok) applyCareSheet(await r.json(), lifeStage)
    } catch {
      /* the link alone is still worth keeping */
    }
  }

  /** Take the matcher's species. Another taxon swaps the form's taxon
   *  (it lives in the URL); everything typed so far stays put. */
  const applySuggestion = () => {
    if (!suggestion) return
    if (suggestion.taxon !== taxon) {
      const q = new URLSearchParams(searchParams.toString())
      q.set('taxon', suggestion.taxon)
      router.replace(`/dashboard/inverts/add?${q}`, { scroll: false })
    }
    void pickSpecies({ id: suggestion.id, scientific_name: suggestion.scientific_name, common_names: suggestion.common_name ? [suggestion.common_name] : [] })
  }

  const chooseLifeStage = (st: LifeStage) => {
    const next = lifeStage === st ? null : st
    setLifeStage(next)
    // Swap the care sheet's enclosure size for the new stage, unless the
    // keeper has typed their own.
    if (careSheet && enclosureSize === (autoSize.current ?? '')) {
      const size = sizeForStage(careSheet, next) ?? ''
      setEnclosureSize(size)
      autoSize.current = size || null
    }
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
      const res = await fetch(`${API_URL}/api/v1/inverts/${collection ? `?collection=${encodeURIComponent(collection)}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          taxon,
          enclosure_id: enclosureId,
          name: name.trim() || null,
          common_name: commonName.trim() || null,
          scientific_name: scientificName.trim() || null,
          species_id: speciesId,
          sex,
          life_stage: lifeStage,
          current_instar: molts ? Number(molts) : null,
          current_length_mm: sizeMm.toStorage(),
          date_acquired: dateAcquired.trim() || null,
          source: source || null,
          price_paid: pricePaid.trim() || null,
          enclosure_type: enclosureType,
          enclosure_size: enclosureSize.trim() || null,
          location,
          substrate_type: substrateType.trim() || null,
          substrate_depth: substrateDepth.trim() || null,
          target_temp_min: tempMin.toStorage(),
          target_temp_max: tempMax.toStorage(),
          target_humidity_min: humidityMin.trim() || null,
          target_humidity_max: humidityMax.trim() || null,
          water_dish: waterDish,
          misting_schedule: mistingSchedule.trim() || null,
          last_enclosure_cleaning: lastCleaning.trim() || null,
          enclosure_notes: enclosureNotes.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      if (res.status === 402 && collection) {
        // The cap is the OWNER's — don't sell the co-keeper an upgrade that doesn't help.
        alert('This collection is at its free-plan limit. The owner can upgrade to add more.')
        return
      }
      if (res.status === 402) {
        // Pull the cap from the 402 payload so this copy never drifts from
        // the server's actual limit. detail = { message, current_count, limit, is_premium }
        const body = await res.json().catch(() => ({} as any))
        const limit = body?.detail?.limit
        setUpgradeMsg(
          typeof body?.detail?.message === 'string'
            ? body.detail.message
            : `You've reached the free plan limit${typeof limit === 'number' ? ` of ${limit} animals` : ''}. Upgrade to Premium for unlimited tracking.`
        )
        return
      }
      if (!res.ok) throw new Error()
      const created = await res.json()
      router.replace(enclosureId ? `/dashboard/enclosures/${enclosureId}` : `/dashboard/inverts/${created.id}`)
    } catch {
      alert('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const changeTaxonHref = (() => {
    const q = new URLSearchParams(searchParams.toString())
    q.delete('taxon')
    q.delete('species_id')
    q.delete('speciesId')
    const s = q.toString()
    return `/dashboard/inverts/add${s ? `?${s}` : ''}`
  })()

  const careSheetBits: string[] = careSheet
    ? [
        normalizeEnclosureType(careSheet.type) ?? '',
        sizeForStage(careSheet, lifeStage) ?? '',
        careSheet.substrate_type ?? '',
        careSheet.temperature_min != null && careSheet.temperature_max != null
          ? formatTempRange(careSheet.temperature_min, careSheet.temperature_max, units) ?? ''
          : '',
        careSheet.humidity_min != null && careSheet.humidity_max != null ? `${careSheet.humidity_min}–${careSheet.humidity_max}%` : '',
      ].filter(Boolean)
    : []

  return (
    <DashboardLayout userName={user?.name ?? undefined} userEmail={user?.email ?? undefined} userAvatar={user?.image ?? undefined}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button onClick={() => router.back()} className="text-sm text-primary hover:underline mb-4">← Back</button>
        {!taxonKnown ? (
          // ?species_id= with no taxon, while the species loads.
          speciesLoadFailed ? (
            <div className="space-y-3">
              <p className="text-theme-secondary">Couldn&apos;t load that species.</p>
              <Link href={changeTaxonHref} className="text-primary hover:underline">Choose the kind of animal instead</Link>
            </div>
          ) : (
            <p className="text-theme-secondary">Loading…</p>
          )
        ) : (
        <>
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <h1 className="text-3xl font-bold text-theme-primary">{meta.glyph} Add {meta.label}</h1>
          <Link href={changeTaxonHref} className="text-sm text-primary hover:underline">Not a {meta.label.toLowerCase()}?</Link>
        </div>

        {enclosureId && enclosureName && (
          <p className="mb-5 px-3 py-2 rounded-lg border border-theme bg-surface-elevated text-sm text-theme-secondary">
            This animal goes in <span className="font-semibold text-theme-primary">{enclosureName}</span>.
          </p>
        )}
        {speciesLoadFailed && (
          <p role="alert" className="mb-5 text-sm text-red-700 dark:text-red-300">
            Couldn&apos;t load the species from the care sheet. Search for it below.
          </p>
        )}

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
                      type="button"
                      onClick={() => void pickSpecies(h)}
                      className="w-full text-left px-3 py-2 hover:bg-surface-elevated border-b border-theme last:border-0"
                    >
                      <div className="text-sm italic font-semibold text-theme-primary">{h.scientific_name}</div>
                      {h.common_names?.[0] && <div className="text-xs text-theme-secondary">{h.common_names[0]}</div>}
                    </button>
                  ))}
                </div>
              )}
              {suggestion && !speciesId ? (
                <SpeciesSuggestion match={suggestion} currentTaxon={taxon} onUse={applySuggestion} />
              ) : noHits && !speciesId && query.trim() ? (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Not in our species list yet. It will be saved as you typed it.</p>
              ) : null}
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
                  type="button"
                  onClick={() => setSex(s)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold capitalize ${sex === s ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Life stage">
            <div className="flex gap-2 flex-wrap">
              {LIFE_STAGES.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => chooseLifeStage(st)}
                  aria-pressed={lifeStage === st}
                  className={`px-4 py-2 rounded-full text-sm font-semibold capitalize ${lifeStage === st ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}
                >
                  {st}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-theme-tertiary">
              With a linked care sheet, this sets the suggested feeding schedule. Tap the selected stage to clear it.
            </p>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={stageCountLabel(taxon)}><input value={molts} onChange={(e) => setMolts(e.target.value)} inputMode="numeric" placeholder="e.g. 4" className={inputCls} /></Field>
            <Field label={withMmUnit(meta.sizeLabel, units)}><input value={sizeMm.value} onChange={(e) => sizeMm.setValue(e.target.value)} inputMode="decimal" placeholder={units === 'metric' ? 'e.g. 180' : 'e.g. 7'} className={inputCls} /></Field>
          </div>

          <h2 className="text-sm font-bold uppercase tracking-wide text-theme-secondary pt-2">Acquisition</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date acquired"><input type="date" value={dateAcquired} onChange={(e) => setDateAcquired(e.target.value)} className={inputCls} /></Field>
            <Field label="Price paid"><input value={pricePaid} onChange={(e) => setPricePaid(e.target.value)} inputMode="decimal" placeholder="e.g. 45" className={inputCls} /></Field>
          </div>
          <Field label="Source">
            <div className="flex gap-2">
              {([['bred', 'Captive bred'], ['bought', 'Bought'], ['wild_caught', 'Wild caught']] as const).map(([v, lbl]) => (
                <button key={v} type="button" onClick={() => setSource(source === v ? '' : v)} className={`px-4 py-2 rounded-full text-sm font-semibold ${source === v ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}>{lbl}</button>
              ))}
            </div>
          </Field>

          <h2 className="text-sm font-bold uppercase tracking-wide text-theme-secondary pt-2">Husbandry</h2>
          {careSheet && careSheetBits.length > 0 && (
            <p className="px-3 py-2 rounded-lg border border-theme bg-surface-elevated text-sm text-theme-secondary">
              Filled in from the care sheet: {careSheetBits.join(' · ')}. Change anything that doesn&apos;t match your setup.
            </p>
          )}
          <Field label="Enclosure type">
            <div className="flex gap-2">
              {(['terrestrial', 'arboreal', 'fossorial'] as const).map((v) => (
                <button key={v} type="button" onClick={() => { setEnclosureType(v); habitFromSheet.current = true }} className={`px-4 py-2 rounded-full text-sm font-semibold capitalize ${enclosureType === v ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}>{v}</button>
              ))}
            </div>
          </Field>
          <Field label="Enclosure size"><input value={enclosureSize} onChange={(e) => setEnclosureSize(e.target.value)} placeholder='e.g. 6x6x6"' className={inputCls} /></Field>
          <Field label="Location"><LocationField token={token} value={location} onChange={setLocation} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Substrate type"><input value={substrateType} onChange={(e) => setSubstrateType(e.target.value)} placeholder="e.g. coco fiber" className={inputCls} /></Field>
            <Field label="Substrate depth"><input value={substrateDepth} onChange={(e) => setSubstrateDepth(e.target.value)} placeholder='e.g. 3"' className={inputCls} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={`Temp min (${tempMin.unit})`}><input value={tempMin.value} onChange={(e) => tempMin.setValue(e.target.value)} inputMode="decimal" placeholder={units === 'metric' ? '22' : '72'} className={inputCls} /></Field>
            <Field label={`Temp max (${tempMax.unit})`}><input value={tempMax.value} onChange={(e) => tempMax.setValue(e.target.value)} inputMode="decimal" placeholder={units === 'metric' ? '28' : '82'} className={inputCls} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Humidity min (%)"><input value={humidityMin} onChange={(e) => setHumidityMin(e.target.value)} inputMode="numeric" placeholder="60" className={inputCls} /></Field>
            <Field label="Humidity max (%)"><input value={humidityMax} onChange={(e) => setHumidityMax(e.target.value)} inputMode="numeric" placeholder="75" className={inputCls} /></Field>
          </div>
          <Field label="Water dish">
            <div className="flex gap-2">
              {([['yes', true], ['no', false]] as const).map(([lbl, val]) => (
                <button key={lbl} type="button" onClick={() => setWaterDish(val)} className={`px-4 py-2 rounded-full text-sm font-semibold capitalize ${waterDish === val ? 'bg-gradient-brand text-white' : 'bg-surface border border-theme text-theme-secondary'}`}>{lbl}</button>
              ))}
            </div>
          </Field>
          <Field label="Misting schedule"><input value={mistingSchedule} onChange={(e) => setMistingSchedule(e.target.value)} placeholder="e.g. 2x per week" className={inputCls} /></Field>
          <Field label="Last enclosure cleaning"><input type="date" value={lastCleaning} onChange={(e) => setLastCleaning(e.target.value)} className={inputCls} /></Field>
          <Field label="Enclosure notes"><textarea value={enclosureNotes} onChange={(e) => setEnclosureNotes(e.target.value)} rows={2} placeholder="Decor, modifications, etc." className={inputCls} /></Field>

          <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls} /></Field>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-gradient-brand text-white rounded-xl font-semibold disabled:opacity-60"
          >
            {saving ? 'Saving…' : `Save ${meta.label.toLowerCase()}`}
          </button>
        </div>
        </>
        )}
      </div>

      <UpgradeModal source="collection_cap"
        isOpen={upgradeMsg !== null}
        onClose={() => setUpgradeMsg(null)}
        feature="Unlimited Animals"
        description={upgradeMsg ?? ''}
      />
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
